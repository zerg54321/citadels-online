import { createI18n } from 'vue-i18n';

import zh from './locale.zh.json';
import en from './locale.en.json';

export const messages = { zh, en };

const i18n = createI18n({
  locale: 'zh',
  fallbackLocale: 'en',
  messages,
  warnHtmlInMessage: 'off',
});

export function updateTitle() {
  document.title = i18n.global.t('ui.title');
}

export default i18n;
