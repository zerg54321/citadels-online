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
 * Regression coverage for the "Magician must use the special BEFORE taking
 * resources" rule in ActionExecutor.
 *
 * Rule (changed 2026-08-30): the Magician's exchange / discard special must
 * be used before the normal resource action (draw / gold). Once resources
 * are taken (TAKE_GOLD or DRAW_CARDS resolved), the special is forfeit for
 * the rest of the turn — mirroring the existing build-forfeit rule, so a
 * player can't draw their whole hand first and then dump it on an opponent.
 */

const SIX = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

function makeMagicianState(hand: DistrictId[], stash: number): GameState {
  const gs = new GameState({ completeCitySize: 8, fastMode: true, syncMode: true });
  SIX.forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
  gs.setupGame(new GameSetupData(SIX, 8));
  gs.progress = GameProgress.IN_GAME;
  if (!gs.board) throw new Error('board missing');

  const p1Seat = gs.board.playerOrder.indexOf('p1');
  if (p1Seat < 0) throw new Error('p1 missing from playerOrder');

  gs.board.gamePhase = GamePhase.DO_ACTIONS;
  const cm = gs.board.characterManager;
  cm.characters[CharacterType.MAGICIAN] = CharacterPosition.PLAYER_1 + p1Seat;
  // MAGICIAN_ACTIONS keeps the client in TAKE_RESOURCES before resources are
  // taken, yet makes getCurrentCharacter() return MAGICIAN — matching the
  // real turn lifecycle.
  cm.turnState = TurnState.MAGICIAN_ACTIONS;
  cm.hasTakenResources = false;
  cm.canDoSpecialAction[CharacterType.MAGICIAN] = true;

  const p1 = gs.board.players.get('p1')!;
  p1.hand = [...hand];
  p1.stash = stash;
  const p2 = gs.board.players.get('p2')!;
  p2.hand = ['church', 'temple'];
  return gs;
}

function exchangeMove(targetSeat: number) {
  return { type: MoveType.MAGICIAN_EXCHANGE_HAND, data: targetSeat } as const;
}

function discardMove(cards: DistrictId[]) {
  return { type: MoveType.MAGICIAN_DISCARD_CARDS, data: cards } as const;
}

describe('ActionExecutor — Magician taking resources forfeits special action', () => {
  it('clears canDoSpecialAction[MAGICIAN] after the Magician takes gold', () => {
    const gs = makeMagicianState(['tavern'], 5);
    const cm = gs.board!.characterManager;

    expect(cm.canDoSpecialAction[CharacterType.MAGICIAN]).toBe(true);

    expect(gs.gatherResources({ type: MoveType.TAKE_GOLD })).toBe(true);

    expect(cm.canDoSpecialAction[CharacterType.MAGICIAN]).toBe(false);
  });

  it('rejects MAGICIAN_EXCHANGE_HAND after the Magician takes gold', () => {
    const gs = makeMagicianState(['tavern'], 5);
    const p1 = gs.board!.players.get('p1')!;
    const p2 = gs.board!.players.get('p2')!;
    const p2Seat = gs.board!.playerOrder.indexOf('p2');

    expect(gs.gatherResources({ type: MoveType.TAKE_GOLD })).toBe(true);

    const p1HandAfter = [...p1.hand];
    const p2HandAfter = [...p2.hand];

    const ok = gs.exchangeHand(exchangeMove(p2Seat));

    expect(ok).toBe(false);
    expect(p1.hand).toEqual(p1HandAfter);
    expect(p2.hand).toEqual(p2HandAfter);
  });

  it('rejects MAGICIAN_DISCARD_CARDS after the Magician takes gold', () => {
    const gs = makeMagicianState(['tavern'], 5);
    const p1 = gs.board!.players.get('p1')!;

    expect(gs.gatherResources({ type: MoveType.TAKE_GOLD })).toBe(true);

    const ok = gs.discardCards(discardMove(['tavern']));

    expect(ok).toBe(false);
    // The card must not have been discarded by the rejected move.
    expect(p1.hand).toEqual(['tavern']);
  });

  it('still allows the exchange when the Magician has NOT taken resources', () => {
    const gs = makeMagicianState(['tavern'], 5);
    const p1 = gs.board!.players.get('p1')!;
    const p2 = gs.board!.players.get('p2')!;
    const p2Seat = gs.board!.playerOrder.indexOf('p2');
    const p1HandBefore = [...p1.hand];
    const p2HandBefore = [...p2.hand];

    const ok = gs.exchangeHand(exchangeMove(p2Seat));

    expect(ok).toBe(true);
    expect(p1.hand).toEqual(p2HandBefore);
    expect(p2.hand).toEqual(p1HandBefore);
  });

  it('does not clear the flag when a non-Magician takes gold', () => {
    const gs = new GameState({ completeCitySize: 8, fastMode: true, syncMode: true });
    SIX.forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    gs.setupGame(new GameSetupData(SIX, 8));
    gs.progress = GameProgress.IN_GAME;
    if (!gs.board) throw new Error('board missing');

    const p1Seat = gs.board.playerOrder.indexOf('p1');
    gs.board.gamePhase = GamePhase.DO_ACTIONS;
    const cm = gs.board.characterManager;
    cm.characters[CharacterType.KING] = CharacterPosition.PLAYER_1 + p1Seat;
    cm.turnState = TurnState.KING_ACTIONS;
    cm.hasTakenResources = false;
    cm.canDoSpecialAction[CharacterType.MAGICIAN] = true;

    const p1 = gs.board.players.get('p1')!;
    p1.stash = 5;

    expect(gs.gatherResources({ type: MoveType.TAKE_GOLD })).toBe(true);
    // Magician flag must remain true — the King taking gold must not affect it.
    expect(cm.canDoSpecialAction[CharacterType.MAGICIAN]).toBe(true);
  });
});
