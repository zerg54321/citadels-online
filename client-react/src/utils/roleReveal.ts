// Role-reveal flip stagger. Guarantees a minimum visual gap between
// consecutive role-card reveal flips in the call sequence, so that each
// reveal is a distinct event (and, once per-reveal sounds land in Phase D,
// the sounds never overlap or collide).
//
// Scope: only the per-seat role cards and the local player's self role
// card opt in via CharacterCard's `staggerReveal` prop. The centre draft
// grid keeps its single batch flip (choose -> DONE) untouched.
//
// Sync: the local player's role is rendered twice (own SeatPanel + the
// BoardScreen self-role card) for the same characterId. Keying the assigned
// delay by characterId makes both renders share one delay, so they flip
// together while staying staggered against other seats' reveals.
//
// The server already spaces killed-character skips by ~1500-3000ms; this
// layer is a no-op whenever reveals arrive >= MIN_GAP apart and only
// stretches the sub-MIN_GAP cases (e.g. fast AI consecutive reveals, or any
// same-notify multi-reveal path) up to MIN_GAP. CRITICAL: the per-card delay
// is hard-capped at MAX_DELAY so accumulated stagger can never exceed the
// server's skipDelay — otherwise a late reveal (e.g. the Warlord, 8th in
// order) could still be mid-stagger when the server advances past it into
// the next round, and the flip would be swallowed by the round transition.

const MIN_GAP = 320; // ms — minimum gap between consecutive reveal flip-starts
const MAX_DELAY = 600; // ms — per-card cap; keep well under server skipDelay (~1500+)
const IDLE_RESET = 6000; // ms — no reveal for this long => new round, clear state

let nextAvailableAt = 0; // ms timestamp; earliest a new reveal flip may start
let lastAssignRealAt = 0; // real time of last assignment (drives idle reset)
const assigned = new Map<number, number>(); // characterId -> delay ms (per round)
// Audio dedup: the self role card and the self SeatPanel render the same
// characterId, so without dedup both would fire role_reveal/stamp audio →
// double sound. These Sets track which characterId's audio already played
// this round; cleared on idle reset alongside the delay cache.
const playedRevealAudio = new Set<number>();
const playedStampAudio = new Set<number>();

function maybeReset(now: number) {
  if (lastAssignRealAt && now - lastAssignRealAt > IDLE_RESET) {
    nextAvailableAt = 0;
    assigned.clear();
    playedRevealAudio.clear();
    playedStampAudio.clear();
  }
}

export function getRevealDelay(characterId: number): number {
  if (!characterId) return 0;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  maybeReset(now);
  const cached = assigned.get(characterId);
  if (cached !== undefined) return cached;
  let delay = 0;
  if (nextAvailableAt > now) delay = Math.min(nextAvailableAt - now, MAX_DELAY);
  const startAt = now + delay;
  nextAvailableAt = startAt + MIN_GAP;
  lastAssignRealAt = now;
  assigned.set(characterId, delay);
  return delay;
}

/** Returns true the first time a characterId's reveal audio is requested
 *  this round, false thereafter (dedup across self card + seat panel). */
export function claimRevealAudio(characterId: number): boolean {
  if (!characterId) return false;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  maybeReset(now);
  if (playedRevealAudio.has(characterId)) return false;
  playedRevealAudio.add(characterId);
  return true;
}

/** Same dedup for stamp (kill/rob) audio. */
export function claimStampAudio(characterId: number): boolean {
  if (!characterId) return false;
  const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
  maybeReset(now);
  if (playedStampAudio.has(characterId)) return false;
  playedStampAudio.add(characterId);
  return true;
}
