import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { PlayerRole } from 'citadels-common';
import { useAppStore, useGameSetupData, selectPlayerFromId } from '@/store';
import ParticleField from '@/components/common/ParticleField';
import TimeoutSelect from './elements/TimeoutSelect';
import PlayersList from './elements/PlayersList';
import RoomChat from './RoomChat';

// 重构后的大厅页：主辅双栏布局，视觉对齐 HomeScreen。
//   全屏 wrapper（背景渐变 + 粒子）→ 居中内容区
//   内容区 = 主体（主区 PlayersList + 辅栏 设置卡/聊天卡）+ 底部条（离开 / 校验 / 开局）
// 全局 header（App.tsx）已处理标题/导航，本页不再重复渲染。
// 零行为回归：所有 store action / socket 事件 / validation 逻辑不动。
export default function LobbyScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const gameState = useAppStore((s) => s.gameState);
  const gameSetupData = useGameSetupData();
  const prepareGameSetupConfirmation = useAppStore((s) => s.prepareGameSetupConfirmation);
  const updateGameSetup = useAppStore((s) => s.updateGameSetup);
  const startGameAction = useAppStore((s) => s.startGame);
  const leaveRoomAction = useAppStore((s) => s.leaveRoom);

  const [startingGame, setStartingGame] = useState(false);
  const [actionTimeoutSeconds, setActionTimeoutSeconds] = useState(
    gameState?.settings?.actionTimeoutSeconds ?? 120,
  );
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

  // 当前回合限时：房主用本地状态，其他玩家从游戏状态读取（服务端同步）
  const currentTimeout = isManager
    ? actionTimeoutSeconds
    : (gameState?.settings?.actionTimeoutSeconds ?? 120);

  const handleTimeoutChange = async (value: number) => {
    const prevValue = actionTimeoutSeconds;
    setActionTimeoutSeconds(value);
    try {
      await updateGameSetup({ actionTimeoutSeconds: value });
    } catch {
      setActionTimeoutSeconds(prevValue);
    }
  };

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
      actionTimeoutSeconds: currentTimeout,
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
                <h5 className="modal-title lobby-modal-title">
                  {t('ui.lobby.start_game')}
                </h5>
                <button
                  type="button"
                  className="close"
                  aria-label={t('ui.cancel') as string}
                  onClick={() => setShowSetupConfirm(false)}
                >
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                {/* 卡片式设置行 */}
                <div className="lobby-setup-rows">
                  <div className="lobby-setup-row">
                    <span className="lobby-setup-row__label">{t('ui.lobby.settings.complete_city_size')}</span>
                    <span className="lobby-setup-row__value">{isSixPlayers ? 8 : gameSetupData.completeCitySize}</span>
                  </div>
                  <div className="lobby-setup-row">
                    <span className="lobby-setup-row__label">{t('ui.lobby.settings.action_timeout')}</span>
                    <span className="lobby-setup-row__value">{`${currentTimeout}s`}</span>
                  </div>
                </div>
                {/* 玩家清单（卡片式行布局） */}
                <div className="lobby-setup-players">
                  <div className="lobby-setup-players__head">{t('ui.lobby.players')}</div>
                  <ul className="lobby-setup-players__list">
                    {gameSetupData.players.map((playerId) => {
                      const p = getPlayer(playerId);
                      const offline = p && !p.online;
                      return (
                        <li
                          key={playerId}
                          className={`lobby-setup-players__item${offline ? ' lobby-setup-players__item--offline' : ''}`}
                        >
                          <span className="lobby-setup-players__name">{p?.username}</span>
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

      <div className="lobby-wrapper">
        {/* 背景渐变层 + 粒子（与 HomeScreen 同款） */}
        <div className="lobby-bg" aria-hidden>
          <div className="lobby-bg__gradient" />
          <ParticleField />
          <div className="lobby-bg__veil" />
          <div className="lobby-bg__glow" />
        </div>

        {/* 居中内容区 */}
        <div className="lobby">
          {/* 主体：主区 PlayersList + 辅栏 设置卡/聊天卡 */}
          <div className="lobby-body">
            {/* 主区：PlayersList 自带金属边框即为主视觉 */}
            <div className="lobby-main">
              <PlayersList />
            </div>

            {/* 辅栏 */}
            <div className="lobby-side">
              {/* 设置卡（所有玩家可见，非房主只读） */}
              <div className="lobby-card lobby-card--settings">
                <div className="lobby-card__header">
                  <h6 className="lobby-card__title">{t('ui.lobby.settings.card_title')}</h6>
                </div>
                <div className="lobby-card__body">
                  <div className="lobby-settings__group">
                    <label htmlFor="actionTimeoutSeconds" className="lobby-settings__label">
                      {t('ui.lobby.settings.action_timeout')}
                    </label>
                    {isManager ? (
                      <TimeoutSelect
                        value={actionTimeoutSeconds}
                        options={[
                          { value: 10, label: '10s' },
                          { value: 60, label: '60s' },
                          { value: 90, label: '90s' },
                          { value: 120, label: '120s' },
                          { value: 180, label: '180s' },
                        ]}
                        onChange={handleTimeoutChange}
                      />
                    ) : (
                      <div className="lobby-settings__readonly">
                        <span className="lobby-settings__readonly-value">
                          {currentTimeout}s
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* 聊天卡：固定高度、消息可滚动 */}
              <div className="lobby-card lobby-card--chat">
                <div className="lobby-card__header">
                  <h6 className="lobby-card__title">{t('ui.lobby.chat_title')}</h6>
                </div>
                <div className="lobby-card__body">
                  <RoomChat />
                </div>
              </div>
            </div>
          </div>

          {/* 底部条：离开 + 校验信息 + 开局 */}
          <div className="lobby-footer">
            <button
              type="button"
              className="btn btn-outline-gold btn-lg lobby-footer__leave"
              onClick={leaveRoom}
            >
              {t('ui.score.leave_room')}
            </button>
            <div className="lobby-footer__validation">
              {validation.disabled ? validation.message : ''}
            </div>
            <button
              type="button"
              className="btn btn-gold btn-lg lobby-footer__start"
              onClick={showConfirmationModal}
              disabled={validation.disabled}
            >
              <span className="lobby-footer__start-icon" aria-hidden>▶</span>
              {t('ui.lobby.start_game')}
            </button>
          </div>
        </div>
      </div>
    </>
  );
}
