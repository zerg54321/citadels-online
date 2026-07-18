import {
  CharacterChoosingStateType as CCST,
  GamePhase,
  GameProgress,
  MoveType,
  PlayerPosition,
  PlayerRole,
} from 'citadels-common';
import Room from './Room';
import { pickAndApplyAutoplayMove } from '../game/AutoplayPolicy';
import { CharacterType, TurnState } from '../game/CharacterManager';

/**
 * P4/P5: action deadline + AI/autoplay + system AUTO.
 * Heartbeat every 400ms ensures we never stay stuck after async/sync phase changes.
 */
export class TurnTimer {
  private room: Room;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private workTimer: ReturnType<typeof setTimeout> | null = null;
  private heartbeat: ReturnType<typeof setInterval> | null = null;
  private disposed = false;
  private suppressArm = false;
  private running = false;

  constructor(room: Room) {
    this.room = room;
    this.heartbeat = setInterval(() => this.tick(), 400);
  }

  dispose() {
    this.disposed = true;
    this.clearTimers();
    if (this.heartbeat) {
      clearInterval(this.heartbeat);
      this.heartbeat = null;
    }
  }

  private clearTimers() {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.workTimer) {
      clearTimeout(this.workTimer);
      this.workTimer = null;
    }
  }

  onStateChanged(refreshDeadline = false) {
    if (this.disposed || this.suppressArm) return;
    this.arm(refreshDeadline);
  }

  resetDeadlineAfterHumanMove() {
    this.onStateChanged(true);
  }

  /** periodic safety net */
  private tick() {
    if (this.disposed || this.running || this.suppressArm) return;
    const gs = this.room.gameState;
    if (gs.progress !== GameProgress.IN_GAME) return;
    // only re-arm if nothing scheduled (do not stomp intentional AI pacing delay)
    if (this.shouldDriveNow() && !this.workTimer) {
      this.arm(false);
    } else if (gs.needsActionTimer() && !this.timer) {
      this.arm(false);
    }
  }

  private shouldDriveNow(): boolean {
    const gs = this.room.gameState;
    if (!gs.board || gs.progress !== GameProgress.IN_GAME) return false;
    if (this.needsSystemWork()) return true;
    const actorId = gs.board.getCurrentPlayerId();
    const actor = actorId ? gs.players.get(actorId) : undefined;
    return Boolean(actor && actor.role === PlayerRole.PLAYER && (actor.isAi || actor.isAutoplay));
  }

  private arm(refreshDeadline: boolean) {
    const gs = this.room.gameState;
    if (gs.progress !== GameProgress.IN_GAME) {
      this.clearTimers();
      gs.turnDeadlineAt = null;
      return;
    }

    this.clearTimers();

    if (this.shouldDriveNow()) {
      gs.turnDeadlineAt = null;
      const actorId = gs.board?.getCurrentPlayerId();
      const actor = actorId ? gs.players.get(actorId) : undefined;
      const delay = (actor && (actor.isAi || actor.isAutoplay) && !this.needsSystemWork())
        ? this.aiActionDelayMs()
        : 40;
      this.scheduleWork(delay);
      return;
    }

    if (gs.needsActionTimer()) {
      if (refreshDeadline || !gs.turnDeadlineAt || gs.turnDeadlineAt <= Date.now()) {
        gs.refreshTurnDeadline();
      }
      const ms = Math.max(50, (gs.turnDeadlineAt || Date.now()) - Date.now());
      this.timer = setTimeout(() => this.onTimeout(), ms);
      return;
    }

    gs.turnDeadlineAt = null;
  }

  /** human-vs-AI pacing: longer when pure AI seats act so players can read the board */
  private aiActionDelayMs(): number {
    const gs = this.room.gameState;
    // mixed table (has human player not autoplay): slow AI so humans can follow
    const hasWatchingHuman = Array.from(gs.players.values()).some(
      (p) => p.role === PlayerRole.PLAYER && !p.isAi && !p.isAutoplay,
    );
    if (hasWatchingHuman) {
      const cm = gs.board?.characterManager;
      // end of character phase: longer so humans can read results
      if (cm && cm.turnState === TurnState.DONE) {
        return 4000;
      }
      // killed / unowned role slot: linger so reveal is readable
      if (cm) {
        const ch = cm.getCurrentCharacter();
        if (ch !== CharacterType.NONE && !cm.isCharacterPlayable(ch)) {
          return 2200;
        }
      }
      // ~1.2s between AI actions
      return 1200;
    }
    // all AI / sim / hosted: keep snappy
    return 80;
  }

  private scheduleWork(delayMs: number) {
    if (this.workTimer) clearTimeout(this.workTimer);
    this.workTimer = setTimeout(() => this.runStep(), delayMs);
  }

  private needsSystemWork(): boolean {
    const gs = this.room.gameState;
    if (!gs.board) return false;
    const phase = gs.board.gamePhase;
    const cm = gs.board.characterManager;

    if (phase === GamePhase.INITIAL) return true;

    if (phase === GamePhase.CHOOSE_CHARACTERS) {
      const st = cm.choosingState.getState();
      if (st.type === CCST.INITIAL || st.type === CCST.DONE) return true;
      if (st.player === PlayerPosition.SPECTATOR) return true;
      return false;
    }

    if (phase === GamePhase.DO_ACTIONS) {
      if (cm.turnState === TurnState.DONE || cm.turnState === TurnState.INITIAL) return true;
      const ch = cm.getCurrentCharacter();
      if (ch !== CharacterType.NONE && !cm.isCharacterPlayable(ch)) return true;
      return false;
    }

    return false;
  }

  private onTimeout() {
    if (this.disposed) return;
    const gs = this.room.gameState;
    if (gs.progress !== GameProgress.IN_GAME) return;
    const actorId = gs.board?.getCurrentPlayerId();
    if (!actorId) {
      this.arm(false);
      return;
    }
    const actor = gs.players.get(actorId);
    if (!actor || actor.isAi || actor.isAutoplay) {
      this.arm(false);
      return;
    }
    actor.isAutoplay = true;
    gs.turnDeadlineAt = null;
    this.pushUpdate();
  }

  private runStep() {
    if (this.disposed || this.running) return;
    this.running = true;
    try {
      const gs = this.room.gameState;
      if (gs.progress !== GameProgress.IN_GAME) {
        this.clearTimers();
        return;
      }

      // System AUTO / spectator aside first
      if (this.needsSystemWork()) {
        const cm = gs.board?.characterManager;
        if (gs.board?.gamePhase === GamePhase.CHOOSE_CHARACTERS && cm) {
          const st = cm.choosingState.getState();
          if (st.player === PlayerPosition.SPECTATOR
              && st.type !== CCST.DONE
              && st.type !== CCST.INITIAL) {
            cm.autoSpectatorAside();
            this.pushUpdate();
            return;
          }
        }
        gs.step({ type: MoveType.AUTO });
        this.pushUpdate();
        return;
      }

      const actorId = gs.board?.getCurrentPlayerId();
      const actor = actorId ? gs.players.get(actorId) : undefined;
      if (actor && actor.role === PlayerRole.PLAYER && (actor.isAi || actor.isAutoplay)) {
        const move = pickAndApplyAutoplayMove(gs);
        if (move && actorId) {
          gs.markEffectiveAiControl(actorId);
        } else {
          // try harder: AUTO then one more policy attempt
          gs.step({ type: MoveType.AUTO });
          if (this.shouldDriveNow()) {
            const m2 = pickAndApplyAutoplayMove(gs);
            if (m2 && actorId) gs.markEffectiveAiControl(actorId);
          }
        }
        this.pushUpdate();
        return;
      }

      // Human waiting
      this.arm(false);
    } finally {
      this.running = false;
    }
  }

  private pushUpdate() {
    this.suppressArm = true;
    try {
      this.room.update();
    } finally {
      this.suppressArm = false;
    }
    // immediately arm next work (AI chains without waiting for heartbeat)
    this.arm(false);
  }
}

const timers = new Map<string, TurnTimer>();

export function getTurnTimer(room: Room): TurnTimer {
  let t = timers.get(room.roomId);
  if (!t) {
    t = new TurnTimer(room);
    timers.set(room.roomId, t);
  }
  return t;
}

export function disposeTurnTimer(roomId: string) {
  const t = timers.get(roomId);
  if (t) {
    t.dispose();
    timers.delete(roomId);
  }
}

export default TurnTimer;
