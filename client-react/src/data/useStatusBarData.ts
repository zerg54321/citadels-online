import { useMemo } from 'react';
import { ClientGameState, getStatusBarData, type StatusBarData } from 'citadels-common';
import { useAppStore } from '@/store';

const EMPTY: StatusBarData = { type: 'NORMAL', message: '', args: undefined };

/**
 * React hook wrapping the framework-agnostic `getStatusBarData` pure function
 * (common/view/statusBar.ts). Injects the Zustand-only `selectedCards` that
 * the pure function cannot derive from game state alone. Mirrors the Vue
 * client's data/statusBarData.ts thin wrapper.
 */
export function useStatusBarData(state: ClientGameState | undefined): StatusBarData {
  const selectedCards = useAppStore((s) => s.selectedCards);
  return useMemo(() => {
    if (!state) return EMPTY;
    return getStatusBarData(state, { selectedCards });
  }, [state, selectedCards]);
}
