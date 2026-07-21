import type { ClientGameState } from '../index';

/**
 * Parse a server-provided game state payload into a `ClientGameState`.
 *
 * This unifies the two previously-duplicated parse sites (the `join room`
 * response in `api/index.ts` and the `update game state` handler in
 * `socket/index.ts`) which had drifted out of sync — the join path silently
 * dropped `turnDeadlineAt`, `lastRoundSummary`, `lobbyPlayerOrder`, and
 * `actionFeed`.
 *
 * Behavior:
 *   - Throws if `data` is not a non-null object (clear error instead of a
 *     later cryptic "cannot read property of undefined").
 *   - Passes through required fields (`progress`, `gameMode`, `players`,
 *     `self`, `board`, `settings`) as-is. The server is trusted for the
 *     shape of these complex nested objects; deep runtime validation is
 *     intentionally NOT performed (over-engineering for this project).
 *   - Applies defensive defaults for optional fields so consumers always
 *     see a stable shape:
 *       turnDeadlineAt    → null
 *       lastRoundSummary  → null
 *       lobbyPlayerOrder  → []
 *       actionFeed        → []
 *     `teamScores` and `matchResult` are passed through unchanged
 *     (undefined is a meaningful "not yet set" state for downstream logic).
 *   - `board.players` defaults to `{}` when missing, so direct indexing
 *     (`gs.board.players[pid]`) in older call sites does not throw.
 */
export function parseClientGameState(data: unknown): ClientGameState {
  if (data === null || typeof data !== 'object') {
    throw new Error('parseClientGameState: expected a non-null object');
  }
  const d = data as Record<string, any>;
  const board = (d.board === null || typeof d.board !== 'object') ? {} : d.board;
  return {
    progress: d.progress,
    gameMode: d.gameMode,
    players: d.players,
    self: d.self,
    board: { ...board, players: board.players ?? {} },
    settings: d.settings,
    turnDeadlineAt: d.turnDeadlineAt ?? null,
    teamScores: d.teamScores,
    matchResult: d.matchResult,
    lastRoundSummary: d.lastRoundSummary ?? null,
    lobbyPlayerOrder: d.lobbyPlayerOrder || [],
    actionFeed: d.actionFeed || [],
  };
}
