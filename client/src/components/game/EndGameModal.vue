<template>
  <div
    v-if="show"
    class="modal fade show d-block"
    style="background:rgba(0,0,0,0.65); z-index: 1050;"
  >
    <div class="modal-dialog modal-lg modal-dialog-centered modal-dialog-scrollable">
      <div class="modal-content">
        <div class="modal-header" :class="endHeaderClass">
          <h4 class="modal-title mb-0">{{ endTitle }}</h4>
          <button
            type="button"
            class="close text-white"
            @click="$emit('close')"
            aria-label="close"
          >
            <span aria-hidden="true">&times;</span>
          </button>
        </div>
        <div class="modal-body">
          <div class="text-center mb-3">
            <div class="h5">{{ endSubtitle }}</div>
            <div v-if="showTeamScores" class="mt-2">
              <span class="badge badge-primary badge-pill px-3 py-2 mr-2">
                {{ isSpectator ? $t('ui.team.a') : $t('ui.team.mine') }} {{ liveTeamScores.A }}
              </span>
              <span class="badge badge-danger badge-pill px-3 py-2">
                {{ isSpectator ? $t('ui.team.b') : $t('ui.team.enemy') }} {{ liveTeamScores.B }}
              </span>
            </div>
          </div>
          <table class="table table-sm table-striped mb-0">
            <thead>
              <tr>
                <th>{{ $t('ui.lobby.players') }}</th>
                <th v-if="showTeamScores">{{ $t('ui.stats.team') }}</th>
                <th class="text-right">{{ $t('ui.score.total') }}</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="row in endScoreRows" :key="row.id">
                <td>
                  {{ row.name }}
                   <span
                     v-if="row.isSelf"
                     class="badge badge-info ml-1"
                  >{{ $t('ui.lobby.you') }}</span>
                  <span v-if="row.isAi" class="badge badge-dark ml-1">AI</span>
                </td>
                <td v-if="showTeamScores">
                  <span class="badge" :class="row.team === 'A' ? 'badge-primary' : 'badge-danger'">
                    {{ row.team }}
                  </span>
                </td>
                <td class="text-right font-weight-bold">{{ row.total }}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <div class="modal-footer">
          <button type="button" class="btn btn-outline-secondary" @click="$emit('close')">
            {{ $t('ui.score.keep_browsing') }}
          </button>
          <button type="button" class="btn btn-primary" @click="$emit('leave')">
            {{ $t('ui.score.leave_room') }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { MatchResult, TeamId } from 'citadels-common';

export default defineComponent({
  name: 'EndGameModal',
  props: {
    show: {
      type: Boolean,
      required: true,
    },
    gameState: {
      type: Object,
      required: true,
    },
    selfId: {
      type: String,
      required: true,
    },
    isSpectator: {
      type: Boolean,
      required: true,
    },
    showTeamScores: {
      type: Boolean,
      required: true,
    },
    getPlayerFromId: {
      type: Function,
      required: true,
    },
  },
  emits: ['close', 'leave'],
  computed: {
    isWin() {
      const result = this.gameState?.matchResult;
      const team = this.getPlayerFromId(this.selfId)?.team;
      return (result === MatchResult.TEAM_A_WIN && team === TeamId.A)
        || (result === MatchResult.TEAM_B_WIN && team === TeamId.B);
    },
    isLose() {
      const result = this.gameState?.matchResult;
      const team = this.getPlayerFromId(this.selfId)?.team;
      return (result === MatchResult.TEAM_A_WIN && team === TeamId.B)
        || (result === MatchResult.TEAM_B_WIN && team === TeamId.A);
    },
    endTitle() {
      if (this.isSpectator) return this.$t('ui.score.game_over');
      if (this.isWin) return this.$t('ui.score.you_win');
      if (this.isLose) return this.$t('ui.score.you_lose');
      if (this.gameState?.matchResult === MatchResult.DRAW) return this.$t('ui.score.draw');
      return this.$t('ui.score.game_over');
    },
    endSubtitle() {
      if (this.matchSummary?.detail) return this.matchSummary.detail;
      if (this.matchSummary?.title) return this.matchSummary.title;
      return '';
    },
    endHeaderClass() {
      if (this.isWin) return 'bg-success text-white';
      if (this.isLose) return 'bg-danger text-white';
      return 'bg-secondary text-white';
    },
    liveTeamScores() {
      const ts = this.gameState?.teamScores;
      let A = 0;
      let B = 0;
      if (ts && (ts.A != null || ts.B != null)) {
        A = ts.A ?? 0;
        B = ts.B ?? 0;
      } else {
        (this.gameState?.board?.playerOrder || []).forEach((pid: string) => {
          const meta = this.getPlayerFromId(pid);
          const total = this.gameState?.board?.players?.[pid]?.score?.total ?? 0;
          if (meta?.team === TeamId.A) A += total;
          if (meta?.team === TeamId.B) B += total;
        });
      }
      const mine = this.getPlayerFromId(this.selfId)?.team;
      if (!this.isSpectator && mine === TeamId.B) {
        return { A: B, B: A };
      }
      return { A, B };
    },
    matchSummary() {
      if (!this.showTeamScores) return null;
      const { A, B } = this.liveTeamScores;
      const result = this.gameState?.matchResult;
      let title = this.$t('ui.score.draw');
      if (result === MatchResult.TEAM_A_WIN) title = this.$t('ui.score.team_a_win');
      if (result === MatchResult.TEAM_B_WIN) title = this.$t('ui.score.team_b_win');
      if (result === MatchResult.CASUAL_END) title = this.$t('ui.score.game_over');
      return {
        title,
        detail: this.$t('ui.score.team_totals', { a: A, b: B }),
      };
    },
    endScoreRows() {
      const order = this.gameState?.board?.playerOrder || [];
      return order.map((pid: string) => {
        const meta = this.getPlayerFromId(pid);
         const board = this.gameState?.board?.players?.[pid];
        let team = '';
        if (meta?.team === TeamId.A) team = 'A';
        if (meta?.team === TeamId.B) team = 'B';
        return {
          id: pid,
          name: meta?.username || pid,
          isSelf: pid === this.selfId,
          isAi: Boolean(meta?.isAi),
          team,
          total: board?.score?.total ?? 0,
        };
      }).sort((a: any, b: any) => b.total - a.total);
    },
  },
});
</script>
