// DEV AV Panel — development-only audio/visual debug harness.
//
// Soundboard: lists every event in avConfig (the single source of truth) with
// a play button plus per-event modifiers (intensity / role / amount / distant)
// so each variant of each sound can be auditioned in isolation. Volume + mute
// are the live settings-store values, adjustable in-panel.
//
// Animation Harness: triggers the three core game animations — role-card
// flip, kill/rob stamp slam, and build fly-in — using the SAME spring/scalePeak
// params from avConfig that production reads, and fires the matching audio
// through the dispatcher so animation/audio 咬合 (sync) can be verified without
// entering a real game. Audio can be fired via the clean lead path or the real
// dispatchAv path (A/B to spot dispatcher issues).
//
// Mounts only under import.meta.env.DEV (see App.tsx) and portals to
// document.body so it escapes the GameStage scale layer and never affects the
// real game layout. It does NOT touch CenterPanel/ActionPanel/BoardScreen.

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, useAnimationControls, useReducedMotion } from 'framer-motion';
import {
  AV_EVENTS, getAvConfig, resolveLeadMs, type AvEvent,
} from '@/utils/avConfig';
import { dispatchAv, playUi } from '@/utils/av';
import { playSfx, type AudioRole } from '@/utils/audio';
import { useAppStore, useSfxVolume, useMuted } from '@/store';
import { cn } from '@/utils/cn';

// ── per-event modifier metadata (mirrors audio.ts eventToFiles) ──

const ROLE_OPTIONS: Partial<Record<AvEvent, AudioRole[]>> = {
  kill_settle: ['victim', 'other'],
  rob_settle: ['perpetrator', 'victim', 'other'],
  destroy: ['victim', 'perpetrator', 'other'],
};

const AMOUNT_EVENTS = new Set<AvEvent>(['earn_gold']);
const AMOUNT_OPTIONS = [1, 2, 3, 4, 6];

const DISTANT_EVENTS = new Set<AvEvent>(['earn_gold', 'draw_card', 'build_cheap']);

const TIER_LABEL: Record<'L1' | 'L2' | 'L3', string> = {
  L1: 'L1 local',
  L2: 'L2 量感',
  L3: 'L3 broadcast',
};

interface EvState {
  intensity: 1 | 2 | 3;
  role?: AudioRole;
  amount: number;
  distant: boolean;
}

function defaultStates(): Record<string, EvState> {
  const o: Record<string, EvState> = {};
  AV_EVENTS.forEach((e) => {
    o[e] = { intensity: getAvConfig(e).intensity, amount: 1, distant: false };
  });
  return o;
}

// Run `fn` every `ms` while `active` is true. Uses a ref so the latest fn is
// always called without resubscribing the interval each render.
function useLoop(active: boolean, fn: () => void, ms: number) {
  const ref = useRef(fn);
  ref.current = fn;
  useEffect(() => {
    if (!active) return undefined;
    const id = window.setInterval(() => ref.current(), ms);
    return () => window.clearInterval(id);
  }, [active, ms]);
}

function springOf(ev: AvEvent) {
  const s = getAvConfig(ev).spring;
  return s ?? { stiffness: 300, damping: 26, mass: 1 };
}

