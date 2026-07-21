import {
  CharacterType,
  ClientGameState,
  ClientTurnState,
  CharacterChoosingStateType as CCST,
  DistrictId,
  GamePhase,
  GameProgress,
  Move,
  MoveType,
  PlayerBoard,
  PlayerExtraData,
} from '../index';

export type StatusBarMessageType = 'NORMAL' | 'HIGHLIGHTED' | 'ERROR';

export interface StatusBarAction {
  title: string;
  args?: string[];
  move: Move;
}

export interface StatusBarData {
  type: StatusBarMessageType;
  message: string;
  args?: string[];
  actions?: StatusBarAction[];
}

/**
 * Options for {@link getStatusBarData}. UI selection state that the pure
 * function cannot derive from the game state alone must be injected here so
 * the function stays free of store/Vuex coupling.
 */
export interface GetStatusBarDataOptions {
  /**
   * District cards the user has currently selected in their hand. Required
   * only to populate the `move.data` of the MAGICIAN_DISCARD_CARDS confirm
   * action; the message itself does not depend on it.
   */
  selectedCards?: DistrictId[];
}

const INVALID_STATE: StatusBarData = {
  type: 'ERROR',
  message: 'ui.game.messages.errors.invalid_state',
};

const END_OF_GAME: StatusBarData = {
  type: 'NORMAL',
  message: 'ui.game.messages.end',
};

// NOTE: kept as functions (not top-level Record<Enum,...> objects) on purpose.
// statusBar.ts imports these enums from '../index', and index.ts re-exports
// statusBar.ts — a static cycle. The cycle is runtime-safe only as long as
// enum members are read inside function bodies (after index.ts has fully
// loaded). Top-level computed keys like `[CCST.INITIAL]` would be evaluated
// during module init, while `CCST` is still undefined.
function chooseCharacterMessageKey(type: CCST): string | undefined {
  switch (type) {
    case CCST.INITIAL: return 'initial';
    case CCST.PUT_ASIDE_FACE_UP: return 'put_aside_face_up';
    case CCST.PUT_ASIDE_FACE_DOWN: return 'put_aside_face_down';
    case CCST.PUT_ASIDE_FACE_DOWN_UP: return 'put_aside_face_down';
    case CCST.CHOOSE_CHARACTER: return 'choose_character';
    case CCST.GET_ASIDE_FACE_DOWN: return 'get_aside_face_down';
    case CCST.DONE: return 'done';
    default: return undefined;
  }
}

function doActionMessageKey(turnState: ClientTurnState): string | undefined {
  switch (turnState) {
    case ClientTurnState.INITIAL: return 'initial';
    case ClientTurnState.TAKE_RESOURCES: return 'choose_action';
    case ClientTurnState.CHOOSE_CARD: return 'choose_card';
    case ClientTurnState.CHOOSE_ACTION: return 'choose_action';
    case ClientTurnState.ASSASSIN_KILL: return 'assassin_kill';
    case ClientTurnState.THIEF_ROB: return 'thief_rob';
    case ClientTurnState.MAGICIAN_EXCHANGE_HAND: return 'magician_exchange_hand';
    case ClientTurnState.MAGICIAN_DISCARD_CARDS: return 'magician_discard_cards';
    case ClientTurnState.MERCHANT_TAKE_1_GOLD: return 'merchant_take_1_gold';
    case ClientTurnState.ARCHITECT_DRAW_2_CARDS: return 'architect_draw_2_cards';
    case ClientTurnState.WARLORD_DESTROY_DISTRICT: return 'warlord_destroy_district';
    case ClientTurnState.GRAVEYARD_RECOVER_DISTRICT: return 'graveyard_recover_district';
    case ClientTurnState.LABORATORY_DISCARD_CARD: return 'laboratory_discard_card';
    case ClientTurnState.BUILD_DISTRICT: return 'build_district';
    case ClientTurnState.DONE: return 'done';
    default: return undefined;
  }
}

