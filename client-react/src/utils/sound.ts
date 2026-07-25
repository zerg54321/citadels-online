// Lightweight Web Audio sound effects. No binary assets needed — sounds are
// synthesized on the fly with oscillators. Browsers require a user gesture
// before audio can play; by the time a game board is reachable the user has
// already clicked through lobby/auth, so AudioContext will resume fine.

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

/**
 * Short ascending two-note "ding" played when it becomes the local player's
 * turn to act during the action phase. Kept soft and brief so it notifies
 * without being intrusive.
 */
export function playTurnSound(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => { /* ignore */ });
  const now = c.currentTime;
  // Two ascending sine notes (A5 → E6) for a gentle "ding-dong" rise.
  [880, 1320].forEach((freq, i) => {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    const start = now + i * 0.11;
    gain.gain.setValueAtTime(0, start);
    gain.gain.linearRampToValueAtTime(0.16, start + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.001, start + 0.18);
    osc.connect(gain).connect(c.destination);
    osc.start(start);
    osc.stop(start + 0.2);
  });
}
