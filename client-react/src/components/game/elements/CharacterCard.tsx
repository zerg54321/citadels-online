import { useTranslation } from 'react-i18next';
import { cn } from '@/utils/cn';

const ART_KEYS: Record<number, string> = {
  1: 'assassin',
  2: 'thief',
  3: 'magician',
  4: 'king',
  5: 'bishop',
  6: 'merchant',
  7: 'architect',
  8: 'warlord',
};

const EMOJIS: Record<number, string> = {
  1: '🗡️',
  2: '🦹',
  3: '🪄',
  4: '👑',
  5: '✝️',
  6: '💰',
  7: '🏗️',
  8: '⚔️',
};

interface CharacterCardProps {
  characterId?: number;
  faceDown?: boolean;
  selectable?: boolean;
  disabled?: boolean;
  small?: boolean;
  size?: string;
  killed?: boolean;
  robbed?: boolean;
  faceUpMark?: boolean;
  current?: boolean;
  onSelect?: () => void;
}

// Mirrors Vue elements/CharacterCard.vue. Pure presentational; emits `select`
// via callback prop. ART_KEYS/EMOJIS stay module-level. SCSS extracted to
// scss/_character-card.scss (BEM .char-card names are globally unique).
export default function CharacterCard({
  characterId = 0,
  faceDown = false,
  selectable = false,
  disabled = false,
  small = false,
  size = '',
  killed = false,
  robbed = false,
  faceUpMark = false,
  current = false,
  onSelect,
}: CharacterCardProps) {
  const { t } = useTranslation();

  const resolvedSize = (size === 'small' || size === 'medium' || size === 'large')
    ? size
    : (small ? 'small' : 'medium');
  const isBack = faceDown || !characterId;
  const artKey = ART_KEYS[characterId] || '';
  const roleEmoji = EMOJIS[characterId] || '🎭';

  const handleClick = () => {
    if (selectable && !disabled) onSelect?.();
  };

  return (
    <div
      className={cn(
        'char-card',
        `char-card--${resolvedSize}`,
        {
          'char-card--selectable': selectable && !disabled,
          'char-card--disabled': disabled,
          'char-card--face-down': isBack,
          'char-card--killed': killed,
          'char-card--robbed': robbed,
          'char-card--face-up-mark': faceUpMark,
          'char-card--current': current,
        },
      )}
      onClick={handleClick}
    >
      {isBack ? (
        <div className="char-card__inner char-card__inner--back" />
      ) : (
        <div className={cn('char-card__inner', `char-card__inner--c${characterId}`, artKey && `char-card__inner--art-${artKey}`)}>
          <div className="char-card__num">{characterId}</div>
          <div className="char-card__art">
            {!artKey && <span className="char-card__emoji">{roleEmoji}</span>}
          </div>
          <div className="char-card__footer">
            <div className="char-card__name">{t(`characters.${characterId}.name`)}</div>
          </div>
          {killed && <div className="char-card__stamp char-card__stamp--kill">💀</div>}
          {!killed && robbed && <div className="char-card__stamp char-card__stamp--rob">💰</div>}
          {faceUpMark && (
            <div className="char-card__tag">{t('ui.game.character_face_up_short')}</div>
          )}
        </div>
      )}
    </div>
  );
}
