<template>
  <div class="card h-100">
    <div class="card-header border-0 pt-3 pb-2">
      <h5 class="mb-0 text-gold lobby-title">
        {{ $t('ui.lobby.title') }}
      </h5>
    </div>
    <div class="row no-gutters h-100 overflow-auto lobby-body">
      <div v-if="isManager" class="col-auto p-3 lobby-settings-col">
        <div class="lobby-alert-info mb-2">
          {{ $t('ui.lobby.settings.mode_team6_only') }}
        </div>
        <div v-if="hasAiPlayers" class="lobby-alert-warn mb-2">
          {{ $t('ui.lobby.settings.ai_practice_hint') }}
        </div>
        <div class="form-group">
          <label for="actionTimeoutSeconds" class="text-gold lobby-label">
            {{ $t('ui.lobby.settings.action_timeout') }}
          </label>
          <select
            class="form-control"
            id="actionTimeoutSeconds"
            v-model.number="actionTimeoutSeconds"
          >
            <option :value="10">10s（测试）</option>
            <option :value="60">60s</option>
            <option :value="90">90s</option>
            <option :value="120">120s</option>
            <option :value="180">180s</option>
          </select>
          <small class="text-muted-gold">{{ $t('ui.lobby.settings.action_timeout_hint') }}</small>
        </div>
      </div>
      <div class="col p-3 lobby-players-col">
        <div class="row no-gutters">
          <div class="col-6">
            <div class="px-2 py-1 team-a-header text-white small font-weight-bold text-center mb-2">
              {{ $t('ui.team.a') }} ({{ teamAPlayers.length }}/4)
            </div>
            <div class="lobby-slots">
              <div
                v-for="player in teamAPlayers"
                :key="player.id"
                class="lobby-slot lobby-slot--filled"
                :class="{ 'lobby-slot--self': player.id === self?.id }"
               >
                 <span class="lobby-slot__name">{{ player.username }}</span>
                 <span class="lobby-slot__badges">
                   <span
                     v-if="player.id === self?.id"
                     class="badge badge-info"
                   >{{ $t('ui.lobby.you') }}</span>
                   <span v-if="player.isAi" class="badge badge-dark">AI</span>
                   <span
                     v-if="player.manager"
                     class="badge manager-badge"
                   >{{ $t('ui.lobby.manager') }}</span>
                 </span>
                 <div
                   v-if="canManageAi || player.id === self?.id"
                   class="lobby-slot__actions"
                 >
                   <button
                     v-if="player.id !== self?.id && canManageAi"
                     type="button"
                     class="btn btn-xs btn-outline-gold py-0"
                     @click="moveToTeam('B', player.id)"
                     :disabled="teamBPlayers.length >= 4"
                    :title="$t('ui.lobby.move_to_team_b')"
                  >&rarr;</button>
                  <button
                    v-if="player.id === self?.id"
                    type="button"
                    class="btn btn-xs btn-outline-gold py-0"
                    @click="moveToTeam('B')"
                    :disabled="teamBPlayers.length >= 4"
                  >&rarr;</button>
                </div>
              </div>
              <div
                v-for="i in (4 - teamAPlayers.length)"
                :key="'empty-a-' + i"
                class="lobby-slot lobby-slot--empty"
                @click="moveSelfTo('A')"
              >
                <span class="lobby-slot__plus">+</span>
              </div>
            </div>
          </div>
          <div class="col-6">
            <div class="px-2 py-1 team-b-header text-white small font-weight-bold text-center mb-2">
              {{ $t('ui.team.b') }} ({{ teamBPlayers.length }}/4)
            </div>
            <div class="lobby-slots">
              <div
                v-for="player in teamBPlayers"
                :key="player.id"
                class="lobby-slot lobby-slot--filled"
                :class="{ 'lobby-slot--self': player.id === self?.id }"
              >
                <span class="lobby-slot__name">{{ player.username }}</span>
                <span class="lobby-slot__badges">
                  <span
                    v-if="player.id === self?.id"
                    class="badge badge-info"
                  >{{ $t('ui.lobby.you') }}</span>
                  <span v-if="player.isAi" class="badge badge-dark">AI</span>
                  <span
                    v-if="player.manager"
                    class="badge manager-badge"
                  >{{ $t('ui.lobby.manager') }}</span>
                </span>
                <div
                  v-if="canManageAi || player.id === self?.id"
                  class="lobby-slot__actions"
                >
                  <button
                    v-if="player.id !== self?.id && canManageAi"
                    type="button"
                    class="btn btn-xs btn-outline-gold py-0"
                    @click="moveToTeam('A', player.id)"
                    :disabled="teamAPlayers.length >= 4"
                    :title="$t('ui.lobby.move_to_team_a')"
                  >&larr;</button>
                  <button
                    v-if="player.id === self?.id"
                    type="button"
                    class="btn btn-xs btn-outline-gold py-0"
                    @click="moveToTeam('A')"
                    :disabled="teamAPlayers.length >= 4"
                  >&larr;</button>
                </div>
              </div>
              <div
                v-for="i in (4 - teamBPlayers.length)"
                :key="'empty-b-' + i"
                class="lobby-slot lobby-slot--empty"
                @click="moveSelfTo('B')"
              >
                <span class="lobby-slot__plus">+</span>
              </div>
            </div>
          </div>
        </div>
        <div class="mt-3">
          <LobbyChat />
        </div>
        <div v-if="spectators.length" class="mt-3">
          <div class="px-2 py-1 small text-muted-gold mb-1">{{ $t('ui.lobby.spectator') }}</div>
          <ul class="list-group list-group-flush">
            <li
              v-for="p in spectators"
              :key="p.id"
              class="list-group-item py-1 px-2 small d-flex justify-content-between"
            >
              <span>{{ p.username }}</span>
              <span>
                <span
                  v-if="p.id === self?.id"
                  class="badge badge-info"
                >{{ $t('ui.lobby.you') }}</span>
                <button
                  v-if="self && self.role === PlayerRole.PLAYER && canManageAi && !p.isAi"
                  type="button"
                  class="btn btn-xs btn-outline-gold py-0 ml-1"
                  @click="moveToTeam('A', p.id)"
                  :disabled="teamAPlayers.length >= 4"
                >A</button>
                <button
                  v-if="self && self.role === PlayerRole.PLAYER && canManageAi && !p.isAi"
                  type="button"
                  class="btn btn-xs btn-outline-gold py-0 ml-1"
                  @click="moveToTeam('B', p.id)"
                  :disabled="teamBPlayers.length >= 4"
                >B</button>
              </span>
            </li>
          </ul>
        </div>
        <div class="mt-3 small text-muted-gold">
          {{ $t('ui.lobby.player_count', { n: seatedPlayers.length }) }}
          ·
          {{ $t('ui.lobby.spectator_count', { n: spectators.length }) }}
          ·
          {{ $t('ui.lobby.ai_count', { n: aiCount }) }}
        </div>
        <div v-if="inLobby && self" class="mt-2">
          <button
            v-if="self.role === PlayerRole.SPECTATOR"
            type="button"
            class="btn btn-sm btn-gold btn-block"
            :disabled="roleBusy || seatedPlayers.length >= 6"
            @click="setRole('player')"
          >{{ $t('ui.lobby.become_player') }}</button>
          <button
            v-else
            type="button"
            class="btn btn-sm btn-outline-gold btn-block"
            :disabled="roleBusy"
            @click="setRole('spectator')"
          >{{ $t('ui.lobby.become_spectator') }}</button>
        </div>
        <button
          v-if="canManageAi"
          type="button"
          class="btn btn-sm btn-outline-gold btn-block mt-2"
          :disabled="!canAddAi || aiBusy"
          @click="addAi"
        >{{ $t('ui.lobby.add_ai') }}</button>
        <div v-if="canManageAi" class="small text-muted-gold mt-1">
          {{ $t('ui.lobby.add_ai_hint') }}
        </div>
      </div>
    </div>
    <div class="card-footer border-0">
      <input
        type="button"
        class="btn btn-gold btn-lg btn-block"
        @click="showConfirmationModal"
        :disabled="validation.disabled"
        :value="validation.message"
      >
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import $ from 'jquery';
import { mapGetters } from 'vuex';
import { GameProgress, PlayerRole, TeamId } from 'citadels-common';
import { store } from '../../store';
import LobbyChat from './LobbyChat.vue';

