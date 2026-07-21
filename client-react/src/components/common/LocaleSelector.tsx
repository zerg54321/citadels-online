import { useTranslation } from 'react-i18next';
import Emoji from '@/components/common/Emoji';
import { updateTitle } from '@/i18n';
import { useEffect } from 'react';

// Mirrors Vue LocaleSelector.vue. The Vue `$i18n.locale` v-model + watch
// becomes react-i18next's i18n.changeLanguage + useEffect on i18n.language.
export default function LocaleSelector() {
  const { t, i18n } = useTranslation();

  // Vue watch '$i18n.locale' → updateTitle(). Mirror here on language change.
  useEffect(() => {
    updateTitle();
  }, [i18n.language]);

  return (
    <div className="input-group">
      <div className="input-group-prepend">
        <label className="input-group-text px-2" htmlFor="inputGroupLocale">
          <Emoji emoji={t('flag') as string} />
        </label>
      </div>
      <select
        className="custom-select"
        id="inputGroupLocale"
        value={i18n.language}
        onChange={(e) => i18n.changeLanguage(e.target.value)}
      >
        {i18n.options.resources
          ? Object.keys(i18n.options.resources).map((locale) => (
            <option key={`locale-${locale}`} value={locale}>
              {t('name', { lng: locale }) as string}
            </option>
          ))
          : null}
      </select>
    </div>
  );
}
