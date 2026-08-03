import { useMemo, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DndContext, DragOverlay, PointerSensor, TouchSensor,
  useDraggable, useDroppable, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import {
  Avatar, GameProgress, MAX_LOBBY_SEATS, PlayerId, PlayerRole,
} from 'citadels-common';
import { useAppStore } from '@/store';
import { avatarUrl } from '@/utils/avatarUrl';

// 重构后的大厅座位列表：6 个固定槽位（含空位），房主可拖拽调位（空位移动 /
// 已占位交换），普通玩家可拖自己到空位或点击空位入座。底层数据为
// gameState.lobbySeats（长度6，null=空位），队伍由 slot 奇偶派生（偶=A，奇=B）。
const TEAM_A_SLOTS = [0, 2, 4];
const TEAM_B_SLOTS = [1, 3, 5];

type SeatPlayer = {
  id: string;
  username: string;
  isAi?: boolean;
  manager?: boolean;
  avatar?: Avatar;
};

/** Team CSS class for a seat slot (single source of truth). */
function teamClassFor(slot: number): string {
  return slot % 2 === 0 ? 'team-a' : 'team-b';
}

/** Hook-free card body shared by OccupiedSeat and DragPreview so the drag
 *  ghost never visually diverges from the source card. */
function SeatCardBody({
  slot, player, isSelf,
}: { slot: number; player: SeatPlayer; isSelf: boolean }) {
  const { t } = useTranslation();
  return (
    <>
      <span className={`seat-card__no ${teamClassFor(slot)}`}>{slot + 1}</span>
      <span className="seat-card__avatar" aria-hidden>
        {player.isAi
          ? '🤖'
          : (player.avatar
            ? <img src={avatarUrl(player.avatar)} alt="" />
            : player.username.charAt(0).toUpperCase())}
      </span>
      <span className="seat-card__name">
        <span className="seat-card__name-text text-truncate">{player.username}</span>
        <span className="seat-card__tags">
          {isSelf && <span className="tag tag--you">{t('ui.lobby.you')}</span>}
          {player.manager && <span className="tag tag--mgr">{t('ui.lobby.manager')}</span>}
        </span>
      </span>
    </>
  );
}

// ── Occupied seat: draggable (self/manager) + droppable (swap target) ──
function OccupiedSeat({
  slot, player, isSelf, canDrag, canDrop, canRemoveAi, onRemoveAi,
}: {
  slot: number;
  player: SeatPlayer;
  isSelf: boolean;
  canDrag: boolean;
  canDrop: boolean;
  canRemoveAi: boolean;
  onRemoveAi: () => void;
}) {
  const draggable = useDraggable({ id: `seat-${slot}`, disabled: !canDrag });
  const droppable = useDroppable({ id: `slot-${slot}`, disabled: !canDrop });
  const setNodeRef = (node: HTMLElement | null) => {
    draggable.setNodeRef(node);
    droppable.setNodeRef(node);
  };
  return (
    <li
      ref={setNodeRef}
      {...draggable.attributes}
      {...draggable.listeners}
      className={[
        'seat-card',
        isSelf ? 'seat-card--self' : '',
        player.isAi ? 'seat-card--ai' : '',
        draggable.isDragging ? 'seat-card--dragging' : '',
        droppable.isOver ? 'seat-card--over-occupied' : '',
        canDrag ? 'seat-card--draggable' : '',
      ].filter(Boolean).join(' ')}
    >
      <SeatCardBody slot={slot} player={player} isSelf={isSelf} />
      {canRemoveAi && (
        <button
          type="button"
          className="btn btn-sm btn-outline-danger py-0 ml-1 seat-card__remove"
          onClick={onRemoveAi}
          onPointerDown={(e) => e.stopPropagation()}
          aria-label="remove"
        >
          ×
        </button>
      )}
    </li>
  );
}

// ── Empty seat: droppable + click-to-join ──
function EmptySeat({
  slot, canDrop, canClick, onClick,
}: {
  slot: number;
  canDrop: boolean;
  canClick: boolean;
  onClick: () => void;
}) {
  const droppable = useDroppable({ id: `slot-${slot}`, disabled: !canDrop });
  return (
    <li
      ref={droppable.setNodeRef}
      onClick={canClick ? onClick : undefined}
      className={[
        'seat-card seat-card--empty',
        droppable.isOver ? 'seat-card--over' : '',
        canClick ? 'seat-card--clickable' : '',
      ].filter(Boolean).join(' ')}
    >
      <span className={`seat-card__no ${teamClassFor(slot)}`}>{slot + 1}</span>
      <span className="seat-card__avatar seat-card__avatar--empty" aria-hidden>·</span>
      <span className="seat-card__name">
        <span className="seat-card__name-text text-truncate">—</span>
      </span>
    </li>
  );
}

// ── Drag overlay preview (no hooks) ──
function DragPreview({ slot, player, isSelf }: { slot: number; player: SeatPlayer; isSelf: boolean }) {
  return (
    <li className={[
      'seat-card seat-card--drag-preview',
      isSelf ? 'seat-card--self' : '',
      player.isAi ? 'seat-card--ai' : '',
    ].filter(Boolean).join(' ')}>
      <SeatCardBody slot={slot} player={player} isSelf={isSelf} />
    </li>
  );
}

export default function PlayersList() {
  const { t } = useTranslation();
  const gameState = useAppStore((s) => s.gameState);
  const setLobbyRole = useAppStore((s) => s.setLobbyRole);
  const moveSeatAction = useAppStore((s) => s.moveLobbySeat);
  const addAiPlayer = useAppStore((s) => s.addAiPlayer);
  const removeAiPlayer = useAppStore((s) => s.removeAiPlayer);

  const [aiBusy, setAiBusy] = useState(false);
  const [roleBusy, setRoleBusy] = useState(false);
  const [activeSlot, setActiveSlot] = useState<number | null>(null);

  const sensors = useSensors(
    // 鼠标：移动 5px 即触发拖拽
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    // 触摸（iPad/手机）：长按 150ms 触发拖拽（时间太长易触发系统手势），
    // 150ms 内手指抖动不超过 5px 才算"长按"而非"滑动"
    useSensor(TouchSensor, {
      activationConstraint: { delay: 150, tolerance: 5 },
    }),
  );

  const self = useMemo(
    () => (gameState ? gameState.players[gameState.self] : undefined),
    [gameState],
  );
  const inLobby = gameState?.progress === GameProgress.IN_LOBBY;
  const isManager = Boolean(self?.manager && inLobby);

  // 6 固定槽位（null=空）。服务端 lobbySeats 是真相来源；缺失/不足时补 null。
  const seats = useMemo<(PlayerId | null)[]>(() => {
    const raw = gameState?.lobbySeats;
    const filled: (PlayerId | null)[] = [];
    for (let i = 0; i < MAX_LOBBY_SEATS; i += 1) {
      filled.push(Array.isArray(raw) && i < raw.length ? (raw[i] ?? null) : null);
    }
    return filled;
  }, [gameState]);

  const spectators = useMemo(() => (gameState
    ? Object.values(gameState.players).filter((p) => p.role === PlayerRole.SPECTATOR)
    : []), [gameState]);

  const counts = useMemo(() => {
    if (!gameState) return { players: 0, spectators: 0, ai: 0 };
    const all = Object.values(gameState.players);
    return {
      players: all.filter((p) => p.role === PlayerRole.PLAYER).length,
      spectators: all.filter((p) => p.role === PlayerRole.SPECTATOR).length,
      ai: all.filter((p) => p.isAi && p.role === PlayerRole.PLAYER).length,
    };
  }, [gameState]);

  const canManageAi = Boolean(self?.manager && inLobby);
  const canAddAi = counts.players < MAX_LOBBY_SEATS;

  // 拖拽权限：房主可拖任意座位；普通玩家仅可拖自己；观战者不可拖。
  const canDragSlot = (slot: number): boolean => {
    if (!inLobby) return false;
    const id = seats[slot];
    if (!id || !self) return false;
    if (isManager) return true;
    return id === self.id && self.role === PlayerRole.PLAYER;
  };

  // 放置权限：基于当前拖动源。空位总可放；已占位仅房主可放（交换）。
  const canDropOn = (slot: number): boolean => {
    if (activeSlot === null) return true;
    if (slot === activeSlot) return false;
    if (seats[slot] !== null && !isManager) return false;
    return true;
  };

  // 空位点击入座：仅已入座 PLAYER 可换到其他空位（观战者用底部按钮转 PLAYER）。
  const canClickEmpty = (slot: number): boolean => {
    if (!inLobby || !self) return false;
    if (self.role !== PlayerRole.PLAYER) return false;
    return seats[slot] === null;
  };

  const handleEmptyClick = (slot: number) => {
    if (!self || self.role !== PlayerRole.PLAYER) return;
    if (seats[slot] !== null) return;
    moveSeatAction({ playerId: self.id, targetSlot: slot }).catch((e) => console.error(e));
  };

  const onDragStart = (e: DragStartEvent) => {
    const slot = Number(String(e.active.id).replace('seat-', ''));
    setActiveSlot(Number.isNaN(slot) ? null : slot);
  };

  const onDragEnd = (e: DragEndEvent) => {
    setActiveSlot(null);
    const { active, over } = e;
    if (!over) return;
    const srcSlot = Number(String(active.id).replace('seat-', ''));
    const targetSlot = Number(String(over.id).replace('slot-', ''));
    if (Number.isNaN(srcSlot) || Number.isNaN(targetSlot)) return;
    if (srcSlot === targetSlot) return;
    const draggedId = seats[srcSlot];
    if (!draggedId) return;
    // 权限二次校验（droppable disabled 已拦截，但防御）
    if (seats[targetSlot] !== null && !isManager) return;
    moveSeatAction({ playerId: draggedId, targetSlot }).catch((err) => console.error(err));
  };

  const setRole = async (role: 'player' | 'spectator') => {
    if (roleBusy) return;
    setRoleBusy(true);
    try {
      await setLobbyRole(role);
    } catch (e) {
      console.error(e);
      // eslint-disable-next-line no-alert
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRoleBusy(false);
    }
  };

  const addAi = async () => {
    setAiBusy(true);
    try {
      await addAiPlayer();
    } catch (e) {
      console.error(e);
      // eslint-disable-next-line no-alert
      window.alert(e instanceof Error ? e.message : String(e));
    } finally {
      setAiBusy(false);
    }
  };

  const removeAi = async (playerId: string) => {
    setAiBusy(true);
    try {
      await removeAiPlayer(playerId);
    } catch (e) {
      console.error(e);
    } finally {
      setAiBusy(false);
    }
  };

  const renderSlot = (slot: number): ReactNode => {
    const id = seats[slot];
    if (id && gameState?.players[id]) {
      const p = gameState.players[id];
      return (
        <OccupiedSeat
          key={slot}
          slot={slot}
          player={{
            id: p.id, username: p.username, isAi: p.isAi, manager: p.manager, avatar: p.avatar,
          }}
          isSelf={p.id === self?.id}
          canDrag={canDragSlot(slot)}
          canDrop={canDropOn(slot)}
          canRemoveAi={canManageAi && Boolean(p.isAi)}
          onRemoveAi={() => removeAi(p.id)}
        />
      );
    }
    return (
      <EmptySeat
        key={slot}
        slot={slot}
        canDrop={canDropOn(slot)}
        canClick={canClickEmpty(slot)}
        onClick={() => handleEmptyClick(slot)}
      />
    );
  };

  const activePreview = (() => {
    if (activeSlot === null) return null;
    const id = seats[activeSlot];
    if (!id || !gameState?.players[id]) return null;
    const p = gameState.players[id];
    return (
      <DragPreview
        slot={activeSlot}
        player={{
          id: p.id, username: p.username, isAi: p.isAi, manager: p.manager, avatar: p.avatar,
        }}
        isSelf={p.id === self?.id}
      />
    );
  })();

  return (
    <div className="players-list">
      <div className="players-list__header">
        <span className="players-list__title">{t('ui.lobby.players')}</span>
      </div>

      <DndContext
        sensors={sensors}
        onDragStart={onDragStart}
        onDragEnd={onDragEnd}
        onDragCancel={() => setActiveSlot(null)}
      >
        <div className="players-list__teams">
          <div className="players-list__team players-list__team--a">
            <div className="players-list__team-head">{t('ui.team.a')}</div>
            <ul className="players-list__seats">
              {TEAM_A_SLOTS.map(renderSlot)}
            </ul>
          </div>
          <div className="players-list__team players-list__team--b">
            <div className="players-list__team-head">{t('ui.team.b')}</div>
            <ul className="players-list__seats">
              {TEAM_B_SLOTS.map(renderSlot)}
            </ul>
          </div>
        </div>

        <DragOverlay dropAnimation={null}>{activePreview}</DragOverlay>
      </DndContext>

      {spectators.length > 0 && (
        <div className="players-list__spectators">
          <div className="players-list__spectators-head">{t('ui.lobby.spectator')}</div>
          <ul className="players-list__seats players-list__seats--spec">
            {spectators.map((p) => (
              <li key={p.id} className="seat-card seat-card--spec">
                <span className="seat-card__avatar" aria-hidden>
                  {p.avatar ? <img src={avatarUrl(p.avatar)} alt="" /> : p.username.charAt(0).toUpperCase()}
                </span>
                <span className="seat-card__name">
                  <span className="seat-card__name-text text-truncate">{p.username}</span>
                  {p.id === self?.id && <span className="tag tag--you">{t('ui.lobby.you')}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="players-list__footer">
        <div className="players-list__counts">
          <span className="players-list__count"><strong>{counts.players}</strong> {t('ui.lobby.players')}</span>
          {counts.spectators > 0 && (
            <>
              <span className="players-list__dot">·</span>
              <span className="players-list__count"><strong>{counts.spectators}</strong> {t('ui.lobby.spectator')}</span>
            </>
          )}
        </div>

        {inLobby && self && (
          <div className="mb-2">
            {self.role === PlayerRole.SPECTATOR ? (
              <button
                type="button"
                className="btn btn-sm btn-gold btn-block"
                disabled={counts.players >= MAX_LOBBY_SEATS}
                onClick={() => setRole('player')}
              >
                {t('ui.lobby.become_player')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-outline-gold btn-block"
                onClick={() => setRole('spectator')}
              >
                {t('ui.lobby.become_spectator')}
              </button>
            )}
          </div>
        )}

        {canManageAi && (
          <>
            <button
              type="button"
              className="btn btn-sm btn-outline-gold btn-block"
              disabled={!canAddAi || aiBusy}
              onClick={addAi}
            >
              {t('ui.lobby.add_ai')}
            </button>
            <div className="players-list__ai-hint">{t('ui.lobby.add_ai_hint')}</div>
          </>
        )}
      </div>
    </div>
  );
}