export default function DevAvPanel() {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'sound' | 'anim'>('sound');

  const sfxVolume = useSfxVolume();
  const muted = useMuted();
  const setSfxVolume = useAppStore((s) => s.setSfxVolume);
  const setMuted = useAppStore((s) => s.setMuted);

  const sysReduce = useReducedMotion();
  const [reduce, setReduce] = useState(false);
  // When true the harness fires audio through the real dispatchAv path
  // (production behaviour, including any lead/double-play quirks). When false
  // it fires a single shot after the resolved lead — clean reference for
  // judging animation/audio sync.
  const [useDispatch, setUseDispatch] = useState(false);

  const [states, setStates] = useState<Record<string, EvState>>(defaultStates);

  const setEv = (ev: AvEvent, patch: Partial<EvState>) => {
    setStates((prev) => ({ ...prev, [ev]: { ...prev[ev], ...patch } }));
  };

  const playSound = (ev: AvEvent) => {
    const s = states[ev];
    playUi(ev, {
      intensity: s.intensity,
      role: s.role,
      amount: s.amount,
      distant: s.distant,
    });
  };

  // ── harness audio ──
  const playHarnessAudio = (ev: AvEvent) => {
    const cfg = getAvConfig(ev);
    if (!cfg.audio) return;
    if (useDispatch) {
      dispatchAv(ev, { reducedMotion: reduce });
      return;
    }
    const lead = resolveLeadMs(ev, reduce);
    const fire = () => playSfx(cfg.audio as string, { intensity: cfg.intensity });
    if (lead > 0) window.setTimeout(fire, lead);
    else fire();
  };

  // ── flip harness ──
  const flipCfg = getAvConfig('role_reveal');
  const flipCtrl = useAnimationControls();
  const [flipLoop, setFlipLoop] = useState(false);
  const playFlip = () => {
    flipCtrl.set({ rotateY: 180 });
    flipCtrl.start({
      rotateY: 0,
      transition: reduce ? { duration: 0 } : { type: 'spring', stiffness: springOf('role_reveal').stiffness, damping: springOf('role_reveal').damping },
    });
    playHarnessAudio('role_reveal');
  };
  useLoop(open && flipLoop, playFlip, 1900);

  // ── stamp harness ──
  const [stampKind, setStampKind] = useState<'stamp_kill' | 'stamp_rob'>('stamp_kill');
  const stampCtrl = useAnimationControls();
  const [stampLoop, setStampLoop] = useState(false);
  const playStamp = () => {
    const s = springOf(stampKind);
    stampCtrl.set({
      scale: 2.4, y: -30, opacity: 0, rotate: -12,
    });
    stampCtrl.start({
      scale: 1,
      y: 0,
      opacity: 0.92,
      rotate: -12,
      transition: reduce ? { duration: 0 } : {
        type: 'spring', stiffness: s.stiffness, damping: s.damping, mass: s.mass,
      },
    });
    playHarnessAudio(stampKind);
  };
  useLoop(open && stampLoop, playStamp, 1700);

  // ── build harness ──
  const [buildKind, setBuildKind] = useState<'build_cheap' | 'build_expensive'>('build_expensive');
  const buildCfg = getAvConfig(buildKind);
  const buildCtrl = useAnimationControls();
  const [buildLoop, setBuildLoop] = useState(false);
  const playBuild = () => {
    const s = springOf(buildKind);
    const peak = buildCfg.scalePeak ?? 1.08;
    buildCtrl.set({
      x: -240, y: -40, opacity: 0, scale: 0.7,
    });
    buildCtrl.start({
      x: 0,
      y: 0,
      opacity: 1,
      scale: [0.7, peak, 1],
      transition: reduce ? { duration: 0 } : {
        type: 'spring', stiffness: s.stiffness, damping: s.damping, mass: s.mass,
      },
    });
    playHarnessAudio(buildKind);
  };
  useLoop(open && buildLoop, playBuild, 2000);

  // Group soundboard events by tier.
  const grouped = (['L1', 'L2', 'L3'] as const).map((tier) => ({
    tier,
    events: AV_EVENTS.filter((e) => getAvConfig(e).tier === tier),
  }));

  return createPortal(
    <div className="dev-av">
      {!open && (
        <button
          type="button"
          className="dev-av__fab"
          title="DEV AV Panel"
          onClick={() => setOpen(true)}
        >
          AV
        </button>
      )}

      {open && (
        <div className="dev-av__panel medieval-panel">
          <div className="dev-av__head">
            <span className="dev-av__title">DEV AV Panel</span>
            <span className="dev-av__badge">DEV</span>
            <button type="button" className="dev-av__x" onClick={() => setOpen(false)} aria-label="close">×</button>
          </div>

          <div className="dev-av__tabs">
            <button type="button" className={cn('dev-av__tab', tab === 'sound' && 'is-active')} onClick={() => setTab('sound')}>Soundboard</button>
            <button type="button" className={cn('dev-av__tab', tab === 'anim' && 'is-active')} onClick={() => setTab('anim')}>Animation Harness</button>
          </div>

          <div className="dev-av__globals">
            <label className="dev-av__field">
              <span className="dev-av__field-label">SFX vol {Math.round(sfxVolume * 100)}%</span>
              <input
                type="range" min={0} max={1} step={0.01} value={sfxVolume}
                onChange={(e) => setSfxVolume(Number(e.target.value))}
              />
            </label>
            <button
              type="button"
              className={cn('dev-av__toggle', !muted && 'is-on')}
              role="switch" aria-checked={!muted}
              onClick={() => setMuted(!muted)}
            >
              {muted ? 'MUTED' : 'SOUND ON'}
            </button>
          </div>

          {tab === 'sound' && (
            <div className="dev-av__scroll">
              {grouped.map((g) => (
                <div key={g.tier} className="dev-av__group">
                  <div className="dev-av__group-head">{TIER_LABEL[g.tier]}</div>
                  {g.events.map((ev) => {
                    const cfg = getAvConfig(ev);
                    const s = states[ev];
                    const roles = ROLE_OPTIONS[ev];
                    return (
                      <div key={ev} className="dev-av__row">
                        <div className="dev-av__row-main">
                          <span className="dev-av__ev" title={`audio: ${cfg.audio ?? '—'} · lead ${cfg.audioLeadMs}ms`}>{ev}</span>
                          <div className="dev-av__mods">
                            {/* intensity */}
                            <div className="dev-av__seg" role="group" aria-label="intensity">
                              {([1, 2, 3] as const).map((i) => (
                                <button
                                  key={i} type="button"
                                  className={cn('dev-av__seg-btn', s.intensity === i && 'is-active')}
                                  onClick={() => setEv(ev, { intensity: i })}
                                >
                                  i{i}
                                </button>
                              ))}
                            </div>
                            {/* amount */}
                            {AMOUNT_EVENTS.has(ev) && (
                              <div className="dev-av__seg" role="group" aria-label="amount">
                                {AMOUNT_OPTIONS.map((a) => (
                                  <button
                                    key={a} type="button"
                                    className={cn('dev-av__seg-btn', s.amount === a && 'is-active')}
                                    onClick={() => setEv(ev, { amount: a })}
                                  >
                                    x{a}
                                  </button>
                                ))}
                              </div>
                            )}
                            {/* distant */}
                            {DISTANT_EVENTS.has(ev) && (
                              <button
                                type="button"
                                className={cn('dev-av__chk', s.distant && 'is-active')}
                                onClick={() => setEv(ev, { distant: !s.distant })}
                                title="distant (muffled L2-others variant)"
                              >
                                distant
                              </button>
                            )}
                            {/* role */}
                            {roles && (
                              <div className="dev-av__seg" role="group" aria-label="role">
                                {roles.map((r) => (
                                  <button
                                    key={r} type="button"
                                    className={cn('dev-av__seg-btn dev-av__seg-btn--role', s.role === r && 'is-active')}
                                    onClick={() => setEv(ev, { role: s.role === r ? undefined : r })}
                                  >
                                    {r.slice(0, 3)}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>
                        <button
                          type="button"
                          className="dev-av__play"
                          disabled={!cfg.audio}
                          onClick={() => playSound(ev)}
                        >
                          ▶
                        </button>
                      </div>
                    );
                  })}
                </div>
              ))}
            </div>
          )}

          {tab === 'anim' && (
            <div className="dev-av__scroll">
              <div className="dev-av__harness-opts">
                <button
                  type="button"
                  className={cn('dev-av__chk', reduce && 'is-active')}
                  onClick={() => setReduce((v) => !v)}
                  title="simulate prefers-reduced-motion (visual instant, lead zeroed)"
                >
                  reduce-motion {reduce ? 'ON' : 'off'}{sysReduce ? ' (sys)' : ''}
                </button>
                <button
                  type="button"
                  className={cn('dev-av__chk', useDispatch && 'is-active')}
                  onClick={() => setUseDispatch((v) => !v)}
                  title="ON: fire audio via dispatchAv (production path). OFF: clean single shot after resolved lead."
                >
                  audio via dispatchAv {useDispatch ? 'ON' : 'off'}
                </button>
              </div>

              {/* flip */}
              <HarnessCard
                title="Card flip (role_reveal)"
                cfg={flipCfg}
                onPlay={playFlip}
                loop={flipLoop}
                onToggleLoop={() => setFlipLoop((v) => !v)}
              >
                <div className="dev-av__stage dev-av__stage--flip" style={{ perspective: reduce ? undefined : 1200 }}>
                  <motion.div
                    className="dev-av__flipper"
                    initial={{ rotateY: 180 }}
                    animate={flipCtrl}
                    style={{ transformStyle: reduce ? undefined : 'preserve-3d' }}
                  >
                    <div className="dev-av__face dev-av__face--front">
                      <span className="dev-av__face-num">1</span>
                      <span className="dev-av__face-name">Assassin</span>
                    </div>
                    <div className="dev-av__face dev-av__face--back" style={{ transform: 'rotateY(180deg)' }} />
                  </motion.div>
                </div>
              </HarnessCard>

              {/* stamp */}
              <HarnessCard
                title={`Stamp slam (${stampKind})`}
                cfg={getAvConfig(stampKind)}
                onPlay={playStamp}
                loop={stampLoop}
                onToggleLoop={() => setStampLoop((v) => !v)}
                extra={(
                  <div className="dev-av__seg" role="group" aria-label="stamp kind">
                    {(['stamp_kill', 'stamp_rob'] as const).map((k) => (
                      <button
                        key={k} type="button"
                        className={cn('dev-av__seg-btn', stampKind === k && 'is-active')}
                        onClick={() => setStampKind(k)}
                      >
                        {k === 'stamp_kill' ? '💀 kill' : '💰 rob'}
                      </button>
                    ))}
                  </div>
                )}
              >
                <div className="dev-av__stage dev-av__stage--stamp">
                  <div className="dev-av__stamp-target">
                    <span className="dev-av__face-num">4</span>
                    <span className="dev-av__face-name">King</span>
                  </div>
                  <motion.div
                    className="dev-av__stamp"
                    initial={{
                      scale: 2.4, y: -30, opacity: 0, rotate: -12,
                    }}
                    animate={stampCtrl}
                  >
                    {stampKind === 'stamp_kill' ? '💀' : '💰'}
                  </motion.div>
                </div>
              </HarnessCard>

              {/* build */}
              <HarnessCard
                title={`Build fly-in (${buildKind})`}
                cfg={buildCfg}
                onPlay={playBuild}
                loop={buildLoop}
                onToggleLoop={() => setBuildLoop((v) => !v)}
                extra={(
                  <div className="dev-av__seg" role="group" aria-label="build kind">
                    {(['build_cheap', 'build_expensive'] as const).map((k) => (
                      <button
                        key={k} type="button"
                        className={cn('dev-av__seg-btn', buildKind === k && 'is-active')}
                        onClick={() => setBuildKind(k)}
                      >
                        {k === 'build_cheap' ? 'cheap i1' : 'expensive i3'}
                      </button>
                    ))}
                  </div>
                )}
              >
                <div className="dev-av__stage dev-av__stage--build">
                  <motion.div
                    className="dev-av__build-card"
                    initial={{
                      x: -240, y: -40, opacity: 0, scale: 0.7,
                    }}
                    animate={buildCtrl}
                  >
                    <span className="dev-av__build-emoji">🏛</span>
                    <span className="dev-av__build-name">{buildKind === 'build_cheap' ? 'Watchtower' : 'Palace'}</span>
                    <span className="dev-av__build-cost">{buildKind === 'build_cheap' ? '1🪙' : '5🪙'}</span>
                  </motion.div>
                </div>
              </HarnessCard>
            </div>
          )}
        </div>
      )}
    </div>,
    document.body,
  );
}

// One animation harness card: header (title + param readout + loop + play) and
// a stage slot for the motion element. Keeps the three harnesses consistent.
interface HarnessCardProps {
  title: string;
  cfg: ReturnType<typeof getAvConfig>;
  onPlay: () => void;
  loop: boolean;
  onToggleLoop: () => void;
  extra?: React.ReactNode;
  children: React.ReactNode;
}

function HarnessCard({
  title, cfg, onPlay, loop, onToggleLoop, extra, children,
}: HarnessCardProps) {
  const sp = cfg.spring;
  return (
    <div className="dev-av__harness">
      <div className="dev-av__harness-head">
        <span className="dev-av__harness-title">{title}</span>
        <div className="dev-av__harness-meta">
          {sp && <span>spring {sp.stiffness}/{sp.damping}{sp.mass ? `/${sp.mass}` : ''}</span>}
          {cfg.scalePeak != null && <span>peak ×{cfg.scalePeak}</span>}
          <span>lead {cfg.audioLeadMs}ms</span>
          <span>i{cfg.intensity}</span>
        </div>
      </div>
      {children}
      <div className="dev-av__harness-ctrl">
        <button type="button" className="dev-av__play dev-av__play--lg" onClick={onPlay}>▶ Play</button>
        <button
          type="button"
          className={cn('dev-av__chk', loop && 'is-active')}
          onClick={onToggleLoop}
        >
          loop {loop ? 'ON' : 'off'}
        </button>
        {extra}
      </div>
    </div>
  );
}
