import { useTranslation } from 'react-i18next';

export interface TurnOrderChip {
  id: number;
  idx: number;
  current: boolean;
  killed: boolean;
  faceUp: boolean;
  tip: string;
}

interface TurnOrderBarProps {
  turnOrderChips: TurnOrderChip[];
  gameProgress: string;
}

// Pure presentational — mirrors Vue TurnOrderBar.vue. Only renders during
// IN_GAME (parent passes gameProgress).
export default function TurnOrderBar({ turnOrderChips, gameProgress }: TurnOrderBarProps) {
  const { t } = useTranslation();
  if (gameProgress !== 'IN_GAME') return null;
  return (
    <div className="board-table__turn-order">
      <span className="board-table__turn-label">{t('ui.game.turn_order')}</span>
      {turnOrderChips.map((ch) => (
        <span
          key={`${ch.id}-${ch.idx}`}
          className={`board-table__char-chip board-table__char-chip--c${ch.id || 0}${ch.current ? ' board-table__char-chip--current' : ''}${ch.killed ? ' board-table__char-chip--killed' : ''}${ch.faceUp ? ' board-table__char-chip--face-up' : ''}`}
          title={ch.tip}
        >
          {ch.id || '?'}
        </span>
      ))}
    </div>
  );
}
