// AV config table (D10). One entry per game/UI event. Each entry drives
// BOTH the visual animation parameters (spring stiffness/damping, scale
// peak) AND the audio (synth id, audioLeadMs, intensity). The dispatcher
// (utils/av.ts) reads this so a single dispatchAv call keeps sound and
// picture locked together.
//
// audioLeadMs: audio fires this many ms BEFORE the visual peak so the
// audio's transient lands on the visual "land/bounce" moment. Under
// prefers-reduced-motion the visual is instant (peak at t=0) so the
// dispatcher zeroes the lead.
//
// intensity (1-3): drives spring stiffness/scale amplitude AND audio
// variant+volume. Higher = heavier land + louder/bigger sound.
//
// This is the single source of truth shared by Phase C (visual) and
// Phase D (audio). No per-call hand-tuning in components.

export type AvEvent =
  // L1 local-only
  | 'ui_hover'
  | 'ui_click'
  | 'ui_panel_open'
  | 'ui_error'
  | 'self_countdown_tick'
  // L2 量感分流
  | 'earn_gold'
  | 'draw_card'
  | 'build_cheap'
  // L3 global broadcast
  | 'role_reveal'
  | 'stamp_kill'
  | 'stamp_rob'
  | 'kill_settle'
  | 'rob_settle'
  | 'build_expensive'
  | 'destroy'
  | 'turn_handoff'
  | 'win_stinger'
  | 'lose_stinger';

export interface AvConfigEntry {
  /** Audio synth id (see utils/audio.ts). null = no audio for this event. */
  audio: string | null;
  /** ms audio leads the visual peak. Zeroed under reduced-motion. */
  audioLeadMs: number;
  /** Default intensity 1-3; callers may override per-event (e.g. build by cost). */
  intensity: 1 | 2 | 3;
  /** Visual spring for framer-motion. null = no default spring (caller-driven). */
  spring?: { stiffness: number; damping: number; mass?: number };
  /** Visual scale peak (relative to 1.0). null = no scale anim. */
  scalePeak?: number;
  /** Audio tier (D9): who hears it. */
  tier: 'L1' | 'L2' | 'L3';
}

const AV_CONFIG: Record<AvEvent, AvConfigEntry> = {
  // ── L1 local-only ──
  ui_hover: {
    audio: 'ui_hover', audioLeadMs: 0, intensity: 1, tier: 'L1',
  },
  ui_click: {
    audio: 'ui_click', audioLeadMs: 0, intensity: 1, tier: 'L1',
  },
  ui_panel_open: {
    audio: 'ui_panel_open', audioLeadMs: 0, intensity: 1, tier: 'L1',
  },
  ui_error: {
    audio: 'ui_error', audioLeadMs: 0, intensity: 2, tier: 'L1',
  },
  self_countdown_tick: {
    audio: 'self_countdown_tick', audioLeadMs: 0, intensity: 2, tier: 'L1',
  },

  // ── L2 量感分流 ──
  earn_gold: {
    audio: 'earn_gold', audioLeadMs: 0, intensity: 2, tier: 'L2',
  },
  draw_card: {
    audio: 'draw_card', audioLeadMs: -40, intensity: 1, tier: 'L2', spring: { stiffness: 320, damping: 26 }, scalePeak: 1.08,
  },
  build_cheap: {
    audio: 'build_cheap', audioLeadMs: 30, intensity: 1, tier: 'L2', spring: { stiffness: 380, damping: 24 }, scalePeak: 1.06,
  },

  // ── L3 global broadcast ──
  role_reveal: {
    audio: 'role_reveal', audioLeadMs: 60, intensity: 2, tier: 'L3', spring: { stiffness: 260, damping: 30 }, scalePeak: 1.0,
  },
  stamp_kill: {
    audio: 'stamp_kill', audioLeadMs: 20, intensity: 3, tier: 'L3', spring: { stiffness: 500, damping: 16, mass: 0.8 }, scalePeak: 2.4,
  },
  stamp_rob: {
    audio: 'stamp_rob', audioLeadMs: 20, intensity: 3, tier: 'L3', spring: { stiffness: 500, damping: 16, mass: 0.8 }, scalePeak: 2.4,
  },
  kill_settle: {
    audio: 'kill_settle', audioLeadMs: 0, intensity: 3, tier: 'L3',
  },
  rob_settle: {
    audio: 'rob_settle', audioLeadMs: 0, intensity: 3, tier: 'L3',
  },
  build_expensive: {
    audio: 'build_expensive', audioLeadMs: 40, intensity: 3, tier: 'L3', spring: { stiffness: 300, damping: 20 }, scalePeak: 1.12,
  },
  destroy: {
    audio: 'destroy', audioLeadMs: 30, intensity: 3, tier: 'L3',
  },
  turn_handoff: {
    audio: 'turn_handoff', audioLeadMs: 0, intensity: 1, tier: 'L3',
  },
  win_stinger: {
    audio: 'win_stinger', audioLeadMs: 0, intensity: 3, tier: 'L3',
  },
  lose_stinger: {
    audio: 'lose_stinger', audioLeadMs: 0, intensity: 2, tier: 'L3',
  },
};

/** Ordered list of all AV events, grouped by tier. Drives the DEV AV
 *  panel soundboard so the panel never drifts from the config table. */
export const AV_EVENTS: AvEvent[] = [
  // L1 local-only
  'ui_hover', 'ui_click', 'ui_panel_open', 'ui_error', 'self_countdown_tick',
  // L2 量感分流
  'earn_gold', 'draw_card', 'build_cheap',
  // L3 global broadcast
  'role_reveal', 'stamp_kill', 'stamp_rob', 'kill_settle', 'rob_settle',
  'build_expensive', 'destroy', 'turn_handoff', 'win_stinger', 'lose_stinger',
];

export function getAvConfig(event: AvEvent): AvConfigEntry {
  return AV_CONFIG[event];
}

/** Resolve audioLeadMs, zeroing it under reduced-motion (visual is instant →
 * peak at t=0, audio must fire immediately). */
export function resolveLeadMs(event: AvEvent, reducedMotion: boolean): number {
  if (reducedMotion) return 0;
  return AV_CONFIG[event].audioLeadMs;
}
