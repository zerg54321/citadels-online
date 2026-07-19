let forceSyncPhases = false;

export function setForceSyncPhases(enabled: boolean) {
  forceSyncPhases = enabled;
}

const FAST = process.env.CITADELS_FAST === '1' || process.env.CITADELS_SYNC === '1';
const SYNC = process.env.CITADELS_SYNC === '1';
export const DELAY_SHORT = FAST ? 30 : 3000;
export const DELAY_LONG = FAST ? 50 : 5000;
export const MAX_CHARACTER_SKIP_ATTEMPTS = 10;

export function schedulePhase(fn: () => void, ms: number) {
  if (SYNC || forceSyncPhases) {
    fn();
    return;
  }
  setTimeout(fn, ms);
}
