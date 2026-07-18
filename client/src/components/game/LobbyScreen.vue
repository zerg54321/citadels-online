<template>
<div
  class="modal fade"
  id="setupConfirmationModal"
  tabindex="-1"
  aria-labelledby="setupConfirmationModalLabel"
  aria-hidden="true"
>
  <div class="modal-dialog modal-dialog-centered modal-dialog-scrollable">
    <div class="modal-content">
      <div class="modal-header">
        <h5 class="modal-title" id="setupConfirmationModalLabel">
          {{ $t('ui.lobby.start_game') }}
        </h5>
        <button type="button" class="close" data-dismiss="modal" :aria-label="$t('ui.cancel')">
          <span aria-hidden="true">&times;</span>
        </button>
      </div>
      <div class="modal-body">
        <table class="table">
          <tbody>
            <tr v-if="isSixPlayers">
              <td>{{ $t('ui.lobby.settings.game_mode') }}</td>
              <td>{{ $t('ui.lobby.settings.mode_team6') }}</td>
            </tr>
            <tr>
              <td>{{ $t('ui.lobby.settings.complete_city_size') }}</td>
              <td>{{ isSixPlayers ? 8 : gameSetupData.completeCitySize }}</td>
            </tr>
            <tr>
              <td>{{ $t('ui.lobby.settings.action_timeout') }}</td>
              <td>{{ gameSetupData.actionTimeoutSeconds }}s</td>
            </tr>
          </tbody>
        </table>
        <div class="card">
          <div class="card-header">{{ $t('ui.lobby.players') }}</div>
          <ul class="list-group list-group-flush">
            <li
              class="list-group-item d-flex justify-content-between align-items-center"
              :class="{'text-muted': !getPlayerFromId(playerId).online}"
              v-for="playerId in gameSetupData.players"
              :key="playerId"
            >
              <span>{{ getPlayerFromId(playerId).username }}</span>
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
      <div class="modal-footer">
        <button type="button" class="btn btn-secondary" data-dismiss="modal">
          {{ $t('ui.cancel') }}
        </button>
        <button
          type="button"
          class="btn btn-primary"
          @click="startGame"
          :disabled="startingGame"
        >{{ $t('ui.confirm') }}</button>
      </div>
    </div>
  </div>
</div>
<div class="card h-100">
  <div class="card-header">{{ $t('ui.lobby.title') }}</div>
  <div class="row no-gutters h-100 overflow-auto">
    <div v-if="isManager" class="col p-3">
      <div class="alert alert-info py-2">
        {{ $t('ui.lobby.settings.mode_team6_only') }}
      </div>
      <div v-if="hasAiPlayers" class="alert alert-warning py-2">
        {{ $t('ui.lobby.settings.ai_practice_hint') }}
      </div>
      <div class="form-group">
        <label for="actionTimeoutSeconds">
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
        <small class="form-text text-muted">
          {{ $t('ui.lobby.settings.action_timeout_hint') }}
        </small>
      </div>
    </div>
    <div class="col p-3 bg-light">
      <PlayersList />
    </div>
  </div>
  <div class="card-footer">
    <input
      type="button"
      class="btn btn-primary btn-lg btn-block"
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
