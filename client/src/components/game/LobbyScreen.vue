<template>
<div
  class="modal fade"
  id="setupConfirmationModal"
  tabindex="-1"
  aria-labelledby="setupConfirmationModalLabel"
  aria-hidden="true"
>
  <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
    <div class="modal-content lobby-modal">
      <div class="modal-header border-0 pb-2">
         <h5 class="modal-title text-gold lobby-modal-title" id="setupConfirmationModalLabel">
          {{ $t('ui.lobby.start_game') }}
        </h5>
         <button
           type="button"
           class="close text-gold"
           data-dismiss="modal"
           :aria-label="$t('ui.cancel')"
         >
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body">
        <table class="table lobby-table">
          <tbody>
            <tr v-if="isSixPlayers">
              <td class="text-muted-gold">{{ $t('ui.lobby.settings.game_mode') }}</td>
              <td class="text-gold">{{ $t('ui.lobby.settings.mode_team6') }}</td>
            </tr>
            <tr>
              <td class="text-muted-gold">{{ $t('ui.lobby.settings.complete_city_size') }}</td>
              <td class="text-gold">{{ isSixPlayers ? 8 : gameSetupData.completeCitySize }}</td>
            </tr>
            <tr>
              <td class="text-muted-gold">{{ $t('ui.lobby.settings.action_timeout') }}</td>
              <td class="text-gold">{{ gameSetupData.actionTimeoutSeconds }}s</td>
            </tr>
          </tbody>
        </table>
        <div class="card lobby-modal-card">
          <div class="card-header text-gold lobby-modal-card-header">
            {{ $t('ui.lobby.players') }}
          </div>
          <ul class="list-group list-group-flush">
            <li
              class="list-group-item d-flex justify-content-between align-items-center"
              :class="{'text-muted-gold': !getPlayerFromId(playerId).online}"
              v-for="playerId in gameSetupData.players"
              :key="playerId"
            >
              <span class="text-parchment">{{ getPlayerFromId(playerId).username }}</span>
              <span
                v-if="playerId === gameState.self"
                class="badge badge-info"
              >{{ $t('ui.lobby.you') }}</span>
              <span
                v-else-if="!getPlayerFromId(playerId).online"
                class="badge badge-secondary"
              >{{ $t('ui.lobby.offline') }}</span>
              <span
                v-else
                class="badge badge-success"
              >{{ $t('ui.lobby.online') }}</span>
            </li>
          </ul>
        </div>
      </div>
      <div class="modal-footer border-0">
        <button type="button" class="btn btn-outline-gold" data-dismiss="modal">
          {{ $t('ui.cancel') }}
        </button>
        <button
          type="button"
          class="btn btn-gold"
          @click="startGame"
          :disabled="startingGame"
        >{{ $t('ui.confirm') }}</button>
      </div>
    </div>
  </div>
</div>
 <div class="card h-100 medieval-panel">
  <div class="card-header border-0 pt-3 pb-2">
    <h5 class="mb-0 text-gold lobby-title">
      {{ $t('ui.lobby.title') }}
    </h5>
  </div>
  <div class="row no-gutters h-100 overflow-auto">
    <div v-if="isManager" class="col p-3 lobby-settings-col">
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
      <PlayersList />
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
import { PlayerRole } from 'citadels-common';
import PlayersList from './elements/PlayersList.vue';
import { store } from '../../store';

export default defineComponent({
  components: { PlayersList },
  name: 'LobbyScreen',
  data() {
    return {
      startingGame: false,
      completeCitySize: 8,
      actionTimeoutSeconds: 120,
    };
  },
  computed: {
    ...mapGetters([
      'getPlayerFromId',
      'gameSetupData',
      'gameState',
    ]),
    isManager() {
      return this.getPlayerFromId(this.gameState.self)?.manager || false;
    },
    isSixPlayers() {
      return Array.from(this.gameState?.players.values() || [])
        .filter((player: any) => player.role === PlayerRole.PLAYER).length === 6;
    },
    hasAiPlayers() {
      return Array.from(this.gameState?.players.values() || [])
        .some((player: any) => player.isAi && player.role === PlayerRole.PLAYER);
    },
    validation() {
      // get players
      const playersCount = Array.from(this.gameState?.players.values() || [])
        .filter((player) => player.role === PlayerRole.PLAYER).length;

      // 3v3 only: exactly 6 seats
      if (playersCount < 6) {
        return {
          disabled: true,
          message: this.$t('ui.lobby.need_six_players', { n: playersCount }),
        };
      }
      if (playersCount > 6) {
        return {
          disabled: true,
          message: this.$t('ui.lobby.too_many_players'),
        };
      }

      // not a manager
      if (!this.isManager) {
        return {
          disabled: true,
          message: this.$t('ui.lobby.wait_message'),
        };
      }

      // pass all checks
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
        // surface error so host is not stuck on a silent modal
        // eslint-disable-next-line no-alert
        window.alert(error instanceof Error ? error.message : String(error));
      }
    },
  },
  beforeUnmount() {
    $('#setupConfirmationModal').modal('hide');
  },
});
</script>

<style scoped>
.lobby-settings-col {
  background: rgba(13, 11, 8, 0.35);
  border-right: 1px solid rgba(212, 175, 55, 0.2);
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
.lobby-modal {
  background: var(--bg-panel);
  border: 1px solid rgba(212, 175, 55, 0.5);
  box-shadow: 0 8px 40px rgba(0,0,0,0.7), 0 0 0 1px rgba(212,175,55,0.15);
}
.lobby-table td {
  border-color: rgba(212, 175, 55, 0.18);
  padding: 0.45rem 0.5rem;
}
.lobby-modal-card {
  background: rgba(13, 11, 8, 0.45);
  border: 1px solid rgba(212, 175, 55, 0.3);
}
.lobby-modal-title {
  font-family: var(--font-display);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.lobby-modal-card-header {
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.06em;
  text-transform: uppercase;
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

:deep(.list-group-item) {
  background: transparent;
  border-color: rgba(212, 175, 55, 0.12);
  color: var(--parchment);
}
:deep(.badge-info) {
  background: rgba(212, 175, 55, 0.2);
  color: var(--gold-bright);
  border: 1px solid rgba(212, 175, 55, 0.4);
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
</style>