function getActions(
  turnState: ClientTurnState,
  character: CharacterType,
  extraData: PlayerExtraData,
  player: PlayerBoard,
  selectedCards: DistrictId[],
): StatusBarAction[] {
  const actions: StatusBarAction[] = [];

  switch (turnState) {
    case ClientTurnState.TAKE_RESOURCES:
    case ClientTurnState.CHOOSE_ACTION:
      if (!extraData.hasUsedLaboratory
      && player.city.includes('laboratory')
      && player.hand.length >= 1
      ) {
        actions.push({ title: 'laboratory_discard_card', move: { type: MoveType.LABORATORY_DISCARD_CARD } });
      }
      if (!extraData.hasUsedSmithy && player.city.includes('smithy') && player.stash >= 2) {
        actions.push({ title: 'smithy_draw_cards', move: { type: MoveType.SMITHY_DRAW_CARDS } });
      }
      break;

    default:
      break;
  }

  switch (turnState) {
    case ClientTurnState.TAKE_RESOURCES:
    case ClientTurnState.CHOOSE_ACTION:
      // earnings only before regular resource action
      if (turnState === ClientTurnState.TAKE_RESOURCES
          && extraData.canTakeEarnings && extraData.earningsValue > 0) {
        actions.push({ title: 'take_gold_earnings', args: [extraData.earningsValue.toString()], move: { type: MoveType.TAKE_GOLD_EARNINGS } });
      }
      if (extraData.canDoSpecialAction) {
        switch (character) {
          case CharacterType.ASSASSIN:
            actions.push({
              title: 'assassin_kill',
              move: { type: MoveType.ASSASSIN_KILL },
            });
            break;
          case CharacterType.THIEF:
            actions.push({
              title: 'thief_rob',
              move: { type: MoveType.THIEF_ROB },
            });
            break;
          case CharacterType.MAGICIAN:
            actions.push({
              title: 'magician_exchange_hand',
              move: { type: MoveType.MAGICIAN_EXCHANGE_HAND },
            });
            actions.push({
              title: 'magician_discard_cards',
              move: { type: MoveType.MAGICIAN_DISCARD_CARDS },
            });
            break;
          case CharacterType.WARLORD:
            actions.push({
              title: 'warlord_destroy_district',
              move: { type: MoveType.WARLORD_DESTROY_DISTRICT },
            });
            break;
          default:
            break;
        }
      }
      // build allowed before resources (then still earnings) or after
      if (extraData.districtsToBuild > 0) {
        actions.push({ title: 'build_district', move: { type: MoveType.BUILD_DISTRICT } });
      }
      if (turnState === ClientTurnState.TAKE_RESOURCES) {
        actions.push({ title: 'take_gold', move: { type: MoveType.TAKE_GOLD } });
        actions.push({
          title: player.city.includes('observatory') ? 'draw_cards_3' : 'draw_cards',
          move: { type: MoveType.DRAW_CARDS },
        });
      } else {
        actions.push({ title: 'finish_turn', move: { type: MoveType.FINISH_TURN } });
      }
      break;
    case ClientTurnState.ASSASSIN_KILL:
    case ClientTurnState.THIEF_ROB:
    case ClientTurnState.MAGICIAN_EXCHANGE_HAND:
    case ClientTurnState.WARLORD_DESTROY_DISTRICT:
    case ClientTurnState.BUILD_DISTRICT:
      actions.push({ title: 'cancel', move: { type: MoveType.DECLINE } });
      break;
    case ClientTurnState.MAGICIAN_DISCARD_CARDS:
      actions.push({ title: 'confirm', move: { type: MoveType.MAGICIAN_DISCARD_CARDS, data: selectedCards } });
      actions.push({ title: 'cancel', move: { type: MoveType.DECLINE } });
      break;
    case ClientTurnState.GRAVEYARD_RECOVER_DISTRICT:
      actions.push({ title: 'graveyard_recover_district', move: { type: MoveType.GRAVEYARD_RECOVER_DISTRICT } });
      actions.push({ title: 'decline', move: { type: MoveType.DECLINE } });
      break;
    case ClientTurnState.LABORATORY_DISCARD_CARD:
      actions.push({ title: 'cancel', move: { type: MoveType.DECLINE } });
      break;
    default:
  }
  return actions;
}

/**
 * Derive the status-bar data (message key + available actions) for a given
 * client-view game state. Framework-agnostic: returns i18n message keys, not
 * localized strings, and injects any UI-only selection state via `options`.
 *
 * Character ID convention: the client-view state stores character ids as
 * `CharacterType + 1` (1-based) — see project fact `client.character_id_convention`.
 * Hence `state.board.characters.current - 1` is passed to `getActions`.
 */
export function getStatusBarData(
  state: ClientGameState,
  options?: GetStatusBarDataOptions,
): StatusBarData {
  const selectedCards = options?.selectedCards ?? [];

  switch (state.progress) {
    case GameProgress.IN_GAME:
    {
      const currentPlayer = state.board.playerOrder[state.board.currentPlayer];
      const isCurrentPlayerSelf = currentPlayer === state.self;
      const currentPlayerName = state.players[currentPlayer]?.username ?? '';

      switch (state.board.gamePhase) {
        case GamePhase.INITIAL:
          return {
            type: 'NORMAL',
            message: 'ui.game.messages.welcome',
          };

        case GamePhase.CHOOSE_CHARACTERS:
        {
          const message = chooseCharacterMessageKey(state.board.characters.state.type);
          if (message !== undefined) {
            return {
              type: isCurrentPlayerSelf ? 'HIGHLIGHTED' : 'NORMAL',
              message: `ui.game.messages.choose_characters.${message}`,
              args: [currentPlayerName],
            };
          }
          break;
        }

        case GamePhase.DO_ACTIONS:
        {
          const currentCharacter = state.board.characters.current;
          if (!isCurrentPlayerSelf) {
            if (state.board.turnState === ClientTurnState.GRAVEYARD_RECOVER_DISTRICT) {
              return {
                type: 'NORMAL',
                message: 'ui.game.messages.actions.graveyard_recover_district_others',
              };
            }
            if (currentCharacter !== CharacterType.NONE) {
              return {
                type: 'NORMAL',
                message: `characters.${currentCharacter}.turn`,
              };
            }
          }
          const message = doActionMessageKey(state.board.turnState);
          if (message !== undefined) {
            const player = state.board.players[currentPlayer];
            return {
              type: isCurrentPlayerSelf ? 'HIGHLIGHTED' : 'NORMAL',
              message: `ui.game.messages.actions.${message}`,
              actions: player !== undefined ? getActions(
                state.board.turnState,
                state.board.characters.current - 1,
                state.board.currentPlayerExtraData,
                player,
                selectedCards,
              ) : [],
            };
          }
          break;
        }

        default:
      }
      return INVALID_STATE;
    }

    case GameProgress.FINISHED:
      return END_OF_GAME;

    default:
  }

  return INVALID_STATE;
}
