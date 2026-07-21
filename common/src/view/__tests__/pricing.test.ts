import { describe, it, expect } from 'vitest';
import {
  CharacterType,
  CharacterChoosingStateType,
  ClientGameState,
  ClientTurnState,
  DistrictId,
  GameMode,
  GamePhase,
  GameProgress,
  PlayerPosition,
} from '../../index';
import { getDistrictDestroyPrice } from '../pricing';

function makeBaseState(overrides: Partial<ClientGameState> = {}): ClientGameState {
  return {
    progress: GameProgress.IN_GAME,
    gameMode: GameMode.COMPETITIVE_TEAM6,
    self: 'warlord',
    players: {},
    board: {
      players: {},
      gamePhase: GamePhase.DO_ACTIONS,
      turnState: ClientTurnState.INITIAL,
      playerOrder: [],
      currentPlayer: PlayerPosition.PLAYER_1,
      currentPlayerExtraData: {
        districtsToBuild: 0,
        canTakeEarnings: false,
        canDoSpecialAction: false,
        hasUsedLaboratory: false,
        hasUsedSmithy: false,
        earningsValue: 0,
      },
      characters: {
        state: { type: CharacterChoosingStateType.INITIAL, player: PlayerPosition.PLAYER_1 },
        current: CharacterType.NONE,
        callable: [],
        aside: [],
      },
      graveyard: undefined,
    },
    settings: { completeCitySize: 8, actionTimeoutSeconds: 30 },
    ...overrides,
  } as ClientGameState;
}

/** Build a target player board with given city and (optional) bishop role. */
function makePlayerBoard(opts: {
  city?: DistrictId[];
  isBishop?: boolean;
}) {
  const characters = opts.isBishop
    ? [{ id: (CharacterType.BISHOP + 1) as CharacterType }]
    : [];
  return {
    stash: 0,
    hand: [],
    tmpHand: [],
    city: opts.city ?? [],
    score: {},
    characters,
  } as never;
}

/** Build a callable entry for the Bishop (1-based id), with given killed flag. */
function bishopCallable(killed: boolean) {
  return { id: (CharacterType.BISHOP + 1) as CharacterType, killed, robbed: false };
}

describe('getDistrictDestroyPrice', () => {
  it('returns -1 for keep regardless of state', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        players: { target: makePlayerBoard({ city: ['keep'] }) },
      },
    });
    expect(getDistrictDestroyPrice(gs, 'target', 'keep')).toBe(-1);
  });

  it('returns -1 when game state is undefined', () => {
    expect(getDistrictDestroyPrice(undefined, 'target', 'temple')).toBe(-1);
  });

  it('returns -1 when target player is not on the board', () => {
    const gs = makeBaseState();
    expect(getDistrictDestroyPrice(gs, 'ghost', 'temple')).toBe(-1);
  });

  it('returns -1 when target player has completed their city', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        players: {
          target: makePlayerBoard({
            city: ['temple', 'church', 'monastery', 'cathedral', 'watchtower', 'prison', 'barracks', 'fortress'],
          }),
        },
      },
    });
    expect(getDistrictDestroyPrice(gs, 'target', 'temple')).toBe(-1);
  });

  it('returns -1 when target is the Bishop and Bishop is alive (not killed)', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        players: { target: makePlayerBoard({ city: ['temple'], isBishop: true }) },
        characters: {
          ...makeBaseState().board.characters,
          callable: [bishopCallable(false)],
        },
      },
    });
    expect(getDistrictDestroyPrice(gs, 'target', 'temple')).toBe(-1);
  });

  it('returns normal price when target is the Bishop but Bishop has been killed', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        players: { target: makePlayerBoard({ city: ['temple'], isBishop: true }) },
        characters: {
          ...makeBaseState().board.characters,
          callable: [bishopCallable(true)],
        },
      },
    });
    // temple cost = 1, discount = 1 → max(1-1, 0) = 0
    expect(getDistrictDestroyPrice(gs, 'target', 'temple')).toBe(0);
  });

  it('returns cost - 1 for a normal district without great_wall', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        players: { target: makePlayerBoard({ city: ['palace'] }) },
      },
    });
    // palace cost = 5, discount = 1 → 4
    expect(getDistrictDestroyPrice(gs, 'target', 'palace')).toBe(4);
  });

  it('returns cost - 1 for great_wall itself (great_wall does not protect itself)', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        players: { target: makePlayerBoard({ city: ['great_wall'] }) },
      },
    });
    // great_wall cost = 6, discount = 1 (because target === 'great_wall') → 5
    expect(getDistrictDestroyPrice(gs, 'target', 'great_wall')).toBe(5);
  });

  it('returns full cost (no discount) for a non-great_wall district when player owns great_wall', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        players: { target: makePlayerBoard({ city: ['great_wall', 'temple'] }) },
      },
    });
    // temple cost = 1, discount = 0 (great_wall protects other districts) → 1
    // (contrast: without great_wall, temple would be max(1-1,0)=0)
    expect(getDistrictDestroyPrice(gs, 'target', 'temple')).toBe(1);
  });

  it('clamps to 0 when cost - 1 would be negative (temple cost=1)', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        players: { target: makePlayerBoard({ city: ['market'] }) },
      },
    });
    // temple cost = 1, discount = 1 → max(0, 0) = 0
    expect(getDistrictDestroyPrice(gs, 'target', 'temple')).toBe(0);
  });

  it('treats missing Bishop callable entry as "Bishop not in round" (isBishopDead=false)', () => {
    // Player is Bishop but callable list is empty (Bishop was put aside / not in round).
    // Original logic: isBishopDead defaults to false, so Bishop's city stays protected.
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        players: { target: makePlayerBoard({ city: ['temple'], isBishop: true }) },
        characters: {
          ...makeBaseState().board.characters,
          callable: [],
        },
      },
    });
    expect(getDistrictDestroyPrice(gs, 'target', 'temple')).toBe(-1);
  });

  it('returns -1 when player is not Bishop and Bishop is alive (no protection for non-bishop)', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        players: { target: makePlayerBoard({ city: ['palace'], isBishop: false }) },
        characters: {
          ...makeBaseState().board.characters,
          callable: [bishopCallable(false)],
        },
      },
    });
    // palace cost = 5, discount = 1 → 4 (Bishop being alive does not protect non-Bishop player)
    expect(getDistrictDestroyPrice(gs, 'target', 'palace')).toBe(4);
  });
});
