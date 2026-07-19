<template>
<div class="card">
  <div class="card-header d-flex justify-content-between align-items-center">
    <span>{{ $t('ui.lobby.players') }}</span>
    <span class="small text-muted">{{ $t('ui.lobby.team_preview_hint') }}</span>
  </div>

  <!-- Team A / Team B columns -->
  <div class="row no-gutters">
    <div class="col-6 border-right">
      <div class="px-2 py-1 team-a-header text-white small font-weight-bold text-center">
        {{ $t('ui.team.a') }}
      </div>
      <ul class="list-group list-group-flush">
         <li
           v-for="row in teamARows"
           :key="row.id"
           class="list-group-item py-2 px-2 d-flex align-items-center"
            :class="{ 'self-row': row.id === self?.id }"
         >
            <span class="badge team-a-badge badge-pill mr-1">{{ row.seatNo }}</span>
           <span class="flex-fill text-truncate small">
             {{ row.username }}
             <span
               v-if="row.id === self?.id"
               class="badge badge-info"
             >{{ $t('ui.lobby.you') }}</span>
             <span v-if="row.isAi" class="badge badge-dark">AI</span>
              <span
                v-if="row.manager"
                class="badge manager-badge"
              >{{ $t('ui.lobby.manager') }}</span>
           </span>
           <span v-if="canManageAi && !row.isAi" class="btn-group btn-group-sm">
             <button
               type="button"
               class="btn btn-outline-secondary btn-sm py-0"
               @click="moveSeat(row.id, -1)"
             >↑</button>
             <button
               type="button"
               class="btn btn-outline-secondary btn-sm py-0"
               @click="moveSeat(row.id, 1)"
             >↓</button>
           </span>
           <button
             v-if="canManageAi && row.isAi"
             type="button"
             class="btn btn-sm btn-outline-danger py-0 ml-1"
             @click="removeAi(row.id)"
           >×</button>
         </li>
         <li
           v-if="!teamARows.length"
           class="list-group-item small text-muted text-center py-2"
         >—</li>
      </ul>
    </div>
    <div class="col-6">
      <div class="px-2 py-1 team-b-header text-white small font-weight-bold text-center">
        {{ $t('ui.team.b') }}
      </div>
      <ul class="list-group list-group-flush">
         <li
           v-for="row in teamBRows"
           :key="row.id"
           class="list-group-item py-2 px-2 d-flex align-items-center"
            :class="{ 'self-row': row.id === self?.id }"
         >
            <span class="badge team-b-badge badge-pill mr-1">{{ row.seatNo }}</span>
           <span class="flex-fill text-truncate small">
             {{ row.username }}
             <span
               v-if="row.id === self?.id"
               class="badge badge-info"
             >{{ $t('ui.lobby.you') }}</span>
             <span v-if="row.isAi" class="badge badge-dark">AI</span>
              <span
                v-if="row.manager"
                class="badge manager-badge"
              >{{ $t('ui.lobby.manager') }}</span>
           </span>
           <span v-if="canManageAi && !row.isAi" class="btn-group btn-group-sm">
             <button
               type="button"
               class="btn btn-outline-secondary btn-sm py-0"
               @click="moveSeat(row.id, -1)"
             >↑</button>
             <button
               type="button"
               class="btn btn-outline-secondary btn-sm py-0"
               @click="moveSeat(row.id, 1)"
             >↓</button>
           </span>
           <button
             v-if="canManageAi && row.isAi"
             type="button"
             class="btn btn-sm btn-outline-danger py-0 ml-1"
             @click="removeAi(row.id)"
           >×</button>
         </li>
         <li
           v-if="!teamBRows.length"
           class="list-group-item small text-muted text-center py-2"
         >—</li>
      </ul>
    </div>
  </div>

  <!-- Spectators -->
  <div v-if="spectators.length" class="border-top">
    <div class="px-2 py-1 small text-muted">{{ $t('ui.lobby.spectator') }}</div>
    <ul class="list-group list-group-flush">
      <li
        v-for="p in spectators"
        :key="p.id"
        class="list-group-item py-1 px-2 small"
      >
        {{ p.username }}
             <span
               v-if="p.id === self?.id"
               class="badge badge-info"
             >{{ $t('ui.lobby.you') }}</span>
      </li>
    </ul>
  </div>

  <div class="card-footer">
    <div class="small text-muted mb-2">
      {{ $t('ui.lobby.player_count', { n: counts.players }) }}
      ·
      {{ $t('ui.lobby.spectator_count', { n: counts.spectators }) }}
      ·
      {{ $t('ui.lobby.ai_count', { n: counts.ai }) }}
    </div>

    <!-- self: switch player / spectator -->
    <div v-if="inLobby && self" class="mb-2">
      <button
        v-if="self.role === PlayerRole.SPECTATOR"
        type="button"
        class="btn btn-sm btn-primary btn-block"
        :disabled="roleBusy || counts.players >= 6"
        @click="setRole('player')"
      >{{ $t('ui.lobby.become_player') }}</button>
      <button
        v-else
        type="button"
        class="btn btn-sm btn-outline-secondary btn-block"
        :disabled="roleBusy"
        @click="setRole('spectator')"
      >{{ $t('ui.lobby.become_spectator') }}</button>
    </div>

    <button
      v-if="canManageAi"
      type="button"
      class="btn btn-sm btn-outline-primary btn-block"
      :disabled="!canAddAi || aiBusy"
      @click="addAi"
    >{{ $t('ui.lobby.add_ai') }}</button>
    <div v-if="canManageAi" class="small text-muted mt-1">{{ $t('ui.lobby.add_ai_hint') }}</div>
  </div>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters } from 'vuex';
