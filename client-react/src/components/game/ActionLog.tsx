import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatActionFeedLine, type ActionFeedLine } from 'citadels-common';
import { useGameStage } from './gameStageContext';

interface ActionLogProps {
  displayActionFeed: ActionFeedLine[];
  onShowEvent?: (text: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

// Feed entries are pushed by the server as structured { kind, params } (no
// localized text) and rendered here via formatActionFeedLine() with the
// current i18n language, so the log follows the UI locale. Round separators
// (kind='round') render as divider rows. The transient event banner
// (onShowEvent) fires for kill/rob-related entries so big plays surface in
// CenterPanel regardless of scroll position.

// kinds that highlight the CenterPanel event banner
const BANNER_KINDS = new Set(['kill', 'rob', 'rob_move', 'rob_move_empty', 'call_killed']);
// kinds that get the red "kill" log-item styling
const KILL_STYLE_KINDS = new Set(['kill', 'call_killed']);
// kinds that get the amber "warn" log-item styling
const WARN_STYLE_KINDS = new Set(['rob', 'rob_move', 'rob_move_empty', 'warn']);

export default function ActionLog({ displayActionFeed, onShowEvent, collapsed, onToggleCollapsed }: ActionLogProps) {
  const { t } = useTranslation();
  const stage = useGameStage();
  const listRef = useRef<HTMLDivElement>(null);
  // Closing phase: when the user collapses the overlay drawer, keep it
  // mounted briefly so the slide-out animation can play before swapping to
  // the tab button. Without this the drawer unmounts instantly (no exit
  // animation), which felt jarring vs. the slide-in on expand.
  const [closing, setClosing] = useState(false);
  const prevCollapsedRef = useRef(collapsed);
  useEffect(() => {
    const prev = prevCollapsedRef.current;
    if (!prev && collapsed) setClosing(true); // expanded → collapsed: animate out
    if (prev && !collapsed) setClosing(false); // collapsed → expanded: reset
    prevCollapsedRef.current = collapsed;
  }, [collapsed]);
  // Track whether the user is parked at the bottom of the log ("sticky").
  // We only auto-scroll to newly appended entries while sticky, so a user
  // who scrolled up to read earlier history isn't yanked back to the bottom
  // on the next server state push.
  const stickyRef = useRef(true);
  // Track the signature of the last-seen feed item rather than its length.
  // The server retains the full feed for the current game, so once a game
  // has been running a while `list.length` keeps growing — but a new round
  // of the same length (impossible here, but defensively) or a re-push of
  // unchanged state could fool a length-based guard. A signature of
  // `length|kind|params|round` still changes when a genuinely new item is
  // appended, so the banner keeps firing for the whole game.
  const lastSigRef = useRef<string | null>(null);

  // Park a one-time scroll listener that updates stickyRef as the user
  // scrolls. Threshold in px from the bottom still counts as "at bottom"
  // so fractional/rounding differences don't flip sticky off spuriously.
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      stickyRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, []);

  useEffect(() => {
    const list = displayActionFeed;
    if (!Array.isArray(list) || !list.length) return;
    const last = list[list.length - 1];
    const sig = `${list.length}|${last?.kind ?? ''}|${JSON.stringify(last?.params ?? null)}|${last?.round ?? ''}`;
    // Only fire when a genuinely new feed line is appended, not on every
    // state push / re-render (the feed array identity changes on each
    // server push even when content is unchanged — the signature stays
    // stable in that case, so the banner is not re-triggered).
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      if (last && BANNER_KINDS.has(last.kind)) {
        onShowEvent?.(formatActionFeedLine(last, t));
      }
    }
    // Only auto-scroll when the user is already at the bottom. If they
    // scrolled up to read history, leave their position alone.
    const el = listRef.current;
    if (el && stickyRef.current) el.scrollTop = el.scrollHeight;
  }, [displayActionFeed, onShowEvent, t]);

  // Render the log list body (shared by inline + popout). Only one of them
  // is mounted at a time, so sharing listRef is safe.
  const renderList = () => (
    <div className="board-table__log-list" ref={listRef}>
      {displayActionFeed.map((line, i) => (
        line.kind === 'round' ? (
          <div key={i} className="board-table__log-round-sep">
            {t('ui.game.round_start', { n: line.round ?? '' })}
          </div>
        ) : (
          <div
            key={i}
            className={`board-table__log-item${WARN_STYLE_KINDS.has(line.kind) ? ' board-table__log-item--warn' : ''}${KILL_STYLE_KINDS.has(line.kind) ? ' board-table__log-item--kill' : ''}`}
          >
            {formatActionFeedLine(line, t)}
          </div>
        )
      ))}
      {!displayActionFeed.length && (
        <div className="board-table__log-item opacity-50">{t('ui.game.action_log_empty')}</div>
      )}
    </div>
  );

  // Portal target comes from GameStage: dock mode → native-width panel
  // beside the canvas (PC); overlay mode → absolute host layered over the
  // canvas (iPad). Until the host mounts (first render) render nothing.
  const target = stage?.mode === 'dock' ? stage?.logDockEl : stage?.logOverlayEl;
  if (!target) return null;

  // Dock mode (PC, wide): the log is a permanent panel beside the canvas.
  // It ignores `collapsed` — the side has room, so always show it inline.
  if (stage?.mode === 'dock') {
    return createPortal(
      <div className="board-table__log board-table__log--dock">
        <div className="board-table__log-header">
          <div className="board-table__log-title">{t('ui.game.action_log')}</div>
        </div>
        {renderList()}
      </div>,
      target,
    );
  }

  // Overlay mode (iPad): a floating drawer over the board's right edge.
  // While closing, keep the drawer mounted with the slide-out animation;
  // onAnimationEnd (bubbled from the inner slide-out) flips closing off and
  // the collapsed tab renders next.
  if (closing) {
    return createPortal(
      <div
        className="board-table__log-popout board-table__log-popout--open board-table__log-popout--closing"
        onAnimationEnd={() => setClosing(false)}
      >
        <div className="board-table__log-popout-inner">
          <div className="board-table__log-header">
            <div className="board-table__log-title">{t('ui.game.action_log')}</div>
            <span className="board-table__log-toggle" aria-hidden="true">
              <span className="board-table__log-arrow board-table__log-arrow--right">&#9654;</span>
            </span>
          </div>
          {renderList()}
        </div>
      </div>,
      target,
    );
  }

  if (collapsed) {
    return createPortal(
      <button
        className="board-table__log-tab"
        onClick={onToggleCollapsed}
        title={t('ui.game.action_log_expand')}
      >
        <span className="board-table__log-tab-text">{t('ui.game.action_log')}</span>
        <span className="board-table__log-tab-arrow">&#9664;</span>
      </button>,
      target,
    );
  }

  return createPortal(
    <div className="board-table__log-popout board-table__log-popout--open" onClick={onToggleCollapsed}>
      <div className="board-table__log-popout-inner" onClick={(e) => e.stopPropagation()}>
        <div
          className="board-table__log-header board-table__log-header--clickable"
          onClick={onToggleCollapsed}
          title={t('ui.game.action_log_collapse')}
        >
          <div className="board-table__log-title">{t('ui.game.action_log')}</div>
          <span className="board-table__log-toggle" aria-hidden="true">
            <span className="board-table__log-arrow board-table__log-arrow--right">&#9654;</span>
          </span>
        </div>
        {renderList()}
      </div>
    </div>,
    target,
  );
}
