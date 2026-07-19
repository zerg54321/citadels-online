<template>
<div
  class="modal fade"
  id="aboutModal"
  tabindex="-1"
  aria-labelledby="exampleModalLabel"
  aria-hidden="true"
>
  <div class="modal-dialog">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="exampleModalLabel">{{ $t('ui.about.title') }}</h5>
        <button type="button" class="close" data-dismiss="modal" :aria-label="$t('ui.close')">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body">
        <p v-html="$t('ui.about.text')"></p>
        <h6>{{ $t('ui.about.picture_credits') }}</h6>
        <ul>
          <li
            v-for="line, i in credits"
            :key="i"
          >
            <a :href="line[1]" target="_blank">{{ $t(`districts.${line[0]}.name`) }}</a>
            {{ $t('ui.about.by') }}
            <a v-if="line[3]" :href="line[3]" target="_blank">{{ line[2] }}</a>
            <span v-else>{{ line[2] }}</span>
          </li>
        </ul>
      </div>
    </div>
  </div>
</div>
<div class="d-flex flex-column h-100">
<header>
  <div class="container-fluid">
    <div class="d-flex flex-wrap align-items-center justify-content-end">
      <div class="flex-grow-1 text-center pb-1">
        <h1><a href="/" class="text-reset">{{ $t('ui.title') }}</a></h1>
        <h6 :class="{ 'header-subtitle--hidden': inGame }">{{ $t('ui.subtitle2') }}</h6>
      </div>
      <div class="text-right header-actions">
        <AuthPanel class="mb-1" />
        <div class="mb-1 header-extra" :class="{ 'header-extra--hidden': inGame }">
          <router-link class="text-reset text-decoration-none mr-2" :to="{ name: 'stats' }">
            {{ $t('ui.stats.title') }}
          </router-link>
          <a
            class="text-reset text-decoration-none"
            href="#"
            data-toggle="modal"
            data-target="#aboutModal"
          >{{ $t('ui.about.title') }}</a>
        </div>
        <LocaleSelector class="opacity-4" />
      </div>
    </div>
  </div>
</header>
<div class="body flex-fill" :class="{ 'body--game': inGame }">
  <router-view></router-view>
</div>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import LocaleSelector from './components/LocaleSelector.vue';
import AuthPanel from './components/AuthPanel.vue';
import credits from './data/credits.json';
import { store } from './store';

export default defineComponent({
  name: 'App',
  components: {
    LocaleSelector,
    AuthPanel,
  },
  computed: {
    credits() {
      return credits;
    },
    inGame() {
      return this.$route.name === 'room';
    },
  },
  created() {
    store.dispatch('initAuth');
  },
});
</script>

<style lang="scss" scoped>
header {
  background: linear-gradient(180deg, rgba(13,11,8,0.97) 0%, rgba(26,20,16,0.95) 100%);
  color: var(--parchment);
  margin: 0;
  padding: 0.6em 0;
  border-bottom: 1px solid rgba(212, 175, 55, 0.35);
  box-shadow: 0 2px 18px rgba(0,0,0,0.55);
  transition: padding 0.25s ease;

  h1, h2, h6 {
    padding: 0;
    margin: 0;
    font-family: var(--font-display);
    letter-spacing: 0.08em;
  }

  h1 a, h2 a {
    color: var(--gold);
    text-decoration: none;
    text-shadow: 0 1px 6px rgba(212,175,55,0.25);
  }

  h6 {
    color: var(--text-muted);
    font-size: 0.8rem;
    transition: all 0.25s ease;
  }

  .header-subtitle--hidden {
    max-height: 0;
    opacity: 0;
    margin-bottom: 0;
    overflow: hidden;
  }

  .header-extra {
    transition: all 0.25s ease;
  }

  .header-extra--hidden {
    max-height: 0;
    opacity: 0;
    margin-bottom: 0;
    overflow: hidden;
    display: none;
  }
}

.body {
  background: var(--bg-void);
  min-height: 0;
}

.body--game {
  background: #1a1410;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

:deep(.auth-panel) {
  .badge-success {
    background: rgba(212, 175, 55, 0.2);
    color: var(--gold-bright);
    border: 1px solid rgba(212, 175, 55, 0.4);
  }
  .btn-outline-light {
    color: var(--gold);
    border-color: rgba(212, 175, 55, 0.55);
  }
  .btn-outline-light:hover {
    background: rgba(212, 175, 55, 0.08);
    color: var(--gold-bright);
  }
  .btn-outline-secondary {
    color: var(--text-muted);
    border-color: rgba(184, 168, 136, 0.4);
  }
  .btn-outline-secondary:hover {
    color: var(--parchment);
    border-color: var(--parchment);
    background: rgba(232, 220, 192, 0.06);
  }
}
</style>