import { GameProgress, PlayerRole } from 'citadels-common';
import { store } from '../../../store';

export default defineComponent({
  name: 'PlayersList',
  data() {
    return {
      aiBusy: false,
      roleBusy: false,
      PlayerRole,
    };
  },
  computed: {
    ...mapGetters([
      'gameState',
    ]),
    self() {
      return this.gameState.players.get(this.gameState.self);
    },
    inLobby() {
      return this.gameState?.progress === GameProgress.IN_LOBBY;
    },
    seatedOrder() {
      const order = this.gameState?.lobbyPlayerOrder;
      if (Array.isArray(order) && order.length) {
        return order
          .map((id: string) => this.gameState.players.get(id))
          .filter(Boolean);
      }
      // fallback: all PLAYER roles
      return Array.from(this.gameState.players.values())
        .filter((p: any) => p.role === PlayerRole.PLAYER);
    },
    teamARows() {
      return this.seatedOrder
        .filter((_: any, i: number) => i % 2 === 0)
        .map((p: any) => ({
          ...p,
          seatNo: this.seatedOrder.indexOf(p) + 1,
        }));
    },
    teamBRows() {
      return this.seatedOrder
        .filter((_: any, i: number) => i % 2 === 1)
        .map((p: any) => ({
          ...p,
          seatNo: this.seatedOrder.indexOf(p) + 1,
        }));
    },
    spectators() {
      return Array.from(this.gameState.players.values())
        .filter((p: any) => p.role === PlayerRole.SPECTATOR);
    },
    counts() {
      const all = Array.from(this.gameState.players.values()) as any[];
      return {
        players: all.filter((p) => p.role === PlayerRole.PLAYER).length,
        spectators: all.filter((p) => p.role === PlayerRole.SPECTATOR).length,
        ai: all.filter((p) => p.isAi && p.role === PlayerRole.PLAYER).length,
      };
    },
    canManageAi() {
      return this.self?.manager && this.inLobby;
    },
    canAddAi() {
      return this.counts.players < 6;
    },
  },
  methods: {
    async setRole(role: 'player' | 'spectator') {
      if (this.roleBusy) return;
      this.roleBusy = true;
      try {
        await store.dispatch('setLobbyRole', role);
      } catch (e) {
        console.error(e);
        // eslint-disable-next-line no-alert
        window.alert(e instanceof Error ? e.message : String(e));
      } finally {
        this.roleBusy = false;
      }
    },
    async moveSeat(playerId: string, direction: number) {
      try {
        await store.dispatch('reorderLobbySeat', { playerId, direction });
      } catch (e) {
        console.error(e);
      }
    },
    async addAi() {
      if (this.aiBusy) return;
      this.aiBusy = true;
      try {
        await store.dispatch('addAiPlayer');
      } catch (e) {
        console.error(e);
        // eslint-disable-next-line no-alert
        window.alert(e instanceof Error ? e.message : String(e));
      } finally {
        this.aiBusy = false;
      }
    },
    async removeAi(playerId: string) {
      if (this.aiBusy) return;
      this.aiBusy = true;
      try {
        await store.dispatch('removeAiPlayer', playerId);
      } catch (e) {
        console.error(e);
      } finally {
        this.aiBusy = false;
      }
    },
  },
});
</script>

<style scoped>
.card {
  background: transparent;
  border: 1px solid rgba(212, 175, 55, 0.35);
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
}
.card-header {
  background: rgba(13, 11, 8, 0.45);
  border-bottom: 1px solid rgba(212, 175, 55, 0.35);
  color: var(--gold);
  font-family: var(--font-display);
  font-size: 0.8rem;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.list-group-item {
  background: transparent;
  border-color: rgba(212, 175, 55, 0.12);
  color: var(--parchment);
}
.team-a-header {
  background: rgba(70, 90, 110, 0.35);
  border-bottom: 1px solid rgba(70, 90, 110, 0.45);
}
.team-b-header {
  background: rgba(110, 60, 60, 0.35);
  border-bottom: 1px solid rgba(110, 60, 60, 0.45);
}
.team-a-badge {
  background: rgba(70, 90, 110, 0.25);
  color: #b8c8d8;
  border: 1px solid rgba(70, 90, 110, 0.45);
}
.team-b-badge {
  background: rgba(110, 60, 60, 0.25);
  color: #d8a8a8;
  border: 1px solid rgba(110, 60, 60, 0.45);
}
.manager-badge {
  background: rgba(180, 130, 50, 0.25);
  color: #e8c66a;
  border: 1px solid rgba(180, 130, 50, 0.5);
}
.self-row {
  background: rgba(212, 175, 55, 0.08) !important;
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
.text-muted {
  color: var(--text-muted) !important;
}
.card-footer {
  background: rgba(13, 11, 8, 0.35);
  border-top: 1px solid rgba(212, 175, 55, 0.25);
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
.btn-outline-danger {
  color: #d8a8a8;
  border-color: rgba(110, 60, 60, 0.55);
}
.btn-outline-danger:hover {
  background: rgba(110, 60, 60, 0.15);
  color: #f5caca;
}
.border-right {
  border-right: 1px solid rgba(212, 175, 55, 0.25) !important;
}
</style>
