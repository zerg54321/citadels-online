import fs from 'fs';
import path from 'path';
import Database from 'better-sqlite3';

// Test isolation: use in-memory SQLite ONLY under a real vitest run.
// VITEST_WORKER_ID is set automatically by vitest and never by operators,
// so a stray NODE_ENV=test in production cannot silently switch the server
// to :memory: (which would wipe all user/match data on every restart).
// Production is completely unaffected — same path resolution as before.
const isTest = process.env.VITEST_WORKER_ID !== undefined;
const defaultPath = path.resolve(__dirname, '../../../data/citadels.sqlite');

function resolveDbPath(): string {
  if (isTest) return ':memory:';
  if (process.env.DATABASE_PATH) return path.resolve(process.env.DATABASE_PATH);
  return defaultPath;
}

const dbPath = resolveDbPath();

if (isTest) {
  // Loud signal so an accidental in-memory start is never silent.
  // eslint-disable-next-line no-console
  console.warn('[db] vitest detected — using in-memory SQLite (all data is ephemeral)');
} else {
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY NOT NULL,
    username TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT NOT NULL,
    display_name TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS matches (
    id TEXT PRIMARY KEY NOT NULL,
    room_id TEXT NOT NULL,
    game_mode INTEGER NOT NULL,
    ranked INTEGER NOT NULL DEFAULT 0,
    has_ai INTEGER NOT NULL DEFAULT 0,
    complete_city_size INTEGER NOT NULL,
    team_score_a INTEGER,
    team_score_b INTEGER,
    match_result INTEGER NOT NULL DEFAULT 0,
    started_at TEXT NOT NULL,
    ended_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS match_players (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    match_id TEXT NOT NULL,
    user_id TEXT,
    player_id TEXT NOT NULL,
    seat INTEGER NOT NULL,
    team INTEGER NOT NULL DEFAULT 0,
    display_name TEXT NOT NULL,
    personal_score INTEGER NOT NULL DEFAULT 0,
    score_json TEXT,
    is_ai INTEGER NOT NULL DEFAULT 0,
    had_effective_ai_control INTEGER NOT NULL DEFAULT 0,
    ranked_win_eligible INTEGER NOT NULL DEFAULT 1,
    team_won INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_matches_ended ON matches(ended_at DESC);
  CREATE INDEX IF NOT EXISTS idx_matches_ranked ON matches(ranked, ended_at DESC);
  CREATE INDEX IF NOT EXISTS idx_match_players_user ON match_players(user_id);
  CREATE INDEX IF NOT EXISTS idx_match_players_match ON match_players(match_id);
`);

export default db;
export { dbPath };
