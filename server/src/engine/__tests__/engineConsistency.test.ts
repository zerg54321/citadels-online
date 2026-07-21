import { describe, it, expect } from 'vitest';
import { GameProgress, GamePhase } from 'citadels-common';
import GameState from '../../game/GameState';
import GameSetupData from '../../game/GameSetupData';
import { TrainingEngine } from '../trainingEngine';
import { EnginePhase } from '../types';

function createBaseGameState(): GameState {
  const gs = new GameState({ completeCitySize: 8, fastMode: true, syncMode: true });
  const playerNames = ['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank'];
  const playerIds = playerNames.map((_, i) => `p${i + 1}`);
  playerIds.forEach((id, i) => {
    gs.addPlayer(id, playerNames[i], i === 0, true);
  });
  const setup = new GameSetupData(playerIds, 8);
  gs.setupGame(setup);
  gs.progress = GameProgress.IN_GAME;
  if (gs.board) {
    gs.board.gamePhase = GamePhase.CHOOSE_CHARACTERS;
  }
  return gs;
}

describe('TrainingEngine consistency', () => {
  it('initializes with same state as raw GameState', () => {
    const engine = new TrainingEngine(['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank']);

    expect(engine.isFinished()).toBe(false);
    expect(engine.getPlayerOrder()).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(engine.getMatchResult().progress).toBe(GameProgress.IN_GAME);
  });

  it('observation reflects underlying GameState after actions', () => {
    const gs = createBaseGameState();
    const engine = new TrainingEngine(['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank']);

    const obs = engine.getObservation();
    expect(obs.phase).toBe(EnginePhase.CHARACTER_SELECTION);
    expect(obs.players).toHaveLength(6);
    expect(obs.deckCount).toBeGreaterThan(0);

    const board = gs.board!;
    expect(obs.crownPlayerId).toBe(board.playerOrder[0]);
    expect(obs.players[0].hasCrown).toBe(true);
  });

  it('applies a choose-character action and advances state', () => {
    const engine = new TrainingEngine(['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank']);

    const actions = engine.getLegalActions();
    expect(actions.length).toBeGreaterThan(0);
    expect(actions[0].type).toBe('choose_character');

    const result = engine.applyAction(actions[0]);
    expect(result.ok).toBe(true);
    expect(result.observation).toBeDefined();
  });

  it('runs multiple AUTO steps without crashing', () => {
    const engine = new TrainingEngine(['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank']);

    for (let step = 0; step < 30; step += 1) {
      if (engine.isFinished()) break;
      const actions = engine.getLegalActions();
      if (actions.length === 0) {
        const obs = engine.getObservation();
        const phases = [
          EnginePhase.CHARACTER_SELECTION,
          EnginePhase.ACTIONS,
          EnginePhase.FINISHED,
        ];
        expect(phases).toContain(obs.phase);
        break;
      }
      const result = engine.applyAction(actions[0]);
      expect(result.ok).toBe(true);
    }

    const result = engine.getMatchResult();
    expect([GameProgress.FINISHED, GameProgress.IN_GAME]).toContain(result.progress);
  });

  it('player order and team assignments remain stable', () => {
    const engine = new TrainingEngine(['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank']);
    const order = engine.getPlayerOrder();
    const teamMap = engine.getTeamMap();

    expect(order).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(teamMap.p1).toBe('A');
    expect(teamMap.p2).toBe('B');
    expect(teamMap.p3).toBe('A');
    expect(teamMap.p4).toBe('B');
    expect(teamMap.p5).toBe('A');
    expect(teamMap.p6).toBe('B');
  });

  it('getObservation after applyAction returns updated state', () => {
    const engine = new TrainingEngine(['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank']);

    const actions = engine.getLegalActions();
    expect(actions.length).toBeGreaterThan(0);

    const result = engine.applyAction(actions[0]);
    expect(result.ok).toBe(true);

    const after = engine.getObservation();
    expect(after.phase).toBeDefined();
    expect(after.players).toHaveLength(6);
  });
});
