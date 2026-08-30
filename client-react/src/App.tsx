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
import DevAvPanel from './components/dev/DevAvPanel';
import DevAiPanel from './components/dev/DevAiPanel';
import {
  useAppStore, useGameProgress, useIsConnected, useMuted,
} from './store';

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
  const setMuted = useAppStore((s) => s.setMuted);
  const muted = useMuted();
  const gameProgress = useGameProgress();
  const isConnected = useIsConnected();

  const inGame = location.pathname.startsWith('/room');
  // Admin sub-screens (live OB / replay) run under /admin/*. Their topbar has
  // its own 返回 button, but the header brand is ALSO a "back" affordance for
  // users — pointing it to /admin (breadcrumb-style) instead of the site home
  // ensures every back affordance on those screens returns to the admin page.
  const onAdminSubPage = location.pathname.startsWith('/admin/');
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
                ) : onAdminSubPage ? (
                  <Link to="/admin" className="text-reset" title={t('ui.admin.title')}>{t('ui.title')}</Link>
                ) : (
                  <a href="/" className="text-reset">{t('ui.title')}</a>
                )}
              </h1>

            </div>
          {inPlay && <GameTopBar />}
          <div className="header-actions">
            {inPlay && gameProgress === 'IN_GAME' && (
              <div className="header-group">
                <button type="button" className="header-leave-btn" onClick={leaveRoom}>
                  {t('ui.score.leave_room')}
                </button>
              </div>
            )}
            {!inPlay && (
              <div className="header-group">
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
              </div>
            )}
            {!inLobby && !inPlay && (
              <div className="header-group">
                <Link className="hdr-link" to="/stats">
                  {t('ui.stats.title')}
                </Link>
                <Link className="hdr-link" to="/replays">
                  {t('ui.replay.library_title')}
                </Link>
              </div>
            )}
            <div className="header-group">
              <button
                type="button"
                className={`hdr-btn hdr-sound${muted ? ' is-muted' : ''}`}
                role="switch"
                aria-checked={!muted}
                aria-label={t('ui.settings.sound') as string}
                title={`${t('ui.settings.sound')}: ${muted ? t('ui.settings.off') : t('ui.settings.on')}`}
                onClick={() => setMuted(!muted)}
              >
                {muted ? (
                  <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <line x1="23" y1="9" x2="17" y2="15" />
                    <line x1="17" y1="9" x2="23" y2="15" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
                    <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
                    <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
                  </svg>
                )}
              </button>
            </div>
            <div className="header-group">
              <AuthPanel />
            </div>
            <div className="header-group">
              <LocaleSelector />
            </div>
          </div>
        </div>
      </div>
    </header>
  );

  // 首页页脚：关于入口（原头部按钮，低频信息与备案链接同类）+ ICP 备案号 +
  // 公安备案号（VITE_ICP_BEIAN / VITE_GONGAN_BEIAN，读 local-only 的 .env.local，
  // 不进公开仓库）。只在首页（'/'）滚动 body 的最底部渲染（备案链接按备案
  // 规范须位于页脚而非视口钉住）。其他页面（admin/stats/cards/房间等）隐藏。
  const icpBeian = import.meta.env.VITE_ICP_BEIAN as string | undefined;
  const gonganBeian = import.meta.env.VITE_GONGAN_BEIAN as string | undefined;
  const footer = location.pathname === '/' ? (
    <footer className="app-footer">
      <button
        type="button"
        className="app-footer__link app-footer__link--btn"
        onClick={() => setShowAbout(true)}
      >
        {t('ui.about.title')}
      </button>
      {icpBeian && (
        <a
          href="https://beian.miit.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          className="app-footer__link"
        >
          {icpBeian}
        </a>
      )}
      {gonganBeian && (
        <a
          href="https://www.beian.gov.cn/"
          target="_blank"
          rel="noopener noreferrer"
          className="app-footer__link app-footer__link--gongan"
        >
          {gonganBeian}
        </a>
      )}
    </footer>
  ) : null;

  const body = (
    <div className={`body flex-fill${inPlay ? ' body--game' : ''}`}>
      <Outlet />
      {footer}
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

  // DEV AV Panel — audio/visual debug harness. Portals to <body> internally
  // (escapes GameStage scaling) so it can sit in both the in-play and
  // non-in-play branches. Gated on Vite's DEV flag so it never ships.
  const devPanel = import.meta.env.DEV && (
    <>
      <DevAvPanel />
      <DevAiPanel />
    </>
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
        {devPanel}
      </GameStage>
    );
  }

  return (
    <div className="d-flex flex-column h-100 app-shell">
      {header}
      {body}
      {aboutModal}
      {devPanel}
    </div>
  );
}
