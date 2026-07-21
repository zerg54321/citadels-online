import { describe, it, expect } from 'vitest';
import { DistrictId } from 'citadels-common';
import PlayerBoardState from '../PlayerBoardState';
import { CharacterType } from '../CharacterManager';

/**
 * Phase 3.3 — PlayerBoardState unit tests.
 *
 * Covers build/destroy mechanics, character earnings (with school_of_magic
 * wildcard), destroy cost (with great_wall discount), hand management, and
 * the computeScore path (base + completion bonus + 5-color bonus).
 *
 * Note: PlayerBoardState.computeScore is also exercised via ScoreCalculator
 * tests at the GameState level; here we test it in isolation.
 */

function makeBoard(stash = 10, hand: DistrictId[] = [], city: DistrictId[] = []) {
  return new PlayerBoardState(stash, hand, city);
}

describe('PlayerBoardState — construction & defaults', () => {
  it('initializes with given stash, hand, city and empty tmpHand', () => {
    const b = makeBoard(5, ['tavern'], ['manor']);
    expect(b.stash).toBe(5);
    expect(b.hand).toEqual(['tavern']);
    expect(b.city).toEqual(['manor']);
    expect(b.tmpHand).toEqual([]);
    expect(b.score).toEqual({});
    expect(b.firstToCompleteCity).toBe(false);
    expect(b.sameTurnCompleteCity).toBe(false);
    expect(b.hauntedQuarterBuiltInFinalRound).toBe(false);
  });

  it('city defaults to empty when not provided', () => {
    const b = new PlayerBoardState(2, ['tavern']);
    expect(b.city).toEqual([]);
  });
});

describe('PlayerBoardState — buildDistrict', () => {
  it('builds a district: deducts cost, moves card from hand to city', () => {
    const b = makeBoard(5, ['manor']); // cost 3
    expect(b.buildDistrict('manor')).toBe(true);
    expect(b.stash).toBe(2);
    expect(b.hand).toEqual([]);
    expect(b.city).toEqual(['manor']);
  });

  it('fails when card not in hand', () => {
    const b = makeBoard(5, ['tavern']);
    expect(b.buildDistrict('manor')).toBe(false);
    expect(b.stash).toBe(5);
    expect(b.city).toEqual([]);
  });

  it('fails when card already in city (no duplicates)', () => {
    const b = makeBoard(10, ['manor'], ['manor']);
    expect(b.buildDistrict('manor')).toBe(false);
    expect(b.stash).toBe(10);
    expect(b.city).toEqual(['manor']);
  });

  it('fails when insufficient gold', () => {
    const b = makeBoard(2, ['palace']); // cost 5
    expect(b.buildDistrict('palace')).toBe(false);
    expect(b.stash).toBe(2);
    expect(b.city).toEqual([]);
    expect(b.hand).toEqual(['palace']);
  });

  it('fails for unknown district id', () => {
    const b = makeBoard(100, ['nonexistent' as DistrictId]);
    expect(b.buildDistrict('nonexistent' as DistrictId)).toBe(false);
    expect(b.stash).toBe(100);
  });

  it('builds exactly when cost == stash (boundary)', () => {
    const b = makeBoard(3, ['manor']); // cost 3
    expect(b.buildDistrict('manor')).toBe(true);
    expect(b.stash).toBe(0);
  });

  it('builds multiple districts in sequence', () => {
    const b = makeBoard(10, ['tavern', 'church', 'watchtower']); // 1+2+1
    expect(b.buildDistrict('tavern')).toBe(true);
    expect(b.buildDistrict('church')).toBe(true);
    expect(b.buildDistrict('watchtower')).toBe(true);
    expect(b.stash).toBe(6);
    expect(b.city).toEqual(['tavern', 'church', 'watchtower']);
    expect(b.hand).toEqual([]);
  });
});

