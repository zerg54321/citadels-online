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

  return (
    <div className="container py-4">
      <h3 className="mb-3">{t('ui.stats.title')}</h3>

      <ul className="nav nav-tabs mb-3">
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link${tab === 'history' ? ' active' : ''}`}
            onClick={() => setTab('history')}
          >
            {t('ui.stats.my_matches')}
          </button>
        </li>
        <li className="nav-item">
          <button
            type="button"
            className={`nav-link${tab === 'ranking' ? ' active' : ''}`}
            onClick={() => setTab('ranking')}
          >
            {t('ui.stats.ranking')}
          </button>
        </li>
      </ul>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <div className="text-muted">{t('ui.loading')}</div>}

      {!loading && tab === 'history' && (
        <>
          {!isLoggedIn && <p className="text-muted">{t('ui.stats.login_for_history')}</p>}
          {isLoggedIn && matches.length === 0 && <div className="text-muted">{t('ui.stats.no_matches')}</div>}
          {isLoggedIn && matches.length > 0 && (
            <div className="table-responsive">
              <table className="table table-sm table-striped bg-white">
                <thead>
                  <tr>
                    <th>{t('ui.stats.ended_at')}</th>
                    <th>{t('ui.stats.mode')}</th>
                    <th>{t('ui.stats.team')}</th>
                    <th>{t('ui.stats.personal')}</th>
                    <th>{t('ui.stats.team_scores')}</th>
                    <th>{t('ui.stats.result')}</th>
                  </tr>
                </thead>
                <tbody>
                  {matches.map((m) => (
                    <tr key={m.matchId}>
                      <td>{formatTime(m.endedAt)}</td>
                      <td>
                        <span className={`badge ${m.ranked ? 'badge-primary' : 'badge-secondary'}`}>
                          {m.ranked ? t('ui.stats.ranked') : t('ui.stats.casual')}
                        </span>
                      </td>
                      <td>{teamName(m.team)}</td>
                      <td>{m.personalScore}</td>
                      <td>{m.teamScoreA != null ? `A ${m.teamScoreA} · B ${m.teamScoreB}` : '—'}</td>
                      <td>{resultLabel(m)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {!loading && tab === 'ranking' && (
        <>
          <p className="small text-muted">{t('ui.stats.ranking_hint')}</p>
          {ranking.length === 0 && <div className="text-muted">{t('ui.stats.no_ranking')}</div>}
          {ranking.length > 0 && (
            <div className="table-responsive">
              <table className="table table-sm table-striped bg-white">
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t('ui.stats.player')}</th>
                    <th>{t('ui.stats.wins')}</th>
                    <th>{t('ui.stats.games')}</th>
                    <th>{t('ui.stats.losses')}</th>
                    <th>{t('ui.stats.draws')}</th>
                  </tr>
                </thead>
                <tbody>
                  {ranking.map((r, i) => (
                    <tr key={r.userId}>
                      <td>{i + 1}</td>
                      <td>{r.displayName}</td>
                      <td><strong>{r.rankedWins}</strong></td>
                      <td>{r.rankedGames}</td>
                      <td>{r.rankedLosses}</td>
                      <td>{r.rankedDraws}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </div>
  );
}
