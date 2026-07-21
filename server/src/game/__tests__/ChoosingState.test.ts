import { describe, it, expect } from 'vitest';
import {
  CharacterChoosingStateType as CCST,
  PlayerPosition,
} from 'citadels-common';
import { CharacterChoosingState } from '../ChoosingState';

/**
 * Phase 3.2 — CharacterChoosingState FSM tests (6-player / 3v3 only).
 *
 * Pins the 6P character-selection state sequence and FSM boundaries
 * (INITIAL → aside → 6 chooses → aside → DONE). These are pure state
 * transitions; action application is covered by engineConsistency tests.
 */

describe('CharacterChoosingState — 6-player FSM', () => {
  it('constructs with stateNumber 0 and INITIAL/SPECTATOR', () => {
    const s = new CharacterChoosingState(6);
    expect(s.stateNumber).toBe(0);
    expect(s.getState()).toEqual({
      type: CCST.INITIAL,
      player: PlayerPosition.SPECTATOR,
    });
  });

  it('has exactly 10 states for 6P (INITIAL, aside, 6 chooses, aside, DONE)', () => {
    const s = new CharacterChoosingState(6);
    // Walk to the end and count via step
    let count = 1;
    while (s.getState().type !== CCST.DONE) {
      s.step();
      count += 1;
    }
    expect(count).toBe(10);
  });

  it('follows the exact 6P state sequence', () => {
    const s = new CharacterChoosingState(6);
    const seq: Array<{ type: CCST; player: PlayerPosition }> = [];
    for (let i = 0; i < 10; i += 1) {
      seq.push(s.getState());
      if (s.getState().type === CCST.DONE) break;
      s.step();
    }

    expect(seq).toEqual([
      { type: CCST.INITIAL, player: PlayerPosition.SPECTATOR },
      { type: CCST.PUT_ASIDE_FACE_DOWN, player: PlayerPosition.PLAYER_1 },
      { type: CCST.CHOOSE_CHARACTER, player: PlayerPosition.PLAYER_1 },
      { type: CCST.CHOOSE_CHARACTER, player: PlayerPosition.PLAYER_2 },
      { type: CCST.CHOOSE_CHARACTER, player: PlayerPosition.PLAYER_3 },
      { type: CCST.CHOOSE_CHARACTER, player: PlayerPosition.PLAYER_4 },
      { type: CCST.CHOOSE_CHARACTER, player: PlayerPosition.PLAYER_5 },
      { type: CCST.CHOOSE_CHARACTER, player: PlayerPosition.PLAYER_6 },
      { type: CCST.PUT_ASIDE_FACE_DOWN, player: PlayerPosition.SPECTATOR },
      { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
    ]);
  });

  it('each CHOOSE_CHARACTER state targets a distinct player 1..6 in order', () => {
    const s = new CharacterChoosingState(6);
    // skip INITIAL + first aside (2 steps)
    s.step(); s.step();
    const choosers: PlayerPosition[] = [];
    for (let i = 0; i < 6; i += 1) {
      choosers.push(s.getState().player);
      s.step();
    }
    expect(choosers).toEqual([
      PlayerPosition.PLAYER_1,
      PlayerPosition.PLAYER_2,
      PlayerPosition.PLAYER_3,
      PlayerPosition.PLAYER_4,
      PlayerPosition.PLAYER_5,
      PlayerPosition.PLAYER_6,
    ]);
  });

  it('step at DONE does not advance past the last state (boundary)', () => {
    const s = new CharacterChoosingState(6);
    // advance to DONE
    for (let i = 0; i < 20; i += 1) s.step();
    expect(s.getState().type).toBe(CCST.DONE);
    const lastIndex = s.stateNumber;
    s.step();
    s.step();
    s.step();
    expect(s.stateNumber).toBe(lastIndex);
    expect(s.getState().type).toBe(CCST.DONE);
  });

  it('reset returns to stateNumber 0 / INITIAL', () => {
    const s = new CharacterChoosingState(6);
    s.step(); s.step(); s.step();
    expect(s.stateNumber).toBe(3);
    s.reset();
    expect(s.stateNumber).toBe(0);
    expect(s.getState().type).toBe(CCST.INITIAL);
  });

  it('6P uses PUT_ASIDE_FACE_DOWN (never PUT_ASIDE_FACE_UP)', () => {
    const s = new CharacterChoosingState(6);
    const types: CCST[] = [];
    for (let i = 0; i < 10; i += 1) {
      types.push(s.getState().type);
      if (s.getState().type === CCST.DONE) break;
      s.step();
    }
    expect(types).not.toContain(CCST.PUT_ASIDE_FACE_UP);
    expect(types).not.toContain(CCST.PUT_ASIDE_FACE_DOWN_UP);
    expect(types).not.toContain(CCST.GET_ASIDE_FACE_DOWN);
    expect(types.filter((t) => t === CCST.PUT_ASIDE_FACE_DOWN)).toHaveLength(2);
  });

  it('throws on invalid player count (not 2..7)', () => {
    expect(() => new CharacterChoosingState(1)).toThrow();
    expect(() => new CharacterChoosingState(8)).toThrow();
    expect(() => new CharacterChoosingState(0)).toThrow();
  });

  it('getState is idempotent (no side effects)', () => {
    const s = new CharacterChoosingState(6);
    const a = s.getState();
    const b = s.getState();
    expect(a).toEqual(b);
    expect(s.stateNumber).toBe(0);
  });
});
