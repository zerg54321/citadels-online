// AV state-diff dispatcher (D5). The state-driven half of the D5 trigger
// sources: events with NO feed kind are detected by watching game state for
// transitions.
//
// 1. Draw (摸牌): there is no `draw` feed kind. The server exposes every
//    player's hand LENGTH (contents redacted to nulls for non-self,
//    PlayerBoardState.exportForPlayer), so a hand-length increment is the
//    draw edge. Self draws sound crisp; others' draws use the distant
//    (muffled) variant (D2 量感分流). Baseline on session change so reconnect
//    never replays the initial deal (首次观测=基线).
//
// 2. Win/lose stinger: fires once when gameProgress transitions to FINISHED,
//    resolved from matchResult + the local player's team (mirrors
//    EndGameModal's isWin/isLose logic).

import { useEffect, useRef } from 'react';
import { MatchResult, TeamId } from 'citadels-common';
import { useGameState, useGameProgress } from '@/store';
import { dispatchAv } from '@/utils/av';

export function useAvStateDispatch(): void {
  const gs = useGameState();
  const progress = useGameProgress();

  // ── draw state-diff (per-player hand-length increment) ──
  const handLenRef = useRef<Map<string, number>>(new Map());
  const selfRef = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!gs) return;
    const selfId = gs.self;
    const players = gs.board?.players;
    if (!players) return;

    // Session change → seed baselines for every seat; do not fire.
    if (selfId !== selfRef.current) {
      selfRef.current = selfId;
      const baseline = new Map<string, number>();
      Object.entries(players).forEach(([pid, board]) => {
        baseline.set(pid, board.hand.length);
      });
      handLenRef.current = baseline;
      return;
    }

    Object.entries(players).forEach(([pid, board]) => {
      const cur = board.hand.length;
      const prev = handLenRef.current.get(pid);
      if (prev === undefined) {
        handLenRef.current.set(pid, cur);
        return;
      }
      if (cur > prev) {
        dispatchAv('draw_card', { distant: pid !== selfId });
      }
      handLenRef.current.set(pid, cur);
    });
  }, [gs]);

  // ── win/lose stinger on gameProgress → FINISHED edge ──
  const prevProgressRef = useRef(progress);
  useEffect(() => {
    const prev = prevProgressRef.current;
    prevProgressRef.current = progress;
    if (prev === 'FINISHED' || progress !== 'FINISHED') return;
    if (!gs) return;
    const selfId = gs.self;
    const team = selfId ? gs.players[selfId]?.team : undefined;
    const result = gs.matchResult;
    const isWin = (result === MatchResult.TEAM_A_WIN && team === TeamId.A)
      || (result === MatchResult.TEAM_B_WIN && team === TeamId.B);
    const isLose = (result === MatchResult.TEAM_A_WIN && team === TeamId.B)
      || (result === MatchResult.TEAM_B_WIN && team === TeamId.A);
    if (isWin) dispatchAv('win_stinger');
    else if (isLose) dispatchAv('lose_stinger');
  }, [progress, gs]);
}