describe('PlayerBoardState — hand management', () => {
  it('addCardsToHand appends cards', () => {
    const b = makeBoard(5, ['tavern']);
    b.addCardsToHand(['manor', 'church']);
    expect(b.hand).toEqual(['tavern', 'manor', 'church']);
  });

  it('takeCardFromHand removes and returns the card', () => {
    const b = makeBoard(5, ['tavern', 'manor']);
    expect(b.takeCardFromHand('manor')).toBe('manor');
    expect(b.hand).toEqual(['tavern']);
  });

  it('takeCardFromHand returns null for absent card', () => {
    const b = makeBoard(5, ['tavern']);
    expect(b.takeCardFromHand('manor')).toBeNull();
    expect(b.hand).toEqual(['tavern']);
  });

  it('hasCardInCity checks city membership', () => {
    const b = makeBoard(5, [], ['manor']);
    expect(b.hasCardInCity('manor')).toBe(true);
    expect(b.hasCardInCity('tavern')).toBe(false);
  });
});

describe('PlayerBoardState — destroyDistrict & computeDestroyCost', () => {
  it('destroyDistrict removes card from city', () => {
    const b = makeBoard(5, [], ['manor', 'tavern']);
    b.destroyDistrict('manor');
    expect(b.city).toEqual(['tavern']);
  });

  it('destroyDistrict is a no-op for absent card', () => {
    const b = makeBoard(5, [], ['manor']);
    b.destroyDistrict('tavern');
    expect(b.city).toEqual(['manor']);
  });

  it('computeDestroyCost = cost - 1 (default destroy discount)', () => {
    const b = makeBoard(5, [], ['manor']); // cost 3
    expect(b.computeDestroyCost('manor')).toBe(2);
  });

  it('computeDestroyCost floors at 0 for cost-1 districts', () => {
    const b = makeBoard(5, [], ['tavern']); // cost 1
    // cost 1 - discount 1 = 0
    expect(b.computeDestroyCost('tavern')).toBe(0);
  });

  it('great_wall removes the destroy discount for other districts', () => {
    // owner has great_wall: discount becomes 0 (the `: 0` branch), so cost-1 = full cost
    const b = makeBoard(5, [], ['great_wall', 'manor']);
    expect(b.computeDestroyCost('manor')).toBe(3); // no discount
  });

  it('great_wall itself still uses the discount', () => {
    const b = makeBoard(5, [], ['great_wall']); // cost 6
    // great_wall protects others but not itself: discount applies
    expect(b.computeDestroyCost('great_wall')).toBe(5);
  });
});

