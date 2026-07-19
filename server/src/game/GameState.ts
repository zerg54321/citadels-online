import {
  Move,
  MoveType,
  ClientTurnState,
  GameProgress,
  GameMode,
  TeamId,
  MatchResult,
  PlayerRole,
  GamePhase,
  CharacterChoosingStateType as CCST,
  PlayerPosition,
  PlayerId,
  DistrictId,
} from 'citadels-common';
import Debug from 'debug';
import { Observer, Subject } from '../utils/observerPattern';
import BoardState from './BoardState';
import { CharacterPosition, CharacterType, TurnState } from './CharacterManager';

import GameSetupData from './GameSetupData';
import Player from './Player';
import { ALL_DISTRICTS } from './DistrictCard';

const debug = Debug('citadels-server');

/** short delays when CITADELS_FAST=1; CITADELS_SYNC=1 runs phase advances inline (offline engine) */
const FAST = process.env.CITADELS_FAST === '1' || process.env.CITADELS_SYNC === '1';
const SYNC = process.env.CITADELS_SYNC === '1';
const DELAY_SHORT = FAST ? 30 : 3000;
const DELAY_LONG = FAST ? 50 : 5000;

/** when true, phase transitions run inline (AI tables / offline) */
let forceSyncPhases = false;

export function setForceSyncPhases(enabled: boolean) {
  forceSyncPhases = enabled;
}

function schedulePhase(fn: () => void, ms: number) {
  if (SYNC || forceSyncPhases) {
    fn();
    return;
  }
  setTimeout(fn, ms);
}

export default class GameState implements Subject {
  progress: GameProgress;
  gameMode: GameMode;
  players: Map<PlayerId, Player>;
  board: BoardState | undefined;
  completeCitySize: number;
  /** P4: action time limit in seconds */
  actionTimeoutSeconds: number;
  /** P4: epoch ms when current actor must act; null when no human timer */
  turnDeadlineAt: number | null;
  observers: Observer[];
  /** set after first player completes city this match */
  cityCompletedThisMatch: boolean;
  /** true after someone completes city during current DO_ACTIONS phase */
  cityCompletedThisTurnPhase: boolean;
  teamScores: { A: number; B: number };
  matchResult: MatchResult;
  startedAt: string | undefined;
  hasAiPlayers: boolean;
  matchPersisted: boolean;
  /** brief summary of last completed character-action round (for UI) */
  lastRoundSummary: string | null;
  /** lobby seat order for 3v3 team preview (even=A, odd=B) */
  lobbyPlayerOrder: PlayerId[];
  /** rolling action log for clients */
  actionFeed: Array<{ text: string; kind?: string }>;

  constructor(completeCitySize = 7) {
    this.progress = GameProgress.IN_LOBBY;
    this.gameMode = GameMode.CASUAL;
    this.players = new Map();
    this.board = undefined;
    this.completeCitySize = completeCitySize;
    this.actionTimeoutSeconds = 120;
    this.turnDeadlineAt = null;
    this.observers = [];
    this.cityCompletedThisMatch = false;
    this.cityCompletedThisTurnPhase = false;
    this.teamScores = { A: 0, B: 0 };
    this.matchResult = MatchResult.NONE;
    this.startedAt = undefined;
    this.hasAiPlayers = false;
    this.matchPersisted = false;
    this.lastRoundSummary = null;
    this.lobbyPlayerOrder = [];
    this.actionFeed = [];
  }

  private pushAction(text: string, kind = '') {
    this.actionFeed.push({ text, kind });
    if (this.actionFeed.length > 60) {
      this.actionFeed.splice(0, this.actionFeed.length - 60);
    }
  }

  private playerName(playerId: string): string {
    return this.players.get(playerId)?.username || playerId;
  }

  private roleNameZh(ch: number): string {
    const names = ['刺客', '盗贼', '魔术师', '国王', '主教', '商人', '建筑师', '军阀'];
    return names[ch] || `角色${ch + 1}`;
  }

  private static readonly DISTRICT_NAMES_ZH: Record<string, string> = {
    manor: '庄园',
    castle: '城堡',
    palace: '宫殿',
    temple: '神庙',
    church: '教堂',
    monastery: '修道院',
    cathedral: '大教堂',
    tavern: '酒馆',
    market: '市场',
    trading_post: '商栈',
    docks: '码头',
    harbor: '港口',
    town_hall: '市政厅',
    watchtower: '瞭望塔',
    prison: '监狱',
    barracks: '兵营',
    fortress: '要塞',
    dragon_gate: '龙门',
    university: '大学',
    map_room: '地图室',
    imperial_treasury: '帝国宝库',
    haunted_quarter: '闹鬼城区',
    school_of_magic: '魔法学校',
    keep: '要塞堡垒',
    great_wall: '长城',
    graveyard: '墓地',
    observatory: '天文台',
    library: '图书馆',
    laboratory: '实验室',
    smithy: '铁匠铺',
  };

  private districtLabelZh(cardId: string): string {
    const name = GameState.DISTRICT_NAMES_ZH[cardId] || cardId;
    const card = ALL_DISTRICTS.get(cardId)?.card;
    const cost = card?.cost ?? '?';
    const color = ['?', '黄', '蓝', '绿', '红', '紫'][card?.type ?? 0] || '?';
    return `${name}（${color}${cost}）`;
  }

  containsPlayer(playerId: PlayerId | undefined) {
    if (playerId === undefined) { return false; }
    return this.players.has(playerId);
  }

  getPlayer(playerId: PlayerId | undefined) {
    if (playerId === undefined) { return undefined; }
    return this.players.get(playerId);
  }

  addPlayer(
    id: PlayerId,
    username: string,
    manager = false,
    online = true,
    role = PlayerRole.PLAYER,
    userId?: string,
  ) {
    const player = new Player(id, username, manager, online, role, userId);
    this.players.set(id, player);
    if (role === PlayerRole.PLAYER) {
      if (!this.lobbyPlayerOrder.includes(id)) this.lobbyPlayerOrder.push(id);
    }
    this.refreshLobbyTeams();
    return player;
  }

