import { useTranslation } from 'react-i18next';

export default function LoadingSpinner() {
  const { t } = useTranslation();
  return (
    <button type="button" className="btn btn-dark btn-lg text-light" disabled>
      <span className="spinner-border mr-2" role="status" aria-hidden="true" />
      <span className="align-top">{t('ui.loading')}</span>
    </button>
  );
}
