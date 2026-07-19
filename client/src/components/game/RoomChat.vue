<template>
  <div class="room-chat">
    <div class="room-chat__title">{{ $t('ui.lobby.chat_title') }}</div>
    <div class="room-chat__messages" ref="messageList">
      <div v-if="!messages.length" class="room-chat__empty">
        {{ $t('ui.lobby.chat_placeholder') }}
      </div>
      <div
        v-for="(msg, i) in messages"
        :key="i"
        class="room-chat__msg"
        :class="{ 'room-chat__msg--self': msg.playerId === selfId }"
      >
        <span class="room-chat__name">{{ msg.username }}</span>
        <span class="room-chat__text">{{ msg.text }}</span>
      </div>
    </div>
    <form class="room-chat__form" @submit.prevent="send">
      <input
        v-model="input"
        class="room-chat__input"
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
  name: 'RoomChat',
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
.room-chat {
  display: flex;
  flex-direction: column;
  border: 1px solid rgba(212, 175, 55, 0.35);
  border-radius: 0.5rem;
  background: rgba(13, 11, 8, 0.35);
  overflow: hidden;
  height: 100%;
  min-height: 0;
}
.room-chat__title {
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--gold);
  padding: 0.45rem 0.6rem;
  border-bottom: 1px solid rgba(212, 175, 55, 0.25);
  flex-shrink: 0;
}
.room-chat__messages {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
  padding: 0.4rem;
  display: flex;
  flex-direction: column;
  gap: 0.3rem;
}
.room-chat__empty {
  color: var(--text-muted);
  font-size: 0.8rem;
  text-align: center;
  padding: 1rem 0;
}
.room-chat__msg {
  font-size: 0.82rem;
  line-height: 1.35;
  color: var(--parchment);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 6px;
  padding: 0.3rem 0.45rem;
  border-left: 2px solid rgba(212, 175, 55, 0.35);
}
.room-chat__msg--self {
  border-left-color: var(--gold);
  background: rgba(212, 175, 55, 0.06);
}
.room-chat__name {
  font-weight: 700;
  color: var(--gold-bright);
  margin-right: 0.35rem;
}
.room-chat__text {
  word-break: break-word;
}
.room-chat__form {
  display: flex;
  gap: 0.4rem;
  padding: 0.4rem;
  border-top: 1px solid rgba(212, 175, 55, 0.25);
  flex-shrink: 0;
}
.room-chat__input {
  flex: 1 1 auto;
  background: rgba(13, 11, 8, 0.5);
  border: 1px solid rgba(212, 175, 55, 0.35);
  color: var(--parchment);
  border-radius: 0.35rem;
  padding: 0.35rem 0.5rem;
  font-size: 0.85rem;
  outline: none;
}
.room-chat__input:focus {
  border-color: var(--gold);
  box-shadow: 0 0 0 0.15rem rgba(212, 175, 55, 0.15);
}
</style>
