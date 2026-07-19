import Debug from 'debug';
import {
  Move,
  MoveType,
  ClientTurnState,
  GameProgress,
  GamePhase,
  CharacterChoosingStateType as CCST,
  PlayerId,
} from 'citadels-common';
import type GameState from './GameState';
import { CharacterPosition, TurnState, CharacterType } from './CharacterManager';
import { logCharacterCall, buildRoundSummary } from './ActionLogger';
import { refreshLiveScores } from './ScoreCalculator';
import {
  schedulePhase, DELAY_SHORT, DELAY_LONG, MAX_CHARACTER_SKIP_ATTEMPTS,
} from '../utils/schedule';

const debug = Debug('citadels-server');

export default class GameFlowController {
  constructor(private state: GameState) {}

  step(move = { type: MoveType.AUTO } as Move): boolean {
    debug('------- STEP -------');
    debug('move', MoveType[move.type], move.data);
    debug('progress', GameProgress[this.state.progress]);
    debug('phase', this.state.board ? GamePhase[this.state.board.gamePhase] : undefined);

    switch (this.state.progress) {
      case GameProgress.IN_LOBBY:
        if (move.type === MoveType.AUTO) {
          this.state.progress = GameProgress.IN_GAME;
          return this.step(move);
        }
        break;

      case GameProgress.IN_GAME:
        switch (this.state.board?.gamePhase) {
          case GamePhase.INITIAL:
            if (move.type === MoveType.AUTO) {
              schedulePhase(() => {
                if (this.state.board) {
                  this.state.board.gamePhase = GamePhase.CHOOSE_CHARACTERS;
                  this.step();
                  this.state.notify();
                }
              }, DELAY_SHORT);
              return true;
            }
            return false;

          case GamePhase.CHOOSE_CHARACTERS:
            {
              const cm = this.state.board.characterManager;
              const ccs = cm.choosingState;
              switch (ccs.getState().type) {
                case CCST.INITIAL:
                  if (move.type === MoveType.AUTO) {
                    schedulePhase(() => {
                      ccs.step();
                      this.state.notify();
                    }, DELAY_SHORT);
                    return true;
                  }
                  return false;

                case CCST.PUT_ASIDE_FACE_DOWN:
                  return move.type === MoveType.CHOOSE_CHARACTER && cm.chooseRandomCharacter();

                case CCST.PUT_ASIDE_FACE_UP:
                  return move.type === MoveType.CHOOSE_CHARACTER && cm.chooseRandomCharacter(true);

                case CCST.CHOOSE_CHARACTER:
                case CCST.PUT_ASIDE_FACE_DOWN_UP:
                  return move.type === MoveType.CHOOSE_CHARACTER && cm.chooseCharacter(move.data);

                case CCST.DONE:
                  if (move.type === MoveType.AUTO) {
                    schedulePhase(() => {
                      if (this.state.board) {
                        this.state.board.gamePhase = GamePhase.DO_ACTIONS;
                        const cm2 = this.state.board.characterManager;
                        if (cm2.turnState === TurnState.INITIAL) {
                          cm2.jumpToNextCharacter();
                        }
                        let guard = 0;
                        while (
                          guard < MAX_CHARACTER_SKIP_ATTEMPTS
                          && cm2.turnState !== TurnState.DONE
                          && !cm2.isCharacterPlayable(cm2.getCurrentCharacter())
                        ) {
                          logCharacterCall(
                            this.state.players,
                            this.state.board!,
                            cm2.getCurrentCharacter(),
                            this.state.actionFeed,
                          );
                          cm2.jumpToNextCharacter();
                          guard += 1;
                        }
                        if (cm2.turnState !== TurnState.DONE) {
                          this.onCharacterTurnStart();
                        }
                        this.step();
                        this.state.notify();
                      }
                    }, DELAY_SHORT);
                    return true;
                  }
                  return false;

                default:
                  break;
              }
            }
            break;

          case GamePhase.DO_ACTIONS:
          {
            const cm = this.state.board.characterManager;

            switch (move.type) {
              case MoveType.AUTO:
                if (cm.turnState === TurnState.DONE) {
                  const endDelay = this.state.hasAiPlayers
                    ? Math.max(DELAY_LONG, 3500)
                    : Math.max(DELAY_LONG, 2500);
                  schedulePhase(() => {
                    this.finishTurnPhase();
                    this.step();
                    this.state.notify();
                  }, endDelay);
                  return true;
                }
                if (!cm.isCharacterPlayable(cm.getCurrentCharacter())) {
                  logCharacterCall(
                    this.state.players,
                    this.state.board!,
                    cm.getCurrentCharacter(),
                    this.state.actionFeed,
                  );
                  const skipDelay = this.state.hasAiPlayers
                    ? Math.max(DELAY_SHORT, 2200)
                    : Math.max(DELAY_SHORT, 1500);
                  schedulePhase(() => {
                    cm.jumpToNextCharacter();
                    this.onCharacterTurnStart();
                    this.step();
                    this.state.notify();
                  }, skipDelay);
                  return true;
                }
                return false;
              case MoveType.DECLINE:
                return this.state.decline();
              case MoveType.SMITHY_DRAW_CARDS:
              case MoveType.LABORATORY_DISCARD_CARD:
                return this.state.doSpecialAction(move);
              case MoveType.FINISH_TURN:
                if (cm.getClientTurnState() !== ClientTurnState.CHOOSE_ACTION) return false;
                cm.jumpToNextCharacter();
                this.onCharacterTurnStart();
                return true;

              default:
                break;
            }

            switch (cm.getClientTurnState()) {
              case ClientTurnState.TAKE_RESOURCES:
              case ClientTurnState.CHOOSE_ACTION:
                return this.state.executeAction(move);
              case ClientTurnState.CHOOSE_CARD:
                return this.state.chooseDistrictCard(move);
              case ClientTurnState.BUILD_DISTRICT:
                return this.state.buildDistrict(move);
              case ClientTurnState.ASSASSIN_KILL:
                return this.state.killCharacter(move);
              case ClientTurnState.THIEF_ROB:
                return this.state.robCharacter(move);
              case ClientTurnState.MAGICIAN_EXCHANGE_HAND:
                return this.state.exchangeHand(move);
              case ClientTurnState.MAGICIAN_DISCARD_CARDS:
                return this.state.discardCards(move);
              case ClientTurnState.MERCHANT_TAKE_1_GOLD:
                return this.state.takeOneGold(move);
              case ClientTurnState.ARCHITECT_DRAW_2_CARDS:
                return this.state.drawTwoCards(move);
              case ClientTurnState.WARLORD_DESTROY_DISTRICT:
                return this.state.destroyDistrict(move);
              case ClientTurnState.GRAVEYARD_RECOVER_DISTRICT:
                return this.state.recoverFromGraveyard(move);
              default:
                break;
            }
            break;
          }

          default:
            this.state.progress = GameProgress.FINISHED;
            break;
        }
        break;

      case GameProgress.FINISHED:
        break;

      default:
    }
    return false;
  }

