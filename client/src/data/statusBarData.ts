import { ClientGameState, getStatusBarData as getStatusBarDataPure } from 'citadels-common';

import { store } from '../store';

/**
 * Thin client wrapper around the framework-agnostic pure function in
 * `common/view/statusBar.ts`. It injects the Vuex-only selection state
 * (`selectedCards`) that the pure function cannot derive from the game
 * state alone, so Vue components keep their original call signature
 * `getStatusBarData(gameState)`.
 */
export function getStatusBarData(state: ClientGameState) {
  return getStatusBarDataPure(state, {
    selectedCards: store.getters.selectedCards,
  });
}

export default getStatusBarData;
