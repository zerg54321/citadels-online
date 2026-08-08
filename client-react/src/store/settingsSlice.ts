import type { StateCreator } from 'zustand';
import type { AuthSlice } from './authSlice';
import type { GameSlice } from './gameSlice';
import type { ChatSlice } from './chatSlice';

// Audio/UX settings slice. Persisted manually to localStorage (same pattern as
// authSlice's initAuth), NOT via zustand persist middleware, so the store stays
// a plain compose of slices. main.tsx calls initSettings() before mount to
// restore the saved volume/mute. Selectors (see selectors.ts) return primitive
// values only — never a spread object — to obey the stable-reference rule.
export interface SettingsSlice {
  // Sound-effects volume, 0..1. The audio engine (utils/audio.ts, Phase D3)
  // multiplies every Howl by this after applying per-event tier/variant gains.
  sfxVolume: number;
  // Master mute for all game/UI sound effects.
  muted: boolean;
  // Restore saved settings from localStorage (called once on app init).
  initSettings: () => void;
  setSfxVolume: (v: number) => void;
  setMuted: (m: boolean) => void;
}

const SFX_VOLUME_KEY = 'sfxVolume';
const MUTED_KEY = 'sfxMuted';
const DEFAULT_SFX_VOLUME = 0.7;

function readVolume(): number {
  const raw = localStorage.getItem(SFX_VOLUME_KEY);
  if (raw == null) return DEFAULT_SFX_VOLUME;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 && n <= 1 ? n : DEFAULT_SFX_VOLUME;
}

function readMuted(): boolean {
  const raw = localStorage.getItem(MUTED_KEY);
  if (raw == null) return false;
  return raw === '1' || raw === 'true';
}

export const createSettingsSlice: StateCreator<
  AuthSlice & GameSlice & ChatSlice & SettingsSlice, [], [], SettingsSlice
> = (set) => ({
  sfxVolume: DEFAULT_SFX_VOLUME,
  muted: false,

  initSettings() {
    set({ sfxVolume: readVolume(), muted: readMuted() });
  },

  setSfxVolume(v) {
    const clamped = Math.max(0, Math.min(1, v));
    localStorage.setItem(SFX_VOLUME_KEY, String(clamped));
    set({ sfxVolume: clamped });
  },

  setMuted(m) {
    localStorage.setItem(MUTED_KEY, m ? '1' : '0');
    set({ muted: m });
  },
});