  /** P5: seat count of PLAYER-role (humans + AI) */
  getSeatedPlayerCount(): number {
    return Array.from(this.players.values())
      .filter((p) => p.role === PlayerRole.PLAYER).length;
  }

  /** P5: add AI seat in lobby only (cap 6 for 3v3-only product) */
  addAiPlayer(id: PlayerId, username: string): Player | null {
    if (this.progress !== GameProgress.IN_LOBBY) return null;
    if (this.getSeatedPlayerCount() >= 6) return null;
    const player = new Player(id, username, false, true, PlayerRole.PLAYER);
    player.isAi = true;
    player.isAutoplay = true;
    this.players.set(id, player);
    if (!this.lobbyPlayerOrder.includes(id)) this.lobbyPlayerOrder.push(id);
    this.refreshLobbyTeams();
    return player;
  }

  /** P5: remove AI seat in lobby only */
  removeAiPlayer(playerId: PlayerId): boolean {
    if (this.progress !== GameProgress.IN_LOBBY) return false;
    const player = this.players.get(playerId);
    if (!player || !player.isAi) return false;
    this.players.delete(playerId);
    this.lobbyPlayerOrder = this.lobbyPlayerOrder.filter((id) => id !== playerId);
    this.refreshLobbyTeams();
    return true;
  }

  /**
   * Lobby: switch between PLAYER seat and SPECTATOR (before game starts).
   */
  setLobbyRole(playerId: PlayerId, role: PlayerRole): boolean {
    if (this.progress !== GameProgress.IN_LOBBY) return false;
    const player = this.players.get(playerId);
    if (!player || player.isAi) return false;
    if (role === player.role) return true;

    if (role === PlayerRole.PLAYER) {
      if (this.getSeatedPlayerCount() >= 6) return false;
      player.role = PlayerRole.PLAYER;
      if (!this.lobbyPlayerOrder.includes(playerId)) this.lobbyPlayerOrder.push(playerId);
    } else if (role === PlayerRole.SPECTATOR) {
      // manager stepping out: transfer manager to first remaining seated human
      if (player.manager) {
        player.manager = false;
        const next = this.lobbyPlayerOrder
          .map((id) => this.players.get(id))
          .find((p) => p && p.id !== playerId && !p.isAi && p.role === PlayerRole.PLAYER);
        if (next) next.manager = true;
        else {
          // no other player — keep as manager spectator so room is not orphaned
          player.manager = true;
        }
      }
      player.role = PlayerRole.SPECTATOR;
      player.team = TeamId.NONE;
      this.lobbyPlayerOrder = this.lobbyPlayerOrder.filter((id) => id !== playerId);
    } else {
      return false;
    }
    this.refreshLobbyTeams();
    return true;
  }

  /** Manager reorders lobby seats (affects A/B team assignment). */
  moveLobbySeat(playerId: PlayerId, direction: -1 | 1): boolean {
    if (this.progress !== GameProgress.IN_LOBBY) return false;
    const idx = this.lobbyPlayerOrder.indexOf(playerId);
    if (idx < 0) return false;
    const j = idx + direction;
    if (j < 0 || j >= this.lobbyPlayerOrder.length) return false;
    const order = [...this.lobbyPlayerOrder];
    [order[idx], order[j]] = [order[j], order[idx]];
    this.lobbyPlayerOrder = order;
    this.refreshLobbyTeams();
    return true;
  }

  /** even index → Team A, odd → Team B (preview + start order) */
  refreshLobbyTeams() {
    // drop stale ids
    this.lobbyPlayerOrder = this.lobbyPlayerOrder.filter((id) => {
      const p = this.players.get(id);
      return p && p.role === PlayerRole.PLAYER;
    });
    this.players.forEach((p) => {
      if (p.role !== PlayerRole.PLAYER) p.team = TeamId.NONE;
    });
    this.lobbyPlayerOrder.forEach((id, index) => {
      const p = this.players.get(id);
      if (p) p.team = index % 2 === 0 ? TeamId.A : TeamId.B;
    });
  }

  findPlayerByUserId(userId: string | undefined) {
    if (!userId) return undefined;
    return Array.from(this.players.values()).find((player) => player.userId === userId);
  }

  getStateFromPlayer(playerId: PlayerId | undefined) {
    if (playerId === undefined) { return undefined; }
    // keep live personal / team scores on every state push
    if (this.progress === GameProgress.IN_GAME || this.progress === GameProgress.FINISHED) {
      this.refreshLiveScores(this.progress === GameProgress.FINISHED);
    }
    return {
      progress: this.progress,
      gameMode: this.gameMode,
      players: Array.from(this.players).map(([id, player]) => [id, {
        id: player.id,
        username: player.username,
        manager: player.manager,
        online: player.online,
        role: player.role,
        userId: player.userId,
        team: player.team,
        isAi: player.isAi,
        isAutoplay: player.isAutoplay,
        hadEffectiveAiControl: player.hadEffectiveAiControl,
      }]),
      self: playerId,
      board: this.board?.exportForPlayer(playerId),
      settings: {
        completeCitySize: this.completeCitySize,
        actionTimeoutSeconds: this.actionTimeoutSeconds,
      },
      turnDeadlineAt: this.turnDeadlineAt,
      teamScores: this.teamScores,
      matchResult: this.matchResult,
      lastRoundSummary: this.lastRoundSummary,
      lobbyPlayerOrder: [...this.lobbyPlayerOrder],
      actionFeed: this.actionFeed.slice(-40),
    };
  }

  validateGameSetup(gameSetupData: GameSetupData): boolean {
    // check whether all player ids are valid (in the room)
    const roomPlayerIds = Array.from(this.players.keys());
    const validPlayerIds = gameSetupData.players.every(
      (playerId) => roomPlayerIds.includes(playerId),
    );
    if (!validPlayerIds) return false;

    // product mode: only 6-player 3v3 (humans and/or AI)
    if (gameSetupData.players.length !== 6) return false;

    return true;
  }

