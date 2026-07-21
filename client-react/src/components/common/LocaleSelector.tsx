import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Emoji from '@/components/common/Emoji';
import { updateTitle } from '@/i18n';

// Mirrors Vue LocaleSelector.vue, but replaces the native <select>
// (input-group + custom-select) with a custom-styled dropdown so the popup
// matches the dark/gold theme instead of the browser-default white. Vue
// `$i18n.locale` v-model + watch → react-i18next changeLanguage + useEffect.
export default function LocaleSelector() {
  const { t, i18n } = useTranslation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Vue watch '$i18n.locale' → updateTitle(). Mirror here on language change.
  useEffect(() => {
    updateTitle();
  }, [i18n.language]);

  // Close on outside click / Escape.
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const locales = i18n.options.resources ? Object.keys(i18n.options.resources) : [];
  const currentName = t('name', { lng: i18n.language }) as string;

  return (
    <div className="locale-select" ref={ref}>
      <button
        type="button"
        className="locale-select__btn"
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <span className="locale-select__flag">
          <Emoji emoji={t('flag') as string} />
        </span>
        <span className="locale-select__name">{currentName}</span>
        <span className={`locale-select__caret${open ? ' locale-select__caret--open' : ''}`}>▾</span>
      </button>
      {open && (
        <ul className="locale-select__menu" role="listbox">
          {locales.map((locale) => (
            <li
              key={`locale-${locale}`}
              className={`locale-select__item${locale === i18n.language ? ' locale-select__item--active' : ''}`}
              role="option"
              aria-selected={locale === i18n.language}
              onClick={() => {
                i18n.changeLanguage(locale);
                setOpen(false);
              }}
            >
              <span className="locale-select__flag">
                <Emoji emoji={t('flag', { lng: locale }) as string} />
              </span>
              <span>{t('name', { lng: locale }) as string}</span>
              {locale === i18n.language && <span className="locale-select__check">✓</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
