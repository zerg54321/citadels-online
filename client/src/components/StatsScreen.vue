<template>
<div class="container py-4">
  <h3 class="mb-3">{{ $t('ui.stats.title') }}</h3>

  <ul class="nav nav-tabs mb-3">
    <li class="nav-item">
      <a
        class="nav-link"
        href="#"
        :class="{ active: tab === 'history' }"
        @click.prevent="tab = 'history'"
      >{{ $t('ui.stats.my_matches') }}</a>
    </li>
    <li class="nav-item">
      <a
        class="nav-link"
        href="#"
        :class="{ active: tab === 'ranking' }"
        @click.prevent="tab = 'ranking'"
      >{{ $t('ui.stats.ranking') }}</a>
    </li>
  </ul>

  <div v-if="error" class="alert alert-danger">{{ error }}</div>
  <div v-if="loading" class="text-muted">{{ $t('ui.loading') }}</div>

  <div v-else-if="tab === 'history'">
    <p v-if="!isLoggedIn" class="text-muted">{{ $t('ui.stats.login_for_history') }}</p>
    <div v-else-if="matches.length === 0" class="text-muted">{{ $t('ui.stats.no_matches') }}</div>
    <div v-else class="table-responsive">
      <table class="table table-sm table-striped bg-white">
        <thead>
          <tr>
            <th>{{ $t('ui.stats.ended_at') }}</th>
            <th>{{ $t('ui.stats.mode') }}</th>
            <th>{{ $t('ui.stats.team') }}</th>
            <th>{{ $t('ui.stats.personal') }}</th>
            <th>{{ $t('ui.stats.team_scores') }}</th>
            <th>{{ $t('ui.stats.result') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in matches" :key="m.matchId">
            <td>{{ formatTime(m.endedAt) }}</td>
            <td>
              <span class="badge" :class="m.ranked ? 'badge-primary' : 'badge-secondary'">
                {{ m.ranked ? $t('ui.stats.ranked') : $t('ui.stats.casual') }}
              </span>
            </td>
            <td>{{ teamName(m.team) }}</td>
            <td>{{ m.personalScore }}</td>
            <td v-if="m.teamScoreA != null">A {{ m.teamScoreA }} · B {{ m.teamScoreB }}</td>
            <td v-else>—</td>
            <td>{{ resultLabel(m) }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>

  <div v-else>
    <p class="small text-muted">{{ $t('ui.stats.ranking_hint') }}</p>
    <div v-if="ranking.length === 0" class="text-muted">{{ $t('ui.stats.no_ranking') }}</div>
    <div v-else class="table-responsive">
      <table class="table table-sm table-striped bg-white">
        <thead>
          <tr>
            <th>#</th>
            <th>{{ $t('ui.stats.player') }}</th>
            <th>{{ $t('ui.stats.wins') }}</th>
            <th>{{ $t('ui.stats.games') }}</th>
            <th>{{ $t('ui.stats.losses') }}</th>
            <th>{{ $t('ui.stats.draws') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(r, i) in ranking" :key="r.userId">
            <td>{{ i + 1 }}</td>
            <td>{{ r.displayName }}</td>
            <td><strong>{{ r.rankedWins }}</strong></td>
            <td>{{ r.rankedGames }}</td>
            <td>{{ r.rankedLosses }}</td>
            <td>{{ r.rankedDraws }}</td>
          </tr>
        </tbody>
      </table>
    </div>
  </div>
</div>
</template>

<script lang="ts">
import { defineComponent } from 'vue';
import { mapGetters } from 'vuex';
import { GameMode, MatchResult, TeamId } from 'citadels-common';
import statsApi, { MyMatchItem, RankingRow } from '../api/stats';
import { store } from '../store';

export default defineComponent({
  name: 'StatsScreen',
  data() {
    return {
      tab: 'history' as 'history' | 'ranking',
      loading: false,
      error: '',
      matches: [] as MyMatchItem[],
      ranking: [] as RankingRow[],
    };
  },
  computed: {
    ...mapGetters(['isLoggedIn', 'authToken']),
  },
  watch: {
    tab() {
      this.load();
    },
    isLoggedIn() {
      if (this.tab === 'history') this.load();
    },
  },
  methods: {
    formatTime(iso: string) {
      try {
        return new Date(iso).toLocaleString();
      } catch {
        return iso;
      }
    },
    teamName(team: number) {
      if (team === TeamId.A) return this.$t('ui.team.a');
      if (team === TeamId.B) return this.$t('ui.team.b');
      return '—';
    },
    resultLabel(m: MyMatchItem) {
      if (m.gameMode === GameMode.COMPETITIVE_TEAM6) {
        if (m.matchResult === MatchResult.DRAW) return this.$t('ui.score.draw');
        if (m.teamWon) {
          return m.rankedWinEligible
            ? this.$t('ui.stats.win')
            : this.$t('ui.stats.win_no_rank');
        }
        if (m.matchResult === MatchResult.TEAM_A_WIN || m.matchResult === MatchResult.TEAM_B_WIN) {
          return this.$t('ui.stats.loss');
        }
      }
      return this.$t('ui.stats.finished');
    },
    async load() {
      this.loading = true;
      this.error = '';
      try {
        if (this.tab === 'ranking') {
          const res = await statsApi.ranking();
          this.ranking = res.ranking || [];
        } else if (this.isLoggedIn && this.authToken) {
          const res = await statsApi.myMatches(this.authToken);
          this.matches = res.matches || [];
        } else {
          this.matches = [];
        }
      } catch (e: any) {
        this.error = e?.message || String(e);
      } finally {
        this.loading = false;
      }
    },
  },
  mounted() {
    this.load();
  },
});
</script>
