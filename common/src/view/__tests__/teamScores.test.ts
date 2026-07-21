import { describe, it, expect } from 'vitest';
import {
  ClientGameState,
  GamePhase,
  GameProgress,
  GameMode,
  CharacterType,
  CharacterChoosingStateType,
  ClientTurnState,
  PlayerPosition,
  PlayerRole,
  TeamId,
} from '../../index';
import { computeTeamScores } from '../teamScores';

function makeBaseState(overrides: Partial<ClientGameState> = {}): ClientGameState {
  return {
    progress: GameProgress.IN_GAME,
    gameMode: GameMode.COMPETITIVE_TEAM6,
    self: 'p1',
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

describe('computeTeamScores', () => {
  it('uses authoritative teamScores when present', () => {
    const gs = makeBaseState({ teamScores: { A: 10, B: 7 } });
    expect(computeTeamScores(gs)).toEqual({ A: 10, B: 7 });
  });

  it('falls back to per-player score.total sums when teamScores absent', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        playerOrder: ['p1', 'p2', 'p3', 'p4'],
        players: {
          p1: { score: { total: 5 } } as never,
          p2: { score: { total: 3 } } as never,
          p3: { score: { total: 8 } } as never,
          p4: { score: { total: 2 } } as never,
        },
      },
      players: {
        p1: {
          id: 'p1', username: 'a', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.A,
        },
        p2: {
          id: 'p2', username: 'b', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.A,
        },
        p3: {
          id: 'p3', username: 'c', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.B,
        },
        p4: {
          id: 'p4', username: 'd', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.B,
        },
      },
    });
    expect(computeTeamScores(gs)).toEqual({ A: 8, B: 10 });
  });

  it('treats explicit zero teamScores as authoritative (does not fall back)', () => {
    const gs = makeBaseState({
      teamScores: { A: 0, B: 0 },
      board: {
        ...makeBaseState().board,
        playerOrder: ['p1'],
        players: { p1: { score: { total: 99 } } as never },
      },
      players: {
        p1: {
          id: 'p1', username: 'a', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.A,
        },
      },
    });
    expect(computeTeamScores(gs)).toEqual({ A: 0, B: 0 });
  });

  it('returns 0/0 for empty playerOrder without teamScores', () => {
    const gs = makeBaseState();
    expect(computeTeamScores(gs)).toEqual({ A: 0, B: 0 });
  });

  it('skips players whose team is NONE (not counted in either side)', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        playerOrder: ['p1', 'p2'],
        players: {
          p1: { score: { total: 5 } } as never,
          p2: { score: { total: 4 } } as never,
        },
      },
      players: {
        p1: {
          id: 'p1', username: 'a', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.NONE,
        },
        p2: {
          id: 'p2', username: 'b', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.A,
        },
      },
    });
    expect(computeTeamScores(gs)).toEqual({ A: 4, B: 0 });
  });

  it('treats missing score.total as 0', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        playerOrder: ['p1'],
        players: { p1: { score: {} } as never },
      },
      players: {
        p1: {
          id: 'p1', username: 'a', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.A,
        },
      },
    });
    expect(computeTeamScores(gs)).toEqual({ A: 0, B: 0 });
  });

  it('defensively skips a playerOrder entry missing from players map', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        playerOrder: ['p1', 'ghost'],
        players: { p1: { score: { total: 5 } } as never },
      },
      players: {
        p1: {
          id: 'p1', username: 'a', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.A,
        },
      },
    });
    expect(computeTeamScores(gs)).toEqual({ A: 5, B: 0 });
  });
});
