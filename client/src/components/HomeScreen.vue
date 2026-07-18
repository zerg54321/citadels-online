<template>
<div class="home">
  <section class="home-hero">
    <div class="home-hero__glow" />
    <div class="container py-5">
      <div class="row align-items-center">
        <div class="col-lg-7 mb-4 mb-lg-0">
          <p class="home-hero__eyebrow">{{ $t('ui.subtitle1') }} · {{ $t('ui.subtitle2') }}</p>
          <h1 class="home-hero__title">{{ $t('ui.title') }}</h1>
          <p class="home-hero__lead">{{ $t('ui.homepage.hero_lead') }}</p>
          <ul class="home-hero__bullets">
            <li>{{ $t('ui.homepage.bullet_3v3') }}</li>
            <li>{{ $t('ui.homepage.bullet_ai') }}</li>
            <li>{{ $t('ui.homepage.bullet_rank') }}</li>
          </ul>
          <div class="d-flex flex-wrap align-items-center gap-2 mt-3">
            <button
              type="button"
              class="btn btn-lg btn-warning home-hero__cta"
              :disabled="creatingRoom || !isLoggedIn"
              @click="createRoom"
            >
              {{ creatingRoom ? $t('ui.loading') : $t('ui.homepage.create_room') }}
            </button>
            <router-link class="btn btn-lg btn-outline-light" :to="{ name: 'stats' }">
              {{ $t('ui.stats.title') }}
            </router-link>
          </div>
          <p v-if="!isLoggedIn" class="text-warning small mt-2 mb-0">
            {{ $t('ui.homepage.login_to_play') }}
          </p>
          <p v-if="createError" class="text-danger small mt-2 mb-0">{{ createError }}</p>
        </div>
        <div class="col-lg-5">
          <div class="home-hero__card">
            <div class="home-hero__card-title">{{ $t('ui.homepage.how_title') }}</div>
            <ol class="home-hero__steps mb-0">
              <li>{{ $t('ui.homepage.how_1') }}</li>
              <li>{{ $t('ui.homepage.how_2') }}</li>
              <li>{{ $t('ui.homepage.how_3') }}</li>
              <li>{{ $t('ui.homepage.how_4') }}</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  </section>

  <section class="container py-4 home-main">
    <div class="row">
      <div class="col-lg-8 mb-4">
        <div class="card home-rooms shadow-sm">
          <div class="card-header d-flex justify-content-between align-items-center bg-white">
            <div>
              <strong>{{ $t('ui.rooms.title') }}</strong>
              <span class="badge badge-secondary ml-2">{{ rooms.length }}</span>
            </div>
            <button
              type="button"
              class="btn btn-sm btn-outline-secondary"
              :disabled="roomsLoading"
              @click="loadRooms"
            >
              {{ $t('ui.rooms.refresh') }}
            </button>
          </div>
          <div class="card-body">
            <p class="small text-muted mb-3">{{ $t('ui.rooms.hint') }}</p>
            <div v-if="roomsError" class="alert alert-danger py-2">{{ roomsError }}</div>
            <div v-if="roomsLoading && rooms.length === 0" class="text-muted py-4 text-center">
              {{ $t('ui.loading') }}
            </div>
            <div v-else-if="rooms.length === 0" class="home-rooms__empty text-center py-4">
              <div class="display-4 mb-2 opacity-50">🏛</div>
              <p class="text-muted mb-3">{{ $t('ui.rooms.empty') }}</p>
              <button
                type="button"
                class="btn btn-primary"
                :disabled="creatingRoom || !isLoggedIn"
                @click="createRoom"
              >
                {{ $t('ui.homepage.create_room') }}
              </button>
            </div>
            <div v-else class="table-responsive">
              <table class="table table-hover mb-0 align-middle">
                <thead class="thead-light">
                  <tr>
                    <th>{{ $t('ui.rooms.room_id') }}</th>
                    <th>{{ $t('ui.rooms.phase') }}</th>
                    <th>{{ $t('ui.rooms.mode') }}</th>
                    <th>{{ $t('ui.rooms.players') }}</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  <tr v-for="room in rooms" :key="room.roomId">
                    <td>
                      <code class="home-rooms__id">{{ room.roomId }}</code>
                      <div class="small text-muted text-truncate" style="max-width: 14rem;">
                        {{ playerNames(room) }}
                      </div>
                    </td>
                    <td>
                      <span class="badge" :class="phaseBadge(room.phase)">
                        {{ phaseLabel(room.phase) }}
                      </span>
                      <span v-if="room.spectatorCount" class="badge badge-light ml-1">
                        {{ $t('ui.rooms.spectators', { n: room.spectatorCount }) }}
                      </span>
                    </td>
                    <td class="small">{{ modeLabel(room) }}</td>
                    <td>
                      <strong>{{ room.playerCount }}</strong>
                      <span class="text-muted">/{{ room.maxPlayers }}</span>
                    </td>
                    <td class="text-right text-nowrap">
                      <button
                        v-if="room.canJoinAsPlayer"
                        type="button"
                        class="btn btn-sm btn-primary mr-1"
                        :disabled="!isLoggedIn"
                        @click="goJoin(room.roomId)"
                      >
                        {{ $t('ui.rooms.join') }}
                      </button>
                      <button
                        v-if="room.canSpectate"
                        type="button"
                        class="btn btn-sm btn-outline-secondary"
                        @click="goSpectate(room.roomId)"
                      >
                        {{ $t('ui.rooms.spectate') }}
                      </button>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </div>

      <div class="col-lg-4">
        <div class="card mb-3 shadow-sm home-side">
          <div class="card-body">
             <h6 class="text-uppercase text-muted small mb-2">
               {{ $t('ui.homepage.features_title') }}
             </h6>
            <div class="home-feature" v-for="(f, i) in featureKeys" :key="i">
              <div class="home-feature__icon">{{ f.icon }}</div>
              <div>
                <div class="font-weight-bold">{{ $t(f.title) }}</div>
                <div class="small text-muted">{{ $t(f.desc) }}</div>
              </div>
            </div>
          </div>
        </div>
        <div class="card shadow-sm home-side">
          <div class="card-body small text-muted">
            <div class="font-weight-bold text-dark mb-1">{{ $t('ui.homepage.tip_title') }}</div>
            <p class="mb-0">{{ $t('ui.homepage.tip_body') }}</p>
          </div>
        </div>
      </div>
    </div>
  </section>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters } from 'vuex';
