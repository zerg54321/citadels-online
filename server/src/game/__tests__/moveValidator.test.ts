import { describe, it, expect } from 'vitest';
import { Move, MoveType } from 'citadels-common';
import { validateMove } from '../moveValidator';

const ok = (move: Move) => expect(validateMove(move).ok).toBe(true);
const notOk = (move: Move, messageFragment?: string) => {
  const r = validateMove(move);
  expect(r.ok).toBe(false);
  if (messageFragment && !r.ok) {
    expect(r.message).toContain(messageFragment);
  }
};

describe('validateMove', () => {
  it('rejects non-Move input', () => {
    notOk(undefined as unknown as Move);
    notOk(null as unknown as Move);
    notOk({} as Move);
    notOk({ type: 'not a number' } as unknown as Move);
  });

  it('rejects unknown MoveType', () => {
    notOk({ type: 999 } as unknown as Move);
  });

  it('rejects AUTO (server-internal)', () => {
    notOk({ type: MoveType.AUTO }, 'AUTO');
  });

  it('validates CHOOSE_CHARACTER index 0..7 (data required)', () => {
    ok({ type: MoveType.CHOOSE_CHARACTER, data: 0 });
    ok({ type: MoveType.CHOOSE_CHARACTER, data: 7 });
    notOk({ type: MoveType.CHOOSE_CHARACTER, data: -1 });
    notOk({ type: MoveType.CHOOSE_CHARACTER, data: 8 });
    notOk({ type: MoveType.CHOOSE_CHARACTER, data: 1.5 });
    notOk({ type: MoveType.CHOOSE_CHARACTER, data: '0' });
    // data required for CHOOSE_CHARACTER (not dual-use)
    notOk({ type: MoveType.CHOOSE_CHARACTER, data: undefined });
    notOk({ type: MoveType.CHOOSE_CHARACTER });
  });

  it('pure-no-data MoveTypes reject extraneous data', () => {
    const noDataTypes = [
      MoveType.TAKE_GOLD,
      MoveType.TAKE_GOLD_EARNINGS,
      MoveType.MERCHANT_TAKE_1_GOLD,
      MoveType.ARCHITECT_DRAW_2_CARDS,
      MoveType.GRAVEYARD_RECOVER_DISTRICT,
      MoveType.SMITHY_DRAW_CARDS,
      MoveType.DECLINE,
      MoveType.FINISH_TURN,
    ];
    noDataTypes.forEach((type) => {
      ok({ type });
      ok({ type, data: undefined });
      ok({ type, data: null });
      notOk({ type, data: 1 });
      notOk({ type, data: 'manor' });
    });
  });

  it('DRAW_CARDS is dual-use: absent data (mode-switch) or DistrictId (pick)', () => {
    ok({ type: MoveType.DRAW_CARDS });
    ok({ type: MoveType.DRAW_CARDS, data: undefined });
    ok({ type: MoveType.DRAW_CARDS, data: null });
    ok({ type: MoveType.DRAW_CARDS, data: 'manor' });
    notOk({ type: MoveType.DRAW_CARDS, data: 'not_a_district' });
    notOk({ type: MoveType.DRAW_CARDS, data: 5 });
  });

  it('ASSASSIN_KILL / THIEF_ROB are dual-use: absent (mode-switch) or int 1..8 (kill/rob)', () => {
    // mode-switch (no data) — the ActionPanel "assassin_kill" button
    ok({ type: MoveType.ASSASSIN_KILL });
    ok({ type: MoveType.ASSASSIN_KILL, data: undefined });
    ok({ type: MoveType.ASSASSIN_KILL, data: null });
    ok({ type: MoveType.THIEF_ROB });
    // real action (with target character id)
    ok({ type: MoveType.ASSASSIN_KILL, data: 1 });
    ok({ type: MoveType.ASSASSIN_KILL, data: 8 });
    ok({ type: MoveType.THIEF_ROB, data: 2 });
    notOk({ type: MoveType.ASSASSIN_KILL, data: 0 });
    notOk({ type: MoveType.ASSASSIN_KILL, data: 9 });
    notOk({ type: MoveType.ASSASSIN_KILL, data: NaN });
    notOk({ type: MoveType.ASSASSIN_KILL, data: '1' });
  });

  it('MAGICIAN_EXCHANGE_HAND is dual-use: absent (mode-switch) or int 0..6 (target seat)', () => {
    ok({ type: MoveType.MAGICIAN_EXCHANGE_HAND });
    ok({ type: MoveType.MAGICIAN_EXCHANGE_HAND, data: 0 });
    ok({ type: MoveType.MAGICIAN_EXCHANGE_HAND, data: 6 });
    notOk({ type: MoveType.MAGICIAN_EXCHANGE_HAND, data: -1 });
    notOk({ type: MoveType.MAGICIAN_EXCHANGE_HAND, data: 7 });
    notOk({ type: MoveType.MAGICIAN_EXCHANGE_HAND, data: 'x' });
  });

  it('MAGICIAN_DISCARD_CARDS is dual-use: absent (mode-switch) or DistrictId[] (discard)', () => {
    ok({ type: MoveType.MAGICIAN_DISCARD_CARDS });
    ok({ type: MoveType.MAGICIAN_DISCARD_CARDS, data: [] });
    ok({ type: MoveType.MAGICIAN_DISCARD_CARDS, data: ['manor', 'tavern'] });
    notOk({ type: MoveType.MAGICIAN_DISCARD_CARDS, data: 'manor' });
    notOk({ type: MoveType.MAGICIAN_DISCARD_CARDS, data: ['manor', 'bad_id'] });
    notOk({ type: MoveType.MAGICIAN_DISCARD_CARDS, data: [1, 2] });
  });

  it('BUILD_DISTRICT / LABORATORY_DISCARD_CARD are dual-use: absent (mode-switch) or DistrictId', () => {
    ok({ type: MoveType.BUILD_DISTRICT });
    ok({ type: MoveType.BUILD_DISTRICT, data: 'manor' });
    ok({ type: MoveType.LABORATORY_DISCARD_CARD });
    ok({ type: MoveType.LABORATORY_DISCARD_CARD, data: 'smithy' });
    notOk({ type: MoveType.BUILD_DISTRICT, data: 'bad_id' });
    notOk({ type: MoveType.BUILD_DISTRICT, data: 5 });
    notOk({ type: MoveType.LABORATORY_DISCARD_CARD, data: 'bad_id' });
  });

  it('WARLORD_DESTROY_DISTRICT is dual-use: absent (mode-switch) or {player, card}', () => {
    ok({ type: MoveType.WARLORD_DESTROY_DISTRICT });
    ok({ type: MoveType.WARLORD_DESTROY_DISTRICT, data: { player: 0, card: 'manor' } });
    ok({ type: MoveType.WARLORD_DESTROY_DISTRICT, data: { player: 6, card: 'keep' } });
    notOk({ type: MoveType.WARLORD_DESTROY_DISTRICT, data: 'manor' });
    notOk({ type: MoveType.WARLORD_DESTROY_DISTRICT, data: { player: 0 } });
    notOk({ type: MoveType.WARLORD_DESTROY_DISTRICT, data: { card: 'manor' } });
    notOk({ type: MoveType.WARLORD_DESTROY_DISTRICT, data: { player: 'x', card: 'manor' } });
    notOk({ type: MoveType.WARLORD_DESTROY_DISTRICT, data: { player: 7, card: 'manor' } });
    notOk({ type: MoveType.WARLORD_DESTROY_DISTRICT, data: { player: 0, card: 'bad_id' } });
    // extra fields are ignored — only player & card are validated
    ok({
      type: MoveType.WARLORD_DESTROY_DISTRICT,
      data: { player: 0, card: 'manor', extra: 'ignored' },
    });
  });
});
