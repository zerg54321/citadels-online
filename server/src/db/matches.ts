import { randomBytes } from 'crypto';
import {
  GameMode,
  MatchResult,
  PlayerRole,
  TeamId,
} from 'citadels-common';
import db from './database';
import GameState from '../game/GameState';
import { nowIso } from '../utils/dateUtils';

export type MatchRow = {
  id: string;
  room_id: string;
  game_mode: number;
  ranked: number;
  has_ai: number;
  complete_city_size: number;
  team_score_a: number | null;
  team_score_b: number | null;
  match_result: number;
  started_at: string;
  ended_at: string;
};

export type MatchPlayerRow = {
  id: number;
  match_id: string;
  user_id: string | null;
  player_id: string;
  seat: number;
  team: number;
  display_name: string;
  personal_score: number;
  score_json: string | null;
  is_ai: number;
  had_effective_ai_control: number;
  ranked_win_eligible: number;
  team_won: number;
};

function genMatchId() {
  return randomBytes(12).toString('hex');
}

/** Persist finished game. Returns match id or null on skip/error. */
export function saveFinishedMatch(roomId: string, gameState: GameState): string | null {
  if (gameState.progress !== 3 /* FINISHED */) {
    return null;
  }
  if (!gameState.board) {
    return null;
  }
  const { board } = gameState;

  const ranked = gameState.gameMode === GameMode.COMPETITIVE_TEAM6
    && !gameState.hasAiPlayers;
  const matchId = genMatchId();
  const endedAt = nowIso();
  const startedAt = gameState.startedAt || endedAt;

  const insertMatch = db.prepare(`
    INSERT INTO matches (
      id, room_id, game_mode, ranked, has_ai, complete_city_size,
      team_score_a, team_score_b, match_result, started_at, ended_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const insertPlayer = db.prepare(`
    INSERT INTO match_players (
      match_id, user_id, player_id, seat, team, display_name,
      personal_score, score_json, is_ai, had_effective_ai_control,
      ranked_win_eligible, team_won
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    insertMatch.run(
      matchId,
      roomId,
      gameState.gameMode,
      ranked ? 1 : 0,
      gameState.hasAiPlayers ? 1 : 0,
      gameState.completeCitySize,
      gameState.teamScores?.A ?? null,
      gameState.teamScores?.B ?? null,
      gameState.matchResult,
      startedAt,
      endedAt,
    );

    board.playerOrder.forEach((playerId, seat) => {
      const meta = gameState.players.get(playerId);
      const playerBoard = board.players.get(playerId);
      if (!meta || meta.role !== PlayerRole.PLAYER || !playerBoard) return;

      const team = meta.team ?? TeamId.NONE;
      const personalScore = playerBoard.score.total ?? 0;
      const isAi = Boolean(meta.isAi);
      const hadAi = Boolean(meta.hadEffectiveAiControl);
      // P4.3: ranked win only if ranked match AND no effective AI control for this player
      // (effective autoplay on a win => ranked_win_eligible=0; losses still set team_won for opponents)
      let teamWon = 0;
      if (gameState.gameMode === GameMode.COMPETITIVE_TEAM6) {
        if (gameState.matchResult === MatchResult.TEAM_A_WIN && team === TeamId.A) teamWon = 1;
        if (gameState.matchResult === MatchResult.TEAM_B_WIN && team === TeamId.B) teamWon = 1;
      }
      const eligible = ranked && teamWon === 1 && !hadAi && !isAi ? 1 : 0;

      insertPlayer.run(
        matchId,
        meta.userId || null,
        playerId,
        seat,
        team,
        meta.username,
        personalScore,
        playerBoard.score ? JSON.stringify(playerBoard.score) : null,
        isAi ? 1 : 0,
        hadAi ? 1 : 0,
        eligible,
        teamWon,
      );
    });
  });

  try {
    tx();
    return matchId;
  } catch (err) {
    console.error('[matches] save failed', err);
    return null;
  }
}

export type MyMatchItem = {
  matchId: string;
  gameMode: number;
  ranked: boolean;
  matchResult: number;
  teamScoreA: number | null;
  teamScoreB: number | null;
  team: number;
  personalScore: number;
  teamWon: boolean;
  rankedWinEligible: boolean;
  endedAt: string;
  startedAt: string;
  displayName: string;
};

export function listMatchesForUser(userId: string, limit = 50): MyMatchItem[] {
  const rows = db.prepare(`
    SELECT
      m.id as match_id,
      m.game_mode,
      m.ranked,
      m.match_result,
      m.team_score_a,
      m.team_score_b,
      m.started_at,
      m.ended_at,
      mp.team,
      mp.personal_score,
      mp.team_won,
      mp.ranked_win_eligible,
      mp.display_name
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    WHERE mp.user_id = ?
    ORDER BY m.ended_at DESC
    LIMIT ?
  `).all(userId, limit) as any[];

  return rows.map((r) => ({
    matchId: r.match_id,
    gameMode: r.game_mode,
    ranked: Boolean(r.ranked),
    matchResult: r.match_result,
    teamScoreA: r.team_score_a,
    teamScoreB: r.team_score_b,
    team: r.team,
    personalScore: r.personal_score,
    teamWon: Boolean(r.team_won),
    rankedWinEligible: Boolean(r.ranked_win_eligible),
    endedAt: r.ended_at,
    startedAt: r.started_at,
    displayName: r.display_name,
  }));
}

export type RankingRow = {
  userId: string;
  displayName: string;
  rankedGames: number;
  rankedWins: number;
  rankedLosses: number;
  rankedDraws: number;
};

