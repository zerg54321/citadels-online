// AV dispatcher (C2). Single entry that keeps sound and picture locked
// together. Components read visual params (spring/scalePeak) from
// avConfig directly for their framer-motion animations; this dispatcher
// handles the AUDIO side with correct lead timing, and exposes a helper
// for callers that want a unified "fire both" entry.
//
// D10 lead timing: audio fires audioLeadMs BEFORE the visual peak so the
// audio transient lands on the visual land/bounce. Under reduced-motion
// the visual is instant (peak at t=0) so lead is zeroed → audio fires
// immediately.
//
// Role (D9): L3 settlement events sound different per role. The caller
// resolves role from feed params + local self + local-issued move history
// and passes it here; the synth engine (audio.ts) picks the variant.
//
// Edge-trigger discipline: this dispatcher does NOT dedupe — callers must
// only invoke on genuine edges (feed signature change / state-diff increment
// / UI handler). See plan §11 音效边沿触发纪律.

import { playSfx, type AudioRole } from '@/utils/audio';
import { getAvConfig, resolveLeadMs, type AvEvent } from '@/utils/avConfig';

export interface DispatchOpts {
  intensity?: 1 | 2 | 3;
  role?: AudioRole;
  amount?: number;
  /** true if the event is on another player's board (L2 distant variant). */
  distant?: boolean;
  /** override reduced-motion detection (else reads useReducedMotion at call
   *  site and passes here, since this util is not a hook). */
  reducedMotion?: boolean;
}

/** Dispatch audio for an event with correct lead timing. Visual animation
 *  is driven by the component reading avConfig; this handles audio only.
 *  Returns false if audio was suppressed (muted/no synth). */
export function dispatchAv(event: AvEvent, opts: DispatchOpts = {}): boolean {
  const cfg = getAvConfig(event);
  if (!cfg.audio) return false;
  const lead = resolveLeadMs(event, Boolean(opts.reducedMotion));
  const play = () => playSfx(cfg.audio as string, {
    intensity: opts.intensity ?? cfg.intensity,
    role: opts.role,
    amount: opts.amount,
    distant: opts.distant,
  });
  if (lead === 0) return play();
  // Non-zero lead: audio must land at a specific offset from now (on or near
  // the visual peak), so schedule a SINGLE delayed play. Never also play
  // immediately — that double-fired the loudest events (role_reveal/stamp/
  // build/destroy) and was the main source of cluttered audio.
  //   lead > 0: visual peaks ~lead ms after dispatch → delay audio by lead
  //   lead < 0: audio intended after peak → delay by |lead|
  window.setTimeout(play, lead > 0 ? lead : -lead);
  return true;
}

/** Convenience: just play the audio now (no lead), for UI-handler L1 events
 *  where there's no visual peak to align to. */
export function playUi(event: AvEvent, opts: DispatchOpts = {}): boolean {
  return playSfx(getAvConfig(event).audio as string, {
    intensity: opts.intensity,
    role: opts.role,
    amount: opts.amount,
    distant: opts.distant,
  });
}
