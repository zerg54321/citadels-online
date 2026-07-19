<template>
  <div class="lobby-chat">
    <div class="lobby-chat__title">{{ $t('ui.lobby.chat_title') }}</div>
    <div class="lobby-chat__messages" ref="messageList">
      <div v-if="!messages.length" class="lobby-chat__empty">
        {{ $t('ui.lobby.chat_placeholder') }}
      </div>
      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="lobby-chat__msg"
        :class="{ 'lobby-chat__msg--self': msg.playerId === selfId }"
      >
        <span class="lobby-chat__name">{{ msg.username }}</span>
        <span class="lobby-chat__text">{{ msg.text }}</span>
      </div>
    </div>
    <form class="lobby-chat__form" @submit.prevent="send">
      <input
        v-model="input"
        class="lobby-chat__input"
        :placeholder="$t('ui.lobby.chat_placeholder')"
        maxlength="200"
      />
      <button type="submit" class="btn btn-gold btn-sm" :disabled="!input.trim()">
        {{ $t('ui.confirm') }}
      </button>
    </form>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters } from 'vuex';
import { store } from '../../store';

export default defineComponent({
  name: 'LobbyChat',
  data() {
    return {
      input: '',
    };
  },
  computed: {
    ...mapGetters(['gameState']),
    messages() {
      return store.state.chatMessages || [];
    },
    selfId() {
      return this.gameState?.self;
    },
  },
  methods: {
    async send() {
      const text = this.input.trim();
      if (!text) return;
      try {
        await store.dispatch('sendChat', text);
        this.input = '';
      } catch (e) {
        // eslint-disable-next-line no-alert
        window.alert(e instanceof Error ? e.message : String(e));
      }
    },
  },
  mounted() {
    this.$nextTick(() => {
      const el = this.$refs.messageList as HTMLElement | undefined;
      if (el) el.scrollTop = el.scrollHeight;
    });
  },
  watch: {
    messages() {
      this.$nextTick(() => {
        const el = this.$refs.messageList as HTMLElement | undefined;
        if (el) el.scrollTop = el.scrollHeight;
      });
    },
  },
});
</script>

<style scoped>
.lobby-chat {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(212, 175, 55, 0.35);
  border-radius: 0.5rem;
  background: rgba(13, 11, 8, 0.35);
  overflow: hidden;
}
.lobby-chat__title {
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold);
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid rgba(212, 175, 55, 0.25);
}
.lobby-chat__messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.lobby-chat__empty {
  color: var(--text-muted);
  font-size: 0.8rem;
  text-align: center;
  padding: 1rem 0;
}
.lobby-chat__msg {
  font-size: 0.82rem;
  line-height: 1.35;
  color: var(--parchment);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
  border-left: 2px solid rgba(212, 175, 55, 0.35);
}
.lobby-chat__msg--self {
  border-left-color: var(--gold);
  background: rgba(212, 175, 55, 0.06);
}
.lobby-chat__name {
  font-weight: 700;
  color: var(--gold-bright);
  margin-right: 0.35rem;
}
.lobby-chat__text {
  word-break: break-word;
}
.lobby-chat__form {
  display: flex;
  gap: 0.4rem;
  padding: 0.4rem;
  border-top: 1px solid rgba(212, 175, 55, 0.25);
}
.lobby-chat__input {
  flex: 1 1 auto;
  background: rgba(13, 11, 8, 0.5);
  border: 1px solid rgba(212, 175, 55, 0.35);
  color: var(--parchment);
  border-radius: 0.35rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  outline: none;
}
.lobby-chat__input:focus {
  border-color: var(--gold);
  box-shadow: 0 0 0 0.15rem rgba(212, 175, 55, 0.15);
}
</style>
