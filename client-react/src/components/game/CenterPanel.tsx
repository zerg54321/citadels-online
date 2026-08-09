import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClientGameState,
  DistrictId,
} from 'citadels-common';
import { useStatusBarData } from '@/data/useStatusBarData';
import { useSeenCharacterIds } from '@/store';
import DistrictCard from './elements/DistrictCard';
import CharacterCard from './elements/CharacterCard';

interface CenterCharacter {
  id: number;
  faceDown?: boolean;
  faceUp?: boolean;
  discardedFaceUp?: boolean;
  killed?: boolean;
  robbed?: boolean;
  selectable?: boolean;
}

interface AsideChip {
  id: number;
  faceUp?: boolean;
}

interface CharactersListLike {
  callable?: CenterCharacter[];
  aside?: AsideChip[];
  current?: number;
}

interface CenterPanelProps {
  gameProgress: string;
  charactersList: CharactersListLike;
  gameState: ClientGameState;
  killMode: boolean;
  robMode: boolean;
  chooseCharacterMode: boolean;
  eventBanner?: string;
  countdownText?: string;
  countdownUrgent?: boolean;
  onSelectCharacter?: (ch: CenterCharacter & { current: boolean }, index: number) => void;
}

// Mirrors Vue CenterPanel.vue. The Vue `watch gameState` (immediate) that
// refreshes statusBar becomes the useStatusBarData hook (recomputes on
// state/selectedCards change via useMemo inside).
export default function CenterPanel({
  gameProgress,
  charactersList,
  gameState,
  killMode,
  robMode,
  chooseCharacterMode,
  eventBanner = '',
  countdownText,
  countdownUrgent = false,
  onSelectCharacter,
}: CenterPanelProps) {
  const { t } = useTranslation();
  const statusBar = useStatusBarData(gameState);
  // Character ids the local player saw face-up during their own pick this
  // round. In the assassin/thief target grid, cards NOT in this set get a grey
  // veil — they are the 天绝 card and characters chosen by earlier pickers,
  // i.e. cards the player never observed and thus cannot be sure about.
  const seenCharacterIds = useSeenCharacterIds();
  const seenSet = useMemo(() => new Set(seenCharacterIds), [seenCharacterIds]);
  // Only meaningful while picking a kill/rob target: outside those modes we
  // never veil cards (e.g. the normal DONE grid shows every role to everyone).
  const veilEnabled = killMode || robMode;

  const centerTitle = useMemo(() => {
    if (gameProgress !== 'IN_GAME') return t('ui.game.messages.end');
    if (chooseCharacterMode) return t('ui.game.character_select_title');
    if (killMode) return t('ui.game.messages.actions.assassin_kill');
    if (robMode) return t('ui.game.messages.actions.thief_rob');
    return t('ui.game.characters');
  }, [gameProgress, chooseCharacterMode, killMode, robMode, t]);

  const centerCharacters = useMemo(() => {
    const list = charactersList?.callable || [];
    const current = charactersList?.current || 0;
    return list.map((c) => {
      const killed = Boolean(c.killed);
      const faceUp = Boolean(c.faceUp || c.discardedFaceUp);
      let selectable = false;
      if (killMode) {
        selectable = c.id > 1 && c.id !== 0 && !c.faceDown;
      } else if (robMode) {
        selectable = c.id > 2 && !killed && c.id !== 0 && !c.faceDown && !faceUp;
      } else if (chooseCharacterMode) {
        selectable = Boolean(c.selectable);
      }
      return {
        ...c,
        killed,
        faceUp,
        selectable,
        current: c.id === current && current !== 0,
      };
    });
  }, [charactersList, killMode, robMode, chooseCharacterMode]);

  // Aside chips: only render cards with a known id (id !== 0). Face-down
  // aside cards (天绝/暗弃 in 6P) always have id=0 from the server's
  // getAsideCards() and never get revealed there, so showing "? ?" for the
  // whole game conveys no information — it just restates the 6P rule that
  // two cards are burned face-down. Filter them out; if none remain (6P),
  // the whole aside row is hidden. Face-up aside cards (4P/5P) keep their
  // real id and are still shown.
  const asideChips = (charactersList?.aside || []).filter((a) => a.id);
  const showCenterCharacterGrid = chooseCharacterMode || killMode || robMode
    || (gameProgress === 'IN_GAME' && (charactersList?.callable || []).length > 0);
  // The "reveal grid" is the full 8-card roster shown at the CHOOSE→DONE
  // boundary and throughout DO_ACTIONS (not the pick / kill / rob target
  // grid). In this mode all 8 cards should cascade-flip face-up on mount;
  // outside it (pick/kill/rob) cards are interactive selectors that don't flip.
  const isRevealGrid = !chooseCharacterMode && !killMode && !robMode;
  const showGraveyard = gameState?.board?.graveyard !== undefined;
  const graveyardCard = gameState?.board?.graveyard as DistrictId | undefined;

  return (
    <div className="board-table__slot board-table__slot--center">
      <div className="board-table__center-panel">
        <h3 className="board-table__center-title">{centerTitle}</h3>
        <div className="board-table__center-msg">
          {statusBar.args
            ? t(statusBar.message, Object.fromEntries(statusBar.args.map((v, i) => [String(i), v])) as Record<string, string>) as string
            : t(statusBar.message) as string}
        </div>

        <div className="board-table__center-flags">
          {gameProgress === 'IN_GAME' && (chooseCharacterMode || killMode || robMode) && countdownText && countdownText !== '—' ? (
            <div className={`board-table__timer${countdownUrgent ? ' board-table__timer--urgent' : ''}`}>
              {countdownText}
            </div>
          ) : null}

          {eventBanner ? (
            <div className="board-table__banner board-table__banner--warn">{eventBanner}</div>
          ) : null}
        </div>

        {showCenterCharacterGrid && (
          <div className="board-table__draft-grid">
            {centerCharacters.map((ch, i) => (
              <CharacterCard
                key={ch.id || `slot-${i}`}
                characterId={ch.id || 0}
                faceDown={Boolean(ch.faceDown)}
                selectable={ch.selectable}
                disabled={!ch.selectable && (killMode || robMode || chooseCharacterMode)}
                killed={ch.killed}
                robbed={ch.robbed}
                faceUpMark={ch.faceUp}
                current={ch.current}
                unseen={veilEnabled && ch.id > 0 && !seenSet.has(ch.id)}
                size="large"
                revealOnMount={isRevealGrid}
                revealDelay={i * 100}
                onSelect={() => onSelectCharacter?.(ch, i)}
              />
            ))}
          </div>
        )}

        {asideChips.length > 0 && (
          <div className="board-table__aside-row">
            <span>{t('ui.game.aside')}:</span>
            {asideChips.map((a, i) => (
              <span key={i} className="badge badge-secondary">
                {t(`characters.${a.id}.name`)}
                {a.faceUp && ` (${t('ui.game.character_face_up_short')})`}
              </span>
            ))}
          </div>
        )}

        {showGraveyard && graveyardCard && (
          <div className="d-flex flex-column align-items-center mt-1">
            <span className="small opacity-75">{t('districts.graveyard.name')}</span>
            <DistrictCard districtId={graveyardCard} small />
          </div>
        )}
      </div>
    </div>
  );
}
