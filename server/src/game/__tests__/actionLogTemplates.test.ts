import { describe, it, expect } from 'vitest';
import { CharacterType } from 'citadels-common';
import {
  templateKill,
  templateRob,
  templateRobMove,
  templateRobMoveEmpty,
} from '../actionLogTemplates';

// Regression guard for the off-by-one bug where the action feed showed the
// wrong character: `role` params must be 1-based client ids (matching the
// 1-indexed `characters` i18n array and CharacterManager's face-up card ids),
// NOT the 0-based CharacterType enum. Before the fix, templateKill(WARLORD)
// emitted role:7, which the client resolved to "Architect" (characters[7])
// instead of "Warlord" (characters[8]).

const players = new Map<string, { username: string }>([
  ['p1', { username: 'Alice' }],
  ['p2', { username: 'Bob' }],
]);

describe('actionLogTemplates role params are 1-based client ids', () => {
  it('templateKill shifts enum to 1-based', () => {
    expect(templateKill(CharacterType.ASSASSIN)).toEqual({ kind: 'kill', params: { role: 1 } });
    expect(templateKill(CharacterType.ARCHITECT)).toEqual({ kind: 'kill', params: { role: 7 } });
    expect(templateKill(CharacterType.WARLORD)).toEqual({ kind: 'kill', params: { role: 8 } });
  });

  it('templateRob shifts enum to 1-based', () => {
    expect(templateRob(CharacterType.THIEF)).toEqual({ kind: 'rob', params: { role: 2 } });
    expect(templateRob(CharacterType.KING)).toEqual({ kind: 'rob', params: { role: 4 } });
  });

  it('templateRobMove shifts robbedRole to 1-based, keeps other params', () => {
    expect(templateRobMove(players, 'p1', CharacterType.MERCHANT, 5, 'p2')).toEqual({
      kind: 'rob_move',
      params: {
        player: 'Alice',
        role: 6,
        amount: 5,
        thief: 'Bob',
      },
    });
  });

  it('templateRobMoveEmpty shifts robbedRole to 1-based', () => {
    expect(templateRobMoveEmpty(players, 'p2', CharacterType.BISHOP)).toEqual({
      kind: 'rob_move_empty',
      params: { player: 'Bob', role: 5 },
    });
  });
});