describe('PlayerBoardState — computeEarningsForCharacter', () => {
  it('KING earns 1 per NOBLE district', () => {
    const b = makeBoard(5, [], ['manor', 'castle']); // 2 noble
    expect(b.computeEarningsForCharacter(CharacterType.KING)).toBe(2);
  });

  it('BISHOP earns 1 per RELIGIOUS district', () => {
    const b = makeBoard(5, [], ['temple', 'church', 'monastery']); // 3 religious
    expect(b.computeEarningsForCharacter(CharacterType.BISHOP)).toBe(3);
  });

  it('MERCHANT earns 1 per TRADE district', () => {
    const b = makeBoard(5, [], ['tavern', 'market']); // 2 trade
    expect(b.computeEarningsForCharacter(CharacterType.MERCHANT)).toBe(2);
  });

  it('WARLORD earns 1 per MILITARY district', () => {
    const b = makeBoard(5, [], ['watchtower', 'prison', 'barracks']); // 3 military
    expect(b.computeEarningsForCharacter(CharacterType.WARLORD)).toBe(3);
  });

  it('ASSASSIN / THIEF / MAGICIAN / ARCHITECT earn 0 (no matching type)', () => {
    const b = makeBoard(5, [], ['manor', 'temple', 'tavern']);
    expect(b.computeEarningsForCharacter(CharacterType.ASSASSIN)).toBe(0);
    expect(b.computeEarningsForCharacter(CharacterType.THIEF)).toBe(0);
    expect(b.computeEarningsForCharacter(CharacterType.MAGICIAN)).toBe(0);
    expect(b.computeEarningsForCharacter(CharacterType.ARCHITECT)).toBe(0);
  });

  it('earns 0 with empty city', () => {
    const b = makeBoard(5, [], []);
    expect(b.computeEarningsForCharacter(CharacterType.KING)).toBe(0);
  });

  it('school_of_magic adds +1 wildcard earning for any earning character', () => {
    const b = makeBoard(5, [], ['manor', 'school_of_magic']); // 1 noble + school
    expect(b.computeEarningsForCharacter(CharacterType.KING)).toBe(2);
    expect(b.computeEarningsForCharacter(CharacterType.BISHOP)).toBe(1); // school only
    expect(b.computeEarningsForCharacter(CharacterType.MERCHANT)).toBe(1); // school only
    expect(b.computeEarningsForCharacter(CharacterType.WARLORD)).toBe(1); // school only
  });

  it('school_of_magic does NOT add earnings to non-earning characters', () => {
    // Rule: school_of_magic counts as any color, but only earning
    // characters (King/Bishop/Merchant/Warlord) collect from it. Assassin/
    // Thief/Magician/Architect never collect earnings, including from school.
    const b = makeBoard(5, [], ['school_of_magic']);
    expect(b.computeEarningsForCharacter(CharacterType.ASSASSIN)).toBe(0);
    expect(b.computeEarningsForCharacter(CharacterType.MAGICIAN)).toBe(0);
    expect(b.computeEarningsForCharacter(CharacterType.THIEF)).toBe(0);
    expect(b.computeEarningsForCharacter(CharacterType.ARCHITECT)).toBe(0);
  });

  it('non-earning characters still earn 0 even with school + matching districts', () => {
    // School must not leak +1 to non-earners even when other districts exist.
    const b = makeBoard(5, [], ['manor', 'temple', 'school_of_magic']);
    expect(b.computeEarningsForCharacter(CharacterType.ASSASSIN)).toBe(0);
    expect(b.computeEarningsForCharacter(CharacterType.MAGICIAN)).toBe(0);
  });

  it('mixed city earns correctly for each character', () => {
    const b = makeBoard(5, [],
      ['manor', 'temple', 'tavern', 'watchtower', 'school_of_magic']);
    // noble(1) + religious(1) + trade(1) + military(1) + unique(school)
    expect(b.computeEarningsForCharacter(CharacterType.KING)).toBe(2); // manor + school
    expect(b.computeEarningsForCharacter(CharacterType.BISHOP)).toBe(2); // temple + school
    expect(b.computeEarningsForCharacter(CharacterType.MERCHANT)).toBe(2); // tavern + school
    expect(b.computeEarningsForCharacter(CharacterType.WARLORD)).toBe(2); // watchtower + school
  });
});

