import { describe, it, expect } from 'vitest';
import {
  CharacterChoosingStateType,
  CharacterType,
  ClientTurnState,
  GameMode,
  GamePhase,
  GameProgress,
  PlayerPosition,
} from '../../index';
import { parseClientGameState } from '../parseGameState';

/** A minimal well-formed payload covering all required fields. */
function wellFormed(): Record<string, any> {
  return {
    progress: GameProgress.IN_GAME,
    gameMode: GameMode.COMPETITIVE_TEAM6,
    players: {},
    self: 'p1',
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
  };
}

describe('parseClientGameState', () => {
  it('passes through required fields unchanged', () => {
    const data = wellFormed();
    const gs = parseClientGameState(data);
    expect(gs.progress).toBe(GameProgress.IN_GAME);
    expect(gs.gameMode).toBe(GameMode.COMPETITIVE_TEAM6);
    expect(gs.self).toBe('p1');
    expect(gs.settings.completeCitySize).toBe(8);
    expect(gs.board.gamePhase).toBe(GamePhase.DO_ACTIONS);
  });

  it('applies defaults for optional fields when absent', () => {
    const gs = parseClientGameState(wellFormed());
    expect(gs.turnDeadlineAt).toBeNull();
    expect(gs.lastRoundSummary).toBeNull();
    expect(gs.lobbyPlayerOrder).toEqual([]);
    expect(gs.actionFeed).toEqual([]);
    expect(gs.teamScores).toBeUndefined();
    expect(gs.matchResult).toBeUndefined();
  });

  it('passes through optional fields when present', () => {
    const data = wellFormed();
    data.turnDeadlineAt = 1234567890;
    data.lastRoundSummary = 'assassin killed king';
    data.lobbyPlayerOrder = ['p1', 'p2'];
    data.actionFeed = [{ text: 'p1 took gold', kind: 'gold' }];
    data.teamScores = { A: 3, B: 5 };
    const gs = parseClientGameState(data);
    expect(gs.turnDeadlineAt).toBe(1234567890);
    expect(gs.lastRoundSummary).toBe('assassin killed king');
    expect(gs.lobbyPlayerOrder).toEqual(['p1', 'p2']);
    expect(gs.actionFeed).toEqual([{ text: 'p1 took gold', kind: 'gold' }]);
    expect(gs.teamScores).toEqual({ A: 3, B: 5 });
  });

  it('defaults board.players to {} when missing', () => {
    const data = wellFormed();
    delete data.board.players;
    const gs = parseClientGameState(data);
    expect(gs.board.players).toEqual({});
  });

  it('preserves other board sub-fields via spread', () => {
    const data = wellFormed();
    data.board.playerOrder = ['p1', 'p2'];
    data.board.graveyard = 'temple';
    const gs = parseClientGameState(data);
    expect(gs.board.playerOrder).toEqual(['p1', 'p2']);
    expect(gs.board.graveyard).toBe('temple');
  });

  it('treats explicit null turnDeadlineAt as null (not defaulted again)', () => {
    const data = wellFormed();
    data.turnDeadlineAt = null;
    const gs = parseClientGameState(data);
    expect(gs.turnDeadlineAt).toBeNull();
  });

  it('treats empty array lobbyPlayerOrder as [] (falsy short-circuit)', () => {
    const data = wellFormed();
    data.lobbyPlayerOrder = [];
    const gs = parseClientGameState(data);
    expect(gs.lobbyPlayerOrder).toEqual([]);
  });

  it('throws when data is null', () => {
    expect(() => parseClientGameState(null)).toThrow('non-null object');
  });

  it('throws when data is a string', () => {
    expect(() => parseClientGameState('not a state')).toThrow('non-null object');
  });

  it('throws when data is a number', () => {
    expect(() => parseClientGameState(42)).toThrow('non-null object');
  });

  it('throws when data is undefined', () => {
    expect(() => parseClientGameState(undefined)).toThrow('non-null object');
  });

  it('handles missing board gracefully (defaults to empty board object)', () => {
    const data = wellFormed();
    delete data.board;
    const gs = parseClientGameState(data);
    expect(gs.board.players).toEqual({});
  });
});