export default defineComponent({
  components: { LobbyChat },
  name: 'LobbyScreen',
  data() {
    return {
      startingGame: false,
      completeCitySize: 8,
      actionTimeoutSeconds: 120,
      roleBusy: false,
      aiBusy: false,
    };
  },
  computed: {
    ...mapGetters([
      'getPlayerFromId',
      'gameSetupData',
      'gameState',
    ]),
    self() {
      return this.getPlayerFromId(this.gameState.self);
    },
    isManager() {
      return this.getPlayerFromId(this.gameState.self)?.manager || false;
    },
    hasAiPlayers() {
      return Array.from(this.gameState?.players.values() || [])
        .some((player: any) => player.isAi && player.role === PlayerRole.PLAYER);
    },
    seatedPlayers() {
      const order = this.gameState?.lobbyPlayerOrder || [];
      return order
        .map((id) => this.gameState.players.get(id))
        .filter((p: any) => p && p.role === PlayerRole.PLAYER);
    },
    teamAPlayers() {
      return this.seatedPlayers.filter((p: any) => p.team === TeamId.A);
    },
    teamBPlayers() {
      return this.seatedPlayers.filter((p: any) => p.team === TeamId.B);
    },
    canManageAi() {
      return this.isManager;
    },
    spectators() {
      return Array.from(this.gameState?.players.values() || [])
        .filter((p: any) => p.role === PlayerRole.SPECTATOR);
    },
    inLobby() {
      return this.gameState?.progress === GameProgress.IN_LOBBY;
    },
    aiCount() {
      return Array.from(this.gameState?.players.values() || [])
        .filter((p: any) => p.isAi && p.role === PlayerRole.PLAYER).length;
    },
    canAddAi() {
      return this.seatedPlayers.length < 6;
    },
    validation() {
      const total = this.seatedPlayers.length;
      const aCount = this.teamAPlayers.length;
      const bCount = this.teamBPlayers.length;

      if (total < 6) {
        return {
          disabled: true,
          message: this.$t('ui.lobby.need_six_players', { n: total }),
        };
      }
      if (total > 6) {
        return {
          disabled: true,
          message: this.$t('ui.lobby.too_many_players'),
        };
      }
      if (aCount !== 3 || bCount !== 3) {
        return {
          disabled: true,
          message: this.$t('ui.lobby.need_3v3', { a: aCount, b: bCount }),
        };
      }
      if (!this.isManager) {
        return {
          disabled: true,
          message: this.$t('ui.lobby.wait_message'),
        };
      }
      return {
        disabled: false,
        message: this.$t('ui.lobby.start_game'),
      };
    },
  },
  methods: {
    showConfirmationModal() {
      const settings = {
        completeCitySize: this.completeCitySize,
        actionTimeoutSeconds: this.actionTimeoutSeconds,
      };
      store.commit('prepareGameSetupConfirmation', settings);
      $('#setupConfirmationModal').modal();
    },
    async startGame() {
      try {
        this.startingGame = true;
        await store.dispatch('startGame');
        this.startingGame = false;
        $('#setupConfirmationModal').modal('hide');
      } catch (error) {
        console.error('error when starting game', error);
        this.startingGame = false;
        window.alert(error instanceof Error ? error.message : String(error));
      }
    },
    async moveToTeam(team: 'A' | 'B', playerId?: string) {
      const targetId = playerId || this.gameState.self;
      if (!targetId) return;
      try {
        await store.dispatch('setLobbyTeam', { team, playerId: targetId });
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e));
      }
    },
    async moveSelfTo(team: 'A' | 'B') {
      await this.moveToTeam(team);
    },
    async setRole(role: 'player' | 'spectator') {
      if (this.roleBusy) return;
      this.roleBusy = true;
      try {
        await store.dispatch('setLobbyRole', role);
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e));
      } finally {
        this.roleBusy = false;
      }
    },
    async addAi() {
      if (this.aiBusy) return;
      this.aiBusy = true;
      try {
        await store.dispatch('addAiPlayer');
      } catch (e) {
        window.alert(e instanceof Error ? e.message : String(e));
      } finally {
        this.aiBusy = false;
      }
    },
  },
  beforeUnmount() {
    $('#setupConfirmationModal').modal('hide');
  },
});
</script>