describe('PlayerBoardState — computeScore', () => {
  it('base score = sum of district costs (no bonuses)', () => {
    const b = makeBoard(5, [], ['manor', 'temple']); // 3 + 1 = 4
    b.computeScore(8);
    expect(b.score.base).toBe(4);
    expect(b.score.extraPointsCompleteCity).toBeUndefined();
    expect(b.score.extraPointsDistrictTypes).toBeUndefined();
    expect(b.score.total).toBe(4);
  });

  it('completion bonus +4 for first to complete (city >= completeCitySize)', () => {
    const city: DistrictId[] = ['manor', 'castle', 'temple', 'church',
      'tavern', 'market', 'watchtower', 'prison']; // 8, 4 types
    const b = makeBoard(5, [], city);
    b.firstToCompleteCity = true;
    b.computeScore(8);
    expect(b.score.base).toBe(16); // 3+4+1+2+1+2+1+2
    expect(b.score.extraPointsCompleteCity).toBe(4);
    expect(b.score.extraPointsDistrictTypes).toBeUndefined();
    expect(b.score.total).toBe(20);
  });

  it('completion bonus +2 for later completer (flag false, size met)', () => {
    const city: DistrictId[] = ['manor', 'castle', 'temple', 'church',
      'tavern', 'market', 'watchtower', 'prison'];
    const b = makeBoard(5, [], city);
    b.firstToCompleteCity = false;
    b.computeScore(8);
    expect(b.score.extraPointsCompleteCity).toBe(2);
    expect(b.score.total).toBe(18); // 16 + 2
  });

  it('no completion bonus when city < completeCitySize even if flag set', () => {
    const b = makeBoard(5, [], ['manor', 'temple']); // size 2 < 8
    b.firstToCompleteCity = true;
    b.computeScore(8);
    expect(b.score.extraPointsCompleteCity).toBeUndefined();
    expect(b.score.total).toBe(4);
  });

  it('5-color bonus +3 when all 5 district types present', () => {
    // noble(1) + religious(2) + trade(3) + military(4) + unique(5)
    const b = makeBoard(5, [], ['manor', 'temple', 'tavern', 'watchtower', 'keep']);
    b.computeScore(8);
    expect(b.score.extraPointsDistrictTypes).toBe(3);
    expect(b.score.total).toBe(12); // 9 base + 3
  });

  it('no 5-color bonus with 4 types', () => {
    const b = makeBoard(5, [], ['manor', 'temple', 'tavern', 'watchtower']);
    b.computeScore(8);
    expect(b.score.extraPointsDistrictTypes).toBeUndefined();
    expect(b.score.total).toBe(6);
  });

  it('completion + 5-color bonuses stack', () => {
    const city: DistrictId[] = ['manor', 'castle', 'temple', 'tavern',
      'market', 'watchtower', 'prison', 'keep']; // 8, 5 types
    const b = makeBoard(5, [], city);
    b.firstToCompleteCity = true;
    b.computeScore(8);
    expect(b.score.base).toBe(17); // 3+4+1+1+2+1+2+3
    expect(b.score.extraPointsCompleteCity).toBe(4);
    expect(b.score.extraPointsDistrictTypes).toBe(3);
    expect(b.score.total).toBe(24);
  });

  it('haunted_quarter counts as wildcard color when not built in final round', () => {
    // 4 real types + haunted_quarter as 5th → 5-color bonus applies
    const b = makeBoard(5, [],
      ['manor', 'temple', 'tavern', 'watchtower', 'haunted_quarter']);
    b.hauntedQuarterBuiltInFinalRound = false;
    b.computeScore(8);
    expect(b.score.extraPointsDistrictTypes).toBe(3);
    // base = 3+1+1+1+2 = 8, +3 = 11
    expect(b.score.total).toBe(11);
  });

  it('haunted_quarter does NOT count as wildcard when built in final round', () => {
    // same city but haunted built in final round → only 4 types, no bonus
    const b = makeBoard(5, [],
      ['manor', 'temple', 'tavern', 'watchtower', 'haunted_quarter']);
    b.hauntedQuarterBuiltInFinalRound = true;
    b.computeScore(8);
    expect(b.score.extraPointsDistrictTypes).toBeUndefined();
    expect(b.score.total).toBe(8);
  });

  it('empty city scores 0', () => {
    const b = makeBoard(5, [], []);
    b.computeScore(8);
    expect(b.score.base).toBe(0);
    expect(b.score.total).toBe(0);
  });

  it('recomputing score is idempotent (no accumulation)', () => {
    const b = makeBoard(5, [], ['manor', 'temple', 'tavern', 'watchtower', 'keep']);
    b.computeScore(8);
    const first = { ...b.score };
    b.computeScore(8);
    b.computeScore(8);
    expect(b.score).toEqual(first);
  });
});

describe('PlayerBoardState — exportForPlayer', () => {
  it('hides hand when canSeeHand is false', () => {
    const b = makeBoard(5, ['manor', 'temple'], ['tavern']);
    const exp = b.exportForPlayer(false);
    expect(exp.hand).toEqual([null, null]); // length preserved, values null
    expect(exp.tmpHand).toEqual([]);
    expect(exp.city).toEqual(['tavern']);
    expect(exp.stash).toBe(5);
  });

  it('shows hand when canSeeHand is true', () => {
    const b = makeBoard(5, ['manor', 'temple'], ['tavern']);
    const exp = b.exportForPlayer(true);
    expect(exp.hand).toEqual(['manor', 'temple']);
    expect(exp.city).toEqual(['tavern']);
  });

  it('characters always exported as empty array (filled by BoardState)', () => {
    const b = makeBoard(5, [], []);
    expect(b.exportForPlayer(true).characters).toEqual([]);
  });
});
