import { useState } from 'react';
import { Routes, Route, Navigate, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import HomeScreen from './components/HomeScreen';
import RoomScreen from './components/game/RoomScreen';
import CardsPreview from './components/CardsPreview';
import StatsScreen from './components/StatsScreen';
import AuthPanel from './components/AuthPanel';
import LocaleSelector from './components/common/LocaleSelector';

// Mirrors Vue App.vue. The About modal (Vue Bootstrap data-toggle) becomes a
// createPortal + local state. Vue computed inGame ($route.name === 'room') →
// useLocation pathname check. Header SCSS extracted to _app.scss.
export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const [showAbout, setShowAbout] = useState(false);

  const inGame = location.pathname.startsWith('/room');

  return (
    <div className="d-flex flex-column h-100">
      <header>
        <div className="container-fluid">
          <div className="d-flex flex-wrap align-items-center justify-content-end">
            <div className="flex-grow-1 text-center pb-1">
              <h1><a href="/" className="text-reset">{t('ui.title')}</a></h1>
              <h6 className={inGame ? 'header-subtitle--hidden' : ''}>{t('ui.subtitle2')}</h6>
            </div>
            <div className="text-right header-actions">
              <AuthPanel />
              <div className={`mb-1 header-extra${inGame ? ' header-extra--hidden' : ''}`}>
                <Link className="text-reset text-decoration-none mr-2" to="/stats">
                  {t('ui.stats.title')}
                </Link>
                <button
                  type="button"
                  className="text-reset text-decoration-none btn btn-link p-0"
                  onClick={() => setShowAbout(true)}
                >
                  {t('ui.about.title')}
                </button>
              </div>
              <LocaleSelector />
            </div>
          </div>
        </div>
      </header>

      <div className={`body flex-fill${inGame ? ' body--game' : ''}`}>
        <Routes>
          <Route path="/" element={<HomeScreen />} />
          <Route path="/room/:roomId" element={<RoomScreen />} />
          <Route path="/cards" element={<CardsPreview />} />
          <Route path="/stats" element={<StatsScreen />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>

      {showAbout && createPortal(
        <div className="modal fade show d-block" style={{ background: 'rgba(0,0,0,0.65)', zIndex: 1050 }}>
          <div className="modal-dialog">
            <div className="modal-content">
              <div className="modal-header">
                <h5 className="modal-title">{t('ui.about.title')}</h5>
                <button type="button" className="close" aria-label={t('ui.close') as string} onClick={() => setShowAbout(false)}>
                  <span aria-hidden="true">&times;</span>
                </button>
              </div>
              <div className="modal-body">
                {/* eslint-disable-next-line react/no-danger */}
                <p dangerouslySetInnerHTML={{ __html: t('ui.about.text') as string }} />
              </div>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
