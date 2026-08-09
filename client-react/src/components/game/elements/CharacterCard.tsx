import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { motion, useReducedMotion } from 'framer-motion';
import { cn } from '@/utils/cn';
import { getRevealDelay, claimRevealAudio } from '@/utils/roleReveal';
import { dispatchAv } from '@/utils/av';

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
  /** Card the local player never saw in their own pick pool (天绝 / picked by
   *  earlier pickers). Rendered with a translucent grey veil in the assassin
   *  / thief target grid so the player can tell those apart from cards they
   *  actually observed. */
  unseen?: boolean;
  /** Stagger the reveal flip (face-down -> face-up) against other opt-in
   *  cards so consecutive role reveals in the call sequence never overlap.
   *  Only the per-seat role cards and the local self-role card opt in; the
   *  centre draft grid keeps its single batch flip. See utils/roleReveal.ts. */
  staggerReveal?: boolean;
  /** Start face-down and flip to face-up on mount after `revealDelay` ms.
   *  Used by the centre grid at the CHOOSE→DONE boundary so all 8 role cards
   *  cascade-flip when the action phase begins. Without this, only the cards
   *  that happened to persist across the array-length change (indices 0-1)
   *  would flip; the rest would pop in face-up with no animation. */
  revealOnMount?: boolean;
  /** Cascade delay in ms for the revealOnMount flip (index × step). */
  revealDelay?: number;
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
  unseen = false,
  staggerReveal = false,
  revealOnMount = false,
  revealDelay = 0,
  onSelect,
}: CharacterCardProps) {
  const { t } = useTranslation();

  const resolvedSize = (size === 'small' || size === 'medium' || size === 'large')
    ? size
    : (small ? 'small' : 'medium');
  const isBack = faceDown || !characterId;
  const artKey = ART_KEYS[characterId] || '';
  const reduce = useReducedMotion();

  // Staggered reveal: when an opt-in card flips face-down -> face-up, defer
  // the visual flip by a per-character delay so consecutive role reveals in
  // the call sequence keep a minimum gap (prep for per-reveal sounds). The
  // self role card and the self SeatPanel render the same characterId, so
  // keying by characterId keeps them flipping together. displayBack drives
  // the flip + face-down class; the kill/rob stamps are gated on it too so
  // their slam lands with the (possibly deferred) flip rather than playing
  // hidden during the delay.
  const [displayBack, setDisplayBack] = useState(isBack || revealOnMount);
  const prevBackRef = useRef(isBack || revealOnMount);
  useEffect(() => {
    const wasBack = prevBackRef.current;
    const targetBack = isBack;
    prevBackRef.current = targetBack;
    if (revealOnMount && wasBack && !targetBack && characterId > 0) {
      if (reduce) { setDisplayBack(false); return; }
      const id = window.setTimeout(() => setDisplayBack(false), revealDelay);
      return () => window.clearTimeout(id);
    }
    if (staggerReveal && wasBack && !targetBack && characterId > 0) {
      const d = getRevealDelay(characterId);
      if (d > 0) {
        const id = window.setTimeout(() => setDisplayBack(false), d);
        return () => window.clearTimeout(id);
      }
    }
    setDisplayBack(targetBack);
  }, [isBack, staggerReveal, characterId, revealOnMount, revealDelay, reduce]);

  // Role-reveal audio: fires when the card flips face-up (displayBack
  // true→false), deduped by characterId so the self card + self SeatPanel
  // (same characterId) don't double-play. Only opt-in staggerReveal cards
  // (seat/self) — the centre grid batch flip is not a per-role call event.
  // P1: 只保留被刺/被偷受害者翻面的庄严双音(戏剧性揭晓);普通轮到翻面静默
  // ——视觉翻牌本身已足够,从每回合 6~8 声降到 0~2 声。
  const prevDisplayBackRef = useRef(displayBack);
  useEffect(() => {
    const wasBack = prevDisplayBackRef.current;
    prevDisplayBackRef.current = displayBack;
    if (staggerReveal && wasBack && !displayBack && characterId > 0 && (killed || robbed)) {
      if (claimRevealAudio(characterId)) {
        dispatchAv('role_reveal', { reducedMotion: Boolean(reduce) });
      }
    }
  }, [displayBack, staggerReveal, characterId, killed, robbed, reduce]);

  // Note: stamp_kill/stamp_rob AUDIO is now feed-driven (useAvFeedDispatch
  // on feed `kill`/`rob` at target-selection time), NOT fired here at card
  // reveal. The stamp VISUAL (motion.div below) still appears at reveal —
  // the "thud" sound plays earlier when the assassin/thief picks, which is
  // cleaner (fewer sounds stacked at reveal: role_reveal + kill_settle only)
  // and gives immediate feedback on the selection action.

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
          'char-card--face-down': displayBack,
          'char-card--killed': killed,
          'char-card--robbed': robbed,
          'char-card--face-up-mark': faceUpMark,
          'char-card--current': current,
          'char-card--unseen': unseen,
        },
      )}
      onClick={handleClick}
      style={{ perspective: 1200 }}
    >
      <motion.div
        className="char-card__flipper"
        initial={false}
        animate={{ rotateY: displayBack ? 180 : 0 }}
        transition={reduce
          ? { duration: 0 }
          : { type: 'spring', stiffness: 260, damping: 30 }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        {/* 正面（角色图）—— 朝向 0° */}
        <div
          className={cn('char-card__inner char-card__face char-card__face--front', `char-card__inner--c${characterId}`, artKey && `char-card__inner--art-${artKey}`)}
          style={{ backfaceVisibility: 'hidden', WebkitBackfaceVisibility: 'hidden' }}
        >
          <div className="char-card__num">{characterId}</div>
          <div className="char-card__art">
          </div>
          <div className="char-card__footer">
            <div className="char-card__name">{t(`characters.${characterId}.name`)}</div>
          </div>
          {killed && !displayBack && (
            <motion.div
              className="char-card__stamp char-card__stamp--kill"
              initial={reduce ? false : { scale: 2.4, y: -30, opacity: 0 }}
              animate={{
                scale: 1, y: 0, opacity: 0.92, rotate: -12,
              }}
              transition={reduce
                ? { duration: 0 }
                : {
                  type: 'spring', stiffness: 500, damping: 16, mass: 0.8,
                }}
            >
              💀
            </motion.div>
          )}
          {!killed && robbed && !displayBack && (
            <motion.div
              className="char-card__stamp char-card__stamp--rob"
              initial={reduce ? false : { scale: 2.4, y: -30, opacity: 0 }}
              animate={{
                scale: 1, y: 0, opacity: 0.92, rotate: -12,
              }}
              transition={reduce
                ? { duration: 0 }
                : {
                  type: 'spring', stiffness: 500, damping: 16, mass: 0.8,
                }}
            >
              💰
            </motion.div>
          )}
          {faceUpMark && (
            <div className="char-card__tag">{t('ui.game.character_face_up_short')}</div>
          )}
        </div>
        {/* 背面（卡背）—— 朝向 180° */}
        <div
          className="char-card__inner char-card__inner--back char-card__face char-card__face--back"
          style={{
            backfaceVisibility: 'hidden',
            WebkitBackfaceVisibility: 'hidden',
            transform: 'rotateY(180deg)',
          }}
        />
      </motion.div>
    </div>
  );
}
