import { useState } from 'react';
import {
  Outlet, useLocation, Link, useNavigate,
} from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import AuthPanel from './components/AuthPanel';
import LocaleSelector from './components/common/LocaleSelector';
import GameTopBar from './components/game/GameTopBar';
import GameStage from './components/game/GameStage';
import { useAppStore, useGameProgress, useIsConnected } from './store';

// Mirrors Vue App.vue. The About modal (Vue Bootstrap data-toggle) becomes a
// createPortal + local state. Vue computed inGame ($route.name === 'room') →
// useLocation pathname check. This component is the layout route element for
// the data router in main.tsx; matched child routes render via <Outlet />.
// Header SCSS extracted to _app.scss.
export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const navigate = useNavigate();
  const [showAbout, setShowAbout] = useState(false);
  const leaveRoomStore = useAppStore((s) => s.leaveRoom);
  const gameProgress = useGameProgress();
  const isConnected = useIsConnected();

  const inGame = location.pathname.startsWith('/room');
  // GameStage (equal-ratio scaling) is only for an active board. The lobby
  // shares the /room path and the in-game header styling, but it is a normal
  // responsive page and must not be forced into the 1366×1024 scaled canvas.
  const inPlay = inGame && (gameProgress === 'IN_GAME' || gameProgress === 'FINISHED');
  // Lobby: same /room path but pre-game. Header should match the home page
  // (coin + linked title, stats/about visible) for visual continuity.
  const inLobby = inGame && !inPlay;

  const leaveRoom = async () => {
    try {
      await leaveRoomStore();
    } catch (e) {
      console.error('leave room failed', e);
    }
    navigate('/');
  };

  const header = (
    <header className={inPlay ? 'header--game' : undefined}>
      <div className="container-fluid">
        <div className="header-row">
            <div className="header-brand">
              <h1>
                {(inLobby || !inGame) && <img src="/svg/1fa99.svg" alt="" className="header-brand__coin" />}
                {inPlay ? (
                  t('ui.title')
                ) : (
                  <a href="/" className="text-reset">{t('ui.title')}</a>
                )}
              </h1>

            </div>
          {inPlay && <GameTopBar />}
          <div className="header-actions">
            {inPlay && gameProgress === 'IN_GAME' && (
              <button type="button" className="header-leave-btn" onClick={leaveRoom}>
                {t('ui.score.leave_room')}
              </button>
            )}
            {!inPlay && (
              <div
                className={`header-status${isConnected ? '' : ' header-status--offline'}`}
                title={isConnected ? undefined : t('ui.server_offline_hint', { defaultValue: 'Game server is unreachable. Please wait for it to come back online.' })}
              >
                <span className="header-status__label">SERVER STATUS</span>
                <span className="header-status__state">
                  <span className="header-status__dot" />
                  {isConnected ? 'CONNECTED' : 'OFFLINE'}
                </span>
              </div>
            )}
            <div className={`header-extra${inPlay ? ' header-extra--hidden' : ''}`}>
              {!inLobby && (
                <Link className="hdr-link" to="/stats">
                  {t('ui.stats.title')}
                </Link>
              )}
              <button
                type="button"
                className="hdr-link"
                onClick={() => setShowAbout(true)}
              >
                {t('ui.about.title')}
              </button>
            </div>
            <AuthPanel />
            <LocaleSelector />
          </div>
        </div>
      </div>
    </header>
  );

  const body = (
    <div className={`body flex-fill${inPlay ? ' body--game' : ''}`}>
      <Outlet />
    </div>
  );

  const aboutModal = showAbout && createPortal(
    <div className="modal fade show d-block" style={{ background: 'rgba(0,0,0,0.65)', zIndex: 1050 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content app-modal">
          <div className="modal-header border-0 pb-2">
            <h5 className="modal-title app-modal__title">{t('ui.about.title')}</h5>
            <button type="button" className="close app-modal__close" aria-label={t('ui.close') as string} onClick={() => setShowAbout(false)}>
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body app-modal__about">
            {/* eslint-disable-next-line react/no-danger */}
            <div dangerouslySetInnerHTML={{ __html: t('ui.about.text') as string }} />
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );

  // In-play: wrap header + body in GameStage so the whole shell scales as a
  // unit to fit any landscape viewport (iPad Pro/Air/mini, PC). The action
  // log escapes the stage via portal (see ActionLog + GameStage context).
  // The lobby (also under /room) is NOT scaled — it's a normal responsive page.
  if (inPlay) {
    return (
      <GameStage>
        {header}
        {body}
        {aboutModal}
      </GameStage>
    );
  }

  return (
    <div className="d-flex flex-column h-100 app-shell">
      {header}
      {body}
      {aboutModal}
    </div>
  );
}
