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
 * Regression coverage for the build-cap guard in ActionExecutor.buildDistrict.
 *
 * Bug (fixed 2026-07-26): a player whose city had already reached
 * completeCitySize could keep building — notably the Architect (3 builds/turn)
 * starting from 7 districts could build to 9+ in one turn, because the
 * executor only checked the per-character build quota, not the completion
 * threshold. The fix adds a hard cap: once city.length >= completeCitySize,
 * buildDistrict returns false.
 *
 * These tests drive GameState.buildDistrict directly with a minimal DO_ACTIONS
 * + Architect setup so the guard is exercised without a full game flow.
 */

const SIX = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

/** Eight distinct districts so the no-duplicate rule never trips. */
const EIGHT_DISTRICTS: DistrictId[] = [
  'tavern', 'church', 'watchtower', 'manor',
  'market', 'prison', 'temple', 'trading_post',
];

function makeArchitectState(city: DistrictId[], hand: DistrictId[], stash: number): GameState {
  const gs = new GameState({ completeCitySize: 8, fastMode: true, syncMode: true });
  SIX.forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
  gs.setupGame(new GameSetupData(SIX, 8));
  gs.progress = GameProgress.IN_GAME;
  if (!gs.board) throw new Error('board missing');

  // setupGame shuffles playerOrder (host/random start), so p1 is not
  // necessarily at index 0. Point the Architect at p1's actual seat.
  const p1Seat = gs.board.playerOrder.indexOf('p1');
  if (p1Seat < 0) throw new Error('p1 missing from playerOrder');

  gs.board.gamePhase = GamePhase.DO_ACTIONS;
  const cm = gs.board.characterManager;
  cm.characters[CharacterType.ARCHITECT] = CharacterPosition.PLAYER_1 + p1Seat;
  cm.turnState = TurnState.ARCHITECT_BUILD; // getCurrentCharacter() → ARCHITECT
  cm.districtsToBuild[CharacterType.ARCHITECT] = 3; // full Architect quota

  const p1 = gs.board.players.get('p1')!;
  p1.city = [...city];
  p1.hand = [...hand];
  p1.stash = stash;
  return gs;
}

function buildMove(card: DistrictId) {
  return { type: MoveType.BUILD_DISTRICT, data: card } as const;
}

describe('ActionExecutor.buildDistrict — completion cap', () => {
  it('rejects building once the city already reached completeCitySize', () => {
    // p1 has 8 districts (the threshold) and an unused Architect quota of 3,
    // plus enough gold and a buildable card in hand. Before the fix this would
    // have built a 9th district.
    const gs = makeArchitectState(EIGHT_DISTRICTS, ['harbor'], 10);
    const p1 = gs.board!.players.get('p1')!;

    const ok = gs.buildDistrict(buildMove('harbor'));

    expect(ok).toBe(false);
    expect(p1.city).toHaveLength(8);
    expect(p1.city).not.toContain('harbor');
    expect(p1.stash).toBe(10); // no gold spent
    expect(p1.hand).toEqual(['harbor']); // card not consumed
    // Quota must NOT be decremented on a rejected build.
    expect(gs.board!.characterManager.districtsToBuild[CharacterType.ARCHITECT]).toBe(3);
  });

  it('still allows the build that reaches the threshold (cap is not off-by-one)', () => {
    // p1 has 7 districts; building an 8th must succeed and trigger completion.
    const seven = EIGHT_DISTRICTS.slice(0, 7);
    const gs = makeArchitectState(seven, ['harbor'], 10);
    const p1 = gs.board!.players.get('p1')!;

    const ok = gs.buildDistrict(buildMove('harbor'));

    expect(ok).toBe(true);
    expect(p1.city).toHaveLength(8);
    expect(p1.city).toContain('harbor');
    expect(p1.firstToCompleteCity).toBe(true);
    expect(gs.cityCompletedThisMatch).toBe(true);
  });

  it('rejects a further build after the threshold is reached in the same turn', () => {
    // Simulate the Architect hitting 8 mid-turn, then trying to build again
    // with the remaining quota. The cap must hold even with quota to spare.
    const seven = EIGHT_DISTRICTS.slice(0, 7);
    const gs = makeArchitectState(seven, ['harbor', 'docks'], 20);
    const p1 = gs.board!.players.get('p1')!;

    // First build: 7 → 8 (allowed, completes the city).
    expect(gs.buildDistrict(buildMove('harbor'))).toBe(true);
    expect(p1.city).toHaveLength(8);
    // Quota decremented to 2 after the successful build.
    expect(gs.board!.characterManager.districtsToBuild[CharacterType.ARCHITECT]).toBe(2);

    // Second build: 8 → 9 must be blocked by the cap despite quota == 2.
    expect(gs.buildDistrict(buildMove('docks'))).toBe(false);
    expect(p1.city).toHaveLength(8);
    expect(p1.city).not.toContain('docks');
    expect(p1.hand).toContain('docks');
    expect(gs.board!.characterManager.districtsToBuild[CharacterType.ARCHITECT]).toBe(2);
  });
});
