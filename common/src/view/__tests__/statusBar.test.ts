import { describe, it, expect } from 'vitest';
import {
  CharacterChoosingStateType as CCST,
  CharacterType,
  ClientGameState,
  ClientTurnState,
  GameMode,
  GamePhase,
  GameProgress,
  MoveType,
  PlayerPosition,
  PlayerRole,
  TeamId,
} from '../../index';
import { getStatusBarData } from '../statusBar';
import type { StatusBarData } from '../statusBar';

/**
 * Phase 2.1 — getStatusBarData pure-function tests.
 *
 * Verifies the i18n key mapping for every turn/choose state, the spectator
 * and "other player's turn" branches, the FINISHED/INVALID fallbacks, and
 * the action-list generation (including injected selectedCards for the
 * magician discard confirm move).
 */

const EXTRA_BASE = {
  districtsToBuild: 0,
  canTakeEarnings: false,
  canDoSpecialAction: false,
  hasUsedLaboratory: false,
  hasUsedSmithy: false,
  earningsValue: 0,
};

function makeBaseState(overrides: Partial<ClientGameState> = {}): ClientGameState {
  return {
    progress: GameProgress.IN_GAME,
    gameMode: GameMode.COMPETITIVE_TEAM6,
    self: 'p1',
    players: {
      p1: {
        id: 'p1', username: 'Alice', manager: false, online: true,
        role: PlayerRole.PLAYER, team: TeamId.A,
      },
    },
    board: {
      players: {},
      gamePhase: GamePhase.DO_ACTIONS,
      turnState: ClientTurnState.INITIAL,
      playerOrder: ['p1'],
      currentPlayer: PlayerPosition.PLAYER_1,
      currentPlayerExtraData: { ...EXTRA_BASE },
      characters: {
        state: { type: CCST.INITIAL, player: PlayerPosition.PLAYER_1 },
        current: CharacterType.NONE,
        callable: [],
        aside: [],
      },
      graveyard: undefined,
    },
    settings: { completeCitySize: 8, actionTimeoutSeconds: 120 },
    ...overrides,
  } as ClientGameState;
}

function makeSelfBoard(city: string[] = [], hand: (string | null)[] = []) {
  return {
    stash: 5,
    hand,
    tmpHand: [],
    city,
    score: {},
    characters: [],
  };
}

describe('getStatusBarData — progress fallbacks', () => {
  it('FINISHED → end-of-game message', () => {
    const gs = makeBaseState({ progress: GameProgress.FINISHED });
    expect(getStatusBarData(gs)).toEqual<StatusBarData>({
      type: 'NORMAL',
      message: 'ui.game.messages.end',
    });
  });

  it('IN_LOBBY (non IN_GAME/FINISHED) → INVALID_STATE', () => {
    const gs = makeBaseState({ progress: GameProgress.IN_LOBBY });
    expect(getStatusBarData(gs)).toEqual<StatusBarData>({
      type: 'ERROR',
      message: 'ui.game.messages.errors.invalid_state',
    });
  });
});

describe('getStatusBarData — INITIAL game phase', () => {
  it('gamePhase INITIAL → welcome message', () => {
    const gs = makeBaseState({
      board: {
        ...makeBaseState().board,
        gamePhase: GamePhase.INITIAL,
      },
    });
    const r = getStatusBarData(gs);
    expect(r.type).toBe('NORMAL');
    expect(r.message).toBe('ui.game.messages.welcome');
    expect(r.actions).toBeUndefined();
  });
});

