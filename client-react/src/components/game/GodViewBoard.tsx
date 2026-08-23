import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClientGameState,
  formatActionFeedLine,
  getTableSlots,
  PlayerRole,
  MatchResult,
  type ActionFeedLine,
} from 'citadels-common';
import { avatarUrl } from '@/utils/avatarUrl';
import { cn } from '@/utils/cn';
import Emoji from '@/components/common/Emoji';
import DistrictCard from './elements/DistrictCard';
import CharacterCard from './elements/CharacterCard';

// Shared god-view board renderer used by both the replay screen and the live
// admin-OB screen.
//
// PC big-screen layout ("around the table"):
//   ┌──────────┬────────────────────────────┬──────────┬──────────────┐
//   │ left: 3  │   CENTER: the table        │ right: 3 │  right side  │
//   │ seats    │   (8 role cards + phase)   │ seats    │  action log  │
//   └──────────┴────────────────────────────┴──────────┴──────────────┘
//
// Each seat REUSES the in-game `.seat-panel` classes (banner gradient, pill
// chips, crown, ally/enemy border glow, acting pulse) so the OB board is
// visually identical to the player board; the only addition is a god-view
// hand strip below the body (all hands revealed, 7:10 aspect, fanned like
// the player's own hand via .district-card-wrapper).
export default function GodViewBoard({
  gs,
  chat = [],
}: {
  gs: ClientGameState;
  chat?: Array<{ playerId: string; username: string; text: string; role?: number; ts?: number }>;
}) {
  const { t } = useTranslation();

  // Seats are PINNED to the stable lobby/entry order (lobbyPlayerOrder — the
  // order seats were taken when the room was created/joined), exactly like
  // the in-game board: seat #1 bottom-left, clockwise up the left column
  // (#2, #3), then down the right column (#4 top, #5, #6). The banner pick
  // numbers and the crown are derived from the live playerOrder, so each
  // round ONLY those move — seats never rearrange when the king changes.
  const seats = useMemo(() => (gs ? getTableSlots(gs, true) : []), [gs]);
  const byPos = (a: { pos: string }, b: { pos: string }) => a.pos.localeCompare(b.pos);
  const leftSeats = seats.filter((s) => s.pos.startsWith('l')).sort(byPos);
  const rightSeats = seats.filter((s) => s.pos.startsWith('r')).sort(byPos);

  const currentChar = ((gs?.board?.characters as { current?: number } | undefined)?.current
    || 0) as number;

  const centerChars = useMemo(() => {
    const callable = (gs?.board?.characters?.callable || []) as Array<{
      id: number; killed?: boolean; robbed?: boolean; faceUp?: boolean; discardedFaceUp?: boolean;
    }>;
    // show all 8 roles read-only; fall back to 1..8 when the grid is empty
    const fallback: Array<{
      id: number; killed?: boolean; robbed?: boolean; faceUp?: boolean; discardedFaceUp?: boolean;
    }> = [1, 2, 3, 4, 5, 6, 7, 8].map((id) => ({ id }));
    const list = callable.length ? callable : fallback;
    return list.map((c, i) => ({
      id: c.id || 0,
      killed: Boolean(c.killed),
      robbed: Boolean(c.robbed),
      faceUp: Boolean(c.faceUp || c.discardedFaceUp),
      current: c.id !== 0 && c.id === currentChar,
      key: c.id || `slot-${i}`,
    }));
  }, [gs, currentChar]);

  const phaseName = useMemo(() => {
    if (!gs) return '';
    if (gs.progress === 3 /* FINISHED */) return t('ui.game.messages.end');
    if (gs.board?.gamePhase === 0) return t('ui.game.phase_initial');
    if (gs.board?.gamePhase === 1) return t('ui.game.phase_choose');
    return t('ui.game.phase_actions');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gs]);

  const round = typeof gs.roundNumber === 'number' ? gs.roundNumber : 1;
  const resultFlag = gs.matchResult === MatchResult.TEAM_A_WIN ? 'A'
    : gs.matchResult === MatchResult.TEAM_B_WIN ? 'B' : null;

  return (
    <div className="ob-screen__body">
      <div className="ob-layout">
        <div className="ob-layout__board">
          <div className="ob-column ob-column--left">
            {leftSeats.map((slot) => (
              <SeatBlock key={slot.playerId} slot={slot} gs={gs} currentChar={currentChar} />
            ))}
          </div>

          <div className="ob-center">
            <div className="ob-center__head">
              <span className="ob-center__phase">{phaseName}</span>
              <span className="ob-center__round">{t('ui.replay.round')} {round}</span>
            </div>
            <div className="ob-center__chars">
              {centerChars.map((c) => (
                <CharacterCard
                  key={c.key}
                  characterId={c.id}
                  killed={c.killed}
                  robbed={c.robbed}
                  faceUpMark={c.faceUp}
                  current={c.current}
                  size="large"
                />
              ))}
            </div>
            {resultFlag && (
              <div className="ob-center__result">{t('ui.score.winner_team')} {resultFlag}</div>
            )}
          </div>

          <div className="ob-column ob-column--right">
            {rightSeats.map((slot) => (
              <SeatBlock key={slot.playerId} slot={slot} gs={gs} currentChar={currentChar} />
            ))}
          </div>
        </div>

        <ObLog feed={gs.actionFeed || []} chat={chat} />
      </div>
    </div>
  );
}

