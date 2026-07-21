import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { GameMode, MatchResult, TeamId } from 'citadels-common';
import { useAppStore } from '@/store';
import statsApi, { type MyMatchItem, type RankingRow } from '@/api/stats';

// Mirrors Vue StatsScreen.vue. Vue data() (tab/loading/error/matches/ranking)
// → useState. Vue computed (isLoggedIn/authToken) → store hooks. Vue watch
// (tab/isLoggedIn) → useEffect that re-runs load. Vue mounted → initial load.
export default function StatsScreen() {
  const { t } = useTranslation();
  const isLoggedIn = Boolean(useAppStore((s) => s.authToken && s.authUser));
  const authToken = useAppStore((s) => s.authToken);

  const [tab, setTab] = useState<'history' | 'ranking'>('history');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [matches, setMatches] = useState<MyMatchItem[]>([]);
  const [ranking, setRanking] = useState<RankingRow[]>([]);

  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const teamName = (team: number) => {
    if (team === TeamId.A) return t('ui.team.a');
    if (team === TeamId.B) return t('ui.team.b');
    return '—';
  };

  const resultLabel = (m: MyMatchItem) => {
    if (m.gameMode === GameMode.COMPETITIVE_TEAM6) {
      if (m.matchResult === MatchResult.DRAW) return t('ui.score.draw');
      if (m.teamWon) {
        return m.rankedWinEligible
          ? t('ui.stats.win')
          : t('ui.stats.win_no_rank');
      }
      if (m.matchResult === MatchResult.TEAM_A_WIN || m.matchResult === MatchResult.TEAM_B_WIN) {
        return t('ui.stats.loss');
      }
    }
    return t('ui.stats.finished');
  };

  // Vue watch tab/isLoggedIn → load. Vue mounted → load. Mirror with one
  // effect keyed on tab + isLoggedIn so any change re-fetches.
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        if (tab === 'ranking') {
          const res = await statsApi.ranking();
          if (!cancelled) setRanking(res.ranking || []);
        } else if (isLoggedIn && authToken) {
          const res = await statsApi.myMatches(authToken);
          if (!cancelled) setMatches(res.matches || []);
        } else {
          if (!cancelled) setMatches([]);
        }
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [tab, isLoggedIn, authToken]);

  const resultKind = (m: MyMatchItem): 'win' | 'loss' | 'draw' | 'done' => {
    if (m.gameMode === GameMode.COMPETITIVE_TEAM6) {
      if (m.matchResult === MatchResult.DRAW) return 'draw';
      if (m.teamWon) return 'win';
      if (m.matchResult === MatchResult.TEAM_A_WIN || m.matchResult === MatchResult.TEAM_B_WIN) return 'loss';
    }
    return 'done';
  };

  return (
    <div className="container py-4 stats-screen">
      <div className="stats-screen__head">
        <h3 className="stats-screen__title">{t('ui.stats.title')}</h3>
      </div>

      <div className="stats-tabs">
        <button
          type="button"
          className={`stats-tabs__btn${tab === 'history' ? ' stats-tabs__btn--active' : ''}`}
          onClick={() => setTab('history')}
        >
          {t('ui.stats.my_matches')}
        </button>
        <button
          type="button"
          className={`stats-tabs__btn${tab === 'ranking' ? ' stats-tabs__btn--active' : ''}`}
          onClick={() => setTab('ranking')}
        >
          {t('ui.stats.ranking')}
        </button>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <div className="stats-screen__loading">{t('ui.loading')}</div>}

      {!loading && tab === 'history' && (
        <>
          {!isLoggedIn && <div className="stats-screen__empty">{t('ui.stats.login_for_history')}</div>}
          {isLoggedIn && matches.length === 0 && <div className="stats-screen__empty">{t('ui.stats.no_matches')}</div>}
          {isLoggedIn && matches.length > 0 && (
            <div className="stats-table">
              <div className="stats-table__head">
                <span>{t('ui.stats.ended_at')}</span>
                <span>{t('ui.stats.mode')}</span>
                <span>{t('ui.stats.team')}</span>
                <span>{t('ui.stats.personal')}</span>
                <span>{t('ui.stats.team_scores')}</span>
                <span>{t('ui.stats.result')}</span>
              </div>
              {matches.map((m) => (
                <div className="stats-table__row" key={m.matchId}>
                  <span className="stats-table__cell--time">{formatTime(m.endedAt)}</span>
                  <span>
                    <span className={`stats-badge stats-badge--${m.ranked ? 'ranked' : 'casual'}`}>
                      {m.ranked ? t('ui.stats.ranked') : t('ui.stats.casual')}
                    </span>
                  </span>
                  <span className="stats-table__cell--team">{teamName(m.team)}</span>
                  <span className="stats-table__cell--score">{m.personalScore}</span>
                  <span className="stats-table__cell--teamscore">
                    {m.teamScoreA != null ? `A ${m.teamScoreA} · B ${m.teamScoreB}` : '—'}
                  </span>
                  <span>
                    <span className={`stats-result stats-result--${resultKind(m)}`}>
                      {resultLabel(m)}
                    </span>
                  </span>
                </div>
              ))}
            </div>
          )}
        </>
      )}

      {!loading && tab === 'ranking' && (
        <>
          <p className="stats-screen__hint">{t('ui.stats.ranking_hint')}</p>
          {ranking.length === 0 && <div className="stats-screen__empty">{t('ui.stats.no_ranking')}</div>}
          {ranking.length > 0 && (
            <div className="stats-table">
              <div className="stats-table__head stats-table__head--rank">
                <span>#</span>
                <span>{t('ui.stats.player')}</span>
                <span>{t('ui.stats.wins')}</span>
                <span>{t('ui.stats.games')}</span>
                <span>{t('ui.stats.losses')}</span>
                <span>{t('ui.stats.draws')}</span>
              </div>
              {ranking.map((r, i) => (
                <div
                  className={`stats-table__row stats-table__row--rank${i < 3 ? ` stats-table__row--top${i + 1}` : ''}`}
                  key={r.userId}
                >
                  <span className="stats-table__cell--rank">{i + 1}</span>
                  <span className="stats-table__cell--player">{r.displayName}</span>
                  <span><strong className="stats-table__strong">{r.rankedWins}</strong></span>
                  <span>{r.rankedGames}</span>
                  <span>{r.rankedLosses}</span>
                  <span>{r.rankedDraws}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
