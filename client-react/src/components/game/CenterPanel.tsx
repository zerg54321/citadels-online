import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ClientGameState,
  DistrictId,
} from 'citadels-common';
import DistrictCard from './elements/DistrictCard';
import CharacterCard from './elements/CharacterCard';
import { useStatusBarData } from '@/data/useStatusBarData';

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
  onSelectCharacter,
}: CenterPanelProps) {
  const { t } = useTranslation();
  const statusBar = useStatusBarData(gameState);

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

  const asideChips = charactersList?.aside || [];
  const showCenterCharacterGrid = chooseCharacterMode || killMode || robMode
    || (gameProgress === 'IN_GAME' && (charactersList?.callable || []).length > 0);
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

        {eventBanner && <div className="board-table__banner board-table__banner--warn">{eventBanner}</div>}

        {showCenterCharacterGrid && (
          <div className="board-table__draft-grid">
            {centerCharacters.map((ch, i) => (
              <CharacterCard
                key={i}
                characterId={ch.id || 0}
                faceDown={false}
                selectable={ch.selectable}
                disabled={!ch.selectable && (killMode || robMode || chooseCharacterMode)}
                killed={ch.killed}
                robbed={ch.robbed}
                faceUpMark={ch.faceUp}
                current={ch.current}
                size="large"
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
                {a.id ? t(`characters.${a.id}.name`) : '?'}
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
