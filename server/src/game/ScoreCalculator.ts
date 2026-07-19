/** Extracted scoring logic from GameState. */
import { MatchResult, TeamId } from 'citadels-common';
import GameState from './GameState';

export function refreshLiveScores(gs: GameState, finalize = false): void {
  const { board } = gs;
  if (!board) return;

  board.players.forEach((player) => {
    player.score = {};
    if (player.city.length >= gs.completeCitySize) {
      player.score.extraPointsCompleteCity = player.firstToCompleteCity ? 4 : 2;
    }
    player.computeScore(gs.completeCitySize);
  });

  let scoreA = 0;
  let scoreB = 0;
  let hasTeams = false;
  board.playerOrder.forEach((playerId) => {
    const meta = gs.players.get(playerId);
    const pb = board.players.get(playerId);
    const total = pb?.score.total ?? 0;
    if (meta?.team === TeamId.A) {
      scoreA += total;
      hasTeams = true;
    }
    if (meta?.team === TeamId.B) {
      scoreB += total;
      hasTeams = true;
    }
  });

  if (hasTeams) {
    gs.teamScores = { A: scoreA, B: scoreB };
    if (finalize) {
      if (scoreA > scoreB) gs.matchResult = MatchResult.TEAM_A_WIN;
      else if (scoreB > scoreA) gs.matchResult = MatchResult.TEAM_B_WIN;
      else gs.matchResult = MatchResult.DRAW;
    }
  } else if (finalize) {
    gs.matchResult = MatchResult.CASUAL_END;
  }
}
