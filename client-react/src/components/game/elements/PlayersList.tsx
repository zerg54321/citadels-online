import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameProgress, PlayerRole } from 'citadels-common';
import { useAppStore } from '@/store';

// Mirrors Vue elements/PlayersList.vue. The Vue computed (self/inLobby/
// seatedOrder/teamARows/teamBRows/spectators/counts/canManageAi/canAddAi) →
// useMemo. Vue data() (aiBusy/roleBusy) → useState. The scoped styles are
// extracted to _players-list.scss.
export default function PlayersList() {
  const { t } = useTranslation();
  const gameState = useAppStore((s) => s.gameState);
  const setLobbyRole = useAppStore((s) => s.setLobbyRole);
  const reorderLobbySeat = useAppStore((s) => s.reorderLobbySeat);
  const addAiPlayer = useAppStore((s) => s.addAiPlayer);
  const removeAiPlayer = useAppStore((s) => s.removeAiPlayer);

  const [aiBusy, setAiBusy] = useState(false);
  const [roleBusy, setRoleBusy] = useState(false);

  const self = useMemo(
    () => (gameState ? gameState.players[gameState.self] : undefined),
    [gameState],
  );
  const inLobby = gameState?.progress === GameProgress.IN_LOBBY;

  const seatedOrder = useMemo(() => {
    if (!gameState) return [];
    const order = gameState.lobbyPlayerOrder;
    if (Array.isArray(order) && order.length) {
      return order.map((id) => gameState.players[id]).filter(Boolean);
    }
    return Object.values(gameState.players).filter((p) => p.role === PlayerRole.PLAYER);
  }, [gameState]);

  const makeRows = (filterFn: (_: unknown, i: number) => boolean) => seatedOrder
    .filter(filterFn)
    .map((p) => ({ ...p, seatNo: seatedOrder.indexOf(p) + 1 }));

  const teamARows = useMemo(() => makeRows((_, i) => i % 2 === 0), [seatedOrder]);
  const teamBRows = useMemo(() => makeRows((_, i) => i % 2 === 1), [seatedOrder]);

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
  const canAddAi = counts.players < 6;

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

  const moveSeat = async (playerId: string, direction: number) => {
    try {
      await reorderLobbySeat({ playerId, direction });
    } catch (e) {
      console.error(e);
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

  const renderRow = (row: { id: string; username: string; isAi?: boolean; manager?: boolean; seatNo: number }, teamClass: string) => (
    <li
      key={row.id}
      className={`seat-card${row.id === self?.id ? ' seat-card--self' : ''}${row.isAi ? ' seat-card--ai' : ''}`}
    >
      <span className={`seat-card__no ${teamClass}`}>{row.seatNo}</span>
      <span className="seat-card__avatar" aria-hidden>
        {row.isAi ? '🤖' : row.username.charAt(0).toUpperCase()}
      </span>
      <span className="seat-card__name">
        <span className="seat-card__name-text text-truncate">{row.username}</span>
        <span className="seat-card__tags">
          {row.id === self?.id && <span className="tag tag--you">{t('ui.lobby.you')}</span>}
          {row.isAi && <span className="tag tag--ai">AI</span>}
          {row.manager && <span className="tag tag--mgr">{t('ui.lobby.manager')}</span>}
        </span>
      </span>
      {canManageAi && !row.isAi && (
        <span className="btn-group btn-group-sm seat-card__reorder">
          <button type="button" className="btn btn-outline-secondary btn-sm py-0" onClick={() => moveSeat(row.id, -1)} aria-label="up">↑</button>
          <button type="button" className="btn btn-outline-secondary btn-sm py-0" onClick={() => moveSeat(row.id, 1)} aria-label="down">↓</button>
        </span>
      )}
      {canManageAi && row.isAi && (
        <button type="button" className="btn btn-sm btn-outline-danger py-0 ml-1 seat-card__remove" onClick={() => removeAi(row.id)} aria-label="remove">×</button>
      )}
    </li>
  );

  return (
    <div className="players-list">
      <div className="players-list__header">
        <span className="players-list__title">{t('ui.lobby.players')}</span>
        <span className="players-list__subtitle">{t('ui.lobby.team_preview_hint')}</span>
      </div>

      <div className="players-list__teams">
        <div className="players-list__team players-list__team--a">
          <div className="players-list__team-head">{t('ui.team.a')}</div>
          <ul className="players-list__seats">
            {teamARows.map((r) => renderRow(r, 'team-a'))}
            {!teamARows.length && <li className="players-list__empty">—</li>}
          </ul>
        </div>
        <div className="players-list__team players-list__team--b">
          <div className="players-list__team-head">{t('ui.team.b')}</div>
          <ul className="players-list__seats">
            {teamBRows.map((r) => renderRow(r, 'team-b'))}
            {!teamBRows.length && <li className="players-list__empty">—</li>}
          </ul>
        </div>
      </div>

      {spectators.length > 0 && (
        <div className="players-list__spectators">
          <div className="players-list__spectators-head">{t('ui.lobby.spectator')}</div>
          <ul className="players-list__seats players-list__seats--spec">
            {spectators.map((p) => (
              <li key={p.id} className="seat-card seat-card--spec">
                <span className="seat-card__avatar" aria-hidden>{p.username.charAt(0).toUpperCase()}</span>
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
          <span className="players-list__dot">·</span>
          <span className="players-list__count"><strong>{counts.spectators}</strong> {t('ui.lobby.spectator')}</span>
          <span className="players-list__dot">·</span>
          <span className="players-list__count"><strong>{counts.ai}</strong> AI</span>
        </div>

        {inLobby && self && (
          <div className="mb-2">
            {self.role === PlayerRole.SPECTATOR ? (
              <button
                type="button"
                className="btn btn-sm btn-gold btn-block"
                disabled={counts.players >= 6}
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