<style scoped>
.lobby-body {
  max-height: 55vh;
}
.lobby-settings-col {
  background: rgba(13, 11, 8, 0.35);
  border-right: 1px solid rgba(212, 175, 55, 0.2);
  min-width: 14rem;
  max-width: 16rem;
}
.lobby-players-col {
  background: rgba(13, 11, 8, 0.15);
}
.lobby-alert-info {
  background: rgba(212, 175, 55, 0.1);
  border: 1px solid rgba(212, 175, 55, 0.3);
  color: var(--gold-bright);
  border-radius: 0.35rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
}
.lobby-alert-warn {
  background: rgba(180, 120, 40, 0.12);
  border: 1px solid rgba(212, 175, 55, 0.35);
  color: var(--gold);
  border-radius: 0.35rem;
  padding: 0.5rem 0.75rem;
  font-size: 0.85rem;
}
.lobby-slots {
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
}
.lobby-slot {
  border-radius: 0.5rem;
  padding: 0.55rem 0.7rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  min-height: 2.6rem;
}
.lobby-slot--filled {
  background: rgba(13, 11, 8, 0.45);
  border: 1px solid rgba(212, 175, 55, 0.3);
}
.lobby-slot--filled:hover {
  border-color: rgba(212, 175, 55, 0.55);
  background: rgba(13, 11, 8, 0.6);
}
.lobby-slot--self {
  border-color: rgba(212, 175, 55, 0.65);
  background: rgba(212, 175, 55, 0.08);
}
.lobby-slot--empty {
  border: 1px dashed rgba(212, 175, 55, 0.35);
  background: rgba(13, 11, 8, 0.15);
  cursor: pointer;
  justify-content: center;
  transition: all 0.2s ease;
}
.lobby-slot--empty:hover {
  border-color: var(--gold);
  background: rgba(212, 175, 55, 0.08);
}
.lobby-slot__name {
  font-weight: 700;
  font-size: 0.95rem;
  color: var(--parchment);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.lobby-slot__badges {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}
.lobby-slot__actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}
.lobby-slot__plus {
  font-size: 1.2rem;
  color: var(--text-muted);
  font-weight: 300;
}
.lobby-slot--empty:hover .lobby-slot__plus {
  color: var(--gold);
}
.lobby-title {
  font-family: var(--font-display);
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.lobby-label {
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}
.team-a-header {
  background: rgba(70, 90, 110, 0.35);
  border-bottom: 1px solid rgba(70, 90, 110, 0.45);
  border-radius: 0.35rem 0.35rem 0 0;
}
.team-b-header {
  background: rgba(110, 60, 60, 0.35);
  border-bottom: 1px solid rgba(110, 60, 60, 0.45);
  border-radius: 0.35rem 0.35rem 0 0;
}
.manager-badge {
  background: rgba(180, 130, 50, 0.25);
  color: #e8c66a;
  border: 1px solid rgba(180, 130, 50, 0.5);
}
.badge-info {
  background: rgba(212, 175, 55, 0.2);
  color: var(--gold-bright);
  border: 1px solid rgba(212, 175, 55, 0.4);
}
.badge-dark {
  background: rgba(120, 110, 95, 0.25);
  color: var(--text-muted);
  border: 1px solid rgba(120, 110, 95, 0.4);
}
.form-control {
  background: rgba(13, 11, 8, 0.5);
  border: 1px solid rgba(212, 175, 55, 0.35);
  color: var(--parchment);
}
.form-control:focus {
  background: rgba(13, 11, 8, 0.7);
  border-color: var(--gold);
  color: var(--gold-bright);
  box-shadow: 0 0 0 0.15rem rgba(212, 175, 55, 0.15);
}

:deep(.list-group-item) {
  background: transparent;
  border-color: rgba(212, 175, 55, 0.12);
  color: var(--parchment);
}
:deep(.badge-success) {
  background: rgba(76, 140, 76, 0.25);
  color: #a3d9a3;
  border: 1px solid rgba(76, 140, 76, 0.45);
}
:deep(.badge-secondary) {
  background: rgba(120, 110, 95, 0.2);
  color: var(--text-muted);
  border: 1px solid rgba(120, 110, 95, 0.35);
}

:deep(.btn-outline-gold) {
  color: var(--gold);
  border-color: rgba(212, 175, 55, 0.55);
  font-family: var(--font-display);
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-weight: 700;
}
:deep(.btn-outline-gold:hover) {
  background: rgba(212, 175, 55, 0.08);
  border-color: var(--gold-bright);
  color: var(--gold-bright);
}
:deep(.btn-outline-gold:disabled) {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
