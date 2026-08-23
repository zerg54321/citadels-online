import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { GameProgress, ClientGameState } from 'citadels-common';
import adminApi from '@/api/admin';
import type { ReplayChatEntry } from '@/api/matches';
import { cn } from '@/utils/cn';
import GodViewBoard, { ObTopBar } from './GodViewBoard';

const ADMIN_TOKEN_KEY = 'adminToken';
const SPEEDS = [400, 1000, 2200];

function parseFrame(frame: unknown): ClientGameState | null {
  if (frame === null || typeof frame !== 'object') return null;
  const d = frame as Record<string, any>;
  const board = (d.board === null || typeof d.board !== 'object') ? {} : d.board;
  return {
    progress: d.progress,
    gameMode: d.gameMode,
    players: d.players,
    self: d.self,
    board: { ...board, players: board.players ?? {} },
    settings: d.settings,
    turnDeadlineAt: d.turnDeadlineAt ?? null,
    teamScores: d.teamScores,
    matchResult: d.matchResult,
    lastRoundSummary: d.lastRoundSummary ?? null,
    roundNumber: typeof d.roundNumber === 'number' ? d.roundNumber : 1,
    lobbyPlayerOrder: d.lobbyPlayerOrder || [],
    lobbySeats: Array.isArray(d.lobbySeats) ? d.lobbySeats : [],
    actionFeed: d.actionFeed || [],
  };
}

function findPrevRound(frames: ClientGameState[], idx: number): number {
  const cur = frames[idx]?.roundNumber;
  for (let i = idx - 1; i >= 0; i -= 1) {
    if (frames[i].roundNumber !== cur) return i;
  }
  return 0;
}

function findNextRound(frames: ClientGameState[], idx: number): number {
  const cur = frames[idx]?.roundNumber;
  for (let i = idx + 1; i < frames.length; i += 1) {
    if (frames[i].roundNumber !== cur) return i;
  }
  return frames.length - 1;
}