// Shared OB topbar — game-style status strip replacing the old plain-text
// row: gold round pill, phase pill, an in-game-style team score (A blue /
// B red, mirroring board-table__score-bar) and a mono room chip.
// `children` (public replay's perspective switcher) renders after the score
// so extra controls live in the SAME banner instead of stacking more strips.
export function ObTopBar({
  brand,
  round,
  phaseName,
  scoreA,
  scoreB,
  roomId,
  onBack,
  backLabel,
  children,
}: {
  brand: string;
  round: number;
  phaseName: string;
  scoreA: number;
  scoreB: number;
  roomId?: string;
  onBack: () => void;
  backLabel: string;
  children?: ReactNode;
}) {
  const { t } = useTranslation();
  return (
    <div className="ob-screen__topbar">
      <div className="ob-screen__brand">{brand}</div>
      <div className="ob-screen__meta">
        <span className="ob-chip ob-chip--round">{t('ui.replay.round')} {round}</span>
        <span className="ob-chip ob-chip--phase">{phaseName}</span>
        <span className="ob-screen__score" title={t('ui.admin.col_scores')}>
          <span className="ob-screen__score-team ob-screen__score-team--a">{t('ui.team.a')} {scoreA}</span>
          <span className="ob-screen__score-vs">VS</span>
          <span className="ob-screen__score-team ob-screen__score-team--b">{t('ui.team.b')} {scoreB}</span>
        </span>
        {roomId && <span className="ob-chip ob-chip--room" title={t('ui.admin.ob_hint')}>{roomId}</span>}
        {children}
      </div>
      <button type="button" className="admin-btn admin-btn--ghost" onClick={onBack}>{backLabel}</button>
    </div>
  );
}

