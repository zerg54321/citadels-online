import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GameMode, MatchResult } from 'citadels-common';
import matchesApi, { type PublicMatchItem } from '@/api/matches';

// Public replay library. Lists every FINISHED match (server stores replay
// frames at match end) and links to the first-person replay viewer. By
// default AI matches are hidden (replays are for analyzing human games);
// the checkbox opts them in. Private matches (is_public=0, future room
// setting) are filtered server-side.
export default function ReplayListScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const PAGE_SIZE = 20;
  const [includeAi, setIncludeAi] = useState(false);
  const [page, setPage] = useState(0);
  const [total, setTotal] = useState(0);
  const [matches, setMatches] = useState<PublicMatchItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const res = await matchesApi.list(includeAi, PAGE_SIZE, page * PAGE_SIZE);
        if (cancelled) return;
        setMatches(res.matches || []);
        setTotal(res.total || 0);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [includeAi, page]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const formatTime = (iso: string) => {
    try {
      return new Date(iso).toLocaleString();
    } catch {
      return iso;
    }
  };

  const resultText = (m: PublicMatchItem) => {
    if (m.match_result === MatchResult.TEAM_A_WIN) return `${t('ui.team.a')} ${t('ui.replay.wins')}`;
    if (m.match_result === MatchResult.TEAM_B_WIN) return `${t('ui.team.b')} ${t('ui.replay.wins')}`;
    if (m.match_result === MatchResult.DRAW) return t('ui.score.draw');
    return '—';
  };

  return (
    <div className="container py-4 replay-list">
      <div className="replay-list__head">
        <h3 className="replay-list__title">{t('ui.replay.library_title')}</h3>
        <label className="replay-list__filter">
          <input
            type="checkbox"
            checked={includeAi}
            onChange={(e) => {
              setIncludeAi(e.target.checked);
              setPage(0);
            }}
          />
          <span>{t('ui.replay.include_ai')}</span>
        </label>
      </div>

      {error && <div className="alert alert-danger">{error}</div>}
      {loading && <div className="replay-list__state">{t('ui.loading')}</div>}

      {!loading && !error && matches.length === 0 && (
        <div className="replay-list__state">{t('ui.replay.empty')}</div>
      )}

      {!loading && matches.length > 0 && (
        <>
          <div className="replay-table">
            <div className="replay-table__head">
              <span>{t('ui.stats.ended_at')}</span>
              <span>{t('ui.stats.mode')}</span>
              <span>{t('ui.stats.team_scores')}</span>
              <span>{t('ui.replay.players')}</span>
              <span>{t('ui.replay.view')}</span>
            </div>
            {matches.map((m) => (
              <button
                type="button"
                key={m.id}
                className="replay-table__row"
                onClick={() => navigate(`/replay/${m.id}`)}
              >
                <span className="replay-table__cell--time">{formatTime(m.ended_at)}</span>
                <span>
                  <span className={`stats-badge stats-badge--${m.ranked ? 'ranked' : 'casual'}`}>
                    {m.ranked ? t('ui.stats.ranked') : t('ui.stats.casual')}
                  </span>
                </span>
                <span className={`replay-table__score${m.game_mode === GameMode.COMPETITIVE_TEAM6 ? '' : ' replay-table__score--na'}`}>
                  {m.game_mode === GameMode.COMPETITIVE_TEAM6 ? (
                    <>
                      <span className="replay-table__score-a">{m.team_score_a ?? 0}</span>
                      <span className="replay-table__score-vs">:</span>
                      <span className="replay-table__score-b">{m.team_score_b ?? 0}</span>
                    </>
                  ) : '—'}
                </span>
                <span className="replay-table__players">
                  {m.players.map((p) => (
                    <span
                      key={p.seat}
                      className={`replay-table__player replay-table__player--${p.team === 0 ? 'a' : 'b'}${p.is_ai ? ' replay-table__player--ai' : ''}`}
                      title={`${p.display_name}${p.is_ai ? ` · ${t('ui.replay.ai_player')}` : ''}`}
                    >
                      {p.display_name}
                    </span>
                  ))}
                  <span className="replay-table__result">{resultText(m)}</span>
                </span>
                <span className="replay-table__btn">{t('ui.replay.view')}</span>
              </button>
            ))}
          </div>

          {totalPages > 1 && (
            <div className="replay-list__pager">
              <button
                type="button"
                className="btn btn-sm btn-outline-gold"
                disabled={page === 0}
                onClick={() => setPage((p) => Math.max(0, p - 1))}
              >
                ‹
              </button>
              <span className="replay-list__pager-info">{page + 1} / {totalPages}</span>
              <button
                type="button"
                className="btn btn-sm btn-outline-gold"
                disabled={page >= totalPages - 1}
                onClick={() => setPage((p) => Math.min(totalPages - 1, p + 1))}
              >
                ›
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