export function getRanking(limit = 50): RankingRow[] {
  // ranked wins: ranked match + team_won + ranked_win_eligible
  const rows = db.prepare(`
    SELECT
      mp.user_id as user_id,
      u.display_name as display_name,
      COUNT(*) as ranked_games,
      SUM(CASE WHEN mp.team_won = 1 AND mp.ranked_win_eligible = 1 THEN 1 ELSE 0 END) as ranked_wins,
      SUM(CASE
        WHEN m.match_result IN (1, 2) AND mp.team_won = 0 THEN 1
        ELSE 0
      END) as ranked_losses,
      SUM(CASE WHEN m.match_result = 3 THEN 1 ELSE 0 END) as ranked_draws
    FROM match_players mp
    JOIN matches m ON m.id = mp.match_id
    JOIN users u ON u.id = mp.user_id
    WHERE m.ranked = 1
      AND mp.user_id IS NOT NULL
      AND mp.is_ai = 0
    GROUP BY mp.user_id
    ORDER BY ranked_wins DESC, ranked_games DESC, display_name ASC
    LIMIT ?
  `).all(limit) as any[];

  return rows.map((r) => ({
    userId: r.user_id,
    displayName: r.display_name,
    rankedGames: r.ranked_games,
    rankedWins: r.ranked_wins,
    rankedLosses: r.ranked_losses,
    rankedDraws: r.ranked_draws,
  }));
}

// ── Admin-only operations ───────────────────────────────────────────────

export type AdminMatchItem = {
  id: string;
  room_id: string;
  game_mode: number;
  ranked: boolean;
  has_ai: boolean;
  complete_city_size: number;
  team_score_a: number | null;
  team_score_b: number | null;
  match_result: number;
  started_at: string;
  ended_at: string;
  players: AdminMatchPlayerItem[];
};

export type AdminMatchPlayerItem = {
  user_id: string | null;
  player_id: string;
  seat: number;
  team: number;
  display_name: string;
  personal_score: number;
  is_ai: boolean;
  team_won: boolean;
};

export function adminListMatches(limit: number, offset: number): AdminMatchItem[] {
  const matchRows = db.prepare(`
    SELECT id, room_id, game_mode, ranked, has_ai, complete_city_size,
           team_score_a, team_score_b, match_result, started_at, ended_at
    FROM matches ORDER BY ended_at DESC LIMIT ? OFFSET ?
  `).all(limit, offset) as MatchRow[];

  if (matchRows.length === 0) return [];

  const ids = matchRows.map((m) => m.id);
  const placeholders = ids.map(() => '?').join(',');
  const playerRows = db.prepare(`
    SELECT match_id, user_id, player_id, seat, team, display_name,
           personal_score, is_ai, team_won
    FROM match_players WHERE match_id IN (${placeholders})
    ORDER BY match_id, seat
  `).all(...ids) as (MatchPlayerRow & { match_id: string })[];

  const byMatch = new Map<string, AdminMatchPlayerItem[]>();
  playerRows.forEach((p) => {
    const arr = byMatch.get(p.match_id) ?? [];
    arr.push({
      user_id: p.user_id,
      player_id: p.player_id,
      seat: p.seat,
      team: p.team,
      display_name: p.display_name,
      personal_score: p.personal_score,
      is_ai: Boolean(p.is_ai),
      team_won: Boolean(p.team_won),
    });
    byMatch.set(p.match_id, arr);
  });

  return matchRows.map((m) => ({
    id: m.id,
    room_id: m.room_id,
    game_mode: m.game_mode,
    ranked: Boolean(m.ranked),
    has_ai: Boolean(m.has_ai),
    complete_city_size: m.complete_city_size,
    team_score_a: m.team_score_a,
    team_score_b: m.team_score_b,
    match_result: m.match_result,
    started_at: m.started_at,
    ended_at: m.ended_at,
    players: byMatch.get(m.id) ?? [],
  }));
}

export function adminCountMatches(): number {
  const r = db.prepare('SELECT COUNT(*) n FROM matches').get() as { n: number };
  return r.n;
}

export function adminGetMatch(id: string): AdminMatchItem | undefined {
  const m = db.prepare(`
    SELECT id, room_id, game_mode, ranked, has_ai, complete_city_size,
           team_score_a, team_score_b, match_result, started_at, ended_at
    FROM matches WHERE id = ?
  `).get(id) as MatchRow | undefined;
  if (!m) return undefined;

  const playerRows = db.prepare(`
    SELECT user_id, player_id, seat, team, display_name,
           personal_score, is_ai, team_won
    FROM match_players WHERE match_id = ? ORDER BY seat
  `).all(id) as MatchPlayerRow[];

  return {
    id: m.id,
    room_id: m.room_id,
    game_mode: m.game_mode,
    ranked: Boolean(m.ranked),
    has_ai: Boolean(m.has_ai),
    complete_city_size: m.complete_city_size,
    team_score_a: m.team_score_a,
    team_score_b: m.team_score_b,
    match_result: m.match_result,
    started_at: m.started_at,
    ended_at: m.ended_at,
    players: playerRows.map((p) => ({
      user_id: p.user_id,
      player_id: p.player_id,
      seat: p.seat,
      team: p.team,
      display_name: p.display_name,
      personal_score: p.personal_score,
      is_ai: Boolean(p.is_ai),
      team_won: Boolean(p.team_won),
    })),
  };
}

// Delete a match and its players in one transaction. Relies on the
// match_players ON DELETE CASCADE FK, but we wrap explicitly so a partial
// failure leaves nothing dangling.
export function adminDeleteMatch(id: string): boolean {
  const tx = db.transaction(() => {
    const r = db.prepare('DELETE FROM matches WHERE id = ?').run(id);
    return r.changes > 0;
  });
  return tx();
}
