import { describe, it, expect } from 'vitest';
import {
  derivePlayerView,
  MoveType,
  type ClientGameState,
  type PlayerId,
} from 'citadels-common';
import GameState from '../GameState';
import { TrainingEngine } from '../../engine/trainingEngine';

// Golden test: derivePlayerView (client-side re-masking of god frames) must
// produce EXACTLY the same board the server would send that player live.
// Drives a full random game through TrainingEngine (reusing its legal-action
// machinery) and, at every step, compares the derived view against
// GameState.getStateFromPlayer for all 6 players. If the server's export
// rules ever change without updating common/src/view/replayView.ts, this
// test goes red immediately.

// deterministic pseudo-random (mulberry32) so the game path is reproducible
/* eslint-disable no-bitwise, operator-assignment */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function runGolden(seed: number, maxSteps: number): number {
  const engine = new TrainingEngine(['Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank']);
  // TrainingEngine.gameState is private — tests reach it via cast to reuse
  // the engine's legal-action walk while reading raw GameState exports.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const gs = (engine as any).gameState as GameState;
  const rand = mulberry32(seed);
  const playerIds = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
  let steps = 0;
  // hold the FIRST god frame: its actionFeed must stay frozen at capture
  // time (replay frames are persisted; a live array reference would grow
  // with every later push and every stored frame would serialize the final
  // full feed — the "log shows the whole game from frame 0" regression)
  let firstFrame: ClientGameState | null = null;
  let firstFrameFeedLen = -1;
  // same freeze check on persisted snapshots: capture via the REAL path
  // (captureReplaySnapshot) and re-serialize the first snapshot after the
  // whole game — any state shared by reference with the live game (city
  // array, hand, score object...) would mutate it to the FINAL board
  let firstSnapshotJson: string | null = null;

  while (steps < maxSteps) {
    if (engine.isFinished()) break;
    steps += 1;

    // Random walk over the engine's legal actions. A rare engine action can
    // fail to apply (engine quirk, not this test's concern) — try the next
    // one instead of failing; derive consistency is asserted on every state
    // actually reached.
    const actions = engine.getLegalActions();
    let applied = false;
    for (let tries = 0; tries < actions.length && !applied; tries += 1) {
      const action = actions[Math.floor(rand() * actions.length)];
      const result = engine.applyAction(action);
      applied = Boolean(result.ok);
    }
    if (!applied) {
      gs.step({ type: MoveType.AUTO } as never);
    }

    const god = gs.getGodViewState() as unknown as ClientGameState;
    if (!firstFrame) {
      firstFrame = god;
      firstFrameFeedLen = (god.actionFeed ?? []).length;
    }
    // persist frames exactly like Room.update() does
    gs.captureReplaySnapshot();
    if (firstSnapshotJson === null && gs.replaySnapshots.length > 0) {
      firstSnapshotJson = JSON.stringify(gs.replaySnapshots[0]);
    }
    playerIds.forEach((pid: PlayerId) => {
      const real = gs.getStateFromPlayer(pid) as unknown as ClientGameState;
      const derived = derivePlayerView(god, pid);
      expect(derived.self).toBe(pid);
      expect(derived.board).toStrictEqual(real.board);
    });
  }
  // frames later than the first must have a feed at least as long — and the
  // first frame's feed must NOT have grown (snapshot immutability)
  if (firstFrame) {
    const finalFrame = gs.getGodViewState() as unknown as ClientGameState;
    expect((finalFrame.actionFeed ?? []).length).toBeGreaterThanOrEqual(firstFrameFeedLen);
    expect((firstFrame.actionFeed ?? []).length).toBe(firstFrameFeedLen);
  }
  // the first PERSISTED snapshot must serialize identically after the whole
  // game ran on — a shared reference (city/hand/score) would have rewritten
  // it into the final board
  if (firstSnapshotJson !== null && gs.replaySnapshots.length > 0) {
    expect(JSON.stringify(gs.replaySnapshots[0])).toBe(firstSnapshotJson);
    // snapshots must also be detached from each other: the last snapshot's
    // serialization differs once the game made progress
    const lastSnapshotJson = JSON.stringify(
      gs.replaySnapshots[gs.replaySnapshots.length - 1],
    );
    expect(lastSnapshotJson === firstSnapshotJson).toBe(
      gs.replaySnapshots.length === 1,
    );
  }
  return steps;
}

describe('derivePlayerView golden test', () => {
  it('derived god frame matches the server player view at every step', () => {
    // two seeds → two different game paths for wider state coverage
    const steps = runGolden(42, 400);
    expect(steps).toBeGreaterThan(50);
    const steps2 = runGolden(1337, 400);
    expect(steps2).toBeGreaterThan(50);
  });
});
