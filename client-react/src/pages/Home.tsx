import { useTranslation } from 'react-i18next';
import { useAppStore } from '../store';

// Placeholder home page — will be replaced when HomeScreen is migrated.
// Exists to verify the scaffold (React + Vite + i18n + store + SCSS) boots.
export default function Home() {
  const { t } = useTranslation();
  const authReady = useAppStore((s) => s.authReady);
  const authToken = useAppStore((s) => s.authToken);

  return (
    <div className="container py-4">
      <h1 className="gold-text">{t('ui.title')}</h1>
      <p className="lead">{t('ui.subtitle1')}</p>
      <hr />
      <p>
        React client — 阶段四迁移中
        <br />
        authReady: {String(authReady)} | token: {authToken ? '✓' : '✗'}
      </p>
    </div>
  );
}
