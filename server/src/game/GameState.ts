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
  PlayerId,
} from 'citadels-common';
import { Observer, Subject } from '../utils/observerPattern';
import BoardState from './BoardState';
import { CharacterType } from './CharacterManager';

import GameSetupData from './GameSetupData';
import Player from './Player';
import { refreshLiveScores } from './ScoreCalculator';
import GameFlowController from './GameFlowController';
import ActionExecutor from './ActionExecutor';
import { MAX_CHARACTER_SKIP_ATTEMPTS } from '../utils/schedule';

const ACTION_FEED_MAX_LENGTH = 60;
const ACTION_FEED_EXPORT_LIMIT = 40;

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
  /** epoch ms when this room became empty of human players */
  emptySince: number | null;
  private flow: GameFlowController;
  private executor: ActionExecutor;
  fastMode = false;
  syncMode = false;

  constructor(options?: { completeCitySize?: number; fastMode?: boolean; syncMode?: boolean }) {
    const completeCitySize = options?.completeCitySize ?? 7;
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
    this.emptySince = null;
    this.fastMode = options?.fastMode ?? false;
    this.syncMode = options?.syncMode ?? false;
    this.flow = new GameFlowController(this);
    this.executor = new ActionExecutor(this);
  }

  schedulePhase(fn: () => void, ms: number) {
    if (this.syncMode) {
      fn();
      return;
    }
    const delay = this.fastMode ? Math.round(ms / 100) : ms;
    setTimeout(fn, delay);
  }

  pushAction(text: string, kind = '') {
    this.actionFeed.push({ text, kind });
    if (this.actionFeed.length > ACTION_FEED_MAX_LENGTH) {
      this.actionFeed.splice(0, this.actionFeed.length - ACTION_FEED_MAX_LENGTH);
    }
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

  /** Remove a human player from lobby (and transfer manager if needed). */
  removePlayer(playerId: PlayerId): boolean {
    if (this.progress !== GameProgress.IN_LOBBY
        && this.progress !== GameProgress.FINISHED) {
      return false;
    }
    const player = this.players.get(playerId);
    if (!player || player.isAi) return false;
    if (player.manager && this.progress === GameProgress.IN_LOBBY) {
      player.manager = false;
      const next = this.lobbyPlayerOrder
        .map((id) => this.players.get(id))
        .find((p) => p && p.id !== playerId && !p.isAi && p.role === PlayerRole.PLAYER);
      if (next) next.manager = true;
    }
    this.players.delete(playerId);
    this.lobbyPlayerOrder = this.lobbyPlayerOrder.filter((id) => id !== playerId);
    if (this.progress === GameProgress.IN_LOBBY) {
      this.refreshLobbyTeams();
    }
    return true;
  }

  hasHumanPlayers(): boolean {
    return Array.from(this.players.values()).some(
      (p) => !p.isAi && p.role === PlayerRole.PLAYER,
    );
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
      if (p.role !== PlayerRole.PLAYER) {
        p.team = TeamId.NONE; // eslint-disable-line no-param-reassign
      }
    });
    this.lobbyPlayerOrder.forEach((id, index) => {
      const p = this.players.get(id);
      if (p) p.team = index % 2 === 0 ? TeamId.A : TeamId.B;
    });

    if (this.hasHumanPlayers()) {
      this.emptySince = null;
    } else if (this.emptySince === null) {
      this.emptySince = Date.now();
    }
  }

  findPlayerByUserId(userId: string | undefined) {
    if (!userId) return undefined;
    return Array.from(this.players.values()).find((player) => player.userId === userId);
  }

  getStateFromPlayer(playerId: PlayerId | undefined) {
    if (playerId === undefined) { return undefined; }
    // keep live personal / team scores on every state push
    if (this.progress === GameProgress.IN_GAME || this.progress === GameProgress.FINISHED) {
      refreshLiveScores(this, this.progress === GameProgress.FINISHED);
    }
    return {
      progress: this.progress,
      gameMode: this.gameMode,
      players: Object.fromEntries(
        Array.from(this.players).map(([id, player]) => [id, {
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
      ),
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
      actionFeed: this.actionFeed.slice(-ACTION_FEED_EXPORT_LIMIT),
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
    this.syncMode = this.hasAiPlayers;

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

  /**
   * P4 timeout: force a human player into autoplay (AI takeover).
   *
   * Differs from `setAutoplay(id, true)`:
   *   - does NOT call `refreshTurnDeadline()` (caller — TurnTimer — clears the
   *     deadline itself and immediately re-arms for AI work, so refreshing a
   *     human deadline here would be wrong/no-op);
   *   - bypasses the `isAi` short-circuit (timeout only fires for humans).
   *
   * Previously TurnTimer wrote `actor.isAutoplay = true` directly, which
   * skipped this method entirely and risked the timer/flag going out of sync
   * if `setAutoplay` ever gained side effects.
   */
  forceAutoplayForTimeout(playerId: PlayerId): boolean {
    const player = this.players.get(playerId);
    if (!player || player.role !== PlayerRole.PLAYER) return false;
    player.isAutoplay = true;
    return true;
  }

  /** Clear the action deadline (e.g. when leaving IN_GAME or entering AI drive). */
  clearTurnDeadline() {
    this.turnDeadlineAt = null;
  }

  markEffectiveAiControl(playerId: PlayerId) {
    const player = this.players.get(playerId);
    if (player) player.hadEffectiveAiControl = true;
  }

  step(move = { type: MoveType.AUTO } as Move): boolean {
    return this.flow.step(move);
  }

  decline(): boolean {
    return this.executor.decline();
  }

  doSpecialAction(move: Move): boolean {
    return this.executor.doSpecialAction(move);
  }

  gatherResources(move: Move): boolean {
    return this.executor.gatherResources(move);
  }

  autoCollectEarningsIfPending(
    player: { stash: number; computeEarningsForCharacter: (c: CharacterType) => number },
    cm: { canTakeEarnings: boolean[]; getCurrentCharacter: () => CharacterType },
  ) {
    return this.executor.autoCollectEarningsIfPending(player, cm);
  }

  chooseDistrictCard(move: Move): boolean {
    return this.executor.chooseDistrictCard(move);
  }

  buildDistrict(move: Move) {
    return this.executor.buildDistrict(move);
  }

  executeAction(move: Move): boolean {
    return this.executor.executeAction(move);
  }

  killCharacter(move: Move) {
    return this.executor.killCharacter(move);
  }

  robCharacter(move: Move) {
    return this.executor.robCharacter(move);
  }

  moveRobbedGold() {
    return this.executor.moveRobbedGold();
  }

  exchangeHand(move: Move) {
    return this.executor.exchangeHand(move);
  }

  discardCards(move: Move) {
    return this.executor.discardCards(move);
  }

  takeOneGold(move: Move) {
    return this.executor.takeOneGold(move);
  }

  drawTwoCards(move: Move) {
    return this.executor.drawTwoCards(move);
  }

  destroyDistrict(move: Move) {
    return this.executor.destroyDistrict(move);
  }

  canRecoverFromGraveyard() {
    return this.executor.canRecoverFromGraveyard();
  }

  recoverFromGraveyard(move: Move) {
    return this.executor.recoverFromGraveyard(move);
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
