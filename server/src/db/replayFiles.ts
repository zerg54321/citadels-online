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
// File format v2 (current):
//   { version: 2, startFrame, frames, chatLog }
//     startFrame — absolute number of frames[0]; replaySnapshots is bounded
//                  (REPLAY_MAX_SNAPSHOTS) and drops the OLDEST frames, so
//                  array indices drift while absolute frame numbers don't.
//     chatLog    — chat messages stamped with absolute frame numbers, so the
//                  replay client interleaves them with the action log.
// v1 (legacy, still readable): a bare array of frames, no chat.
//
// Test isolation mirrors database.ts: under vitest (VITEST_WORKER_ID) files
// go to a per-process temp dir so tests never touch real replay data.

export type ReplayChatEntry = {
  playerId: string;
  username: string;
  text: string;
  role: number;
  ts: number;
  frame: number;
};

export type ReplayFileData = {
  frames: unknown[];
  /** absolute frame number of frames[0] (0 for legacy files) */
  startFrame: number;
  chatLog: ReplayChatEntry[];
};

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

/** Persist a replay file (v2: frames + chat archive). Best-effort: returns
 * false on write failure (the match row still saves; the replay is simply
 * absent). startFrame is the absolute number of the first frame — callers
 * derive it from the bounded snapshot buffer (see matches.ts). */
export function saveReplayFile(
  matchId: string,
  frames: unknown[],
  chatLog: ReplayChatEntry[] = [],
  startFrame = 0,
): boolean {
  if (!frames.length) return false;
  try {
    fs.mkdirSync(replayDir, { recursive: true });
    fs.writeFileSync(filePath(matchId), JSON.stringify({
      version: 2,
      startFrame,
      frames,
      chatLog,
    }), 'utf-8');
    return true;
  } catch (err) {
    console.error('[replays] write failed', matchId, err);
    return false;
  }
}

/** Load a match's replay file. Accepts v2 objects and legacy bare arrays
 * (chatLog empty, startFrame 0). Returns undefined when no file exists or
 * the payload is unusable. */
export function loadReplayFile(matchId: string): ReplayFileData | undefined {
  let raw: string;
  try {
    raw = fs.readFileSync(filePath(matchId), 'utf-8');
  } catch {
    return undefined;
  }
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      // v1: bare frame array
      return { frames: parsed, startFrame: 0, chatLog: [] };
    }
    if (parsed !== null && typeof parsed === 'object' && Array.isArray(parsed.frames)) {
      return {
        frames: parsed.frames,
        startFrame: typeof parsed.startFrame === 'number' ? parsed.startFrame : 0,
        chatLog: Array.isArray(parsed.chatLog) ? parsed.chatLog : [],
      };
    }
    return undefined;
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
