import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store';

// Mirrors Vue AuthPanel.vue. The two modals (auth + profile) use createPortal.
// The Vue `mounted` window 'open-auth' listener becomes useEffect. Vue data()
// fields → useState. mapGetters (isLoggedIn/authUser/authReady) → store hooks.
export default function AuthPanel() {
  const { t } = useTranslation();
  const authUser = useAppStore((s) => s.authUser);
  const authReady = useAppStore((s) => s.authReady);
  const authToken = useAppStore((s) => s.authToken);
  const login = useAppStore((s) => s.login);
  const register = useAppStore((s) => s.register);
  const logout = useAppStore((s) => s.logout);
  const updateDisplayName = useAppStore((s) => s.updateDisplayName);

  const isLoggedIn = Boolean(authToken && authUser);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [error, setError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileOk, setProfileOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);

  // Vue watch showProfileModal → reset profile fields. Mirror via effect.
  useEffect(() => {
    if (showProfileModal) {
      setProfileDisplayName(authUser?.displayName || '');
      setProfileError('');
      setProfileOk(false);
    }
  }, [showProfileModal, authUser]);

  // Vue mounted: window 'open-auth' listener. Mirror via effect.
  useEffect(() => {
    const onOpenAuth = () => setShowAuthModal(true);
    window.addEventListener('open-auth', onOpenAuth);
    return () => window.removeEventListener('open-auth', onOpenAuth);
  }, []);

  const openAuth = (m: 'login' | 'register') => {
    setMode(m);
    setError('');
    setPassword('');
    setShowAuthModal(true);
  };

  const submitAuth = async () => {
    setBusy(true);
    setError('');
    try {
      if (mode === 'login') {
        await login(username.trim(), password);
      } else {
        await register({
          username: username.trim(),
          password,
          displayName: displayName.trim() || undefined,
        });
      }
      setShowAuthModal(false);
      setPassword('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const saveProfile = async () => {
    setBusy(true);
    setProfileError('');
    setProfileOk(false);
    try {
      await updateDisplayName(profileDisplayName.trim());
      setProfileOk(true);
    } catch (e) {
      setProfileError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  // Modals use createPortal to document.body, so they render regardless of
  // which early-return branch is active. In Vue the single <template> kept the
  // modals reachable from every v-if state; React's early returns isolate each
  // branch, so we extract the portals into variables referenced by every
  // return. (This was the login/register button "no reaction" bug: the auth
  // modal portal lived only inside the isLoggedIn branch.)
  const authModal = showAuthModal && createPortal(
    <div className="modal fade show d-block" style={{ background: 'rgba(0,0,0,0.65)', zIndex: 1050 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content text-dark text-left">
          <div className="modal-header">
            <h5 className="modal-title">
              {mode === 'login' ? t('ui.auth.login') : t('ui.auth.register')}
            </h5>
            <button type="button" className="close" aria-label={t('ui.close') as string} onClick={() => setShowAuthModal(false)}>
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <div className="form-group">
              <label>{t('ui.auth.username')}</label>
              <input className="form-control" value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="form-group">
              <label>{t('ui.auth.password')}</label>
              <input
                className="form-control"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {mode === 'register' && (
              <div className="form-group">
                <label>{t('ui.auth.display_name')}</label>
                <input
                  className="form-control"
                  value={displayName}
                  placeholder={t('ui.auth.display_name_hint') as string}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="modal-footer">
            <button
              type="button"
              className="btn btn-link"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? t('ui.auth.switch_to_register') : t('ui.auth.switch_to_login')}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={submitAuth}>
              {mode === 'login' ? t('ui.auth.login') : t('ui.auth.register')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );

  const profileModal = showProfileModal && createPortal(
    <div className="modal fade show d-block" style={{ background: 'rgba(0,0,0,0.65)', zIndex: 1050 }}>
      <div className="modal-dialog modal-dialog-centered">
        <div className="modal-content text-dark text-left">
          <div className="modal-header">
            <h5 className="modal-title">{t('ui.auth.profile')}</h5>
            <button type="button" className="close" aria-label={t('ui.close') as string} onClick={() => setShowProfileModal(false)}>
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body">
            {profileError && <div className="alert alert-danger py-2">{profileError}</div>}
            {profileOk && <div className="alert alert-success py-2">{t('ui.auth.saved')}</div>}
            <p className="mb-2">
              <strong>{t('ui.auth.username')}:</strong>
              {authUser?.username}
            </p>
            <div className="form-group mb-0">
              <label>{t('ui.auth.display_name')}</label>
              <input className="form-control" value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} />
            </div>
          </div>
          <div className="modal-footer">
            <button type="button" className="btn btn-secondary" onClick={() => setShowProfileModal(false)}>
              {t('ui.close')}
            </button>
            <button type="button" className="btn btn-primary" disabled={busy} onClick={saveProfile}>
              {t('ui.confirm')}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );

  if (!authReady) {
    return (
      <div className="auth-panel text-right">
        <small className="text-muted">...</small>
        {authModal}
        {profileModal}
      </div>
    );
  }

  if (isLoggedIn && authUser) {
    return (
      <div className="auth-panel text-right">
        <div className="d-flex flex-column align-items-end">
          <span className="small">
            {authUser.displayName}
            <span className="badge badge-success">{t('ui.auth.logged_in')}</span>
          </span>
          <div className="btn-group btn-group-sm mt-1">
            <button type="button" className="btn btn-outline-light btn-sm" onClick={() => setShowProfileModal(true)}>
              {t('ui.auth.profile')}
            </button>
            <button type="button" className="btn btn-outline-light btn-sm" onClick={logout}>
              {t('ui.auth.logout')}
            </button>
          </div>
        </div>
        {authModal}
        {profileModal}
      </div>
    );
  }

  return (
    <div className="auth-panel text-right">
      <span className="badge badge-secondary mr-1">{t('ui.auth.guest')}</span>
      <button type="button" className="btn btn-sm btn-light" onClick={() => openAuth('login')}>
        {t('ui.auth.login')}
      </button>
      <button type="button" className="btn btn-sm btn-outline-light ml-1" onClick={() => openAuth('register')}>
        {t('ui.auth.register')}
      </button>
      {authModal}
      {profileModal}
    </div>
  );
}
