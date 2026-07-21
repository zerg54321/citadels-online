import { create } from 'zustand';
import { createAuthSlice, type AuthSlice } from './authSlice';
import { createGameSlice, type GameSlice } from './gameSlice';

export type AppStore = AuthSlice & GameSlice;

export const useAppStore = create<AppStore>()((...a) => ({
  ...createAuthSlice(...a),
  ...createGameSlice(...a),
}));
