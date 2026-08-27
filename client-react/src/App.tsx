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
import {
  useAppStore, useGameProgress, useIsConnected, useSfxVolume, useMuted,
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
  const [showSettings, setShowSettings] = useState(false);
  const leaveRoomStore = useAppStore((s) => s.leaveRoom);
  const setSfxVolume = useAppStore((s) => s.setSfxVolume);
  const setMuted = useAppStore((s) => s.setMuted);
  const sfxVolume = useSfxVolume();
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
                <>
                  <Link className="hdr-link" to="/stats">
                    {t('ui.stats.title')}
                  </Link>
                  <Link className="hdr-link" to="/replays">
                    {t('ui.replay.library_title')}
                  </Link>
                </>
              )}
              <button
                type="button"
                className="hdr-link"
                onClick={() => setShowAbout(true)}
              >
                {t('ui.about.title')}
              </button>
            </div>
            <button
              type="button"
              className="hdr-btn settings-gear"
              aria-label={t('ui.settings.title') as string}
              title={t('ui.settings.title') as string}
              onClick={() => setShowSettings(true)}
            >
              <svg viewBox="0 0 24 24" width="1.15em" height="1.15em" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="3" />
                <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
              </svg>
            </button>
            <AuthPanel />
            <LocaleSelector />
          </div>
        </div>
      </div>
    </header>
  );

  // ICP 备案号 + 公安备案号 — read from the local-only env vars VITE_ICP_BEIAN /
  // VITE_GONGAN_BEIAN (set in client-react/.env.local, which is gitignored so
  // the numbers never leak into a public repo). Renders the MIIT + 公安 required
  // footer links when present. Only shown on the homepage ('/') inside the
  // scrollable body so it sits at the very bottom of the page (per filing rules
  // it belongs at the page footer, not pinned to the viewport). Other pages
  // (admin/stats/cards/房间等) keep the footer hidden.
  const icpBeian = import.meta.env.VITE_ICP_BEIAN as string | undefined;
  const gonganBeian = import.meta.env.VITE_GONGAN_BEIAN as string | undefined;
  const footer = ((icpBeian || gonganBeian) && location.pathname === '/') ? (
    <footer className="app-footer">
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

  // Settings panel (audio volume / mute). Portals to document.body so it
  // escapes the GameStage scale layer — same pattern as aboutModal. Like
  // aboutModal it is included in BOTH the inPlay and non-inPlay return
  // branches below, so opening it never hits an early-return-isolation gap.
  const settingsModal = showSettings && createPortal(
    <div className="modal fade show d-block" style={{ background: 'rgba(0,0,0,0.65)', zIndex: 1050 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content app-modal">
          <div className="modal-header border-0 pb-2">
            <h5 className="modal-title app-modal__title">{t('ui.settings.title')}</h5>
            <button type="button" className="close app-modal__close" aria-label={t('ui.close') as string} onClick={() => setShowSettings(false)}>
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body">
            <div className="settings-row">
              <label className="settings-row__label" htmlFor="settings-sfx-volume">
                {t('ui.settings.sfx_volume')}
              </label>
              <input
                id="settings-sfx-volume"
                type="range"
                min={0}
                max={1}
                step={0.01}
                className="settings-range"
                value={sfxVolume}
                onChange={(e) => setSfxVolume(Number(e.target.value))}
              />
            </div>
            <div className="settings-row">
              <span className="settings-row__label">{t('ui.settings.sound')}</span>
              <button
                type="button"
                className={`settings-toggle${!muted ? ' is-on' : ''}`}
                role="switch"
                aria-checked={!muted}
                aria-label={t('ui.settings.sound') as string}
                onClick={() => setMuted(!muted)}
              >
                {!muted ? t('ui.settings.on') : t('ui.settings.off')}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );

  // DEV AV Panel — audio/visual debug harness. Portals to <body> internally
  // (escapes GameStage scaling) so it can sit in both the in-play and
  // non-in-play branches. Gated on Vite's DEV flag so it never ships.
  const devPanel = import.meta.env.DEV && <DevAvPanel />;

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
        {settingsModal}
        {devPanel}
      </GameStage>
    );
  }

  return (
    <div className="d-flex flex-column h-100 app-shell">
      {header}
      {body}
      {aboutModal}
      {settingsModal}
      {devPanel}
    </div>
  );
}