  setupGame(gameSetupData: GameSetupData) {
    // prefer lobby seat order (team preview), fall back to payload order
    const orderedIds = (this.lobbyPlayerOrder.length
      ? this.lobbyPlayerOrder
      : gameSetupData.players
    ).filter((id) => this.players.has(id));

    const players: PlayerId[] = [];
    orderedIds.forEach((playerId) => {
      const player = this.players.get(playerId);
      if (player && player.role === PlayerRole.PLAYER) {
        players.push(playerId);
      }
    });
    // include any PLAYER missing from order
    this.players.forEach((player, playerId) => {
      if (player.role === PlayerRole.PLAYER && !players.includes(playerId)) {
        players.push(playerId);
      }
    });
    Array.from(this.players.keys()).forEach((playerId) => {
      if (!players.includes(playerId)) {
        const player = this.players.get(playerId);
        if (player) {
          player.role = PlayerRole.SPECTATOR;
          player.team = TeamId.NONE;
        }
      }
    });

    this.hasAiPlayers = players.some((id) => this.players.get(id)?.isAi);
    // AI tables: sync phase advances so TurnTimer never waits on orphaned setTimeouts
    setForceSyncPhases(this.hasAiPlayers);

    // only 6p 3v3: ranked if no AI, practice (unranked) if any AI
    this.gameMode = this.hasAiPlayers ? GameMode.CASUAL : GameMode.COMPETITIVE_TEAM6;
    this.completeCitySize = 8;
    this.lobbyPlayerOrder = [...players];
    players.forEach((playerId, index) => {
      const player = this.players.get(playerId);
      if (player) {
        // seats 0,2,4 => A ; 1,3,5 => B
        player.team = index % 2 === 0 ? TeamId.A : TeamId.B;
      }
    });

    this.actionTimeoutSeconds = gameSetupData.actionTimeoutSeconds ?? 120;
    this.turnDeadlineAt = null;
    this.cityCompletedThisMatch = false;
    this.cityCompletedThisTurnPhase = false;
    this.teamScores = { A: 0, B: 0 };
    this.matchResult = MatchResult.NONE;
    this.startedAt = new Date().toISOString();
    this.matchPersisted = false;
    players.forEach((id) => {
      const p = this.players.get(id);
      if (p) {
        p.isAutoplay = p.isAi;
        p.hadEffectiveAiControl = false;
      }
    });
    this.board = new BoardState(players);
  }

  /** true if current actor needs a human action timer */
  needsActionTimer(): boolean {
    if (this.progress !== GameProgress.IN_GAME || !this.board) return false;
    if (this.board.gamePhase === GamePhase.INITIAL) return false;
    const actorId = this.board.getCurrentPlayerId();
    if (!actorId) return false;
    const actor = this.players.get(actorId);
    if (!actor || actor.role !== PlayerRole.PLAYER) return false;
    if (actor.isAi || actor.isAutoplay) return false;
    // only when someone must choose / act
    if (this.board.gamePhase === GamePhase.CHOOSE_CHARACTERS) {
      const t = this.board.characterManager.choosingState.getState().type;
      return t === CCST.CHOOSE_CHARACTER
        || t === CCST.PUT_ASIDE_FACE_DOWN_UP
        || t === CCST.PUT_ASIDE_FACE_DOWN
        || t === CCST.PUT_ASIDE_FACE_UP;
    }
    if (this.board.gamePhase === GamePhase.DO_ACTIONS) {
      const turn = this.board.characterManager.getClientTurnState();
      return turn !== ClientTurnState.INITIAL && turn !== ClientTurnState.DONE;
    }
    return false;
  }

  refreshTurnDeadline() {
    if (this.needsActionTimer()) {
      this.turnDeadlineAt = Date.now() + this.actionTimeoutSeconds * 1000;
    } else {
      this.turnDeadlineAt = null;
    }
  }

  setAutoplay(playerId: PlayerId, enabled: boolean): boolean {
    const player = this.players.get(playerId);
    if (!player || player.role !== PlayerRole.PLAYER) return false;
    if (player.isAi) {
      player.isAutoplay = true;
      return true;
    }
    player.isAutoplay = enabled;
    if (!enabled) {
      // cancel only clears autoplay flag; hadEffectiveAiControl stays if AI already acted
    }
    this.refreshTurnDeadline();
    return true;
  }

  markEffectiveAiControl(playerId: PlayerId) {
    const player = this.players.get(playerId);
    if (player) player.hadEffectiveAiControl = true;
  }

