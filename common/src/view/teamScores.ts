import { ClientGameState, PlayerId, TeamId } from '../index';

/**
 * Compute raw team A/B score totals from a client game state.
 *
 * When the server sets `teamScores` on the state (at/after game end), those
 * authoritative values are used directly. Otherwise each player's
 * `board.players[pid].score.total` is summed across `board.playerOrder`,
 * grouped by team. Players whose team is neither A nor B (e.g. NONE) are
 * skipped.
 *
 * Returns raw totals from the global (team-A-left, team-B-right) perspective.
 * Callers are responsible for any viewer-perspective swap (e.g. flipping A/B
 * for team-B viewers) and label assignment.
 */
export function computeTeamScores(gs: ClientGameState): { A: number; B: number } {
  const ts = gs.teamScores;
  if (ts && (ts.A != null || ts.B != null)) {
    return { A: ts.A ?? 0, B: ts.B ?? 0 };
  }
  let A = 0;
  let B = 0;
  const order: PlayerId[] = gs.board?.playerOrder ?? [];
  order.forEach((pid: PlayerId) => {
    const meta = gs.players?.[pid];
    const total = gs.board?.players?.[pid]?.score?.total ?? 0;
    if (meta?.team === TeamId.A) A += total;
    if (meta?.team === TeamId.B) B += total;
  });
  return { A, B };
}
