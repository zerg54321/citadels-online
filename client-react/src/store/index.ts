import { create } from 'zustand';
import { createAuthSlice, type AuthSlice } from './authSlice';
import { createGameSlice, type GameSlice } from './gameSlice';
import { createChatSlice, type ChatSlice } from './chatSlice';

export type AppStore = AuthSlice & GameSlice & ChatSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createGameSlice(...a),
  ...createChatSlice(...a),
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
  useIsConnected,
  selectPlayerFromId,
  getDistrictData,
  selectDistrictDestroyPrice,
  selectPlayerPosition,
} from './selectors';
