// AV feed dispatcher (D5). Watches the server action feed (a full-snapshot
// array re-broadcast on every state push) and fires `dispatchAv` for each
// genuinely new feed entry, mapping feed kind → AV event with role/amount/
// distant classification. This is the feed-driven half of the three D5
// trigger sources (feed / state-diff / UI-handler); the draw state-diff and
// win/lose stinger live in useAvStateDispatch.
//
// Edge-trigger discipline (plan §11 音效边沿触发纪律): a ref tracks how many
// feed entries have already been dispatched; only entries beyond that index
// are processed, so re-pushes of unchanged state never re-fire. On a session
// change (self id changes — new game / rejoin) or a feed shrink (defensive),
// the index snaps to the current length as a baseline so reconnect never
// replays history (the "首次观测=基线" rule).
//
// Role classification (D9): L3 settlement events (kill/rob/destroy) sound
// different per role. `destroy`/`rob_move` carry the perpetrator username in
// params (warlord = params.player; thief = params.thief), so role is resolved
// by comparing against the local username. `call_killed` carries only the
// victim (params.player) and the killed role; the assassin is identified via
// the locally-issued kill record (utils/avIssuedMoves).

import { useEffect, useRef } from 'react';
import { useReducedMotion } from 'framer-motion';
import { districts, type ActionFeedLine } from 'citadels-common';
import { useGameState } from '@/store';
import { dispatchAv } from '@/utils/av';
import type { AudioRole } from '@/utils/audio';
import { getLastIssuedKillRole, clearIssuedKill } from '@/utils/avIssuedMoves';

// cost threshold splitting build_cheap (L2, distant for others) from
// build_expensive (L3 broadcast). Costs range 1-6; >=4 covers the heavier /
// purple-tier districts.
const BUILD_EXPENSIVE_MIN_COST = 4;

function districtCost(id: string): number {
  const d = districts[id as keyof typeof districts] as { cost?: number } | undefined;
  return d?.cost ?? 1;
}

export function useAvFeedDispatch(): void {
  const gs = useGameState();
  const reduce = useReducedMotion();

  const lastProcessedRef = useRef(0);
  const lastSelfRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (!gs) return;
    const feed = gs.actionFeed ?? [];
    if (!Array.isArray(feed)) return;
    const reduceMotion = Boolean(reduce);

    // Session change (new game / rejoin as a possibly different self) or feed
    // shrink → re-baseline; never replay history on reconnect.
    if (gs.self !== lastSelfRef.current) {
      lastSelfRef.current = gs.self;
      lastProcessedRef.current = feed.length;
      return;
    }
    if (feed.length < lastProcessedRef.current) {
      lastProcessedRef.current = feed.length;
      return;
    }

    const selfId = gs.self;
    const selfUsername = selfId ? gs.players[selfId]?.username : undefined;
    const from = lastProcessedRef.current;

    for (let i = from; i < feed.length; i += 1) {
      handleLine(feed[i], selfUsername, reduceMotion);
    }
    lastProcessedRef.current = feed.length;
  }, [gs, reduce]);
}

function handleLine(line: ActionFeedLine, selfUsername: string | undefined, reduceMotion: boolean): void {
  const p = line.params ?? {};
  const dispatch = (event: Parameters<typeof dispatchAv>[0], opts: Parameters<typeof dispatchAv>[1] = {}) => {
    dispatchAv(event, { ...opts, reducedMotion: reduceMotion });
  };

  switch (line.kind) {
    case 'earn': {
      const amount = Number(p.amount) || 1;
      dispatch('earn_gold', { amount, distant: p.player !== selfUsername });
      break;
    }
    case 'build': {
      const cost = districtCost(String(p.district ?? ''));
      const distant = p.player !== selfUsername;
      if (cost >= BUILD_EXPENSIVE_MIN_COST) dispatch('build_expensive', { distant });
      else dispatch('build_cheap', { distant });
      break;
    }
    case 'destroy': {
      const role: AudioRole = p.player === selfUsername ? 'perpetrator'
        : p.victim === selfUsername ? 'victim' : 'other';
      dispatch('destroy', { role });
      break;
    }
    case 'call_killed': {
      const killedRole = Number(p.role);
      const role: AudioRole = p.player === selfUsername ? 'victim'
        : (getLastIssuedKillRole() === killedRole ? 'perpetrator' : 'other');
      dispatch('kill_settle', { role });
      break;
    }
    case 'rob_move': {
      const role: AudioRole = p.thief === selfUsername ? 'perpetrator'
        : p.player === selfUsername ? 'victim' : 'other';
      dispatch('rob_settle', { role, amount: Number(p.amount) || 0 });
      break;
    }
    case 'rob_move_empty': {
      const role: AudioRole = p.thief === selfUsername ? 'perpetrator'
        : p.player === selfUsername ? 'victim' : 'other';
      dispatch('rob_settle', { role, amount: 0 });
      break;
    }
    case 'call': {
      // Turn-handoff cursor sound for OTHER players' turns. The local self-turn
      // ding is handled separately by playTurnSound (BoardScreen) to avoid a
      // double-fire when it is the local player's own character being called.
      if (p.player !== selfUsername) dispatch('turn_handoff');
      break;
    }
    case 'round': {
      // New round → a fresh assassin pick; clear the stale kill record.
      clearIssuedKill();
      break;
    }
    default:
      break;
  }
}