  // step through the FSM and return whether the action is valid
  step(move = { type: MoveType.AUTO } as Move): boolean {
    debug('------- STEP -------');
    debug('move', MoveType[move.type], move.data);
    debug('progress', GameProgress[this.progress]);
    debug('phase', this.board ? GamePhase[this.board.gamePhase] : undefined);

    switch (this.progress) {
      case GameProgress.IN_LOBBY:
        if (move.type === MoveType.AUTO) {
          this.progress = GameProgress.IN_GAME;
          return this.step(move);
        }
        break;

      case GameProgress.IN_GAME:
        switch (this.board?.gamePhase) {
          case GamePhase.INITIAL:
            if (move.type === MoveType.AUTO) {
              schedulePhase(() => {
                if (this.board) {
                  this.board.gamePhase = GamePhase.CHOOSE_CHARACTERS;
                  this.step();
                  this.notify();
                }
              }, DELAY_SHORT);
              return true;
            }
            return false;

          case GamePhase.CHOOSE_CHARACTERS:
            {
              // get character choosing state
              const cm = this.board.characterManager;
              const ccs = cm.choosingState;
              switch (ccs.getState().type) {
                case CCST.INITIAL:
                  if (move.type === MoveType.AUTO) {
                    schedulePhase(() => {
                      ccs.step();
                      this.notify();
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
                      if (this.board) {
                        this.board.gamePhase = GamePhase.DO_ACTIONS;
                        // enter first character (or skip until playable) and apply passives/rob
                        const cm2 = this.board.characterManager;
                        if (cm2.turnState === TurnState.INITIAL) {
                          cm2.jumpToNextCharacter();
                        }
                        // keep skipping unplayable until a playable role or DONE
                        let guard = 0;
                        while (
                          guard < 10
                          && cm2.turnState !== TurnState.DONE
                          && !cm2.isCharacterPlayable(cm2.getCurrentCharacter())
                        ) {
                          this.logCharacterCall(cm2.getCurrentCharacter());
                          cm2.jumpToNextCharacter();
                          guard += 1;
                        }
                        if (cm2.turnState !== TurnState.DONE) {
                          this.onCharacterTurnStart();
                        }
                        this.step();
                        this.notify();
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
            const cm = this.board.characterManager;

            // jump to next character automatically
            switch (move.type) {
              case MoveType.AUTO:
                if (cm.turnState === TurnState.DONE) {
                  // longer pause at end of character phase so mixed human+AI tables can read results
                  const endDelay = this.hasAiPlayers
                    ? Math.max(DELAY_LONG, 3500)
                    : Math.max(DELAY_LONG, 2500);
                  schedulePhase(() => {
                    this.finishTurnPhase();
                    this.step();
                    this.notify();
                  }, endDelay);
                  return true;
                }
                if (!cm.isCharacterPlayable(cm.getCurrentCharacter())) {
                  // killed / not chosen: pause so everyone sees who was called & skipped
                  this.logCharacterCall(cm.getCurrentCharacter());
                  const skipDelay = this.hasAiPlayers
                    ? Math.max(DELAY_SHORT, 2200)
                    : Math.max(DELAY_SHORT, 1500);
                  schedulePhase(() => {
                    cm.jumpToNextCharacter();
                    this.onCharacterTurnStart();
                    this.step();
                    this.notify();
                  }, skipDelay);
                  return true;
                }
                return false;
              case MoveType.DECLINE:
                return this.decline();
              case MoveType.SMITHY_DRAW_CARDS:
              case MoveType.LABORATORY_DISCARD_CARD:
                return this.doSpecialAction(move);
              case MoveType.FINISH_TURN:
                if (cm.getClientTurnState() !== ClientTurnState.CHOOSE_ACTION) return false;
                cm.jumpToNextCharacter();
                this.onCharacterTurnStart();
                return true;

              default:
                break;
            }

            // player actions
            switch (cm.getClientTurnState()) {
              case ClientTurnState.TAKE_RESOURCES:
              case ClientTurnState.CHOOSE_ACTION:
                return this.executeAction(move);
              case ClientTurnState.CHOOSE_CARD:
                return this.chooseDistrictCard(move);
              case ClientTurnState.BUILD_DISTRICT:
                return this.buildDistrict(move);
              case ClientTurnState.ASSASSIN_KILL:
                return this.killCharacter(move);
              case ClientTurnState.THIEF_ROB:
                return this.robCharacter(move);
              case ClientTurnState.MAGICIAN_EXCHANGE_HAND:
                return this.exchangeHand(move);
              case ClientTurnState.MAGICIAN_DISCARD_CARDS:
                return this.discardCards(move);
              case ClientTurnState.MERCHANT_TAKE_1_GOLD:
                return this.takeOneGold(move);
              case ClientTurnState.ARCHITECT_DRAW_2_CARDS:
                return this.drawTwoCards(move);
              case ClientTurnState.WARLORD_DESTROY_DISTRICT:
                return this.destroyDistrict(move);
              case ClientTurnState.GRAVEYARD_RECOVER_DISTRICT:
                return this.recoverFromGraveyard(move);
              default:
                break;
            }
            break;
          }

          default:
            this.progress = GameProgress.FINISHED;
            break;
        }
        break;

      case GameProgress.FINISHED:
        break;

      default:
    }
    return false;
  }

  private finishTurnPhase(): boolean {
    if (!this.board) return false;
    const cm = this.board.characterManager;

    // snapshot before reset so UI can show "what happened last round"
    this.lastRoundSummary = this.buildRoundSummary();

    this.giveCrownToKing();

    // clean graveyard
    if (this.board.graveyard !== undefined) {
      this.board.districtsDeck.discardCards([this.board.graveyard]);
      this.board.graveyard = undefined;
    }

    const isEndOfGame = Array.from(this.board.players.values()).some(
      (player) => player.city.length >= this.completeCitySize,
    );

    if (isEndOfGame) {
      this.computeScores();
      this.progress = GameProgress.FINISHED;
    } else {
      // new character-selection round; same-turn complete flags already applied
      this.cityCompletedThisTurnPhase = false;
      this.board.gamePhase = GamePhase.CHOOSE_CHARACTERS;
      cm.reset();
    }

    return true;
  }

  private buildRoundSummary(): string {
    if (!this.board) return '';
    const cm = this.board.characterManager;
    const names = ['刺客', '盗贼', '魔术师', '国王', '主教', '商人', '建筑师', '军阀'];
    const parts: string[] = [];
    if (cm.killedCharacter >= 0) {
      parts.push(`被刺：${names[cm.killedCharacter] || cm.killedCharacter}`);
    }
    if (cm.robbedCharacter >= 0) {
      parts.push(`被偷：${names[cm.robbedCharacter] || cm.robbedCharacter}`);
    }
    this.board.playerOrder.forEach((pid) => {
      const meta = this.players.get(pid);
      const board = this.board?.players.get(pid);
      if (!meta || !board) return;
      parts.push(
        `${meta.username} 城${board.city.length} 金${board.stash} 分${board.score?.total ?? 0}`,
      );
    });
    return parts.join(' · ');
  }

  /** robbed gold transfer, crown, and merchant/architect passives on turn start */
  private onCharacterTurnStart() {
    if (!this.board) return;
    const cm = this.board.characterManager;
    const ch = cm.getCurrentCharacter();
    if (ch >= 0 && cm.isCharacterPlayable(ch)) {
      this.logCharacterCall(ch);
    }
    if (ch === cm.robbedCharacter) {
      this.moveRobbedGold();
    }
    if (ch === CharacterType.KING
        && cm.killedCharacter !== CharacterType.KING) {
      this.giveCrownToKing();
    }
    this.applyCharacterTurnStartPassives();
  }

  /** who holds a role seat (0-based CharacterType) */
  private ownerOfRole(character: CharacterType): PlayerId | null {
    if (!this.board || character < 0) return null;
    const pos = this.board.characterManager.characters[character];
    if (pos < CharacterPosition.PLAYER_1) return null;
    const seat = pos - CharacterPosition.PLAYER_1;
    return this.board.playerOrder[seat] ?? null;
  }

  private logCharacterCall(character: CharacterType) {
    if (!this.board || character < 0) return;
    const cm = this.board.characterManager;
    const role = this.roleNameZh(character);
    const ownerId = this.ownerOfRole(character);
    if (ownerId == null) {
      this.pushAction(`本轮无人选择${role}`, 'info');
      return;
    }
    const name = this.playerName(ownerId);
    if (character === cm.killedCharacter) {
      this.pushAction(`${name} 的${role}被刺杀，本轮不能行动`, 'kill');
      return;
    }
    this.pushAction(`${name} 的${role}开始行动`);
  }

  /** merchant +1 gold / architect draw 2 — auto before player acts, free of resource action */
  private applyCharacterTurnStartPassives() {
    if (!this.board) return;
    const cm = this.board.characterManager;
    const character = cm.getCurrentCharacter();
    if (!cm.isCharacterPlayable(character)) return;

    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return;

    if (character === CharacterType.MERCHANT) {
      player.stash += 1;
      cm.canDoSpecialAction[CharacterType.MERCHANT] = false;
    } else if (character === CharacterType.ARCHITECT) {
      player.addCardsToHand(this.board.districtsDeck.drawCards(2));
      cm.canDoSpecialAction[CharacterType.ARCHITECT] = false;
    }
  }

  /** live + final scoring; team totals for any 6p team table (ranked or AI practice) */
  private refreshLiveScores(finalize = false) {
    if (!this.board) return;

    this.board.players.forEach((player) => {
      // reset then recompute so demolish / rebuild stays correct mid-game
      player.score = {};
      if (player.city.length >= this.completeCitySize) {
        player.score.extraPointsCompleteCity = player.firstToCompleteCity ? 4 : 2;
      }
      player.computeScore(this.completeCitySize);
    });

    let scoreA = 0;
    let scoreB = 0;
    let hasTeams = false;
    this.board.playerOrder.forEach((playerId) => {
      const meta = this.players.get(playerId);
      const board = this.board?.players.get(playerId);
      const total = board?.score.total ?? 0;
      if (meta?.team === TeamId.A) {
        scoreA += total;
        hasTeams = true;
      }
      if (meta?.team === TeamId.B) {
        scoreB += total;
        hasTeams = true;
      }
    });

    if (hasTeams) {
      this.teamScores = { A: scoreA, B: scoreB };
      if (finalize) {
        if (scoreA > scoreB) this.matchResult = MatchResult.TEAM_A_WIN;
        else if (scoreB > scoreA) this.matchResult = MatchResult.TEAM_B_WIN;
        else this.matchResult = MatchResult.DRAW;
      }
    } else if (finalize) {
      this.matchResult = MatchResult.CASUAL_END;
    }
  }

  private computeScores() {
    this.refreshLiveScores(true);
  }

  private decline(): boolean {
    if (!this.board) return false;
    const cm = this.board.characterManager;

    if (cm.isUsingLaboratory) {
      cm.isUsingLaboratory = false;
      return true;
    }

    switch (cm.getClientTurnState()) {
      case ClientTurnState.ASSASSIN_KILL:
        cm.canDoSpecialAction[CharacterType.ASSASSIN] = false;
        break;
      case ClientTurnState.THIEF_ROB:
        cm.canDoSpecialAction[CharacterType.THIEF] = false;
        break;
      case ClientTurnState.MAGICIAN_EXCHANGE_HAND:
      case ClientTurnState.MAGICIAN_DISCARD_CARDS:
        cm.canDoSpecialAction[CharacterType.MAGICIAN] = false;
        break;
      case ClientTurnState.WARLORD_DESTROY_DISTRICT:
        // declining destroy must consume the special so AI cannot re-enter forever
        cm.canDoSpecialAction[CharacterType.WARLORD] = false;
        break;
      case ClientTurnState.BUILD_DISTRICT:
      case ClientTurnState.GRAVEYARD_RECOVER_DISTRICT:
        break;
      case ClientTurnState.MERCHANT_TAKE_1_GOLD:
        cm.canDoSpecialAction[CharacterType.MERCHANT] = false;
        break;
      case ClientTurnState.ARCHITECT_DRAW_2_CARDS:
        cm.canDoSpecialAction[CharacterType.ARCHITECT] = false;
        break;

      default:
        return false;
    }

    cm.jumpToActionsState();
    return true;
  }

  private doSpecialAction(move: Move): boolean {
    if (!this.board) return false;
    const cm = this.board.characterManager;
    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return false;

    switch (cm.getClientTurnState()) {
      case ClientTurnState.TAKE_RESOURCES:
      case ClientTurnState.CHOOSE_ACTION:
        switch (move.type) {
          case MoveType.SMITHY_DRAW_CARDS:
            // check that player has not already used smithy
            if (cm.hasUsedSmithy) {
              return false;
            }

            // check that player has smithy
            if (!player.city.includes('smithy')) {
              return false;
            }

            // check that player has enough gold
            if (player.stash < 2) {
              return false;
            }

            // draw cards
            player.stash -= 2;
            player.addCardsToHand(this.board.districtsDeck.drawCards(3));
            cm.hasUsedSmithy = true;
            break;

          case MoveType.LABORATORY_DISCARD_CARD:
            // check that player can use laboratory
            if (cm.hasUsedLaboratory || !player.city.includes('laboratory')) {
              return false;
            }

            // go into laboratory mode
            cm.isUsingLaboratory = true;
            break;

          default:
            return false;
        }
        break;

      case ClientTurnState.LABORATORY_DISCARD_CARD:
      {
        if (move.type !== MoveType.LABORATORY_DISCARD_CARD) {
          return false;
        }

        if (!cm.isUsingLaboratory) {
          return false;
        }

        const card = move.data;
        if (player.takeCardFromHand(card) === null) {
          return false;
        }
        this.board.districtsDeck.discardCards(card);
        player.stash += 2;
        cm.isUsingLaboratory = false;
        cm.hasUsedLaboratory = true;
        break;
      }

      default:
        return false;
    }

    return true;
  }

  private gatherResources(move: Move): boolean {
    if (!this.board) return false;
    const cm = this.board.characterManager;
    if (cm.hasTakenResources) return false;
    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return false;

    // if player skips manual rent and takes gold/cards, auto-collect rent first
    this.autoCollectEarningsIfPending(player, cm);

    switch (move.type) {
      case MoveType.TAKE_GOLD:
        player.stash += 2;
        cm.goldFromResourcesThisTurn = 2;
        cm.hasTakenResources = true;
        break;

      case MoveType.DRAW_CARDS:
      {
        const hasObservatory = player.city.includes('observatory');
        const hasLibrary = player.city.includes('library');

        // draw cards (may be empty if deck exhausted)
        const cards = this.board.districtsDeck.drawCards(hasObservatory ? 3 : 2);

        if (cards.length === 0) {
          cm.hasTakenResources = true;
          break;
        }

        if (hasLibrary) {
          // drawn cards go straight to hand
          player.addCardsToHand(cards);
          cm.hasTakenResources = true;
        } else if (cards.length === 1) {
          // only one card available — take it without selection
          player.addCardsToHand(cards);
          cm.hasTakenResources = true;
        } else {
          // put drawn cards in selection space
          player.tmpHand = cards;
          // go to card selection step
          cm.turnState += 1;
        }

        break;
      }

      default:
        return false;
    }

    return true;
  }

  /**
   * Auto rent when taking regular resources without having collected yet.
   * Manual TAKE_GOLD_EARNINGS still allowed before resources; after resources it is locked.
   */
  private autoCollectEarningsIfPending(
    player: { stash: number; computeEarningsForCharacter: (c: CharacterType) => number },
    cm: { canTakeEarnings: boolean[]; getCurrentCharacter: () => CharacterType },
  ) {
    const character = cm.getCurrentCharacter();
    if (!cm.canTakeEarnings[character]) return;
    const amount = player.computeEarningsForCharacter(character);
    if (amount > 0) {
      player.stash += amount;
      const actorId = this.board?.getCurrentPlayerId();
      if (actorId) {
        this.pushAction(
          `${this.playerName(actorId)} 自动收租 +${amount} 金`,
          'earn',
        );
      }
    }
    cm.canTakeEarnings[character] = false;
  }

  private chooseDistrictCard(move: Move): boolean {
    if (move.type !== MoveType.DRAW_CARDS) return false;

    if (!this.board) return false;
    const cm = this.board.characterManager;
    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return false;

    // put requested card in player hand
    const index = player.tmpHand.indexOf(move.data);
    if (index !== -1) {
      player.addCardsToHand([move.data]);
      player.tmpHand.splice(index, 1);
    }

    // discard all other cards
    this.board.districtsDeck.discardCards(player.tmpHand);
    player.tmpHand = [];

    cm.hasTakenResources = true;
    cm.jumpToActionsState();

    return true;
  }

  private buildDistrict(move: Move) {
    if (move.type !== MoveType.BUILD_DISTRICT) return false;

    if (!this.board) return false;
    const cm = this.board.characterManager;
    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return false;

    // check that the current character can build
    if (cm.districtsToBuild[cm.getCurrentCharacter()] < 1) {
      return false;
    }

    // try to build district
    if (!player.buildDistrict(move.data)) {
      return false;
    }

    {
      const actorId = this.board.getCurrentPlayerId();
      this.pushAction(
        `${this.playerName(actorId)} 建造了 ${this.districtLabelZh(String(move.data))}`,
        'build',
      );
    }

    cm.districtsToBuild[cm.getCurrentCharacter()] -= 1;

    // haunted_quarter built after someone already completed city loses wild color
    if (move.data === 'haunted_quarter' && this.cityCompletedThisMatch) {
      player.hauntedQuarterBuiltInFinalRound = true;
    }

    // mark complete-city bonuses (first + same turn phase)
    if (player.city.length >= this.completeCitySize
        && !player.firstToCompleteCity
        && !player.sameTurnCompleteCity) {
      if (!this.cityCompletedThisMatch) {
        player.firstToCompleteCity = true;
        this.cityCompletedThisMatch = true;
        this.cityCompletedThisTurnPhase = true;
      } else if (this.cityCompletedThisTurnPhase) {
        player.sameTurnCompleteCity = true;
      } else {
        // completed after the turn phase where the first city was finished
        player.sameTurnCompleteCity = true;
      }
    }

    // go to actions step
    cm.jumpToActionsState();

    return true;
  }

  private executeAction(move: Move): boolean {
    if (!this.board) return false;
    const cm = this.board.characterManager;
    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return false;

    switch (move.type) {
      // ================
      // gather resources
      // ================
      case MoveType.TAKE_GOLD:
      case MoveType.DRAW_CARDS:
        if (cm.getClientTurnState() !== ClientTurnState.TAKE_RESOURCES) return false;
        return this.gatherResources(move);

      // ============
      // change state
      // ============
      case MoveType.BUILD_DISTRICT:
        // allow building before or after taking resources (earnings only before)
        if (cm.getClientTurnState() !== ClientTurnState.CHOOSE_ACTION
            && cm.getClientTurnState() !== ClientTurnState.TAKE_RESOURCES) {
          return false;
        }
        cm.jumpToBuildState();
        break;
      case MoveType.ASSASSIN_KILL:
        cm.turnState = TurnState.ASSASSIN_KILL;
        break;
      case MoveType.THIEF_ROB:
        cm.turnState = TurnState.THIEF_ROB;
        break;
      case MoveType.MAGICIAN_EXCHANGE_HAND:
        cm.turnState = TurnState.MAGICIAN_EXCHANGE_HAND;
        break;
      case MoveType.MAGICIAN_DISCARD_CARDS:
        cm.turnState = TurnState.MAGICIAN_DISCARD_CARDS;
        break;
      case MoveType.WARLORD_DESTROY_DISTRICT:
        cm.turnState = TurnState.WARLORD_DESTROY_DISTRICT;
        break;

      // ================
      // immediate action
      // ================
      case MoveType.TAKE_GOLD_EARNINGS:
        // manual rent only before regular resource action this turn
        if (cm.hasTakenResources) {
          return false;
        }
        if (!cm.canTakeEarnings[cm.getCurrentCharacter()]) {
          return false;
        }
        {
          const amount = player.computeEarningsForCharacter(cm.getCurrentCharacter());
          player.stash += amount;
          if (amount > 0) {
            this.pushAction(
              `${this.playerName(this.board.getCurrentPlayerId())} 收租 +${amount} 金`,
              'earn',
            );
          }
        }
        cm.canTakeEarnings[cm.getCurrentCharacter()] = false;
        break;
      case MoveType.MERCHANT_TAKE_1_GOLD:
      case MoveType.ARCHITECT_DRAW_2_CARDS:
        // passives are auto-applied at turn start; manual moves are invalid
        return false;

      default:
        return false;
    }

    return true;
  }

  private killCharacter(move: Move) {
    if (move.type !== MoveType.ASSASSIN_KILL) return false;

    if (!this.board) return false;
    const cm = this.board.characterManager;
    const character = move.data - 1 as CharacterType;

    debug('kill', move.data ? CharacterType[character] : undefined);

    switch (character) {
      case CharacterType.THIEF:
      case CharacterType.MAGICIAN:
      case CharacterType.KING:
      case CharacterType.BISHOP:
      case CharacterType.MERCHANT:
      case CharacterType.ARCHITECT:
      case CharacterType.WARLORD:
        cm.killedCharacter = character;
        // cannot rob a killed character — clear if already set somehow
        if (cm.robbedCharacter === character) {
          cm.robbedCharacter = CharacterType.NONE;
        }
        this.pushAction(`刺杀标记：${this.roleNameZh(character)}（持有者到其顺位再揭示）`, 'kill');
        cm.canDoSpecialAction[CharacterType.ASSASSIN] = false;
        cm.jumpToActionsState();
        return true;

      default:
        return false;
    }
  }

  private robCharacter(move: Move) {
    if (move.type !== MoveType.THIEF_ROB) return false;

    if (!this.board) return false;
    const cm = this.board.characterManager;
    const character = move.data - 1 as CharacterType;

    debug('rob', move.data ? CharacterType[character] : undefined);

    // hard rule: killed characters cannot be robbed
    if (character === cm.killedCharacter) {
      return false;
    }

    switch (character) {
      case CharacterType.MAGICIAN:
      case CharacterType.KING:
      case CharacterType.BISHOP:
      case CharacterType.MERCHANT:
      case CharacterType.ARCHITECT:
      case CharacterType.WARLORD:
        cm.robbedCharacter = character;
        this.pushAction(`偷窃标记：${this.roleNameZh(character)}（行动时夺金）`, 'rob');
        cm.canDoSpecialAction[CharacterType.THIEF] = false;
        cm.jumpToActionsState();
        return true;

      default:
        return false;
    }
  }

  private moveRobbedGold() {
    if (!this.board) return false;
    const cm = this.board.characterManager;
    const robbedRole = cm.robbedCharacter;
    if (robbedRole < 0 || robbedRole === CharacterType.NONE) return false;

    // characters[role] = CharacterPosition.PLAYER_1 + seatIndex
    const thiefPos = cm.characters[CharacterType.THIEF];
    const robbedPos = cm.characters[robbedRole];
    if (thiefPos < CharacterPosition.PLAYER_1 || robbedPos < CharacterPosition.PLAYER_1) {
      debug('moveRobbedGold: role not seated', {
        thiefPos, robbedPos, robbedRole, current: cm.getCurrentCharacter(),
      });
      return false;
    }

    const thiefId = this.board.playerOrder[thiefPos - CharacterPosition.PLAYER_1];
    const robbedPlayerId = this.board.playerOrder[robbedPos - CharacterPosition.PLAYER_1];
    if (!thiefId || !robbedPlayerId) return false;

    const thiefPlayer = this.board.players.get(thiefId);
    const robbedPlayer = this.board.players.get(robbedPlayerId);
    if (!thiefPlayer || !robbedPlayer) return false;

    if (thiefId !== robbedPlayerId) {
      const amount = robbedPlayer.stash;
      if (amount > 0) {
        thiefPlayer.stash += amount;
        robbedPlayer.stash = 0;
        this.pushAction(
          `${this.playerName(robbedPlayerId)} 的${this.roleNameZh(robbedRole)}被偷窃，${amount} 金币转移到 ${this.playerName(thiefId)}`,
          'rob',
        );
      } else {
        this.pushAction(
          `${this.playerName(robbedPlayerId)} 的${this.roleNameZh(robbedRole)}被偷窃，但没有金币`,
          'rob',
        );
      }
    }

    // one-shot: clear mark so it cannot apply twice
    cm.robbedCharacter = CharacterType.NONE;
    return true;
  }

  private exchangeHand(move: Move) {
    if (move.type !== MoveType.MAGICIAN_EXCHANGE_HAND) return false;

    if (!this.board) return false;
    const cm = this.board.characterManager;
    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return false;
    const otherPlayer = this.board.players.get(this.board.playerOrder[move.data]);
    if (otherPlayer === undefined) return false;

    // swap hands
    [player.hand, otherPlayer.hand] = [otherPlayer.hand, player.hand];
    cm.canDoSpecialAction[CharacterType.MAGICIAN] = false;
    cm.jumpToActionsState();
    return true;
  }

  private discardCards(move: Move) {
    if (move.type !== MoveType.MAGICIAN_DISCARD_CARDS) return false;
    if (!Array.isArray(move.data)) {
      return false;
    }

    if (!this.board) return false;
    const cm = this.board.characterManager;
    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return false;

    // check that action is permitted
    if (!cm.canDoSpecialAction[CharacterType.MAGICIAN]) {
      return false;
    }

    // discard cards
    const cards: DistrictId[] = [];
    move.data.forEach((card) => {
      if (player.takeCardFromHand(card) !== null) {
        cards.push(card);
      }
    });
    this.board.districtsDeck.discardCards(cards);

    // take new cards
    player.addCardsToHand(this.board.districtsDeck.drawCards(cards.length));

    cm.canDoSpecialAction[CharacterType.MAGICIAN] = false;
    cm.jumpToActionsState();
    return true;
  }

  private takeOneGold(move: Move) {
    if (move.type !== MoveType.MERCHANT_TAKE_1_GOLD) return false;
    if (!this.board) return false;
    const cm = this.board.characterManager;
    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return false;

    // check that action is permitted
    if (!cm.canDoSpecialAction[CharacterType.MERCHANT]) {
      return false;
    }

    // add 1 to stash
    player.stash += 1;

    cm.canDoSpecialAction[CharacterType.MERCHANT] = false;
    cm.jumpToActionsState();
    return true;
  }

  private drawTwoCards(move: Move) {
    if (move.type !== MoveType.ARCHITECT_DRAW_2_CARDS) return false;
    if (!this.board) return false;
    const cm = this.board.characterManager;
    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return false;

    // check that action is permitted
    if (!cm.canDoSpecialAction[CharacterType.ARCHITECT]) {
      return false;
    }

    // draw 2 cards
    player.addCardsToHand(this.board.districtsDeck.drawCards(2));

    cm.canDoSpecialAction[CharacterType.ARCHITECT] = false;
    cm.jumpToActionsState();
    return true;
  }

  private destroyDistrict(move: Move) {
    if (move.type !== MoveType.WARLORD_DESTROY_DISTRICT) return false;
    const data = {
      player: move.data?.player as PlayerPosition,
      card: move.data?.card as DistrictId,
    };

    if (!this.board) return false;
    const cm = this.board.characterManager;
    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return false;
    const otherPlayer = this.board.players.get(this.board.playerOrder[data.player]);
    if (otherPlayer === undefined) return false;

    // check that the current character can destroy
    if (!cm.canDoSpecialAction[CharacterType.WARLORD]) {
      return false;
    }

    // keep cannot be destroyed
    if (data.card === 'keep' || !otherPlayer.hasCardInCity(data.card)) {
      return false;
    }

    // check that victim is not an alive bishop
    const isOtherPlayerBishop = (
      cm.characters[CharacterType.BISHOP] === data.player + CharacterPosition.PLAYER_1
    );
    if (isOtherPlayerBishop && cm.killedCharacter !== CharacterType.BISHOP) {
      return false;
    }

    // sacred protection: once any city reaches 8 (complete size), that city is fully protected
    if (otherPlayer.city.length >= this.completeCitySize) {
      return false;
    }

    // check cost — cannot spend gold gained from this turn's regular TAKE_GOLD
    const cost = otherPlayer.computeDestroyCost(data.card);
    const spendableGold = player.stash - cm.goldFromResourcesThisTurn;
    if (spendableGold < cost) {
      return false;
    }

    // destroy district (move to graveyard)
    player.stash -= cost;
    otherPlayer.destroyDistrict(data.card);
    this.board.graveyard = data.card;

    {
      const actorId = this.board.getCurrentPlayerId();
      const victimId = this.board.playerOrder[data.player];
      this.pushAction(
        `${this.playerName(actorId)} 拆毁了 ${this.playerName(victimId)} 的 ${this.districtLabelZh(data.card)}`,
        'destroy',
      );
    }

    cm.canDoSpecialAction[CharacterType.WARLORD] = false;

    // special state for graveyard
    if (this.canRecoverFromGraveyard()) {
      cm.turnState = TurnState.GRAVEYARD_RECOVER_DISTRICT;
    } else {
      cm.jumpToActionsState();
    }

    return true;
  }

  private canRecoverFromGraveyard() {
    if (!this.board) return false;
    const cm = this.board.characterManager;

    // get player with graveyard
    const playerBoardEntry = [...this.board.players].find((p) => p[1].city.includes('graveyard'));

    // check that this player exists
    if (playerBoardEntry === undefined) {
      return false;
    }

    const [playerId, playerBoard] = playerBoardEntry;

    // check that this player has at least 1 gold
    if (playerBoard.stash < 1) {
      return false;
    }

    // check that this player is not a warlord
    if (cm.characters[CharacterType.WARLORD]
        === this.board.playerOrder.indexOf(playerId) + CharacterPosition.PLAYER_1) {
      return false;
    }

    return true;
  }

  private recoverFromGraveyard(move: Move) {
    if (move.type !== MoveType.GRAVEYARD_RECOVER_DISTRICT) return false;

    if (!this.board) return false;
    const cm = this.board.characterManager;
    const player = this.board.players.get(this.board.getCurrentPlayerId());
    if (player === undefined) return false;

    // check that graveyard is not empty
    if (this.board.graveyard === undefined) {
      return false;
    }

    // check that player has graveyard
    if (!player.city.includes('graveyard')) {
      return false;
    }

    // check that player has at least 1 gold
    if (player.stash < 1) {
      return false;
    }

    // check that player is not a warlord
    if (cm.characters[CharacterType.WARLORD]
        === this.board.getCurrentPlayerPosition() + CharacterPosition.PLAYER_1) {
      return false;
    }

    // take 1 gold from stash
    player.stash -= 1;

    // take card from graveyard
    player.addCardsToHand([this.board.graveyard]);
    this.board.graveyard = undefined;

    cm.jumpToActionsState();

    return true;
  }

  private giveCrownToKing() {
    if (!this.board) return false;
    const cm = this.board.characterManager;

    // get king position
    const position = cm.characters[CharacterType.KING];
    switch (position) {
      case CharacterPosition.PLAYER_2:
      case CharacterPosition.PLAYER_3:
      case CharacterPosition.PLAYER_4:
      case CharacterPosition.PLAYER_5:
      case CharacterPosition.PLAYER_6:
      case CharacterPosition.PLAYER_7:
      {
        // get player at position
        const playerPos = position - CharacterPosition.PLAYER_1;
        // shift player order
        this.board.playerOrder.push(...this.board.playerOrder.splice(0, playerPos));
        // shift character position
        cm.shiftPlayerPosition(playerPos);
        return true;
      }

      default:
        return false;
    }
  }

  attach(observer: Observer): void {
    if (!this.observers.includes(observer)) {
      this.observers.push(observer);
    }
  }

  detach(observer: Observer): void {
    const index = this.observers.indexOf(observer);
    if (index !== -1) {
      this.observers.splice(index, 1);
    }
  }

  notify(): void {
    this.observers.forEach((observer) => {
      observer.update();
    });
  }
}
