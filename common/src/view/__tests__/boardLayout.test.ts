import { describe, it, expect } from 'vitest';
import {
  CharacterChoosingStateType,
  CharacterType,
  ClientGameState,
  ClientTurnState,
  GameMode,
  GamePhase,
  GameProgress,
  PlayerPosition,
  PlayerRole,
  TeamId,
} from '../../index';
import {
  getMyTeam,
  getRelation,
  getSeatOrder,
  getTableSlots,
  isSpectator,
} from '../boardLayout';

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
    settings: { completeCitySize: 8, actionTimeoutSeconds: 120 },
    ...overrides,
  } as ClientGameState;
}

function makePlayer(id: string, team: TeamId, role: PlayerRole = PlayerRole.PLAYER) {
  return {
    id, username: id, manager: false, online: true, role, team,
  };
}

describe('isSpectator', () => {
  it('returns true when self has SPECTATOR role', () => {
    const gs = makeBaseState({
      self: 'sp1',
      players: { sp1: makePlayer('sp1', TeamId.NONE, PlayerRole.SPECTATOR) },
      board: { ...makeBaseState().board, playerOrder: ['p1', 'p2'] },
    });
    expect(isSpectator(gs)).toBe(true);
  });

  it('returns true when self is not in playerOrder and role is PLAYER', () => {
    const gs = makeBaseState({
      self: 'p3',
      players: { p3: makePlayer('p3', TeamId.NONE) },
      board: { ...makeBaseState().board, playerOrder: ['p1', 'p2'] },
    });
    expect(isSpectator(gs)).toBe(true);
  });

  it('returns false when self is in playerOrder with PLAYER role', () => {
    const gs = makeBaseState({
      self: 'p1',
      players: { p1: makePlayer('p1', TeamId.A) },
      board: { ...makeBaseState().board, playerOrder: ['p1', 'p2'] },
    });
    expect(isSpectator(gs)).toBe(false);
  });
});

describe('getMyTeam', () => {
  it('returns null for spectator', () => {
    const gs = makeBaseState({
      self: 'sp1',
      players: { sp1: makePlayer('sp1', TeamId.NONE, PlayerRole.SPECTATOR) },
    });
    expect(getMyTeam(gs, true)).toBeNull();
  });

  it('returns the team of self for a player', () => {
    const gs = makeBaseState({
      players: { p1: makePlayer('p1', TeamId.B) },
    });
    expect(getMyTeam(gs, false)).toBe(TeamId.B);
  });

  it('returns null when self is missing from players map', () => {
    const gs = makeBaseState({ players: {} });
    expect(getMyTeam(gs, false)).toBeNull();
  });
});

describe('getRelation', () => {
  it('returns "self" for the viewer', () => {
    const gs = makeBaseState({
      players: { p1: makePlayer('p1', TeamId.A) },
    });
    expect(getRelation(gs, 'p1', false)).toBe('self');
  });

  it('returns "ally" for same-team player', () => {
    const gs = makeBaseState({
      players: {
        p1: makePlayer('p1', TeamId.A),
        p3: makePlayer('p3', TeamId.A),
      },
    });
    expect(getRelation(gs, 'p3', false)).toBe('ally');
  });

  it('returns "enemy" for different-team player', () => {
    const gs = makeBaseState({
      players: {
        p1: makePlayer('p1', TeamId.A),
        p2: makePlayer('p2', TeamId.B),
      },
    });
    expect(getRelation(gs, 'p2', false)).toBe('enemy');
  });

  it('returns "enemy" when own team is NONE (non-spectator)', () => {
    const gs = makeBaseState({
      players: {
        p1: makePlayer('p1', TeamId.NONE),
        p2: makePlayer('p2', TeamId.A),
      },
    });
    expect(getRelation(gs, 'p2', false)).toBe('enemy');
  });

  it('returns "self" for everyone when spectator', () => {
    const gs = makeBaseState({
      self: 'sp1',
      players: {
        sp1: makePlayer('sp1', TeamId.NONE, PlayerRole.SPECTATOR),
        p1: makePlayer('p1', TeamId.A),
        p2: makePlayer('p2', TeamId.B),
      },
      board: { ...makeBaseState().board, playerOrder: ['p1', 'p2'] },
    });
    expect(getRelation(gs, 'p1', true)).toBe('self');
    expect(getRelation(gs, 'p2', true)).toBe('self');
  });
});

describe('getSeatOrder', () => {
  it('rotates so self is first', () => {
    const gs = makeBaseState({
      self: 'p3',
      board: { ...makeBaseState().board, playerOrder: ['p1', 'p2', 'p3', 'p4'] },
    });
    expect(getSeatOrder(gs, false)).toEqual(['p3', 'p4', 'p1', 'p2']);
  });

  it('returns original order when self is at index 0', () => {
    const gs = makeBaseState({
      self: 'p1',
      board: { ...makeBaseState().board, playerOrder: ['p1', 'p2', 'p3'] },
    });
    expect(getSeatOrder(gs, false)).toEqual(['p1', 'p2', 'p3']);
  });

  it('returns original order for spectator', () => {
    const gs = makeBaseState({
      self: 'sp1',
      players: { sp1: makePlayer('sp1', TeamId.NONE, PlayerRole.SPECTATOR) },
      board: { ...makeBaseState().board, playerOrder: ['p1', 'p2', 'p3'] },
    });
    expect(getSeatOrder(gs, true)).toEqual(['p1', 'p2', 'p3']);
  });

  it('returns original order when self is not in playerOrder', () => {
    const gs = makeBaseState({
      self: 'p9',
      board: { ...makeBaseState().board, playerOrder: ['p1', 'p2', 'p3'] },
    });
    expect(getSeatOrder(gs, false)).toEqual(['p1', 'p2', 'p3']);
  });
});

