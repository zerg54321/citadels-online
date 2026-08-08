import { create } from 'zustand';
import { createAuthSlice, type AuthSlice } from './authSlice';
import { createGameSlice, type GameSlice } from './gameSlice';
import { createChatSlice, type ChatSlice } from './chatSlice';
import { createSettingsSlice, type SettingsSlice } from './settingsSlice';

export type AppStore = AuthSlice & GameSlice & ChatSlice & SettingsSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createGameSlice(...a),
  ...createChatSlice(...a),
  ...createSettingsSlice(...a),
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
  useSeenCharacterIds,
  useSfxVolume,
  useMuted,
} from './selectors';
