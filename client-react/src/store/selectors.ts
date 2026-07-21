import {
  ClientGameState, GameProgress, PlayerId, DistrictId, districts,
  getDistrictDestroyPrice,
} from 'citadels-common';
import { useAppStore } from './index';

// --- Hooks (subscribe to store slices) ---

export const useIsInRoom = () => useAppStore((s) => s.gameState !== undefined);

export const useGameProgress = () => useAppStore((s) => {
  switch (s.gameState?.progress) {
    case GameProgress.IN_LOBBY: return 'IN_LOBBY' as const;
    case GameProgress.IN_GAME: return 'IN_GAME' as const;
    case GameProgress.FINISHED: return 'FINISHED' as const;
    default: return 'UNKNOWN' as const;
  }
});

export const useGameSetupData = () => useAppStore((s) => s.gameSetupData);

export const useCurrentPlayerId = () => useAppStore((s) => {
  if (s.gameState === undefined) return undefined;
  return s.gameState.board.playerOrder[s.gameState.board.currentPlayer];
});

export const useIsCurrentPlayerSelf = () => useAppStore((s) => {
  if (s.gameState === undefined) return false;
  const cp = s.gameState.board.playerOrder[s.gameState.board.currentPlayer];
  return s.gameState.self === cp;
});

export const useCharactersList = () => useAppStore((s) => s.gameState?.board.characters);

export const useSelectedCards = () => useAppStore((s) => s.selectedCards);

export const useGameState = () => useAppStore((s) => s.gameState);

// --- Pure selectors (operate on gameState, no subscription) ---
// Components call these inside useMemo with the gameState from useGameState().

export const selectPlayerFromId = (gs: ClientGameState | undefined) => (playerId: PlayerId) => gs?.players[playerId];

export const getDistrictData = (districtId: DistrictId) => districts[districtId as keyof typeof districts];

export const selectDistrictDestroyPrice = (gs: ClientGameState | undefined) =>
  (playerId: PlayerId, districtId: DistrictId) =>
    getDistrictDestroyPrice(gs, playerId, districtId);

export const selectPlayerPosition = (gs: ClientGameState | undefined) => (playerId: PlayerId) => gs?.board.playerOrder.indexOf(playerId);
