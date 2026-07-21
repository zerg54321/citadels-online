import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';

export interface ActionFeedLine {
  kind: string;
  text: string;
}

interface ActionLogProps {
  displayActionFeed: ActionFeedLine[];
  onShowEvent?: (text: string) => void;
}

// Mirrors Vue ActionLog.vue. The Vue `watch displayActionFeed` (deep) +
// `$nextTick` scroll becomes a useEffect on the feed array. Emits
// `show-event` via the onShowEvent callback prop.
export default function ActionLog({ displayActionFeed, onShowEvent }: ActionLogProps) {
  const { t } = useTranslation();
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const list = displayActionFeed;
    if (!Array.isArray(list) || !list.length) return;
    const last = list[list.length - 1];
    if (last?.kind === 'kill' || last?.kind === 'rob') {
      onShowEvent?.(last.text);
    }
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [displayActionFeed, onShowEvent]);

  return (
    <div className="board-table__slot board-table__slot--log">
      <div className="board-table__log">
        <div className="board-table__log-title">{t('ui.game.action_log')}</div>
        <div className="board-table__log-list" ref={listRef}>
          {displayActionFeed.map((line, i) => (
            <div
              key={i}
              className={`board-table__log-item${line.kind === 'rob' || line.kind === 'warn' ? ' board-table__log-item--warn' : ''}${line.kind === 'kill' ? ' board-table__log-item--kill' : ''}`}
            >
              {line.text}
            </div>
          ))}
          {!displayActionFeed.length && (
            <div className="board-table__log-item opacity-50">{t('ui.game.action_log_empty')}</div>
          )}
        </div>
      </div>
    </div>
  );
}
