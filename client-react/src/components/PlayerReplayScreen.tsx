import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  ClientGameState,
  derivePlayerView,
  getTableSlots,
  GameProgress,
  type DistrictId,
  type PlayerId,
} from 'citadels-common';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store';
import { avatarUrl } from '@/utils/avatarUrl';
import matchesApi, { type ReplayChatEntry } from '@/api/matches';
import Emoji from '@/components/common/Emoji';
import SeatPanel from './game/elements/SeatPanel';
import PlayerHand from './game/elements/PlayerHand';
import DistrictCard from './game/elements/DistrictCard';
import CharacterCard from './game/elements/CharacterCard';
import CenterPanel from './game/CenterPanel';
import { ObTopBar, ObLog } from './game/GodViewBoard';

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

// Public first-person replay viewer. Loads a match's stored god-view frames,
// then derives the SELECTED player's own view per frame (derivePlayerView —
// same information-hiding rules the server applies live, verified by a
// server-side golden test). Switch seats any time to re-analyze the game
// from another player's perspective; the board itself is fully read-only.
//
// The derived frame is INJECTED into the app store while this screen is
// mounted so the shared game components (SeatPanel / CenterPanel /
// PlayerHand) render exactly as they do live — routes are mutually
// exclusive with /room, so a real game session can never be clobbered, and
// the previous store value is restored on unmount.
export default function PlayerReplayScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { matchId } = useParams<{ matchId: string }>();

  const [frames, setFrames] = useState<ClientGameState[]>([]);
  const [chatLog, setChatLog] = useState<ReplayChatEntry[]>([]);
  const [frameOffset, setFrameOffset] = useState(0);
  const [idx, setIdx] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [speed, setSpeed] = useState(1000);
  const [seatId, setSeatId] = useState<PlayerId>('');

  const framesRef = useRef<ClientGameState[]>([]);
  const idxRef = useRef(0);

  const goto = useCallback((n: number) => {
    const max = Math.max(0, framesRef.current.length - 1);
    const clamped = Math.max(0, Math.min(max, n));
    idxRef.current = clamped;
    setIdx(clamped);
    setPlaying(false);
  }, []);

  // load all replay frames (paginated server-side)
  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      setError('');
      try {
        const PAGE = 500;
        const first = await matchesApi.replay(matchId || '', PAGE, 0);
        if (cancelled) return;
        const total = typeof first.total === 'number' ? first.total : first.frames.length;
        const pageCount = Math.max(1, Math.ceil(total / PAGE));
        const pages = await Promise.all(
          Array.from({ length: pageCount }, (_, i) => matchesApi.replay(matchId || '', PAGE, i * PAGE)),
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
        // chat archive + absolute frame of the first frame (chat.frame is
        // absolute; local index = chat.frame - frameOffset)
        setChatLog(first.chatLog || []);
        setFrameOffset(typeof first.frameOffset === 'number' ? first.frameOffset : 0);
        idxRef.current = 0;
        setIdx(0);
        setPlaying(false);
        // default perspective: first lobby seat
        const firstSeat = all[0]?.lobbyPlayerOrder?.[0] || all[0]?.board?.playerOrder?.[0] || '';
        setSeatId(firstSeat);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    load();
    return () => { cancelled = true; };
  }, [matchId]);

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

  const godFrame = frames[idx];
  // the selected player's first-person view of the current frame
  const derived = useMemo(
    () => (godFrame && seatId ? derivePlayerView(godFrame, seatId) : undefined),
    [godFrame, seatId],
  );

  // Chat messages that have "arrived" by the current frame. chat.frame is an
  // ABSOLUTE number; the local index of the current frame is idx + frameOffset
  // (frameOffset = absolute number of frames[0]). Messages stamped -1 (sent
  // before the first frame, e.g. lobby chatter) always show.
  const visibleChat = useMemo(() => {
    const currentAbs = idx + frameOffset;
    return chatLog.filter((m) => m.frame === -1 || m.frame <= currentAbs);
  }, [chatLog, idx, frameOffset]);

  // inject derived view into the store for the shared game components;
  // restore the previous value on unmount (usually undefined — replays and
  // live rooms are on mutually exclusive routes)
  useEffect(() => {
    if (!derived) return undefined;
    const prev = useAppStore.getState().gameState;
    useAppStore.setState({ gameState: derived });
    return () => {
      useAppStore.setState({ gameState: prev });
    };
  }, [derived]);

  // seat switcher follows the stable lobby order (never rearranges)
  const seatOrder = useMemo(() => {
    const lobby = godFrame?.lobbyPlayerOrder || [];
    const order = godFrame?.board?.playerOrder || [];
    const missing = order.filter((id) => !lobby.includes(id));
    return [...lobby, ...missing];
  }, [godFrame]);

  const phaseName = useMemo(() => {
    if (!godFrame) return '';
    if (godFrame.progress === GameProgress.FINISHED) return t('ui.game.messages.end');
    if (godFrame.board?.gamePhase === 0) return t('ui.game.phase_initial');
    if (godFrame.board?.gamePhase === 1) return t('ui.game.phase_choose');
    return t('ui.game.phase_actions');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [godFrame]);

  const round = godFrame ? (typeof godFrame.roundNumber === 'number' ? godFrame.roundNumber : 1) : 1;

  if (loading) {
    return <div className="ob-screen"><div className="ob-screen__center">{t('ui.loading')}</div></div>;
  }

  if (error) {
    return (
      <div className="ob-screen">
        <div className="ob-screen__center ob-screen__center--error">
          <p>{error}</p>
          <button type="button" className="admin-btn admin-btn--ghost" onClick={() => navigate('/replays')}>
            {t('ui.replay.back_list')}
          </button>
        </div>
      </div>
    );
  }

  if (!godFrame || !derived) {
    return <div className="ob-screen"><div className="ob-screen__center">{t('ui.feature_unavailable')}</div></div>;
  }

  const hasPrev = idx > 0;
  const hasNext = idx < frames.length - 1;
  const currentPlayerId = derived.board.playerOrder[derived.board.currentPlayer];

  return (
    <div className="ob-screen replay-screen">
      <ObTopBar
        brand={t('ui.replay.library_title')}
        round={round}
        phaseName={phaseName}
        scoreA={godFrame.teamScores?.A ?? 0}
        scoreB={godFrame.teamScores?.B ?? 0}
        onBack={() => navigate('/replays')}
        backLabel={t('ui.replay.back_list')}
      >
        {/* perspective switcher — the heart of replay analysis: watch the
            same moment from any seat. Lives INSIDE the topbar (after the
            team score) instead of its own strip, keeping one banner. Stable
            lobby order; crown marks the king, dot marks the acting player. */}
        <div className="replay-seats" role="group" title={t('ui.replay.perspective')}>
          {seatOrder.map((pid) => {
            const p = godFrame.players[pid];
            if (!p) return null;
            const isKing = godFrame.board?.playerOrder?.[0] === pid;
            const isActing = pid === currentPlayerId;
            return (
              <button
                key={pid}
                type="button"
                className={cn(
                  'replay-seats__btn',
                  pid === seatId && 'is-active',
                  isActing && 'is-acting',
                )}
                onClick={() => setSeatId(pid)}
              >
                {p.avatar && <img src={avatarUrl(p.avatar)} alt="" className="replay-seats__avatar" />}
                <span className="replay-seats__name">{p.username}</span>
                {isKing && <span className="replay-seats__crown" title={t('ui.game.crown_holder')}>👑</span>}
                {isActing && <span className="replay-seats__acting-dot" />}
              </button>
            );
          })}
        </div>
      </ObTopBar>

      <ReplayBoard derived={derived} chat={visibleChat} />

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

// Read-only first-person board — the live BoardScreen layout (5 opponent
// seats around, own panel at bottom) with every interaction stripped: no
// move buttons, no countdown, no endgame modal. Interaction components read
// the injected store state (player meta, current actor) via their own hooks.
function ReplayBoard({ derived, chat }: { derived: ClientGameState; chat: ReplayChatEntry[] }) {
  const { t } = useTranslation();
  const { self } = derived;
  // replay board is always a player view (god view is admin-only)
  const isSpectator = false;

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const tableSlots = useMemo(() => getTableSlots(derived, isSpectator), [derived]);

  const selfBoard = useMemo(() => {
    const board = derived.board.players[self] as Record<string, unknown> | undefined;
    return {
      stash: 0,
      hand: [],
      tmpHand: [],
      city: [],
      score: {},
      characters: [],
      ...(board || {}),
      crown: (derived.board?.playerOrder?.[0] ?? '') === self,
    };
  }, [derived, self]);

  const selfName = derived.players[self]?.username || 'You';
  const selfPickOrder = useMemo(() => {
    const order = derived.board?.playerOrder || [];
    const i = order.indexOf(self);
    return i >= 0 ? i + 1 : 0;
  }, [derived.board?.playerOrder, self]);

  const selfCity = (selfBoard.city || []) as Array<DistrictId | null>;

  const selfRoleCard = useMemo(() => {
    const chars = (selfBoard.characters || []) as Array<{ id: number; faceDown?: boolean; killed?: boolean; robbed?: boolean }>;
    const revealed = chars.find((c) => c.id > 0);
    if (revealed) {
      return {
        show: true,
        id: revealed.id,
        faceDown: false,
        killed: Boolean(revealed.killed),
        robbed: Boolean(revealed.robbed),
      };
    }
    return {
      show: true,
      id: 0,
      faceDown: true,
      killed: false,
      robbed: false,
    };
  }, [selfBoard]);

  const gameProgressStr = derived.progress === GameProgress.FINISHED ? 'FINISHED' : 'IN_GAME';
  const isCurrentPlayerSelf = derived.board.playerOrder[derived.board.currentPlayer] === self;

  return (
    <div className="replay-layout">
      <div className="board-table replay-layout__board">
        <div className="board-table__bg" />
        <div className="board-table__stage">
          {tableSlots.map((slot) => (
            <div key={slot.playerId} className={`board-table__slot board-table__slot--${slot.pos}`}>
              <SeatPanel
                playerId={slot.playerId}
                board={slot.board}
                pickOrder={slot.pickOrder}
                stash={0}
                relation={slot.relation}
                isSpectator={isSpectator}
              />
            </div>
          ))}

          <CenterPanel
            gameProgress={gameProgressStr}
            charactersList={derived.board.characters || {}}
            gameState={derived}
            killMode={false}
            robMode={false}
            chooseCharacterMode={false}
            countdownText="—"
          />

          <div className="board-table__slot board-table__slot--self">
            <div className="board-table__self-wrap">
              <div className={`board-table__self-panel${gameProgressStr === 'IN_GAME' && isCurrentPlayerSelf ? ' board-table__self-panel--acting' : ''}`}>
                <div className="board-table__self-banner">
                  <span className="board-table__self-pick">{selfPickOrder}</span>
                  <span className="text-truncate flex-fill board-table__self-name">{selfName}</span>
                  <span className="seat-panel__chip seat-panel__chip--gold" title={t('ui.game.stat_gold')}>
                    <span className="seat-panel__chip-icon"><Emoji emoji="🪙" /></span>
                    <span className="seat-panel__chip-val">{(selfBoard.stash as number) ?? 0}</span>
                  </span>
                  <span className="seat-panel__chip seat-panel__chip--hand" title={t('ui.game.stat_hand')}>
                    <span className="card-back-icon" />
                    <span className="seat-panel__chip-val">{(selfBoard.hand || []).length}</span>
                  </span>
                  <span className="seat-panel__chip seat-panel__chip--score" title={t('ui.game.stat_score')}>
                    <span className="seat-panel__chip-icon">⭐</span>
                    <span className="seat-panel__chip-val">{(selfBoard.score as { total?: number } | undefined)?.total ?? 0}</span>
                  </span>
                  {(selfBoard as { crown?: boolean }).crown && (
                    <span className="seat-panel__crown" title={t('ui.game.crown_holder')}>👑</span>
                  )}
                  <span className="seat-panel__tag">{t('ui.lobby.you')}</span>
                </div>
                <div className="board-table__self-body">
                  {(selfBoard.tmpHand || []).length > 0 && selfCity.length === 0 ? (
                    <div className="tmp-hand-pick">
                      <span className="tmp-hand-pick__hint">{t('ui.game.messages.choose_card_prompt')}</span>
                      <div className="tmp-hand-pick__cards">
                        {(selfBoard.tmpHand || []).map((id: string, i: number) => id && (
                          <div key={i} className="tmp-hand-pick__slot">
                            <DistrictCard districtId={id as DistrictId} />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="board-table__self-city">
                        {selfCity.map((id, i) => id && <DistrictCard key={`city-${i}`} districtId={id} small />)}
                        {!selfCity.length && <div className="seat-panel__city-empty">{t('ui.game.no_buildings')}</div>}
                      </div>
                      {(selfBoard.tmpHand || []).length > 0 && selfCity.length > 0 && (
                        <div className="tmp-hand-pick tmp-hand-pick--body">
                          <span className="tmp-hand-pick__hint">{t('ui.game.messages.choose_card_prompt')}</span>
                          <div className="tmp-hand-pick__cards">
                            {(selfBoard.tmpHand || []).map((id: string, i: number) => id && (
                              <div key={i} className="tmp-hand-pick__slot">
                                <DistrictCard districtId={id as DistrictId} />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="board-table__self-role">
                        {selfRoleCard.show && (
                          <CharacterCard
                            characterId={selfRoleCard.id}
                            faceDown={selfRoleCard.faceDown}
                            killed={selfRoleCard.killed}
                            robbed={selfRoleCard.robbed}
                            size="medium"
                          />
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="board-table__self-hand">
                  <PlayerHand board={selfBoard as Parameters<typeof PlayerHand>[0]['board']} />
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="replay-layout__log">
        <ObLog feed={derived.actionFeed || []} chat={chat} />
      </div>
    </div>
  );
}
