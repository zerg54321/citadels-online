import { useState } from 'react';
import { Outlet, useLocation, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import AuthPanel from './components/AuthPanel';
import LocaleSelector from './components/common/LocaleSelector';

// Mirrors Vue App.vue. The About modal (Vue Bootstrap data-toggle) becomes a
// createPortal + local state. Vue computed inGame ($route.name === 'room') →
// useLocation pathname check. This component is the layout route element for
// the data router in main.tsx; matched child routes render via <Outlet />.
// Header SCSS extracted to _app.scss.
export default function App() {
  const { t } = useTranslation();
  const location = useLocation();
  const [showAbout, setShowAbout] = useState(false);

  const inGame = location.pathname.startsWith('/room');

  return (
    <div className="d-flex flex-column h-100">
      <header>
        <div className="container-fluid">
          <div className="header-row">
            <div className="header-brand">
              <h1><a href="/" className="text-reset">{t('ui.title')}</a></h1>
              <h6 className={inGame ? 'header-subtitle--hidden' : ''}>{t('ui.subtitle2')}</h6>
            </div>
            <div className="header-actions">
              <div className={`header-extra${inGame ? ' header-extra--hidden' : ''}`}>
                <Link className="hdr-link" to="/stats">
                  {t('ui.stats.title')}
                </Link>
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

      <div className={`body flex-fill${inGame ? ' body--game' : ''}`}>
        <Outlet />
      </div>

      {showAbout && createPortal(
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
