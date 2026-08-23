import fs from 'fs';
import path from 'path';
import os from 'os';

// Replay frames live OUTSIDE the SQLite user/match DB, one JSON file per
// match under data/replays/<matchId>.json:
//   - decouples bulky immutable replay payloads (2-5MB/match) from user data
//     (backup/archive/prune independently — deleting replays never touches
//     the live DB);
//   - frames are self-contained (player names/avatars denormalized inside
//     each snapshot), so a deleted user never corrupts an old replay;
//   - the matches table keeps only lightweight metadata for list queries.
//
// Test isolation mirrors database.ts: under vitest (VITEST_WORKER_ID) files
// go to a per-process temp dir so tests never touch real replay data.

function resolveReplayDir(): string {
  if (process.env.REPLAY_DIR) return path.resolve(process.env.REPLAY_DIR);
  const isTest = process.env.VITEST_WORKER_ID !== undefined;
  if (isTest) {
    return path.join(os.tmpdir(), `citadels-replays-${process.pid}`);
  }
  // same data/ root as citadels.sqlite (database.ts resolves ../../../data)
  return path.resolve(__dirname, '../../../data/replays');
}

const replayDir = resolveReplayDir();

function filePath(matchId: string): string {
  // matchId is a server-generated hex string; still sanitize defensively so
  // a crafted id can never escape the replay dir via path traversal.
  const safe = matchId.replace(/[^a-zA-Z0-9_-]/g, '');
  return path.join(replayDir, `${safe}.json`);
}

/** Persist replay frames as one JSON file. Best-effort: returns false on
 * write failure (the match row still saves; the replay is simply absent). */
export function saveReplayFile(matchId: string, frames: unknown[]): boolean {
  if (!frames.length) return false;
  try {
    fs.mkdirSync(replayDir, { recursive: true });
    fs.writeFileSync(filePath(matchId), JSON.stringify(frames), 'utf-8');
    return true;
  } catch (err) {
    console.error('[replays] write failed', matchId, err);
    return false;
  }
}

/** Load a match's replay frames, or undefined when no file exists. */
export function loadReplayFile(matchId: string): unknown[] | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath(matchId), 'utf-8');
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : undefined;
  } catch {
    return undefined;
  }
}

/** Delete a match's replay file (no-op when absent). */
export function deleteReplayFile(matchId: string): void {
  try {
    fs.unlinkSync(filePath(matchId));
  } catch {
    // absent or already removed — nothing to do
  }
}
