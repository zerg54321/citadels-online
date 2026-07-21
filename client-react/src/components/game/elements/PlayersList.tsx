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

  const renderRow = (row: { id: string; username: string; isAi?: boolean; manager?: boolean; seatNo: number }, teamBadge: string) => (
    <li
      key={row.id}
      className={`list-group-item py-2 px-2 d-flex align-items-center${row.id === self?.id ? ' self-row' : ''}`}
    >
      <span className={`badge ${teamBadge} badge-pill mr-1`}>
        {row.seatNo}
      </span>
      <span className="flex-fill text-truncate small">
        {row.username}
        {row.id === self?.id && <span className="badge badge-info">{t('ui.lobby.you')}</span>}
        {row.isAi && <span className="badge badge-dark">AI</span>}
        {row.manager && <span className="badge manager-badge">{t('ui.lobby.manager')}</span>}
      </span>
      {canManageAi && !row.isAi && (
        <span className="btn-group btn-group-sm">
          <button type="button" className="btn btn-outline-secondary btn-sm py-0" onClick={() => moveSeat(row.id, -1)}>↑</button>
          <button type="button" className="btn btn-outline-secondary btn-sm py-0" onClick={() => moveSeat(row.id, 1)}>↓</button>
        </span>
      )}
      {canManageAi && row.isAi && (
        <button type="button" className="btn btn-sm btn-outline-danger py-0 ml-1" onClick={() => removeAi(row.id)}>×</button>
      )}
    </li>
  );

  return (
    <div className="card players-list">
      <div className="card-header d-flex justify-content-between align-items-center">
        <span>{t('ui.lobby.players')}</span>
        <span className="small text-muted">{t('ui.lobby.team_preview_hint')}</span>
      </div>

      <div className="row no-gutters">
        <div className="col-6 border-right">
          <div className="px-2 py-1 team-a-header text-white small font-weight-bold text-center">
            {t('ui.team.a')}
          </div>
          <ul className="list-group list-group-flush">
            {teamARows.map((r) => renderRow(r, 'team-a-badge'))}
            {!teamARows.length && <li className="list-group-item small text-muted text-center py-2">—</li>}
          </ul>
        </div>
        <div className="col-6">
          <div className="px-2 py-1 team-b-header text-white small font-weight-bold text-center">
            {t('ui.team.b')}
          </div>
          <ul className="list-group list-group-flush">
            {teamBRows.map((r) => renderRow(r, 'team-b-badge'))}
            {!teamBRows.length && <li className="list-group-item small text-muted text-center py-2">—</li>}
          </ul>
        </div>
      </div>

      {spectators.length > 0 && (
        <div className="border-top">
          <div className="px-2 py-1 small text-muted">{t('ui.lobby.spectator')}</div>
          <ul className="list-group list-group-flush">
            {spectators.map((p) => (
              <li key={p.id} className="list-group-item py-1 px-2 small">
                {p.username}
                {p.id === self?.id && <span className="badge badge-info">{t('ui.lobby.you')}</span>}
              </li>
            ))}
          </ul>
        </div>
      )}

      <div className="card-footer">
        <div className="small text-muted mb-2">
          {t('ui.lobby.player_count', { n: counts.players })}
          {' · '}
          {t('ui.lobby.spectator_count', { n: counts.spectators })}
          {' · '}
          {t('ui.lobby.ai_count', { n: counts.ai })}
        </div>

        {inLobby && self && (
          <div className="mb-2">
            {self.role === PlayerRole.SPECTATOR ? (
              <button
                type="button"
                className="btn btn-sm btn-primary btn-block"
                disabled={counts.players >= 6}
                onClick={() => setRole('player')}
              >
                {t('ui.lobby.become_player')}
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-sm btn-outline-secondary btn-block"
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
              className="btn btn-sm btn-outline-primary btn-block"
              disabled={!canAddAi || aiBusy}
              onClick={addAi}
            >
              {t('ui.lobby.add_ai')}
            </button>
            <div className="small text-muted mt-1">{t('ui.lobby.add_ai_hint')}</div>
          </>
        )}
      </div>
    </div>
  );
}
