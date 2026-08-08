// Re-export from the new Web Audio engine (utils/audio.ts). The original
// playTurnSound lived here as a standalone synth; it now routes through
// audio.ts so volume/mute settings are read consistently. Kept as a thin
// shim so existing import sites (BoardScreen) don't break.
export { playTurnSound } from '@/utils/audio';
