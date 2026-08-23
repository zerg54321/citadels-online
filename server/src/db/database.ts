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
    pwd_changed_at TEXT NOT NULL DEFAULT '',
    avatar_type TEXT NOT NULL DEFAULT 'preset',
    avatar_ref TEXT NOT NULL DEFAULT '01',
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

  CREATE TABLE IF NOT EXISTS admin_audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    ts TEXT NOT NULL,
    ip TEXT NOT NULL,
    action TEXT NOT NULL,
    target_id TEXT,
    before_json TEXT,
    after_json TEXT
  );
  CREATE INDEX IF NOT EXISTS idx_admin_audit_ts ON admin_audit(ts DESC);
`);

// pwd_changed_at backfill for DBs created before the column existed.
// SQLite has no ADD COLUMN IF NOT EXISTS, so guard against the duplicate
// column error (runs only once per pre-existing DB; a no-op error on the
// second boot and on brand-new DBs where CREATE TABLE already added it).
try {
  db.exec('ALTER TABLE users ADD COLUMN pwd_changed_at TEXT NOT NULL DEFAULT \'\'');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes('duplicate column')) throw err;
}

// Backfill empty pwd_changed_at (rows that predate the column) to created_at
// so the strict token check applies to every user immediately. Tokens issued
// before this deploy lack the pwdChangedAt claim and will be rejected,
// forcing a one-time re-login. Matches 0 rows after the first run.
db.exec('UPDATE users SET pwd_changed_at = created_at WHERE pwd_changed_at = \'\'');

// replay_json: optional JSON array of god-view replay snapshots for a match.
// Added via guarded ALTER (SQLite has no ADD COLUMN IF NOT EXISTS); each
// finished match stores its replay frames here for later OB/replay.
try {
  db.exec('ALTER TABLE matches ADD COLUMN replay_json TEXT');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes('duplicate column')) throw err;
}

// is_public: 1 (default) = anyone may view the match replay; 0 = only
// participants. Reserved for a future per-room "public match" setting at
// game start — all current matches save as public. Kept in the DB (not the
// replay file) because the public list query filters on it cheaply.
try {
  db.exec('ALTER TABLE matches ADD COLUMN is_public INTEGER NOT NULL DEFAULT 1');
} catch (err) {
  const msg = err instanceof Error ? err.message : String(err);
  if (!msg.includes('duplicate column')) throw err;
}

// avatar_type / avatar_ref backfill for DBs created before the columns
// existed. Same duplicate-column guard pattern as pwd_changed_at. Existing
// users default to preset avatar '01' so every account has a visible avatar
// immediately; they can change it from the profile modal.
const avatarCols = [
  'avatar_type TEXT NOT NULL DEFAULT \'preset\'',
  'avatar_ref TEXT NOT NULL DEFAULT \'01\'',
];
avatarCols.forEach((col) => {
  try {
    db.exec(`ALTER TABLE users ADD COLUMN ${col}`);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (!msg.includes('duplicate column')) throw err;
  }
});

export default db;
export { dbPath };