describe('getStatusBarData — CHOOSE_CHARACTERS messages', () => {
  function makeChoosing(type: CCST, selfIsCurrent = true) {
    const currentPlayer = selfIsCurrent ? 'p1' : 'p2';
    return makeBaseState({
      players: {
        p1: { id: 'p1', username: 'Alice', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.A },
        p2: { id: 'p2', username: 'Bob', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.B },
      },
      board: {
        players: {},
        gamePhase: GamePhase.CHOOSE_CHARACTERS,
        turnState: ClientTurnState.INITIAL,
        playerOrder: ['p1', 'p2'],
        currentPlayer: selfIsCurrent ? PlayerPosition.PLAYER_1 : PlayerPosition.PLAYER_2,
        currentPlayerExtraData: { ...EXTRA_BASE },
        characters: {
          state: { type, player: selfIsCurrent ? PlayerPosition.PLAYER_1 : PlayerPosition.PLAYER_2 },
          current: CharacterType.NONE,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
  }

  const cases: Array<[CCST, string]> = [
    [CCST.INITIAL, 'initial'],
    [CCST.PUT_ASIDE_FACE_UP, 'put_aside_face_up'],
    [CCST.PUT_ASIDE_FACE_DOWN, 'put_aside_face_down'],
    [CCST.PUT_ASIDE_FACE_DOWN_UP, 'put_aside_face_down'],
    [CCST.CHOOSE_CHARACTER, 'choose_character'],
    [CCST.GET_ASIDE_FACE_DOWN, 'get_aside_face_down'],
    [CCST.DONE, 'done'],
  ];

  cases.forEach(([type, key]) => {
    it(`CCST.${type} → choose_characters.${key}`, () => {
      const r = getStatusBarData(makeChoosing(type));
      expect(r.message).toBe(`ui.game.messages.choose_characters.${key}`);
    });
  });

  it('passes current player username as args[0]', () => {
    const r = getStatusBarData(makeChoosing(CCST.CHOOSE_CHARACTER));
    expect(r.args).toEqual(['Alice']);
  });

  it('HIGHLIGHTED when current player is self, NORMAL otherwise', () => {
    expect(getStatusBarData(makeChoosing(CCST.CHOOSE_CHARACTER, true)).type).toBe('HIGHLIGHTED');
    expect(getStatusBarData(makeChoosing(CCST.CHOOSE_CHARACTER, false)).type).toBe('NORMAL');
    expect(getStatusBarData(makeChoosing(CCST.CHOOSE_CHARACTER, false)).args).toEqual(['Bob']);
  });
});

describe('getStatusBarData — DO_ACTIONS, other player is current', () => {
  it("GRAVEYARD_RECOVER_DISTRICT for other → others' graveyard message", () => {
    const gs = makeBaseState({
      players: {
        p1: { id: 'p1', username: 'Alice', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.A },
        p2: { id: 'p2', username: 'Bob', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.B },
      },
      board: {
        players: {},
        gamePhase: GamePhase.DO_ACTIONS,
        turnState: ClientTurnState.GRAVEYARD_RECOVER_DISTRICT,
        playerOrder: ['p1', 'p2'],
        currentPlayer: PlayerPosition.PLAYER_2,
        currentPlayerExtraData: { ...EXTRA_BASE },
        characters: {
          state: { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
          current: CharacterType.GRAVEYARD_RECOVER_DISTRICT as unknown as CharacterType,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
    const r = getStatusBarData(gs);
    expect(r.message).toBe('ui.game.messages.actions.graveyard_recover_district_others');
    expect(r.type).toBe('NORMAL');
  });

  it("other player's turn with a real character → characters.{char}.turn message", () => {
    const gs = makeBaseState({
      players: {
        p1: { id: 'p1', username: 'Alice', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.A },
        p2: { id: 'p2', username: 'Bob', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.B },
      },
      board: {
        players: {},
        gamePhase: GamePhase.DO_ACTIONS,
        turnState: ClientTurnState.TAKE_RESOURCES,
        playerOrder: ['p1', 'p2'],
        currentPlayer: PlayerPosition.PLAYER_2,
        currentPlayerExtraData: { ...EXTRA_BASE },
        characters: {
          state: { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
          current: CharacterType.KING,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
    const r = getStatusBarData(gs);
    expect(r.message).toBe(`characters.${CharacterType.KING}.turn`);
  });

  it("other player's turn with NONE character falls through to DO_ACTIONS message", () => {
    const gs = makeBaseState({
      players: {
        p1: { id: 'p1', username: 'Alice', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.A },
        p2: { id: 'p2', username: 'Bob', manager: false, online: true, role: PlayerRole.PLAYER, team: TeamId.B },
      },
      board: {
        players: { p2: makeSelfBoard() },
        gamePhase: GamePhase.DO_ACTIONS,
        turnState: ClientTurnState.TAKE_RESOURCES,
        playerOrder: ['p1', 'p2'],
        currentPlayer: PlayerPosition.PLAYER_2,
        currentPlayerExtraData: { ...EXTRA_BASE },
        characters: {
          state: { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
          current: CharacterType.NONE,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
    const r = getStatusBarData(gs);
    expect(r.message).toBe('ui.game.messages.actions.choose_action');
  });
});

describe('getStatusBarData — DO_ACTIONS, self is current, message keys', () => {
  function makeSelfAction(turnState: ClientTurnState, character = CharacterType.NONE) {
    return makeBaseState({
      board: {
        players: { p1: makeSelfBoard() },
        gamePhase: GamePhase.DO_ACTIONS,
        turnState,
        playerOrder: ['p1'],
        currentPlayer: PlayerPosition.PLAYER_1,
        currentPlayerExtraData: { ...EXTRA_BASE },
        characters: {
          state: { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
          current: character,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
  }

  const cases: Array<[ClientTurnState, string]> = [
    [ClientTurnState.INITIAL, 'initial'],
    [ClientTurnState.TAKE_RESOURCES, 'choose_action'],
    [ClientTurnState.CHOOSE_CARD, 'choose_card'],
    [ClientTurnState.CHOOSE_ACTION, 'choose_action'],
    [ClientTurnState.ASSASSIN_KILL, 'assassin_kill'],
    [ClientTurnState.THIEF_ROB, 'thief_rob'],
    [ClientTurnState.MAGICIAN_EXCHANGE_HAND, 'magician_exchange_hand'],
    [ClientTurnState.MAGICIAN_DISCARD_CARDS, 'magician_discard_cards'],
    [ClientTurnState.MERCHANT_TAKE_1_GOLD, 'merchant_take_1_gold'],
    [ClientTurnState.ARCHITECT_DRAW_2_CARDS, 'architect_draw_2_cards'],
    [ClientTurnState.WARLORD_DESTROY_DISTRICT, 'warlord_destroy_district'],
    [ClientTurnState.GRAVEYARD_RECOVER_DISTRICT, 'graveyard_recover_district'],
    [ClientTurnState.LABORATORY_DISCARD_CARD, 'laboratory_discard_card'],
    [ClientTurnState.BUILD_DISTRICT, 'build_district'],
    [ClientTurnState.DONE, 'done'],
  ];

  cases.forEach(([turnState, key]) => {
    it(`ClientTurnState.${turnState} → actions.${key}`, () => {
      const r = getStatusBarData(makeSelfAction(turnState));
      expect(r.message).toBe(`ui.game.messages.actions.${key}`);
    });
  });

  it('HIGHLIGHTED when self is current', () => {
    const r = getStatusBarData(makeSelfAction(ClientTurnState.CHOOSE_ACTION));
    expect(r.type).toBe('HIGHLIGHTED');
  });
});

describe('getStatusBarData — actions: TAKE_RESOURCES', () => {
  function makeTaking(overrides: Partial<ReturnType<typeof makeSelfBoard>> = {},
    extra: Partial<typeof EXTRA_BASE> = {}, character = CharacterType.NONE) {
    return makeBaseState({
      board: {
        players: { p1: makeSelfBoard(overrides.city, overrides.hand) },
        gamePhase: GamePhase.DO_ACTIONS,
        turnState: ClientTurnState.TAKE_RESOURCES,
        playerOrder: ['p1'],
        currentPlayer: PlayerPosition.PLAYER_1,
        currentPlayerExtraData: { ...EXTRA_BASE, ...extra },
        characters: {
          state: { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
          current: character,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
  }

  it('base actions: take_gold + draw_cards', () => {
    const r = getStatusBarData(makeTaking());
    const titles = r.actions!.map((a) => a.title);
    expect(titles).toEqual(['take_gold', 'draw_cards']);
  });

  it('observatory swaps draw_cards → draw_cards_3', () => {
    const r = getStatusBarData(makeTaking({ city: ['observatory'] }));
    const titles = r.actions!.map((a) => a.title);
    expect(titles).toContain('draw_cards_3');
    expect(titles).not.toContain('draw_cards');
  });

  it('earnings action added when canTakeEarnings && earningsValue > 0', () => {
    const r = getStatusBarData(makeTaking({}, { canTakeEarnings: true, earningsValue: 3 }));
    const earn = r.actions!.find((a) => a.title === 'take_gold_earnings');
    expect(earn).toBeDefined();
    expect(earn!.args).toEqual(['3']);
    expect(earn!.move.type).toBe(MoveType.TAKE_GOLD_EARNINGS);
  });

  it('no earnings action when earningsValue is 0 even if canTakeEarnings', () => {
    const r = getStatusBarData(makeTaking({}, { canTakeEarnings: true, earningsValue: 0 }));
    expect(r.actions!.some((a) => a.title === 'take_gold_earnings')).toBe(false);
  });

  it('no earnings action in CHOOSE_ACTION (only TAKE_RESOURCES)', () => {
    const gs = makeBaseState({
      board: {
        players: { p1: makeSelfBoard() },
        gamePhase: GamePhase.DO_ACTIONS,
        turnState: ClientTurnState.CHOOSE_ACTION,
        playerOrder: ['p1'],
        currentPlayer: PlayerPosition.PLAYER_1,
        currentPlayerExtraData: { ...EXTRA_BASE, canTakeEarnings: true, earningsValue: 5 },
        characters: {
          state: { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
          current: CharacterType.NONE,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
    const r = getStatusBarData(gs);
    expect(r.actions!.some((a) => a.title === 'take_gold_earnings')).toBe(false);
    // CHOOSE_ACTION ends with finish_turn instead of take_gold/draw_cards
    expect(r.actions!.some((a) => a.title === 'finish_turn')).toBe(true);
    expect(r.actions!.some((a) => a.title === 'take_gold')).toBe(false);
  });

  it('laboratory action added when city has laboratory, hand >=1, not used', () => {
    const r = getStatusBarData(makeTaking({ city: ['laboratory'], hand: ['manor'] }));
    expect(r.actions!.some((a) => a.title === 'laboratory_discard_card')).toBe(true);
  });

  it('no laboratory action when hand is empty', () => {
    const r = getStatusBarData(makeTaking({ city: ['laboratory'], hand: [] }));
    expect(r.actions!.some((a) => a.title === 'laboratory_discard_card')).toBe(false);
  });

  it('no laboratory action when already used', () => {
    const r = getStatusBarData(
      makeTaking({ city: ['laboratory'], hand: ['manor'] }, { hasUsedLaboratory: true }),
    );
    expect(r.actions!.some((a) => a.title === 'laboratory_discard_card')).toBe(false);
  });

  it('smithy action added when city has smithy, stash >=2, not used', () => {
    const r = getStatusBarData(makeTaking({ city: ['smithy'] }, {}));
    expect(r.actions!.some((a) => a.title === 'smithy_draw_cards')).toBe(true);
  });

  it('no smithy action when stash < 2', () => {
    const gs = makeBaseState({
      board: {
        players: { p1: { ...makeSelfBoard(['smithy']), stash: 1 } },
        gamePhase: GamePhase.DO_ACTIONS,
        turnState: ClientTurnState.TAKE_RESOURCES,
        playerOrder: ['p1'],
        currentPlayer: PlayerPosition.PLAYER_1,
        currentPlayerExtraData: { ...EXTRA_BASE },
        characters: {
          state: { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
          current: CharacterType.NONE,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
    const r = getStatusBarData(gs);
    expect(r.actions!.some((a) => a.title === 'smithy_draw_cards')).toBe(false);
  });

  it('build_district action when districtsToBuild > 0', () => {
    const r = getStatusBarData(makeTaking({}, { districtsToBuild: 2 }));
    expect(r.actions!.some((a) => a.title === 'build_district')).toBe(true);
  });
});

describe('getStatusBarData — actions: special actions per character', () => {
  function makeWithCharacter(turnState: ClientTurnState, character: CharacterType) {
    // Client-view convention: characters.current is 1-based (CharacterType + 1);
    // getStatusBarData internally subtracts 1 before calling getActions.
    return makeBaseState({
      board: {
        players: { p1: makeSelfBoard() },
        gamePhase: GamePhase.DO_ACTIONS,
        turnState,
        playerOrder: ['p1'],
        currentPlayer: PlayerPosition.PLAYER_1,
        currentPlayerExtraData: { ...EXTRA_BASE, canDoSpecialAction: true },
        characters: {
          state: { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
          current: (character + 1) as CharacterType,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
  }

  it('ASSASSIN special → assassin_kill action', () => {
    const r = getStatusBarData(makeWithCharacter(ClientTurnState.TAKE_RESOURCES, CharacterType.ASSASSIN));
    expect(r.actions!.some((a) => a.title === 'assassin_kill'
      && a.move.type === MoveType.ASSASSIN_KILL)).toBe(true);
  });

  it('THIEF special → thief_rob action', () => {
    const r = getStatusBarData(makeWithCharacter(ClientTurnState.TAKE_RESOURCES, CharacterType.THIEF));
    expect(r.actions!.some((a) => a.title === 'thief_rob'
      && a.move.type === MoveType.THIEF_ROB)).toBe(true);
  });

  it('MAGICIAN special → both exchange_hand and discard_cards actions', () => {
    const r = getStatusBarData(makeWithCharacter(ClientTurnState.TAKE_RESOURCES, CharacterType.MAGICIAN));
    const titles = r.actions!.map((a) => a.title);
    expect(titles).toContain('magician_exchange_hand');
    expect(titles).toContain('magician_discard_cards');
  });

  it('WARLORD special → warlord_destroy_district action', () => {
    const r = getStatusBarData(makeWithCharacter(ClientTurnState.TAKE_RESOURCES, CharacterType.WARLORD));
    expect(r.actions!.some((a) => a.title === 'warlord_destroy_district'
      && a.move.type === MoveType.WARLORD_DESTROY_DISTRICT)).toBe(true);
  });

  it('no special action when canDoSpecialAction is false', () => {
    const gs = makeBaseState({
      board: {
        players: { p1: makeSelfBoard() },
        gamePhase: GamePhase.DO_ACTIONS,
        turnState: ClientTurnState.TAKE_RESOURCES,
        playerOrder: ['p1'],
        currentPlayer: PlayerPosition.PLAYER_1,
        currentPlayerExtraData: { ...EXTRA_BASE, canDoSpecialAction: false },
        characters: {
          state: { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
          current: CharacterType.ASSASSIN,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
    const r = getStatusBarData(gs);
    expect(r.actions!.some((a) => a.title === 'assassin_kill')).toBe(false);
  });
});

describe('getStatusBarData — actions: confirm/cancel branches', () => {
  function makeTurn(turnState: ClientTurnState) {
    return makeBaseState({
      board: {
        players: { p1: makeSelfBoard() },
        gamePhase: GamePhase.DO_ACTIONS,
        turnState,
        playerOrder: ['p1'],
        currentPlayer: PlayerPosition.PLAYER_1,
        currentPlayerExtraData: { ...EXTRA_BASE },
        characters: {
          state: { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
          current: CharacterType.NONE,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
  }

  it('ASSASSIN_KILL / THIEF_ROB / MAGICIAN_EXCHANGE_HAND / WARLORD_DESTROY_DISTRICT / BUILD_DISTRICT → only cancel', () => {
    [
      ClientTurnState.ASSASSIN_KILL,
      ClientTurnState.THIEF_ROB,
      ClientTurnState.MAGICIAN_EXCHANGE_HAND,
      ClientTurnState.WARLORD_DESTROY_DISTRICT,
      ClientTurnState.BUILD_DISTRICT,
    ].forEach((ts) => {
      const r = getStatusBarData(makeTurn(ts));
      expect(r.actions).toEqual([
        { title: 'cancel', move: { type: MoveType.DECLINE } },
      ]);
    });
  });

  it('MAGICIAN_DISCARD_CARDS → confirm (with injected selectedCards) + cancel', () => {
    const selected = ['manor', 'temple'];
    const r = getStatusBarData(makeTurn(ClientTurnState.MAGICIAN_DISCARD_CARDS), { selectedCards: selected });
    expect(r.actions).toEqual([
      { title: 'confirm', move: { type: MoveType.MAGICIAN_DISCARD_CARDS, data: selected } },
      { title: 'cancel', move: { type: MoveType.DECLINE } },
    ]);
  });

  it('MAGICIAN_DISCARD_CARDS without options.selectedCards → confirm with empty data', () => {
    const r = getStatusBarData(makeTurn(ClientTurnState.MAGICIAN_DISCARD_CARDS));
    expect(r.actions).toEqual([
      { title: 'confirm', move: { type: MoveType.MAGICIAN_DISCARD_CARDS, data: [] } },
      { title: 'cancel', move: { type: MoveType.DECLINE } },
    ]);
  });

  it('GRAVEYARD_RECOVER_DISTRICT → recover + decline', () => {
    const r = getStatusBarData(makeTurn(ClientTurnState.GRAVEYARD_RECOVER_DISTRICT));
    expect(r.actions).toEqual([
      { title: 'graveyard_recover_district', move: { type: MoveType.GRAVEYARD_RECOVER_DISTRICT } },
      { title: 'decline', move: { type: MoveType.DECLINE } },
    ]);
  });

  it('LABORATORY_DISCARD_CARD → only cancel', () => {
    const r = getStatusBarData(makeTurn(ClientTurnState.LABORATORY_DISCARD_CARD));
    expect(r.actions).toEqual([
      { title: 'cancel', move: { type: MoveType.DECLINE } },
    ]);
  });

  it('INITIAL / DONE / CHOOSE_CARD / MERCHANT / ARCHITECT → no actions (empty default branch)', () => {
    [
      ClientTurnState.INITIAL,
      ClientTurnState.DONE,
      ClientTurnState.CHOOSE_CARD,
      ClientTurnState.MERCHANT_TAKE_1_GOLD,
      ClientTurnState.ARCHITECT_DRAW_2_CARDS,
    ].forEach((ts) => {
      const r = getStatusBarData(makeTurn(ts));
      expect(r.actions).toEqual([]);
    });
  });
});

describe('getStatusBarData — missing player board', () => {
  it('DO_ACTIONS for self but no PlayerBoard entry → message still set, actions = []', () => {
    const gs = makeBaseState({
      board: {
        players: {}, // self p1 not present
        gamePhase: GamePhase.DO_ACTIONS,
        turnState: ClientTurnState.CHOOSE_ACTION,
        playerOrder: ['p1'],
        currentPlayer: PlayerPosition.PLAYER_1,
        currentPlayerExtraData: { ...EXTRA_BASE },
        characters: {
          state: { type: CCST.DONE, player: PlayerPosition.SPECTATOR },
          current: CharacterType.NONE,
          callable: [],
          aside: [],
        },
        graveyard: undefined,
      },
    });
    const r = getStatusBarData(gs);
    expect(r.message).toBe('ui.game.messages.actions.choose_action');
    expect(r.actions).toEqual([]);
  });
});

describe('getStatusBarData — pure / no store coupling', () => {
  it('returns the same object shape for identical input (no hidden state)', () => {
    const gs = makeBaseState();
    const a = getStatusBarData(gs);
    const b = getStatusBarData(gs);
    expect(a).toEqual(b);
  });

  it('does not reference any global store (selectedCards must be passed in)', () => {
    // If the function tried to read a Vuex store it would throw under node.
    const gs = makeBaseState();
    expect(() => getStatusBarData(gs, { selectedCards: ['manor'] })).not.toThrow();
  });
});
