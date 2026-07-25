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
  // finish_turn (end turn) is split out of the main action list and rendered
  // in a separate bottom region together with the autoplay toggle. Keeping
  // these two "leave/control" actions physically separated from the primary
  // gameplay actions (take gold / draw / build / confirm) reduces the risk of
  // misclicking end-turn while performing a turn action.
  const primaryActions = actions.filter((a) => a.title !== 'finish_turn');
  const finishTurnAction = actions.find((a) => a.title === 'finish_turn');
  return (
    <div className="board-table__self-actions">
      <div className="board-table__actions-title">{t('ui.game.action_panel')}</div>
      {gameProgress === 'IN_GAME' && (
        <div className={`board-table__timer${countdownUrgent ? ' board-table__timer--urgent' : ''}`}>
          {countdownText}
        </div>
      )}
      {primaryActions.map((action, i) => (
        <button
          key={i}
          type="button"
          className={`board-table__action-btn${isPrimaryAction(action.title) ? ' board-table__action-btn--primary' : ''}${action.title === 'cancel' ? ' board-table__action-btn--danger' : ''}`}
          onClick={(e) => onAction?.(action.move, e.currentTarget)}
        >
          {t(`ui.game.actions.${action.title}`, action.args ?? {})}
        </button>
      ))}
      <div className="board-table__actions-secondary">
        {finishTurnAction && (
          <button
            type="button"
            className="board-table__action-btn board-table__action-btn--danger"
            onClick={(e) => onAction?.(finishTurnAction.move, e.currentTarget)}
          >
            {t(`ui.game.actions.${finishTurnAction.title}`, finishTurnAction.args ?? {})}
          </button>
        )}
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
        {isAutoplay && <div className="board-table__meta-line">{t('ui.game.autoplay_on')}</div>}
      </div>
    </div>
  );
}
