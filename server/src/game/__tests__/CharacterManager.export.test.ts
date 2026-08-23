import { describe, it, expect } from 'vitest';
import {
  CharacterChoosingStateType as CCST,
  PlayerPosition,
} from 'citadels-common';
import CharacterManager from '../CharacterManager';

/**
 * Regression guard for put-aside (弃置) candidate card visibility.
 *
 * During normal play a player putting a character aside must see the
 * candidates as CARD-BACKS (id 0) — a blind pick. The god-view (revealAll)
 * path is the only one allowed to reveal them face-up.
 *
 * A prior change to exportListPutAside flipped the canSee argument from false
 * to true, which showed these candidates face-up to normal players (bug).
 * These tests pin both behaviors so it cannot regress again.
 */
describe('CharacterManager.exportCharactersList — put-aside reveal', () => {
  /** Drive a 6P CharacterManager into its first PUT_ASIDE_FACE_DOWN state
   *  (targets PLAYER_1), i.e. one step past INITIAL. */
  function cmInPutAside(): CharacterManager {
    const cm = new CharacterManager(6);
    cm.choosingState.step();
    expect(cm.choosingState.getState().type).toBe(CCST.PUT_ASIDE_FACE_DOWN);
    expect(cm.choosingState.getState().player).toBe(PlayerPosition.PLAYER_1);
    return cm;
  }

  it('keeps put-aside candidates as card-backs for a normal player', () => {
    const cm = cmInPutAside();
    // exportCharactersList's inferred return type is just { state } (the
    // spread `characters` is typed {} internally), so assert through unknown.
    const list = cm.exportCharactersList(PlayerPosition.PLAYER_1) as unknown as {
      callable: Array<{ id: number }>;
    };
    expect(list.callable.length).toBeGreaterThan(0);
    // id 0 = card back; a normal player must NOT see the candidate roles.
    expect(list.callable.every((c) => c.id === 0)).toBe(true);
  });

  it('reveals put-aside candidates in god-view (revealAll)', () => {
    const cm = cmInPutAside();
    const list = cm.exportCharactersList(PlayerPosition.PLAYER_1, true) as unknown as {
      callable: Array<{ id: number }>;
    };
    expect(list.callable.length).toBeGreaterThan(0);
    // god-view sees real role ids (1..8) face-up.
    expect(list.callable.every((c) => c.id >= 1)).toBe(true);
  });
});
