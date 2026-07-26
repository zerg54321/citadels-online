import { createContext, useContext } from 'react';

export type LogMode = 'dock' | 'overlay';

export interface GameStageContextValue {
  mode: LogMode;
  // Portal targets. `logDockEl` is the native-width panel beside the canvas
  // (dock mode only); `logOverlayEl` is an absolute host layered over the
  // canvas (overlay mode only). The unused one is null so ActionLog can guard.
  logDockEl: HTMLElement | null;
  logOverlayEl: HTMLElement | null;
}

export const GameStageContext = createContext<GameStageContextValue | null>(null);

export function useGameStage(): GameStageContextValue | null {
  return useContext(GameStageContext);
}
