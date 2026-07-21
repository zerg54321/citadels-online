import { create } from 'zustand';
import { createAuthSlice, type AuthSlice } from './authSlice';
import { createGameSlice, type GameSlice } from './gameSlice';

export type AppStore = AuthSlice & GameSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createGameSlice(...a),
}));

// Re-export selectors so components import from a single '@/store' entry.
export {
  useIsInRoom,
  useGameProgress,
  useGameSetupData,
  useCurrentPlayerId,
  useIsCurrentPlayerSelf,
  useCharactersList,
  useSelectedCards,
  useGameState,
  selectPlayerFromId,
  getDistrictData,
  selectDistrictDestroyPrice,
  selectPlayerPosition,
} from './selectors';
