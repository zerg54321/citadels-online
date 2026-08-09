// Audio engine (Phase D). Plays the sample files in public/sfx/ via howler
// (see MANIFEST.md), falling back to Web Audio synthesis if howler is
// unavailable or a file fails. Zero hard dependency on either path at
// runtime — samples are primary, synth is the safety net.
//
// D9 role-aware playback: L3 settlement events (kill_settle/rob_settle/
// destroy) pick different sample files per role — REPLACE (victim hears
// alarm, others neutral) or LAYER (base + perp/victim tails). Role is
// resolved by the caller (dispatchAv) from feed params + local self +
// local-issued move history.
//
// D2 distant variant for L2 others: earn/draw/build_cheap swap to a
// *_distant sample (muffled) when opts.distant is true.
//
// Volume/mute read from settingsSlice at call time via
// useAppStore.getState() (plain function, not a hook).

import { Howl } from 'howler';
import { useAppStore } from '@/store';

export type AudioRole = 'perpetrator' | 'victim' | 'teammate' | 'other' | 'self';

interface PlayOpts {
  intensity?: 1 | 2 | 3;
  role?: AudioRole;
  /** earn amount for variant selection; draw/build count, etc. */
  amount?: number;
  /** L2 others use distant (muffled) variant. */
  distant?: boolean;
}

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  if (!ctx) {
    const AC = window.AudioContext
      || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

function settings() {
  const { muted, sfxVolume } = useAppStore.getState();
  return { muted, vol: muted ? 0 : sfxVolume };
}

// intensity 1/2/3 → peak gain multiplier (shared by howler + synth paths).
const INT_GAIN = [0, 0.10, 0.16, 0.22];

// ── howler sample layer ──

// Basenames that ship both mp3 + ogg (browser-format fallback). The rest
// are mp3-only (mp3 is universally supported). Mirrors generate_sfx.py's
// has_ogg flags.
const HAS_OGG = new Set([
  'hover', 'click', 'panel_open', 'error', 'countdown_tick',
  'role_reveal', 'stamp_kill', 'stamp_rob', 'build_expensive',
  'turn_handoff', 'win', 'lose',
]);

function sourcesFor(name: string): string[] {
  const base = `${import.meta.env.BASE_URL}sfx/${name}`;
  return HAS_OGG.has(name) ? [`${base}.mp3`, `${base}.ogg`] : [`${base}.mp3`];
}

const howlCache = new Map<string, Howl>();

function getHowl(name: string): Howl | null {
  if (typeof window === 'undefined') return null;
  let h = howlCache.get(name);
  if (h) return h;
  try {
    h = new Howl({ src: sourcesFor(name), preload: true, volume: 1 });
    howlCache.set(name, h);
    return h;
  } catch {
    return null;
  }
}

interface FileHit {
  name: string;
  /** ms delay before this clip starts (for layered tails). */
  delay: number;
  /** gain multiplier relative to the event's intensity gain. */
  gainMul: number;
}

// Map an event id + opts to the sample file(s) to play. Returns [] if the
// event has no sample mapping (shouldn't happen — all 18 are covered).
function eventToFiles(id: string, o: PlayOpts): FileHit[] {
  const one = (name: string): FileHit[] => [{ name, delay: 0, gainMul: 1 }];
  switch (id) {
    case 'ui_hover': return one('hover');
    case 'ui_click': return one('click');
    case 'ui_panel_open': return one('panel_open');
    case 'ui_error': return one('error');
    case 'self_countdown_tick': return one('countdown_tick');
    case 'earn_gold': {
      const amt = o.amount ?? 1;
      const variant = amt <= 1 ? 'earn_1' : amt <= 3 ? 'earn_2' : 'earn_3';
      // P1: 他人收租保留微弱存在感(gainMul 0.3)——收租是有意义的经济信号。
      if (o.distant) return [{ name: 'earn_distant', delay: 0, gainMul: 0.3 }];
      return one(variant);
    }
    case 'draw_card': return one(o.distant ? 'draw_distant' : 'draw');
    case 'build_cheap': return one(o.distant ? 'build_cheap_distant' : 'build_cheap');
    case 'role_reveal': return one('role_reveal');
    case 'stamp_kill': return one('stamp_kill');
    case 'stamp_rob': return one('stamp_rob');
    case 'kill_settle': return one(o.role === 'victim' ? 'kill_victim' : 'kill_neutral');
    case 'rob_settle': {
      // LAYER: base + role tail (tail staggered slightly after base).
      const hits: FileHit[] = [{ name: 'rob_base', delay: 0, gainMul: 1 }];
      if (o.role === 'perpetrator') hits.push({ name: 'rob_perp', delay: 60, gainMul: 0.8 });
      else if (o.role === 'victim') hits.push({ name: 'rob_victim', delay: 60, gainMul: 0.9 });
      return hits;
    }
    // P1: 他人高价建造走 distant(闷+弱):无独立 distant 采样,降 gainMul 至 0.3
    // 使旁观者只听到微弱存在感;synth 回退走 distantChain 低通。
    case 'build_expensive': return [{ name: 'build_expensive', delay: 0, gainMul: o.distant ? 0.3 : 1 }];
    case 'destroy':
      if (o.role === 'victim') return one('destroy_victim');
      if (o.role === 'perpetrator') return one('destroy_perp');
      // P1: 旁观拆迁无需强提示,neutral 降到 ~0.3 gain。
      return [{ name: 'destroy_neutral', delay: 0, gainMul: 0.3 }];
    case 'turn_handoff': return one('turn_handoff');
    case 'win_stinger': return one('win');
    case 'lose_stinger': return one('lose');
    default: return [];
  }
}

function tryHowler(id: string, o: PlayOpts, vol: number): boolean {
  const hits = eventToFiles(id, o);
  if (!hits.length) return false;
  const intensity = o.intensity ?? 2;
  const baseGain = INT_GAIN[intensity] * vol;
  let played = false;
  hits.forEach((hit) => {
    const h = getHowl(hit.name);
    if (!h) return;
    const gain = Math.min(1, baseGain * hit.gainMul);
    const fire = () => {
      try {
        h.volume(gain);
        h.play();
        played = true;
      } catch { /* ignore individual clip failure */ }
    };
    if (hit.delay > 0) window.setTimeout(fire, hit.delay);
    else fire();
  });
  return played;
}

// ── synth fallback (Web Audio) ──

function tone(
  c: AudioContext,
  freq: number,
  start: number,
  dur: number,
  peak: number,
  type: OscillatorType = 'sine',
  dest: AudioNode | undefined = undefined,
) {
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
  osc.connect(gain).connect(dest ?? c.destination);
  osc.start(start);
  osc.stop(start + dur + 0.02);
}

function noise(
  c: AudioContext,
  start: number,
  dur: number,
  peak: number,
  filterFreq: number,
  dest: AudioNode | undefined = undefined,
) {
  const frames = Math.floor(c.sampleRate * dur);
  const buf = c.createBuffer(1, frames, c.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const filter = c.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.value = filterFreq;
  const gain = c.createGain();
  gain.gain.setValueAtTime(0, start);
  gain.gain.linearRampToValueAtTime(peak, start + 0.008);
  gain.gain.exponentialRampToValueAtTime(0.001, start + dur);
  src.connect(filter).connect(gain).connect(dest ?? c.destination);
  src.start(start);
  src.stop(start + dur + 0.02);
}

function distantChain(c: AudioContext) {
  const lp = c.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 700;
  const g = c.createGain();
  g.gain.value = 0.35;
  lp.connect(g).connect(c.destination);
  return lp;
}

const SYNTHS: Record<string, (c: AudioContext, now: number, peak: number, o: PlayOpts) => void> = {
  ui_hover: (c, now, peak) => noise(c, now, 0.05, peak * 0.5, 1800),
  ui_click: (c, now, peak) => tone(c, 1200, now, 0.03, peak, 'square'),
  ui_panel_open: (c, now, peak) => {
    tone(c, 440, now, 0.06, peak * 0.7, 'sine');
    tone(c, 660, now + 0.05, 0.08, peak * 0.7, 'sine');
  },
  ui_error: (c, now, peak) => {
    tone(c, 220, now, 0.09, peak, 'sawtooth');
    tone(c, 180, now + 0.09, 0.12, peak, 'sawtooth');
  },
  self_countdown_tick: (c, now, peak) => tone(c, 1500, now, 0.04, peak * 0.6, 'square'),
  earn_gold: (c, now, peak, o) => {
    const amt = o.amount ?? 1;
    const variant = amt <= 1 ? 1 : amt <= 3 ? 2 : 3;
    const dest = o.distant ? distantChain(c) : undefined;
    if (variant === 1) tone(c, 988, now, 0.10, peak, 'triangle', dest);
    else if (variant === 2) {
      tone(c, 784, now, 0.08, peak * 0.8, 'triangle', dest);
      tone(c, 988, now + 0.06, 0.08, peak * 0.8, 'triangle', dest);
    } else {
      [659, 784, 988, 1175].forEach((f, i) => tone(c, f, now + i * 0.05, 0.08, peak * 0.7, 'triangle', dest));
    }
  },
  draw_card: (c, now, peak, o) => {
    const dest = o.distant ? distantChain(c) : undefined;
    noise(c, now, 0.08, peak * 0.6, 2400, dest);
  },
  build_cheap: (c, now, peak, o) => {
    const dest = o.distant ? distantChain(c) : undefined;
    tone(c, 160, now, 0.10, peak, 'triangle', dest);
    noise(c, now, 0.06, peak * 0.4, 1200, dest);
  },
  role_reveal: (c, now, peak) => {
    tone(c, 523, now, 0.12, peak * 0.6, 'sine');
    tone(c, 659, now + 0.04, 0.16, peak * 0.7, 'sine');
  },
  stamp_kill: (c, now, peak) => {
    tone(c, 90, now, 0.15, peak, 'sine');
    noise(c, now, 0.10, peak * 0.5, 600);
  },
  stamp_rob: (c, now, peak) => {
    tone(c, 110, now, 0.12, peak * 0.8, 'sine');
    tone(c, 1800, now, 0.06, peak * 0.5, 'triangle');
  },
  kill_settle: (c, now, peak, o) => {
    if (o.role === 'victim') {
      tone(c, 140, now, 0.18, peak, 'sawtooth');
      tone(c, 140, now + 0.18, 0.18, peak, 'sawtooth');
    } else {
      tone(c, 200, now, 0.14, peak * 0.7, 'sine');
    }
  },
  rob_settle: (c, now, peak, o) => {
    tone(c, 300, now, 0.10, peak * 0.6, 'triangle');
    if (o.role === 'perpetrator') tone(c, 880, now + 0.08, 0.12, peak * 0.6, 'sine');
    else if (o.role === 'victim') tone(c, 220, now + 0.08, 0.14, peak * 0.7, 'sawtooth');
  },
  build_expensive: (c, now, peak, o) => {
    const dest = o.distant ? distantChain(c) : undefined;
    tone(c, 130, now, 0.18, peak, 'sine', dest);
    tone(c, 196, now + 0.02, 0.22, peak * 0.7, 'sine', dest);
    noise(c, now, 0.12, peak * 0.4, 800, dest);
  },
  destroy: (c, now, peak, o) => {
    if (o.role === 'victim') {
      noise(c, now, 0.20, peak, 500);
      tone(c, 100, now, 0.18, peak * 0.7, 'sawtooth');
    } else if (o.role === 'perpetrator') {
      tone(c, 180, now, 0.14, peak * 0.8, 'triangle');
      noise(c, now, 0.10, peak * 0.4, 1000);
    } else {
      // P1: 旁观拆迁 neutral 降到 ~0.3 peak。
      noise(c, now, 0.14, peak * 0.3, 700);
    }
  },
  turn_handoff: (c, now, peak) => tone(c, 660, now, 0.08, peak * 0.5, 'sine'),
  win_stinger: (c, now, peak) => {
    [523, 659, 784, 1047].forEach((f, i) => tone(c, f, now + i * 0.10, 0.30, peak * 0.7, 'sine'));
  },
  lose_stinger: (c, now, peak) => {
    [392, 330, 262, 196].forEach((f, i) => tone(c, f, now + i * 0.12, 0.30, peak * 0.6, 'sine'));
  },
};

function synthFallback(id: string, o: PlayOpts, vol: number): boolean {
  const c = getCtx();
  if (!c) return false;
  if (c.state === 'suspended') c.resume().catch(() => { /* ignore */ });
  const synth = SYNTHS[id];
  if (!synth) return false;
  const intensity = o.intensity ?? 2;
  const peak = INT_GAIN[intensity] * vol;
  synth(c, c.currentTime, peak, o);
  return true;
}

// ── public API ──

/** Play a sound for an event id. Tries the sample file first (howler),
 *  falls back to Web Audio synthesis if howler is missing or fails.
 *  Respects mute/volume settings. Returns false if suppressed. */
export function playSfx(id: string, opts: PlayOpts = {}): boolean {
  const { muted, vol } = settings();
  if (muted || vol <= 0) return false;
  if (tryHowler(id, opts, vol)) return true;
  return synthFallback(id, opts, vol);
}

/** Legacy turn-sound kept for BoardScreen's existing call site; now routes
 *  through the engine (sample 'role_reveal'-like ding, synth fallback). */
export function playTurnSound(): void {
  const { muted, vol } = settings();
  if (muted || vol <= 0) return;
  if (tryHowler('turn_handoff', {}, vol)) return;
  const c = getCtx();
  if (!c) return;
  if (c.state === 'suspended') c.resume().catch(() => { /* ignore */ });
  const now = c.currentTime;
  const peak = 0.16 * vol;
  [880, 1320].forEach((freq, i) => tone(c, freq, now + i * 0.11, 0.18, peak, 'sine'));
}
