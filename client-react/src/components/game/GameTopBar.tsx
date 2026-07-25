import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  computeTeamScores,
  getMyTeam as getMyTeamOf,
  isSpectator as isSpectatorOf,
  TeamId,
} from 'citadels-common';
import {
  useGameProgress,
  useGameState,
  useCharactersList,
} from '@/store';
import { useTeamScores } from '@/hooks/useTeamScores';
import TurnOrderBar from './TurnOrderBar';

// In-game top bar rendered inside the global App <header> so the score and
// turn-order share ONE row with the brand instead of occupying a second bar
// below it. The leave button lives in App's header-actions cluster (see
// App.tsx) to avoid overlapping the locale selector. All data is pulled from
// the store so this component is independent of BoardScreen.
export default function GameTopBar() {
  const { t } = useTranslation();

  const gameState = useGameState();
  const gameProgress = useGameProgress();
  const charactersList = useCharactersList();

  const isSpectator = useMemo(() => (gameState ? isSpectatorOf(gameState) : true), [gameState]);
  const myTeam = useMemo(() => (gameState ? getMyTeamOf(gameState, isSpectator) : null), [gameState, isSpectator]);

  const showTeamScores = useTeamScores();

  const liveTeamScores = useMemo(() => {
    if (!gameState) return { A: 0, B: 0 };
    const { A, B } = computeTeamScores(gameState);
    if (!isSpectator && myTeam === TeamId.B) return { A: B, B: A };
    return { A, B };
  }, [gameState, isSpectator, myTeam]);

  const turnOrderChips = useMemo(() => {
    const list = (charactersList?.callable || []) as Array<{ id: number; killed?: boolean; faceUp?: boolean; discardedFaceUp?: boolean }>;
    const current = charactersList?.current || 0;
    if (list.length) {
      return list.map((c, idx) => ({
        idx,
        id: c.id || 0,
        current: c.id === current && current !== 0,
        killed: Boolean(c.killed),
        faceUp: Boolean(c.faceUp || c.discardedFaceUp),
        tip: c.id ? t(`characters.${c.id}.name`) : t('ui.game.character_unknown'),
      }));
    }
    return [1, 2, 3, 4, 5, 6, 7, 8].map((id, idx) => ({
      idx, id, current: id === current, killed: false, faceUp: false, tip: '',
    }));
  }, [charactersList, t]);

  if (!gameState || gameProgress !== 'IN_GAME') return null;

  return (
    <div className="game-top-bar">
      {showTeamScores && (
        <div className="board-table__score-bar">
          <span className="board-table__team-a">
            {isSpectator ? t('ui.team.a') : t('ui.team.mine')} {liveTeamScores.A}
          </span>
          <span className="opacity-50">VS</span>
          <span className="board-table__team-b">
            {isSpectator ? t('ui.team.b') : t('ui.team.enemy')} {liveTeamScores.B}
          </span>
        </div>
      )}
      <TurnOrderBar turnOrderChips={turnOrderChips} gameProgress={gameProgress} />
    </div>
  );
}