import { GameMode } from 'citadels-common';
import { store } from '../store';
import roomsApi, { RoomListItem } from '../api/rooms';

export default defineComponent({
  name: 'HomeScreen',
  data() {
    return {
      creatingRoom: false,
      createError: '',
      rooms: [] as RoomListItem[],
      roomsLoading: false,
      roomsError: '',
      pollTimer: null as ReturnType<typeof setInterval> | null,
      featureKeys: [
        { icon: '⚔️', title: 'ui.homepage.feat_3v3_t', desc: 'ui.homepage.feat_3v3_d' },
        { icon: '🤖', title: 'ui.homepage.feat_ai_t', desc: 'ui.homepage.feat_ai_d' },
        { icon: '🏆', title: 'ui.homepage.feat_rank_t', desc: 'ui.homepage.feat_rank_d' },
        { icon: '👁', title: 'ui.homepage.feat_spec_t', desc: 'ui.homepage.feat_spec_d' },
      ],
    };
  },
  computed: {
    ...mapGetters(['isLoggedIn']),
  },
  methods: {
    async createRoom() {
      this.creatingRoom = true;
      this.createError = '';
      try {
        const roomId = await store.dispatch('createRoom');
        this.$router.push({ name: 'room', params: { roomId } });
        this.creatingRoom = false;
      } catch (error: any) {
        console.error('error when creating room', error);
        this.createError = error?.message || String(error);
        this.creatingRoom = false;
      }
    },
    async loadRooms() {
      this.roomsLoading = true;
      this.roomsError = '';
      try {
        this.rooms = await roomsApi.list();
      } catch (e: any) {
        this.roomsError = e?.message || String(e);
      } finally {
        this.roomsLoading = false;
      }
    },
    playerNames(room: RoomListItem) {
      return room.players.map((p) => p.username).join(', ') || '—';
    },
    phaseLabel(phase: string) {
      if (phase === 'lobby') return this.$t('ui.rooms.phase_lobby');
      if (phase === 'in_game') return this.$t('ui.rooms.phase_in_game');
      return this.$t('ui.rooms.phase_finished');
    },
    phaseBadge(phase: string) {
      if (phase === 'lobby') return 'badge-success';
      if (phase === 'in_game') return 'badge-primary';
      return 'badge-secondary';
    },
    modeLabel(room: RoomListItem) {
      if (room.phase === 'lobby') {
        return room.playerCount === 6
          ? this.$t('ui.lobby.settings.mode_team6')
          : this.$t('ui.stats.casual');
      }
      if (room.gameMode === GameMode.COMPETITIVE_TEAM6) {
        return this.$t('ui.lobby.settings.mode_team6');
      }
      return this.$t('ui.stats.casual');
    },
    goJoin(roomId: string) {
      this.$router.push({ name: 'room', params: { roomId } });
    },
    goSpectate(roomId: string) {
      this.$router.push({
        name: 'room',
        params: { roomId },
        query: { spectate: '1' },
      });
    },
  },
  mounted() {
    this.loadRooms();
    this.pollTimer = setInterval(() => {
      this.loadRooms();
    }, 4000);
  },
  beforeUnmount() {
    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }
  },
});
</script>

