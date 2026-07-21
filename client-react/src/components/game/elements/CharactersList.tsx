import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { Move, MoveType } from 'citadels-common';
import Emoji from '@/components/common/Emoji';
import { cn } from '@/utils/cn';
import { useAppStore } from '@/store';

export interface CharacterEntry {
  id: number;
  faceDown?: boolean;
  faceUp?: boolean;
  discardedFaceUp?: boolean;
  killed?: boolean;
  robbed?: boolean;
  selectable?: boolean;
}

interface CharactersListProps {
  title?: string;
  characters: CharacterEntry[];
  current?: number;
  killMode?: boolean;
  robMode?: boolean;
  putAsideMode?: boolean;
}

interface ProcessedChar extends CharacterEntry {
  killed: boolean;
  robbed: boolean;
  faceUp: boolean;
  selectable: boolean;
}

// Mirrors Vue elements/CharactersList.vue. The Vue `store.dispatch('sendMove')`
// becomes useAppStore().sendMove. processedCharacters computed → useMemo.
function bgColor(id: number, current: number): string {
  if (id < current) return 'dark';
  switch (id) {
    case 4: return 'warning';
    case 5: return 'primary';
    case 6: return 'success';
    case 8: return 'danger';
    default: return 'secondary';
  }
}

function textColor(id: number, current: number): string {
  if (id < current) return 'light';
  return id === 4 ? 'dark' : 'light';
}

export default function CharactersList({
  title = '',
  characters,
  current = 0,
  killMode = false,
  robMode = false,
  putAsideMode = false,
}: CharactersListProps) {
  const { t } = useTranslation();
  const sendMove = useAppStore((s) => s.sendMove);

  const processedCharacters = useMemo<ProcessedChar[]>(() => characters.map((character) => {
    const killed = Boolean(character.killed);
    const robbed = Boolean(character.robbed);
    const faceUp = Boolean(character.faceUp || character.discardedFaceUp);
    let selectable = Boolean(character.selectable);

    if (killMode) {
      selectable = character.id > 1 && character.id !== 0 && !character.faceDown;
    } else if (robMode) {
      selectable = character.id > 2 && !killed && character.id !== 0
          && !character.faceDown && !faceUp;
    } else if (putAsideMode) {
      selectable = Boolean(character.selectable);
    }

    return {
      ...character, killed, robbed, faceUp, selectable,
    };
  }), [characters, killMode, robMode, putAsideMode]);

  if (characters.length === 0) return null;

  const rowClass = (character: ProcessedChar) => cn({
    'list-group-item-dark': !character.killed,
    'list-group-item-danger': character.killed,
    'char-face-up': character.faceUp,
    'char-killed': character.killed,
    'bg-secondary text-white-50': character.id > 0 && character.id < current
      && !character.killed && !character.faceUp,
    'active bg-white text-dark border-dark mx-n1 shadow-sm rounded':
      character.id === current && current !== 0 && !(killMode || robMode),
    'bg-light': character.id > current && !character.killed
      && character.id !== 0 && !character.faceUp,
    'bg-white text-dark cursor-pointer hover-hint-hitbox border border-primary':
      character.selectable,
    'font-italic opacity-75': character.faceDown || character.id === 0,
  });

  const tooltipText = (character: ProcessedChar) => {
    if (character.faceDown || character.id === 0) return t('ui.game.character_face_down');
    const base = t(`characters.${character.id}.description`);
    if (character.faceUp) {
      return `${base} — ${t('ui.game.character_face_up')}（${t('ui.game.character_face_up_hint')}）`;
    }
    if (character.killed) return `${base} — ${t('ui.game.character_killed')}`;
    return base;
  };

  const selectCharacter = async (index: number, characterId: number) => {
    const target = processedCharacters[index];
    if (!target.selectable) return;
    if (robMode && target.killed) return;

    let moveType = MoveType.CHOOSE_CHARACTER;
    let moveData: unknown = index;
    if (killMode) {
      moveType = MoveType.ASSASSIN_KILL;
      moveData = characterId;
    } else if (robMode) {
      moveType = MoveType.THIEF_ROB;
      moveData = characterId;
    }
    await sendMove({ type: moveType, data: moveData } as Move);
  };

  return (
    <div className="card bg-dark">
      {title && (
        <div className="card-header bg-secondary text-light text-center px-0">{title}</div>
      )}
      <ul className="list-group list-group-flush text-dark shadow-sm">
        {processedCharacters.map((character, i) => (
          <li
            key={i}
            className={cn('list-group-item p-1 d-flex justify-content-between align-items-center', rowClass(character))}
            title={tooltipText(character)}
            data-placement="left"
            onClick={() => selectCharacter(i, character.id)}
          >
            {character.id === 0 || character.faceDown ? (
              <span className="badge px-2 py-2 shadow-sm bg-dark text-light border border-secondary">?</span>
            ) : (
              <span className={cn('badge px-2 py-2 shadow-sm', `bg-${bgColor(character.id, current)} text-${textColor(character.id, current)}`)}>
                {character.id}
              </span>
            )}

            <span className="badge text-truncate flex-fill text-left">
              {character.id === 0 || character.faceDown
                ? t('ui.game.character_unknown')
                : t(`characters.${character.id}.name`)}
            </span>

            {(character.faceUp || character.discardedFaceUp) && (
              <span
                className="badge badge-info badge-pill p-1 shadow-sm mr-1"
                title={t('ui.game.character_face_up')}
              >
                {t('ui.game.character_face_up_short')}
              </span>
            )}

            {character.killed ? (
              <span className="badge badge-pill badge-danger p-1 shadow-sm" title={t('ui.game.character_killed')}>
                <Emoji emoji="💀" />
              </span>
            ) : character.robbed ? (
              <span className="badge badge-pill badge-warning p-1 shadow-sm" title={t('ui.game.character_robbed')}>
                <Emoji emoji="💰" />
              </span>
            ) : null}

            <span className="hover-hint">
              {killMode && character.selectable ? (
                <span className="badge badge-pill badge-danger p-1 shadow-sm"><Emoji emoji="💀" /></span>
              ) : robMode && character.selectable ? (
                <span className="badge badge-pill badge-dark p-1 shadow-sm"><Emoji emoji="💰" /></span>
              ) : putAsideMode ? (
                <Emoji emoji="⬇️" />
              ) : null}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
