import { useMemo } from 'react';
import { TeamId } from 'citadels-common';
import { useGameState } from '@/store';

// Whether any seated player is on team A or B, i.e. whether the team score
// bar (GameTopBar) and the EndGameModal team rows should render. Extracted
// from the identical useMemo that previously lived in both GameTopBar.tsx
// and BoardScreen.tsx so the two views cannot drift.
export function useTeamScores(): boolean {
  const gameState = useGameState();
  return useMemo(() => {
    if (!gameState?.board?.playerOrder) return false;
    return Object.values(gameState.players).some(
      (p) => p.team === TeamId.A || p.team === TeamId.B,
    );
  }, [gameState]);
}