describe('getTableSlots', () => {
  const sixPlayerOrder = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

  function makeSixPlayerState(self: string): ClientGameState {
    return makeBaseState({
      self,
      players: {
        p1: makePlayer('p1', TeamId.A),
        p2: makePlayer('p2', TeamId.B),
        p3: makePlayer('p3', TeamId.A),
        p4: makePlayer('p4', TeamId.B),
        p5: makePlayer('p5', TeamId.A),
        p6: makePlayer('p6', TeamId.B),
      },
      board: {
        ...makeBaseState().board,
        playerOrder: sixPlayerOrder,
        players: {
          p1: {
            stash: 1, hand: [], tmpHand: [], city: [], score: {}, characters: [],
          } as never,
          p2: {
            stash: 2, hand: [], tmpHand: [], city: [], score: {}, characters: [],
          } as never,
          p3: {
            stash: 3, hand: [], tmpHand: [], city: [], score: {}, characters: [],
          } as never,
          p4: {
            stash: 4, hand: [], tmpHand: [], city: [], score: {}, characters: [],
          } as never,
          p5: {
            stash: 5, hand: [], tmpHand: [], city: [], score: {}, characters: [],
          } as never,
          p6: {
            stash: 6, hand: [], tmpHand: [], city: [], score: {}, characters: [],
          } as never,
        },
      },
    });
  }

  it('produces 5 slots for a 6-player game (self excluded)', () => {
    const gs = makeSixPlayerState('p1');
    const slots = getTableSlots(gs, false);
    expect(slots).toHaveLength(5);
    expect(slots.map((s) => s.playerId)).not.toContain('p1');
  });

  it('assigns positions l1,l2,l3 (left) and r1,r2 (right)', () => {
    const gs = makeSixPlayerState('p1');
    const slots = getTableSlots(gs, false);
    const positions = slots.map((s) => s.pos).sort();
    expect(positions).toEqual(['l1', 'l2', 'l3', 'r1', 'r2']);
  });

  it('marks the crown holder (playerOrder[0]) with crown=true', () => {
    const gs = makeSixPlayerState('p3');
    const slots = getTableSlots(gs, false);
    const crownSlot = slots.find((s) => s.board.crown);
    expect(crownSlot?.playerId).toBe('p1');
  });

  it('computes pickOrder as 1-based index in playerOrder', () => {
    const gs = makeSixPlayerState('p1');
    const slots = getTableSlots(gs, false);
    const p2Slot = slots.find((s) => s.playerId === 'p2');
    expect(p2Slot?.pickOrder).toBe(2);
    const p6Slot = slots.find((s) => s.playerId === 'p6');
    expect(p6Slot?.pickOrder).toBe(6);
  });

  it('assigns relation correctly for team A viewer', () => {
    const gs = makeSixPlayerState('p1'); // team A
    const slots = getTableSlots(gs, false);
    const p3Slot = slots.find((s) => s.playerId === 'p3'); // team A → ally
    expect(p3Slot?.relation).toBe('ally');
    const p2Slot = slots.find((s) => s.playerId === 'p2'); // team B → enemy
    expect(p2Slot?.relation).toBe('enemy');
  });

  it('spectator layout: all players, positions by index parity', () => {
    const gs = makeSixPlayerState('sp1');
    gs.players.sp1 = makePlayer('sp1', TeamId.NONE, PlayerRole.SPECTATOR);
    const slots = getTableSlots(gs, true);
    expect(slots).toHaveLength(6);
    const positions = slots.map((s) => s.pos);
    // first 3 → l1,l2,l3; next 3 → r1,r2,r3
    expect(positions).toEqual(['l1', 'l2', 'l3', 'r1', 'r2', 'r3']);
  });

  it('spectator layout: all relations are "self"', () => {
    const gs = makeSixPlayerState('sp1');
    gs.players.sp1 = makePlayer('sp1', TeamId.NONE, PlayerRole.SPECTATOR);
    const slots = getTableSlots(gs, true);
    expect(slots.every((s) => s.relation === 'self')).toBe(true);
  });

  it('uses EMPTY_BOARD fallback for missing player board', () => {
    const gs = makeBaseState({
      self: 'p1',
      players: {
        p1: makePlayer('p1', TeamId.A),
        p2: makePlayer('p2', TeamId.B),
        p3: makePlayer('p3', TeamId.A),
        p4: makePlayer('p4', TeamId.B),
        p5: makePlayer('p5', TeamId.A),
        p6: makePlayer('p6', TeamId.B),
      },
      board: {
        ...makeBaseState().board,
        playerOrder: ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'],
        players: {}, // no boards at all
      },
    });
    const slots = getTableSlots(gs, false);
    expect(slots).toHaveLength(5);
    expect(slots[0].board.stash).toBe(0);
    expect(slots[0].board.city).toEqual([]);
  });
});