// One god-view seat = the in-game SeatPanel look (same classes) + a revealed
// hand strip. relation from getTableSlots(spectator) maps Team A → ally
// (blue) and Team B → enemy (red), matching the in-game spectator colouring.
function SeatBlock({ slot, gs, currentChar }: {
  slot: ReturnType<typeof getTableSlots>[number];
  gs: ClientGameState;
  currentChar: number;
}) {
  const { t } = useTranslation();
  const {
    board, playerId, pickOrder, relation,
  } = slot;
  const liveCity = (board.city || []).filter(Boolean) as string[];
  // god-view hands are always revealed — null slots never happen, filter hard
  const hand = ((board.hand || []) as Array<string | null>).filter(Boolean) as string[];
  const player = gs.players?.[playerId];
  const playerName = player?.username || playerId;

  // god-view exports the owner's role face-up at characters[0]
  const roleChar = (board.characters?.[0] || {}) as {
    id?: number; killed?: boolean; robbed?: boolean;
  };
  const roleId = roleChar.id ?? 0;
  const isActing = currentChar !== 0 && roleId === currentChar;

  // Seat status tag: same rules as the in-game SeatPanel — offline beats
  // hosted (autoplay); AI seats show nothing.
  const seatStatus = (() => {
    if (!player || player.role !== PlayerRole.PLAYER || player.isAi) return null;
    if (!player.online) return 'offline';
    if (player.isAutoplay) return 'hosted';
    return null;
  })();

  return (
    <div
      className={cn(
        'seat-panel ob-seat',
        `seat-panel--${relation}`,
        isActing && 'seat-panel--acting',
      )}
    >
      <div className="seat-panel__main">
        <div className="seat-panel__banner">
          <span className="seat-panel__pick-no" title={t('ui.game.pick_order_tip')}>{pickOrder}</span>
          {player?.avatar && <img src={avatarUrl(player.avatar)} alt="" className="seat-panel__avatar" />}
          <span className="text-truncate flex-fill seat-panel__name">{playerName}</span>
          {seatStatus && (
            <span className={`seat-panel__status seat-panel__status--${seatStatus}`}>
              {t(seatStatus === 'offline' ? 'ui.game.status_offline' : 'ui.game.status_hosted')}
            </span>
          )}
          <span className="seat-panel__chip seat-panel__chip--gold" title={t('ui.game.stat_gold')}>
            <span className="seat-panel__chip-icon"><Emoji emoji="🪙" /></span>
            <span className="seat-panel__chip-val">{board.stash ?? 0}</span>
          </span>
          <span className="seat-panel__chip seat-panel__chip--hand" title={t('ui.game.stat_hand')}>
            <span className="card-back-icon" />
            <span className="seat-panel__chip-val">{hand.length}</span>
          </span>
          <span className="seat-panel__chip seat-panel__chip--score" title={t('ui.game.stat_score')}>
            <span className="seat-panel__chip-icon">⭐</span>
            <span className="seat-panel__chip-val">{board.score?.total ?? 0}</span>
          </span>
          {board.crown && <span className="seat-panel__crown" title={t('ui.game.crown_holder')}>👑</span>}
          <span className="seat-panel__tag">
            {relation === 'ally' ? t('ui.team.a') : t('ui.team.b')}
          </span>
        </div>

        <div className="seat-panel__body">
          <div className="seat-panel__city">
            {liveCity.map((id, i) => <DistrictCard key={`c-${i}`} districtId={id as never} small />)}
            {!liveCity.length && <div className="seat-panel__city-empty">{t('ui.game.no_buildings')}</div>}
          </div>
          <div className="seat-panel__role">
            {roleId > 0 && (
              <CharacterCard
                characterId={roleId}
                killed={Boolean(roleChar.killed)}
                robbed={Boolean(roleChar.robbed)}
                size="medium"
              />
            )}
          </div>
        </div>

        {/* god-view hand strip: same fanned layout as the player's own hand
            (.district-card-wrapper) — cards at the in-game inline hand-pick
            size, hover a card to fan it out for reading. */}
        <div className="ob-seat__hand">
          {hand.map((id, i) => (
            <div key={`h-${i}`} className="district-card-wrapper">
              <DistrictCard districtId={id as never} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// Right-side game-style log: a unified timeline of action-feed entries and
// chat messages, styled like the in-game ActionLog panel (fonts/colors).
// Exported — the first-person replay screen reuses it (the in-game ActionLog
// is coupled to the GameStage portal + chat store, which replays don't have).
export function ObLog({
  feed,
  chat,
}: {
  feed: ActionFeedLine[];
  chat: Array<{ playerId: string; username: string; text: string; role?: number }>;
}) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
  const mountedRef = useRef(false);
  // atBottomRef tracks whether the list currently SITS at its bottom; the
  // scroll handler keeps it current. Follow decisions use this flag, NOT a
  // "distance to bottom" check: replay jumps (slider drag / round skip)
  // append dozens of lines at once and blow past any px threshold, which
  // silently broke auto-follow.
  const atBottomRef = useRef(true);
  // feed length the user has already seen (drives the unseen-line badge)
  const seenLenRef = useRef(0);
  const [scrolledUp, setScrolledUp] = useState(false);
  const [unseen, setUnseen] = useState(0);

  // Merge actions + chat in arrival order (actions come from the frame feed;
  // chat is passed in for live OB where the socket delivers it).
  const items: Array<{ kind: 'action' | 'round' | 'chat'; data: any; key: string }> = [];
  feed.forEach((item, i) => items.push({ kind: item.kind === 'round' ? 'round' : 'action', data: item, key: `a-${i}` }));
  chat.forEach((m, i) => items.push({ kind: 'chat', data: m, key: `c-${i}` }));

  // Auto-scroll: land at the bottom on first paint; afterwards keep following
  // while the list sits at its bottom (atBottomRef). If the user scrolled up
  // to read history, don't yank the view — surface a "jump to latest" pill
  // with the count of missed lines instead.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    if (!mountedRef.current) {
      mountedRef.current = true;
      el.scrollTop = el.scrollHeight;
      seenLenRef.current = items.length;
      return;
    }
    if (atBottomRef.current) {
      el.scrollTop = el.scrollHeight;
      seenLenRef.current = items.length;
      setUnseen(0);
    } else {
      setUnseen(Math.max(0, items.length - seenLenRef.current));
    }
  }, [items.length]);

  const handleScroll = (e: UIEvent<HTMLDivElement>) => {
    const el = e.currentTarget;
    const near = el.scrollHeight - el.scrollTop - el.clientHeight < 48;
    atBottomRef.current = near;
    setScrolledUp(!near);
    if (near) {
      seenLenRef.current = items.length;
      setUnseen(0);
    } else {
      setUnseen(Math.max(0, items.length - seenLenRef.current));
    }
  };

  const jumpToLatest = () => {
    const el = listRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    atBottomRef.current = true;
    seenLenRef.current = items.length;
    setScrolledUp(false);
    setUnseen(0);
  };

  return (
    <div className="ob-log">
      <div className="ob-log__title">{t('ui.game.action_log')}</div>
      <div className="ob-log__list" ref={listRef} onScroll={handleScroll}>
        {items.map((item) => {
          if (item.kind === 'round') {
            return (
              <div key={item.key} className="ob-log__round-sep">
                {t('ui.game.round_start', { n: (item.data as { round?: number }).round ?? '' })}
              </div>
            );
          }
          if (item.kind === 'chat') {
            const c = item.data as NonNullable<(typeof chat)[number]>;
            const isOb = c.role === 1;
            return (
              <div key={item.key} className={`ob-log__item ob-log__item--chat${isOb ? ' ob-log__item--chat-ob' : ''}`}>
                {isOb && <span className="ob-log__chat-ob-tag">{t('ui.lobby.spectator')}</span>}
                <span className="ob-log__chat-name">{c.username}:</span>
                <span className="ob-log__chat-text">{c.text}</span>
              </div>
            );
          }
          return (
            <div key={item.key} className="ob-log__item">
              {formatActionFeedLine(item.data as ActionFeedLine, t)}
            </div>
          );
        })}
        {!items.length && (
          <div className="ob-log__item ob-log__item--muted">{t('ui.game.action_log_empty')}</div>
        )}
      </div>
      {scrolledUp && (
        <button type="button" className="ob-log__jump" onClick={jumpToLatest}>
          ↓ {t('ui.game.jump_latest')}{unseen > 0 ? ` (${unseen})` : ''}
        </button>
      )}
    </div>
  );
}
