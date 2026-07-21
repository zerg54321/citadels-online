import { useTranslation } from 'react-i18next';
import type { Move } from 'citadels-common';

export interface ActionButton {
  title: string;
  move: Move;
  args?: Record<string, unknown>;
}

interface ActionPanelProps {
  actions: ActionButton[];
  gameProgress: string;
  countdownText: string;
  countdownUrgent: boolean;
  isAutoplay: boolean;
  autoplayBusy: boolean;
  onAction?: (move: Move, target?: HTMLElement) => void;
  onToggleAutoplay?: () => void;
}

const PRIMARY_ACTIONS = ['take_gold', 'draw_cards', 'draw_cards_3', 'build_district', 'confirm', 'accept'];

function isPrimaryAction(title: string) {
  return PRIMARY_ACTIONS.includes(title);
}

// Mirrors Vue ActionPanel.vue. Emits `action` / `toggle-autoplay` via
// callback props. `isPrimaryAction` stays a module-level helper.
export default function ActionPanel({
  actions,
  gameProgress,
  countdownText,
  countdownUrgent,
  isAutoplay,
  autoplayBusy,
  onAction,
  onToggleAutoplay,
}: ActionPanelProps) {
  const { t } = useTranslation();
  return (
    <div className="board-table__self-actions">
      <div className="board-table__actions-title">{t('ui.game.action_panel')}</div>
      {gameProgress === 'IN_GAME' && (
        <div className={`board-table__timer${countdownUrgent ? ' board-table__timer--urgent' : ''}`}>
          {countdownText}
        </div>
      )}
      {actions.map((action, i) => (
        <button
          key={i}
          type="button"
          className={`board-table__action-btn${isPrimaryAction(action.title) ? ' board-table__action-btn--primary' : ''}${action.title === 'finish_turn' || action.title === 'cancel' ? ' board-table__action-btn--danger' : ''}`}
          onClick={(e) => onAction?.(action.move, e.currentTarget)}
        >
          {t(`ui.game.actions.${action.title}`, action.args ?? {})}
        </button>
      ))}
      {gameProgress === 'IN_GAME' && (
        <button
          type="button"
          className="board-table__action-btn"
          disabled={autoplayBusy}
          onClick={onToggleAutoplay}
        >
          {isAutoplay ? t('ui.game.autoplay_cancel') : t('ui.game.autoplay_enable')}
        </button>
      )}
      <div className="board-table__meta">
        {isAutoplay && <div>{t('ui.game.autoplay_on')}</div>}
      </div>
    </div>
  );
}
