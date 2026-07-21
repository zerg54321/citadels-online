import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import zh from './locale.zh.json';
import en from './locale.en.json';

i18n.use(initReactI18next).init({
  resources: {
    zh: { translation: zh },
    en: { translation: en },
  },
  lng: 'zh',
  fallbackLng: 'en',
  interpolation: { escapeValue: false, prefix: '{', suffix: '}' },
});

export default i18n;

export function updateTitle() {
  document.title = i18n.t('ui.title') as string;
}
