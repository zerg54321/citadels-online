import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { useAppStore } from '@/store';
import authApi from '@/api/auth';
import { userAvatarUrl } from '@/utils/avatarUrl';

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
  const changePassword = useAppStore((s) => s.changePassword);
  const setAvatar = useAppStore((s) => s.setAvatar);

  const isLoggedIn = Boolean(authToken && authUser);

  const [mode, setMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [profileDisplayName, setProfileDisplayName] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordOk, setPasswordOk] = useState(false);
  const [error, setError] = useState('');
  const [profileError, setProfileError] = useState('');
  const [profileOk, setProfileOk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showProfileModal, setShowProfileModal] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [avatarPresets, setAvatarPresets] = useState<string[]>([]);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [avatarError, setAvatarError] = useState('');
  const avatarFileRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Account dropdown (logged-in state): close on outside click / Escape —
  // same pattern as LocaleSelector.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  // Vue watch showProfileModal → reset profile fields. Mirror via effect.
  useEffect(() => {
    if (showProfileModal) {
      setProfileDisplayName(authUser?.displayName || '');
      setProfileError('');
      setProfileOk(false);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordOk(false);
      setAvatarError('');
    }
  }, [showProfileModal, authUser]);

  // Fetch the preset avatar id list once when the profile modal first opens.
  // The list is static (matches client-react/public/avatars/*.png), but we
  // ask the server so the picker stays in sync if presets are added later.
  useEffect(() => {
    if (!showProfileModal || avatarPresets.length) return;
    authApi.getAvatarPresets().then((res) => {
      if (res.status === 'ok' && res.presets) setAvatarPresets(res.presets);
    }).catch(() => { /* non-fatal: preset grid just stays empty */ });
  }, [showProfileModal, avatarPresets.length]);

  const pickPreset = async (ref: string) => {
    setAvatarBusy(true);
    setAvatarError('');
    try {
      await setAvatar('preset', ref);
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : String(e));
    } finally {
      setAvatarBusy(false);
    }
  };

  const onUploadFile = async () => {
    const file = avatarFileRef.current?.files?.[0];
    if (!file) return;
    setAvatarBusy(true);
    setAvatarError('');
    try {
      await setAvatar('upload', '', file);
    } catch (e) {
      setAvatarError(e instanceof Error ? e.message : String(e));
    } finally {
      setAvatarBusy(false);
      if (avatarFileRef.current) avatarFileRef.current.value = '';
    }
  };

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

  const savePassword = async () => {
    if (!newPassword || newPassword !== confirmPassword) {
      setProfileError(t('ui.auth.password_mismatch') as string);
      return;
    }
    setBusy(true);
    setProfileError('');
    setPasswordOk(false);
    try {
      await changePassword(currentPassword, newPassword);
      setPasswordOk(true);
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
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
        <div className="modal-content app-modal">
          <div className="modal-header border-0 pb-2">
            <h5 className="modal-title app-modal__title">
              {mode === 'login' ? t('ui.auth.login') : t('ui.auth.register')}
            </h5>
            <button type="button" className="close app-modal__close" aria-label={t('ui.close') as string} onClick={() => setShowAuthModal(false)}>
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body">
            {error && <div className="alert alert-danger py-2">{error}</div>}
            <div className="form-group">
              <label className="app-modal__label">{t('ui.auth.username')}</label>
              <input className="form-control app-modal__input" value={username} autoComplete="username" onChange={(e) => setUsername(e.target.value)} />
            </div>
            <div className="form-group">
              <label className="app-modal__label">{t('ui.auth.password')}</label>
              <input
                className="form-control app-modal__input"
                type="password"
                value={password}
                autoComplete="current-password"
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            {mode === 'register' && (
              <div className="form-group">
                <label className="app-modal__label">{t('ui.auth.display_name')}</label>
                <input
                  className="form-control app-modal__input"
                  value={displayName}
                  placeholder={t('ui.auth.display_name_hint') as string}
                  onChange={(e) => setDisplayName(e.target.value)}
                />
              </div>
            )}
          </div>
          <div className="modal-footer border-0">
            <button
              type="button"
              className="btn btn-link app-modal__switch"
              onClick={() => setMode(mode === 'login' ? 'register' : 'login')}
            >
              {mode === 'login' ? t('ui.auth.switch_to_register') : t('ui.auth.switch_to_login')}
            </button>
            <button type="button" className="btn btn-gold" disabled={busy} onClick={submitAuth}>
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
        <div className="modal-content app-modal">
          <div className="modal-header border-0 pb-2">
            <h5 className="modal-title app-modal__title">{t('ui.auth.profile')}</h5>
            <button type="button" className="close app-modal__close" aria-label={t('ui.close') as string} onClick={() => setShowProfileModal(false)}>
              <span aria-hidden="true">&times;</span>
            </button>
          </div>
          <div className="modal-body">
            {profileError && <div className="alert alert-danger py-2">{profileError}</div>}
            {profileOk && <div className="alert app-modal__ok py-2">{t('ui.auth.saved')}</div>}
            <p className="mb-2 app-modal__line">
              <strong>{t('ui.auth.username')}:</strong>
              <span>{authUser?.username}</span>
            </p>

            <div className="form-group mb-0">
              <label className="app-modal__label">{t('ui.auth.avatar')}</label>
              {avatarError && <div className="alert alert-danger py-2">{avatarError}</div>}
              <div className="avatar-picker">
                <div className="avatar-picker__current">
                  <img src={userAvatarUrl(authUser)} alt="" className="avatar-picker__preview" />
                </div>
                <div className="avatar-picker__grid">
                  {avatarPresets.map((id) => (
                    <button
                      key={id}
                      type="button"
                      className={`avatar-picker__cell${authUser?.avatar?.type === 'preset' && authUser?.avatar?.ref === id ? ' is-selected' : ''}`}
                      disabled={avatarBusy}
                      onClick={() => pickPreset(id)}
                    >
                      <img src={`/avatars/${id}.png`} alt="" />
                    </button>
                  ))}
                </div>
              </div>
              <div className="avatar-picker__upload">
                <input
                  ref={avatarFileRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="avatar-picker__file"
                  onChange={onUploadFile}
                  disabled={avatarBusy}
                />
                <span className="avatar-picker__hint">{t('ui.auth.avatar_upload_hint') as string}</span>
              </div>
            </div>

            <div className="form-group mb-0">
              <label className="app-modal__label">{t('ui.auth.display_name')}</label>
              <input className="form-control app-modal__input" value={profileDisplayName} onChange={(e) => setProfileDisplayName(e.target.value)} />
            </div>

            <hr className="app-modal__divider" />
            <h6 className="app-modal__label">{t('ui.auth.change_password')}</h6>
            {passwordOk && <div className="alert app-modal__ok py-2">{t('ui.auth.password_changed')}</div>}
            <div className="form-group">
              <label className="app-modal__label">{t('ui.auth.current_password')}</label>
              <input
                className="form-control app-modal__input"
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                onChange={(e) => setCurrentPassword(e.target.value)}
              />
            </div>
            <div className="form-group">
              <label className="app-modal__label">{t('ui.auth.new_password')}</label>
              <input
                className="form-control app-modal__input"
                type="password"
                value={newPassword}
                autoComplete="new-password"
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </div>
            <div className="form-group mb-0">
              <label className="app-modal__label">{t('ui.auth.confirm_new_password')}</label>
              <input
                className="form-control app-modal__input"
                type="password"
                value={confirmPassword}
                autoComplete="new-password"
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </div>
          </div>
          <div className="modal-footer border-0">
            <button type="button" className="btn btn-outline-gold" onClick={() => setShowProfileModal(false)}>
              {t('ui.close')}
            </button>
            <button
              type="button"
              className="btn btn-outline-gold"
              disabled={busy || !currentPassword || !newPassword}
              onClick={savePassword}
            >
              {t('ui.auth.change_password')}
            </button>
            <button type="button" className="btn btn-gold" disabled={busy} onClick={saveProfile}>
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
      <div className="auth-panel">
        <span className="auth-panel__status auth-panel__status--muted">…</span>
        {authModal}
        {profileModal}
      </div>
    );
  }

  if (isLoggedIn && authUser) {
    return (
      <div className="auth-panel auth-panel--in" ref={menuRef}>
        <div className="auth-menu">
          <button
            type="button"
            className="auth-menu__btn"
            onClick={() => setMenuOpen((v) => !v)}
            aria-haspopup="menu"
            aria-expanded={menuOpen}
            title={t('ui.auth.logged_in') as string}
          >
            <img src={userAvatarUrl(authUser)} alt="" className="auth-panel__avatar" />
            <span className="auth-menu__name text-truncate">{authUser.displayName}</span>
            <span className={`locale-select__caret${menuOpen ? ' locale-select__caret--open' : ''}`}>▾</span>
          </button>
          {menuOpen && (
            <div className="auth-menu__menu" role="menu">
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); setShowProfileModal(true); }}
              >
                {t('ui.auth.profile')}
              </button>
              <button
                type="button"
                role="menuitem"
                onClick={() => { setMenuOpen(false); logout(); }}
              >
                {t('ui.auth.logout')}
              </button>
            </div>
          )}
        </div>
        {authModal}
        {profileModal}
      </div>
    );
  }

  return (
    <div className="auth-panel auth-panel--guest">
      {/* 注册入口收进认证弹窗内的切换链接（switch_to_register），头部只保留登录 */}
      <button type="button" className="hdr-btn hdr-btn--gold" onClick={() => openAuth('login')}>
        {t('ui.auth.login')}
      </button>
      {authModal}
      {profileModal}
    </div>
  );
}
