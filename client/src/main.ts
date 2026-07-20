import { createApp } from 'vue';
import twemoji from 'twemoji';
import router from './router';
import { store } from './store';
import App from './App.vue';
import i18n from './i18n';

import 'bootstrap';
import './scss/main.scss';

const app = createApp(App);

app.directive('focus', {
  mounted(el) {
    el.focus();
  },
});

app.directive('tooltip', {
  mounted(el, binding) {
    el.setAttribute('title', binding.value ?? '');
  },
  updated(el, binding) {
    el.setAttribute('title', binding.value ?? '');
  },
  unmounted(el) {
    el.removeAttribute('title');
  },
});

app.component('emoji', {
  data() {
    return {
      html: '',
    };
  },
  props: {
    emoji: {
      type: String,
      required: true,
    },
  },
  methods: {
    updateEmoji() {
      this.html = twemoji.parse(this.emoji, {
        base: '/',
        folder: 'svg',
        ext: '.svg',
      });
    },
  },
  mounted() {
    this.updateEmoji();
  },
  watch: {
    emoji() {
      this.updateEmoji();
    },
  },
  template: '<span v-html="html"></span>',
});

app.use(store);
app.use(router);
app.use(i18n);
app.mount('#app');
