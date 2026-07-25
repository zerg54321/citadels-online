import { describe, it, expect } from 'vitest';
import {
  DistrictId, GamePhase, GameProgress, MoveType,
} from 'citadels-common';
import GameState from '../GameState';
import GameSetupData from '../GameSetupData';
import {
  CharacterType, CharacterPosition, TurnState,
} from '../CharacterManager';

/**
 * Regression coverage for the "Magician forfeits special action after
 * building" rule in ActionExecutor.
 *
 * Bug (fixed 2026-07-26): the Magician could build one or more districts
 * and THEN trigger MAGICIAN_EXCHANGE_HAND / MAGICIAN_DISCARD_CARDS. This
 * was exploitative: a player could empty their hand by building and then
 * swap with an opponent's full hand, or discard a hand they had already
 * emptied. The fix:
 *   1. buildDistrict() clears canDoSpecialAction[MAGICIAN] when the
 *      current character is the Magician.
 *   2. exchangeHand() now guards on canDoSpecialAction[MAGICIAN] (it
 *      previously lacked the check that discardCards already had).
 *
 * These tests drive GameState.buildDistrict / GameState.exchangeHand
 * directly with a minimal DO_ACTIONS + Magician setup.
 */

const SIX = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

function makeMagicianState(hand: DistrictId[], stash: number): GameState {
  const gs = new GameState({ completeCitySize: 8, fastMode: true, syncMode: true });
  SIX.forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
  gs.setupGame(new GameSetupData(SIX, 8));
  gs.progress = GameProgress.IN_GAME;
  if (!gs.board) throw new Error('board missing');

  // setupGame shuffles playerOrder; point the Magician at p1's actual seat.
  const p1Seat = gs.board.playerOrder.indexOf('p1');
  if (p1Seat < 0) throw new Error('p1 missing from playerOrder');

  gs.board.gamePhase = GamePhase.DO_ACTIONS;
  const cm = gs.board.characterManager;
  cm.characters[CharacterType.MAGICIAN] = CharacterPosition.PLAYER_1 + p1Seat;
  // MAGICIAN_BUILD makes getCurrentCharacter() return MAGICIAN; buildDistrict
  // branches on that to decide whether to clear the special-action flag.
  cm.turnState = TurnState.MAGICIAN_BUILD;
  cm.districtsToBuild[CharacterType.MAGICIAN] = 1;
  // Default post-draft state: special action still available.
  cm.canDoSpecialAction[CharacterType.MAGICIAN] = true;

  const p1 = gs.board.players.get('p1')!;
  p1.hand = [...hand];
  p1.stash = stash;
  // Give p2 a distinct hand so a swap would be observable.
  const p2 = gs.board.players.get('p2')!;
  p2.hand = ['church', 'temple'];
  return gs;
}

function buildMove(card: DistrictId) {
  return { type: MoveType.BUILD_DISTRICT, data: card } as const;
}

function exchangeMove(targetSeat: number) {
  return { type: MoveType.MAGICIAN_EXCHANGE_HAND, data: targetSeat } as const;
}

describe('ActionExecutor — Magician build forfeits special action', () => {
  it('clears canDoSpecialAction[MAGICIAN] after a successful build', () => {
    const gs = makeMagicianState(['tavern'], 5);
    const cm = gs.board!.characterManager;

    expect(cm.canDoSpecialAction[CharacterType.MAGICIAN]).toBe(true);

    expect(gs.buildDistrict(buildMove('tavern'))).toBe(true);

    expect(cm.canDoSpecialAction[CharacterType.MAGICIAN]).toBe(false);
  });

  it('rejects MAGICIAN_EXCHANGE_HAND after the Magician has built', () => {
    const gs = makeMagicianState(['tavern'], 5);
    const p1 = gs.board!.players.get('p1')!;
    const p2 = gs.board!.players.get('p2')!;
    const p2Seat = gs.board!.playerOrder.indexOf('p2');

    expect(gs.buildDistrict(buildMove('tavern'))).toBe(true);

    // After the build, p1's hand is empty (tavern was consumed) and p2
    // still holds its original cards. The rejected exchange must not swap.
    const p1HandAfterBuild = [...p1.hand];
    const p2HandAfterBuild = [...p2.hand];
    expect(p1HandAfterBuild).toEqual([]);
    expect(p2HandAfterBuild).toEqual(['church', 'temple']);

    // The mode-switch (no data) is gated by executeAction's CHOOSE_ACTION
    // routing — but the actual swap must be rejected even if a client
    // sends it directly with a target seat.
    const ok = gs.exchangeHand(exchangeMove(p2Seat));

    expect(ok).toBe(false);
    // Hands must be unchanged by the rejected exchange.
    expect(p1.hand).toEqual(p1HandAfterBuild);
    expect(p2.hand).toEqual(p2HandAfterBuild);
  });

  it('still allows MAGICIAN_EXCHANGE_HAND when the Magician has NOT built', () => {
    const gs = makeMagicianState(['tavern'], 5);
    const p1 = gs.board!.players.get('p1')!;
    const p2 = gs.board!.players.get('p2')!;
    const p2Seat = gs.board!.playerOrder.indexOf('p2');
    const p1HandBefore = [...p1.hand];
    const p2HandBefore = [...p2.hand];

    const ok = gs.exchangeHand(exchangeMove(p2Seat));

    expect(ok).toBe(true);
    // Hands swapped.
    expect(p1.hand).toEqual(p2HandBefore);
    expect(p2.hand).toEqual(p1HandBefore);
    // And the special flag is cleared by the exchange itself.
    expect(gs.board!.characterManager.canDoSpecialAction[CharacterType.MAGICIAN]).toBe(false);
  });

  it('does not clear the flag when a non-Magician character builds', () => {
    // Sanity: the build-forfeit rule is scoped to the Magician only.
    // Build with the King and confirm the Magician flag is untouched.
    const gs = new GameState({ completeCitySize: 8, fastMode: true, syncMode: true });
    SIX.forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    gs.setupGame(new GameSetupData(SIX, 8));
    gs.progress = GameProgress.IN_GAME;
    if (!gs.board) throw new Error('board missing');

    const p1Seat = gs.board.playerOrder.indexOf('p1');
    gs.board.gamePhase = GamePhase.DO_ACTIONS;
    const cm = gs.board.characterManager;
    cm.characters[CharacterType.KING] = CharacterPosition.PLAYER_1 + p1Seat;
    cm.turnState = TurnState.KING_BUILD;
    cm.districtsToBuild[CharacterType.KING] = 1;
    cm.canDoSpecialAction[CharacterType.MAGICIAN] = true;

    const p1 = gs.board.players.get('p1')!;
    p1.hand = ['tavern'];
    p1.stash = 5;

    expect(gs.buildDistrict(buildMove('tavern'))).toBe(true);
    // Magician flag must remain true — the King building must not affect it.
    expect(cm.canDoSpecialAction[CharacterType.MAGICIAN]).toBe(true);
  });
});