// Admin match replay: step through persisted god-view frames with full
// playback control (play/pause, step & round fast-forward/rewind, speed).
export default function ObReplayScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { matchId } = useParams<{ matchId: string }>();

  const [frames, setFrames] = useState<ClientGameState[]>([]);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [speed, setSpeed] = useState(1000);
  const [chatLog, setChatLog] = useState<ReplayChatEntry[]>([]);
  const [frameOffset, setFrameOffset] = useState(0);

  const framesRef = useRef<ClientGameState[]>([]);
  const idxRef = useRef(0);

  const goto = useCallback((n: number) => {
    const max = Math.max(0, framesRef.current.length - 1);
    const clamped = Math.max(0, Math.min(max, n));
    idxRef.current = clamped;
    setIdx(clamped);
    setPlaying(false);
  }, []);

  // load replay frames (paginated, so a large match isn't fetched at once)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      const token = localStorage.getItem(ADMIN_TOKEN_KEY);
      if (!token) {
        if (!cancelled) { setError(t('ui.admin.token_required')); setLoading(false); }
        return;
      }
      try {
        const PAGE = 200;
        // Sequential loop triggers the no-await-in-loop rule; fetch pages in
        // two stages instead: read the total from the first page, then fetch
        // any remaining pages in parallel and keep them in order.
        const first = await adminApi.replay(token, matchId || '', PAGE, 0);
        const totals = typeof first.total === 'number' ? first.total : (first.frames || []).length;
        const pageCount = Math.max(1, Math.ceil(totals / PAGE));
        const pages = await Promise.all(
          Array.from({ length: pageCount }, (_, i) => adminApi.replay(token, matchId || '', PAGE, i * PAGE)),
        );
        if (cancelled) return;
        const all: ClientGameState[] = [];
        pages.forEach((p) => {
          const parsed = (p.frames || [])
            .map(parseFrame)
            .filter((f): f is ClientGameState => f !== null);
          all.push(...parsed);
        });
        framesRef.current = all;
        setFrames(all);
        setChatLog(first.chatLog || []);
        setFrameOffset(typeof first.frameOffset === 'number' ? first.frameOffset : 0);
        idxRef.current = 0;
        setIdx(0);
        setPlaying(false);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchId]);

  // keep refs in sync so the interval closure always sees current frames/index
  framesRef.current = frames;
  idxRef.current = idx;

  // autoplay advance
  useEffect(() => {
    if (!playing) return undefined;
    const id = window.setInterval(() => {
      if (idxRef.current + 1 >= framesRef.current.length) {
        setPlaying(false);
        return;
      }
      setIdx((i) => {
        const next = Math.min(i + 1, framesRef.current.length - 1);
        idxRef.current = next;
        return next;
      });
    }, speed);
    return () => window.clearInterval(id);
  }, [playing, speed]);

  const gs = frames[idx];
  // chat messages that have arrived by the current frame (absolute frame
  // numbers; local index = idx + frameOffset; -1 = pre-first-frame lobby chat)
  const visibleChat = useMemo(() => {
    const currentAbs = idx + frameOffset;
    return chatLog.filter((m) => m.frame === -1 || m.frame <= currentAbs);
  }, [chatLog, idx, frameOffset]);
  const hasPrev = idx > 0;
  const hasNext = idx < frames.length - 1;
  const phaseName = !gs ? '' : gs.progress === GameProgress.FINISHED
    ? t('ui.game.messages.end')
    : gs.board?.gamePhase === 0 ? t('ui.game.phase_initial')
      : gs.board?.gamePhase === 1 ? t('ui.game.phase_choose')
        : t('ui.game.phase_actions');
  const round = gs ? (typeof gs.roundNumber === 'number' ? gs.roundNumber : 1) : 1;

  if (loading) {
    return <div className="ob-screen"><div className="ob-screen__center">{t('ui.loading')}</div></div>;
  }

  if (error) {
    return (
      <div className="ob-screen">
        <div className="ob-screen__center ob-screen__center--error">
          <p>{error}</p>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => navigate('/admin')}>
            {t('ui.admin.back')}
          </button>
        </div>
      </div>
    );
  }

  if (!gs) {
    return <div className="ob-screen"><div className="ob-screen__center">{t('ui.feature_unavailable')}</div></div>;
  }

  return (
    <div className="ob-screen">
      <ObTopBar
        brand={t('ui.title')}
        round={round}
        phaseName={phaseName}
        scoreA={gs.teamScores?.A ?? 0}
        scoreB={gs.teamScores?.B ?? 0}
        onBack={() => navigate('/admin')}
        backLabel={t('ui.admin.back')}
      />

      <GodViewBoard gs={gs} chat={visibleChat} />

      <div className="ob-player">
        <button type="button" className="ob-player__btn" title={t('ui.replay.prev_round')} disabled={!hasPrev} onClick={() => goto(findPrevRound(frames, idx))}>⏮</button>
        <button type="button" className="ob-player__btn" title={t('ui.replay.step_back')} disabled={!hasPrev} onClick={() => goto(idx - 1)}>◀</button>
        <button
          type="button"
          className="ob-player__btn ob-player__btn--primary"
          title={playing ? t('ui.replay.pause') : t('ui.replay.play')}
          onClick={() => {
            if (playing) { setPlaying(false); return; }
            if (!hasNext) goto(0);
            setPlaying(true);
          }}
        >
          {playing ? '⏸' : '▶'}
        </button>
        <button type="button" className="ob-player__btn" title={t('ui.replay.step_forward')} disabled={!hasNext} onClick={() => goto(idx + 1)}>▶</button>
        <button type="button" className="ob-player__btn" title={t('ui.replay.next_round')} disabled={!hasNext} onClick={() => goto(findNextRound(frames, idx))}>⏭</button>

        <input
          className="ob-player__slider"
          type="range"
          min={0}
          max={Math.max(0, frames.length - 1)}
          value={idx}
          onChange={(e) => goto(Number(e.target.value))}
        />
        <span className="ob-player__pos">{idx + 1} / {frames.length}</span>
        <div className="ob-player__speed" role="group" title={t('ui.replay.speed')}>
          {SPEEDS.map((ms) => (
            <button
              key={ms}
              type="button"
              className={cn('ob-player__speed-btn', speed === ms && 'is-active')}
              onClick={() => setSpeed(ms)}
            >
              {ms / 1000}×
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
