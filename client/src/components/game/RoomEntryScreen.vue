<template>
<div class="container-fluid d-flex justify-content-center align-items-center">
  <transition name="fade" mode="out-in">
    <div v-if="loading" class="text-center">
      <LoadingSpinner />
    </div>
    <div v-else-if="error" class="text-center text-gold">
      {{ $t(errorMessage, { msg: errorReason }) }}
    </div>
    <div
      v-else-if="needLogin"
      class="card p-4 text-center room-entry-card"
      style="min-width: 20rem;"
    >
      <p class="mb-3 text-gold">{{ $t('ui.room.login_required') }}</p>
      <p class="text-muted-gold small mb-3">{{ $t('ui.room.login_required_hint') }}</p>
      <button type="button" class="btn btn-gold mb-2" @click="openLogin">
        {{ $t('ui.auth.login') }}
      </button>
      <button type="button" class="btn btn-outline-gold" @click="joinAsSpectator">
        {{ $t('ui.room.spectate') }}
      </button>
    </div>
    <div v-else class="text-muted-gold small text-center">
      {{ $t('ui.room.connecting') }}
    </div>
  </transition>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters } from 'vuex';
import { RoomId } from 'citadels-common';
import { store } from '../../store';
import LoadingSpinner from './elements/LoadingSpinner.vue';

/**
 * Auto-enter room: logged-in users join as player (or spectator if full / mid-game).
 * Role can be switched inside the lobby — no intermediate choose screen.
 */
export default defineComponent({
  components: { LoadingSpinner },
  name: 'RoomEntryScreen',
  emits: ['open-auth'],
  data() {
    return {
      loading: true,
      open: false,
      error: false,
      errorMessage: undefined as string | undefined,
      errorReason: undefined as string | undefined,
      needLogin: false,
    };
  },
  computed: {
    ...mapGetters([
      'isConnected',
      'isLoggedIn',
      'authUser',
      'authReady',
    ]),
    roomId() {
      return this.$route.params.roomId as string;
    },
    wantSpectate() {
      const q = this.$route.query.spectate;
      return q === '1' || q === 'true';
    },
  },
  watch: {
    authReady(val) {
      if (val) this.getRoomInfo(this.roomId);
    },
    isLoggedIn(val) {
      if (val && this.needLogin) {
        this.getRoomInfo(this.roomId);
      }
    },
  },
  methods: {
    openLogin() {
      window.dispatchEvent(new CustomEvent('open-auth'));
    },
    async getRoomInfo(roomId: RoomId) {
      if (!this.authReady) return;
      try {
        this.loading = true;
        this.open = false;
        this.error = false;
        this.needLogin = false;
        const roomInfo = await store.dispatch('getRoomInfo', roomId);
        switch (roomInfo.status) {
          case 'open':
            this.open = true;
            break;
          case 'closed':
            this.open = false;
            break;
          case 'not found':
            this.errorMessage = 'ui.room.error_does_not_exist';
            this.error = true;
            break;
          default:
            this.errorMessage = 'ui.unknown_error';
            this.error = true;
        }
        if (this.error) {
          this.loading = false;
          return;
        }

        // Deep link spectate
        if (this.wantSpectate) {
          await this.doJoin('', true);
          return;
        }

        // reconnect saved seat
        const savedPlayerId = localStorage.getItem(this.roomId);
        if (savedPlayerId && this.isLoggedIn) {
          await this.doJoin(savedPlayerId, false);
          return;
        }

        // not logged in: can only spectate, or login first
        if (!this.isLoggedIn) {
          if (!this.open) {
            // mid-game: allow anonymous spectate
            await this.doJoin('', true);
            return;
          }
          this.needLogin = true;
          this.loading = false;
          return;
        }

        // logged in: auto join as player if open, else spectator
        if (this.open) {
          await this.doJoin(localStorage.getItem(this.roomId), false);
        } else {
          await this.doJoin('', true);
        }
      } catch (error) {
        console.log(error);
        this.loading = false;
        this.error = true;
        this.errorMessage = 'ui.unknown_error';
      }
    },
    async doJoin(playerId: string | null, asSpectator: boolean) {
      this.loading = true;
      this.error = false;
      try {
        await store.dispatch('joinRoom', {
          roomId: this.roomId,
          playerId: playerId || '',
          username: this.authUser?.displayName || 'Spectator',
          asSpectator,
        });
      } catch (reason: any) {
        this.loading = false;
        const msg = reason?.message || String(reason);
        // room full as player → fall back to spectator
        if (!asSpectator && (msg.includes('full') || msg.includes('cannot'))) {
          try {
            await store.dispatch('joinRoom', {
              roomId: this.roomId,
              playerId: '',
              username: this.authUser?.displayName || 'Spectator',
              asSpectator: true,
            });
            return;
          } catch (e2) {
            /* fall through */
          }
        }
        if (msg.includes('login required')) {
          this.needLogin = true;
          return;
        }
        this.error = true;
        this.errorMessage = 'ui.room.error_join';
        this.errorReason = msg;
      }
    },
    joinAsSpectator() {
      this.doJoin('', true);
    },
  },
  mounted() {
    if (this.authReady) {
      this.getRoomInfo(this.roomId);
    }
  },
});
</script>

<style scoped>
.room-entry-card {
  background: var(--bg-panel);
  border: 1px solid rgba(212, 175, 55, 0.45);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.55), 0 0 0 1px rgba(212, 175, 55, 0.12);
}
</style>
