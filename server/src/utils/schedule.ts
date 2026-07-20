export const MAX_CHARACTER_SKIP_ATTEMPTS = 10;

export function schedulePhase(fn: () => void, ms: number, sync: boolean) {
  if (sync) {
    fn();
    return;
  }
  setTimeout(fn, ms);
}