<style lang="scss" scoped>
.home {
  min-height: 100%;
  background: #f4efe6;
}

.home-hero {
  position: relative;
  overflow: hidden;
  color: #f5e6c8;
  background:
    radial-gradient(ellipse at 20% 0%, rgba(212, 175, 55, 0.25), transparent 50%),
    radial-gradient(ellipse at 90% 40%, rgba(59, 130, 246, 0.18), transparent 45%),
    linear-gradient(145deg, #1a1410 0%, #2c2118 50%, #1a1410 100%);

  &__glow {
    position: absolute;
    inset: 0;
    background: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23d4af37' fill-opacity='0.05'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
    pointer-events: none;
  }

  &__eyebrow {
    text-transform: uppercase;
    letter-spacing: 0.14em;
    font-size: 0.75rem;
    color: #d4af37;
    margin-bottom: 0.5rem;
  }

  &__title {
    font-weight: 900;
    font-size: clamp(2rem, 4vw, 2.75rem);
    margin-bottom: 0.75rem;
    text-shadow: 0 2px 12px rgba(0, 0, 0, 0.4);
  }

  &__lead {
    font-size: 1.05rem;
    opacity: 0.9;
    max-width: 34rem;
    margin-bottom: 1rem;
  }

  &__bullets {
    padding-left: 1.1rem;
    margin-bottom: 0;
    li {
      margin-bottom: 0.35rem;
      opacity: 0.88;
    }
  }

  &__cta {
    font-weight: 800;
    min-width: 10rem;
    box-shadow: 0 6px 20px rgba(212, 175, 55, 0.35);
  }

  &__card {
    background: rgba(0, 0, 0, 0.35);
    border: 1px solid rgba(212, 175, 55, 0.35);
    border-radius: 14px;
    padding: 1.25rem 1.4rem;
    backdrop-filter: blur(6px);
  }

  &__card-title {
    color: #d4af37;
    font-weight: 800;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    font-size: 0.8rem;
    margin-bottom: 0.75rem;
  }

  &__steps {
    padding-left: 1.15rem;
    li {
      margin-bottom: 0.45rem;
      line-height: 1.4;
    }
  }
}

.home-main {
  margin-top: -1.5rem;
  position: relative;
  z-index: 1;
}

.home-rooms {
  border: none;
  border-radius: 12px;
  overflow: hidden;

  &__id {
    font-size: 0.85rem;
  }

  &__empty {
    background: #faf7f2;
    border-radius: 8px;
  }
}

.home-side {
  border: none;
  border-radius: 12px;
}

.home-feature {
  display: flex;
  gap: 0.75rem;
  align-items: flex-start;
  padding: 0.55rem 0;
  border-bottom: 1px solid #eee;

  &:last-child {
    border-bottom: none;
    padding-bottom: 0;
  }

  &__icon {
    font-size: 1.4rem;
    line-height: 1;
    width: 2rem;
    text-align: center;
  }
}

.gap-2 {
  gap: 0.5rem;
}
</style>
