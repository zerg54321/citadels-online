import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { formatActionFeedLine, type ActionFeedLine } from 'citadels-common';

interface ActionLogProps {
  displayActionFeed: ActionFeedLine[];
  onShowEvent?: (text: string) => void;
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

export default function ActionLog({ displayActionFeed, onShowEvent }: ActionLogProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);
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

  return (
    <div className="board-table__slot board-table__slot--log">
      <div className="board-table__log">
        <div className="board-table__log-title">{t('ui.game.action_log')}</div>
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
      </div>
    </div>
  );
}