  finishTurnPhase(): boolean {
    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;

    this.state.lastRoundSummary = buildRoundSummary(this.state.players, this.state.board);

    this.giveCrownToKing();

    if (this.state.board.graveyard !== undefined) {
      this.state.board.districtsDeck.discardCards([this.state.board.graveyard]);
      this.state.board.graveyard = undefined;
    }

    const isEndOfGame = Array.from(this.state.board.players.values()).some(
      (player) => player.city.length >= this.state.completeCitySize,
    );

    if (isEndOfGame) {
      refreshLiveScores(this.state, true);
      this.state.progress = GameProgress.FINISHED;
    } else {
      this.state.cityCompletedThisTurnPhase = false;
      this.state.board.gamePhase = GamePhase.CHOOSE_CHARACTERS;
      cm.reset();
    }

    return true;
  }

  onCharacterTurnStart() {
    if (!this.state.board) return;
    const cm = this.state.board.characterManager;
    const ch = cm.getCurrentCharacter();
    if (ch >= 0 && cm.isCharacterPlayable(ch)) {
      logCharacterCall(this.state.players, this.state.board, ch, this.state.actionFeed);
    }
    if (ch === cm.robbedCharacter) {
      this.state.moveRobbedGold();
    }
    if (ch === CharacterType.KING
        && cm.killedCharacter !== CharacterType.KING) {
      this.giveCrownToKing();
    }
    this.applyCharacterTurnStartPassives();
  }

  giveCrownToKing() {
    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;

    const position = cm.characters[CharacterType.KING];
    switch (position) {
      case CharacterPosition.PLAYER_2:
      case CharacterPosition.PLAYER_3:
      case CharacterPosition.PLAYER_4:
      case CharacterPosition.PLAYER_5:
      case CharacterPosition.PLAYER_6:
      case CharacterPosition.PLAYER_7:
      {
        const playerPos = position - CharacterPosition.PLAYER_1;
        this.state.board.playerOrder.push(...this.state.board.playerOrder.splice(0, playerPos));
        cm.shiftPlayerPosition(playerPos);
        return true;
      }

      default:
        return false;
    }
  }

  applyCharacterTurnStartPassives() {
    if (!this.state.board) return;
    const cm = this.state.board.characterManager;
    const character = cm.getCurrentCharacter();
    if (!cm.isCharacterPlayable(character)) return;

    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return;

    if (character === CharacterType.MERCHANT) {
      player.stash += 1;
      cm.canDoSpecialAction[CharacterType.MERCHANT] = false;
    } else if (character === CharacterType.ARCHITECT) {
      player.addCardsToHand(this.state.board.districtsDeck.drawCards(2));
      cm.canDoSpecialAction[CharacterType.ARCHITECT] = false;
    }
  }

  ownerOfRole(character: CharacterType): PlayerId | null {
    if (!this.state.board || character < 0) return null;
    const pos = this.state.board.characterManager.characters[character];
    if (pos < CharacterPosition.PLAYER_1) return null;
    const seat = pos - CharacterPosition.PLAYER_1;
    return this.state.board.playerOrder[seat] ?? null;
  }
}
