import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { PlayerRole } from 'citadels-common';
import { useAppStore, useGameSetupData, selectPlayerFromId } from '@/store';
import PlayersList from './elements/PlayersList';
import RoomChat from './RoomChat';

// Mirrors Vue LobbyScreen.vue. The setup-confirm modal uses createPortal. Vue
// data() (startingGame/completeCitySize/actionTimeoutSeconds/showSetupConfirm)
// → useState. Vue computed (isManager/isSixPlayers/hasAiPlayers/validation) →
// useMemo. The Vue :deep() badge overrides for the modal are scoped under
// .lobby-modal in _lobby-screen.scss.
export default function LobbyScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const gameState = useAppStore((s) => s.gameState);
  const gameSetupData = useGameSetupData();
  const prepareGameSetupConfirmation = useAppStore((s) => s.prepareGameSetupConfirmation);
  const startGameAction = useAppStore((s) => s.startGame);
  const leaveRoomAction = useAppStore((s) => s.leaveRoom);

  const [startingGame, setStartingGame] = useState(false);
  const [actionTimeoutSeconds, setActionTimeoutSeconds] = useState(120);
  const [showSetupConfirm, setShowSetupConfirm] = useState(false);

  const getPlayer = selectPlayerFromId(gameState);

  const isManager = useMemo(
    () => (gameState ? Boolean(getPlayer(gameState.self)?.manager) : false),
    [gameState, getPlayer],
  );

  const isSixPlayers = useMemo(() => {
    if (!gameState) return false;
    return Object.values(gameState.players).filter((p) => p.role === PlayerRole.PLAYER).length === 6;
  }, [gameState]);

  const hasAiPlayers = useMemo(() => {
    if (!gameState) return false;
    return Object.values(gameState.players).some((p) => p.isAi && p.role === PlayerRole.PLAYER);
  }, [gameState]);

  const validation = useMemo(() => {
    if (!gameState) return { disabled: true, message: '' };
    const playersCount = Object.values(gameState.players)
      .filter((p) => p.role === PlayerRole.PLAYER).length;
    if (playersCount < 6) {
      return { disabled: true, message: t('ui.lobby.need_six_players', { n: playersCount }) };
    }
    if (playersCount > 6) {
      return { disabled: true, message: t('ui.lobby.too_many_players') };
    }
    if (!isManager) {
      return { disabled: true, message: t('ui.lobby.wait_message') };
    }
    return { disabled: false, message: t('ui.lobby.start_game') };
  }, [gameState, isManager, t]);

  const showConfirmationModal = () => {
    prepareGameSetupConfirmation({
      completeCitySize: 8,
      actionTimeoutSeconds,
    });
    setShowSetupConfirm(true);
  };

  const startGame = async () => {
    try {
      setStartingGame(true);
      await startGameAction();
      setShowSetupConfirm(false);
    } catch (error) {
      console.error('error when starting game', error);
      // eslint-disable-next-line no-alert
      window.alert(error instanceof Error ? error.message : String(error));
    } finally {
      setStartingGame(false);
    }
  };

  const leaveRoom = async () => {
    try {
      await leaveRoomAction();
      navigate('/');
    } catch (e) {
      console.error('leave room failed', e);
    }
  };

  return (
    <>
      {showSetupConfirm && createPortal(
        <div className="modal fade show d-block" style={{ background: 'rgba(0,0,0,0.65)', zIndex: 1050 }}>
          <div className="modal-dialog modal-dialog-centered modal-dialog-scrollable">
            <div className="modal-content lobby-modal">
              <div className="modal-header border-0 pb-2">
                <h5 className="modal-title text-gold lobby-modal-title">
                  {t('ui.lobby.start_game')}
                </h5>
                <button
                  type="button"
                  className="close text-gold"
                  aria-label={t('ui.cancel') as string}
                  onClick={() => setShowSetupConfirm(false)}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                <table className="table lobby-table">
                  <tbody>
                    {isSixPlayers && (
                      <tr>
                        <td className="text-muted-gold">{t('ui.lobby.settings.game_mode')}</td>
                        <td className="text-gold">{t('ui.lobby.settings.mode_team6')}</td>
                      </tr>
                    )}
                    <tr>
                      <td className="text-muted-gold">{t('ui.lobby.settings.complete_city_size')}</td>
                      <td className="text-gold">{isSixPlayers ? 8 : gameSetupData.completeCitySize}</td>
                    </tr>
                    <tr>
                      <td className="text-muted-gold">{t('ui.lobby.settings.action_timeout')}</td>
                      <td className="text-gold">{`${gameSetupData.actionTimeoutSeconds}s`}</td>
                    </tr>
                  </tbody>
                </table>
                <div className="card lobby-modal-card">
                  <div className="card-header text-gold lobby-modal-card-header">
                    {t('ui.lobby.players')}
                  </div>
                  <ul className="list-group list-group-flush">
                    {gameSetupData.players.map((playerId) => {
                      const p = getPlayer(playerId);
                      return (
                        <li
                          key={playerId}
                          className={`list-group-item d-flex justify-content-between align-items-center${p && !p.online ? ' text-muted-gold' : ''}`}
                        >
                          <span className="text-parchment">{p?.username}</span>
                          {playerId === gameState?.self && (
                            <span className="badge badge-info">{t('ui.lobby.you')}</span>
                          )}
                          {playerId !== gameState?.self && p && !p.online && (
                            <span className="badge badge-secondary">{t('ui.lobby.offline')}</span>
                          )}
                          {playerId !== gameState?.self && p && p.online && (
                            <span className="badge badge-success">{t('ui.lobby.online')}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              </div>
              <div className="modal-footer border-0">
                <button type="button" className="btn btn-outline-gold" onClick={() => setShowSetupConfirm(false)}>
                  {t('ui.cancel')}
                </button>
                <button
                  type="button"
                  className="btn btn-gold"
                  onClick={startGame}
                  disabled={startingGame}
                >
                  {t('ui.confirm')}
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}

      <div className="card h-100 medieval-panel lobby-screen">
        <div className="card-header border-0 pt-3 pb-2">
          <h5 className="mb-0 text-gold lobby-title">
            {t('ui.lobby.title')}
          </h5>
        </div>
        <div className="card-body lobby-body p-0">
          <div className="row no-gutters lobby-players-area">
            {isManager && (
              <div className="col-auto p-3 lobby-settings-col">
                <div className="lobby-alert-info mb-2">
                  {t('ui.lobby.settings.mode_team6_only')}
                </div>
                {hasAiPlayers && (
                  <div className="lobby-alert-warn mb-2">
                    {t('ui.lobby.settings.ai_practice_hint')}
                  </div>
                )}
                <div className="form-group">
                  <label htmlFor="actionTimeoutSeconds" className="text-gold lobby-label">
                    {t('ui.lobby.settings.action_timeout')}
                  </label>
                  <select
                    className="form-control"
                    id="actionTimeoutSeconds"
                    value={actionTimeoutSeconds}
                    onChange={(e) => setActionTimeoutSeconds(Number(e.target.value))}
                  >
                    <option value={10}>10s（测试）</option>
                    <option value={60}>60s</option>
                    <option value={90}>90s</option>
                    <option value={120}>120s</option>
                    <option value={180}>180s</option>
                  </select>
                  <small className="text-muted-gold">{t('ui.lobby.settings.action_timeout_hint')}</small>
                </div>
              </div>
            )}
            <div className="col p-3 lobby-players-col">
              <PlayersList />
            </div>
          </div>
          <div className="lobby-chat-area px-3 pb-2">
            <RoomChat />
          </div>
        </div>
        <div className="card-footer border-0">
          <div className="d-flex gap-2">
            <input
              type="button"
              className="btn btn-outline-gold btn-lg"
              onClick={leaveRoom}
              value={t('ui.score.leave_room') as string}
            />
            <input
              type="button"
              className="btn btn-gold btn-lg flex-fill"
              onClick={showConfirmationModal}
              disabled={validation.disabled}
              value={validation.message}
            />
          </div>
        </div>
      </div>
    </>
  );
}
