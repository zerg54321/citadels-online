import {
  Router,
  Request,
  Response,
} from 'express';
import path from 'path';
import fs from 'fs';
import { requireAdmin, adminIpFrom } from './middleware';
import {
  insertAudit,
  listAudit,
  countAudit,
  AuditRow,
} from './audit';
import backupDb from './backup';
import {
  adminListUsers,
  adminCountUsers,
  adminGetUser,
  adminResetPassword,
  adminUpdateUser,
  adminDeleteUsers,
  AdminUserRow,
} from '../db/users';
import {
  adminListMatches,
  adminCountMatches,
  adminGetMatch,
  adminGetMatchReplay,
  adminDeleteMatch,
  AdminMatchItem,
} from '../db/matches';

// Mirror of avatarRoutes' UPLOAD_DIR (same override/env resolution). Defaults
// to data/avatars/{userId}.webp and honors AVATAR_DIR so the admin module stays
// in sync with the player-facing avatar router without depending on it. Used
// only to clean up uploaded avatar files when a user with avatar_type='upload'
// is deleted.
const AVATAR_UPLOAD_DIR = process.env.AVATAR_DIR
  ? path.resolve(process.env.AVATAR_DIR)
  : path.resolve(__dirname, '../../../data/avatars');

function cleanAvatarUploads(rows: AdminUserRow[]): void {
  rows.forEach((u) => {
    if (u.avatar_type === 'upload') {
      try { fs.unlinkSync(path.join(AVATAR_UPLOAD_DIR, `${u.id}.webp`)); } catch { /* best effort */ }
    }
  });
}

function clampLimit(v: unknown, def: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}
function clampOffset(v: unknown): number {
  const n = Number(v);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

function publicUserRow(u: AdminUserRow) {
  return {
    id: u.id,
    username: u.username,
    displayName: u.display_name,
    avatar: { type: u.avatar_type, ref: u.avatar_ref },
    pwdChangedAt: u.pwd_changed_at,
    createdAt: u.created_at,
    updatedAt: u.updated_at,
  };
}

function publicMatchRow(m: AdminMatchItem) {
  return {
    id: m.id,
    roomId: m.room_id,
    gameMode: m.game_mode,
    ranked: m.ranked,
    hasAi: m.has_ai,
    completeCitySize: m.complete_city_size,
    teamScoreA: m.team_score_a,
    teamScoreB: m.team_score_b,
    matchResult: m.match_result,
    startedAt: m.started_at,
    endedAt: m.ended_at,
    players: m.players,
  };
}

export function createAdminRouter(): Router {
  const router = Router();

  // Gated health probe — also serves as a credential check for the admin UI.
  router.get('/ping', requireAdmin, (_req, res: Response) => {
    res.json({ status: 'ok' });
  });

  // -- Users --

  router.get('/users', requireAdmin, (req: Request, res: Response) => {
    const limit = clampLimit(req.query.limit, 50, 200);
    const offset = clampOffset(req.query.offset);
    const prefix = typeof req.query.prefix === 'string' ? req.query.prefix : undefined;
    const users = adminListUsers(limit, offset, prefix).map(publicUserRow);
    res.json({ status: 'ok', total: adminCountUsers(prefix), users });
  });

  router.get('/users/:id', requireAdmin, (req: Request, res: Response) => {
    const u = adminGetUser(req.params.id);
    if (!u) { res.status(404).json({ status: 'error', message: 'user not found' }); return; }
    res.json({ status: 'ok', user: publicUserRow(u) });
  });

  router.patch('/users/:id', requireAdmin, (req: Request, res: Response) => {
    const { displayName, avatarType, avatarRef } = req.body || {};
    const patch: { displayName?: string; avatarType?: string; avatarRef?: string } = {};
    if (displayName !== undefined) patch.displayName = displayName;
    if (avatarType !== undefined) patch.avatarType = avatarType;
    if (avatarRef !== undefined) patch.avatarRef = avatarRef;

    const before = adminGetUser(req.params.id);
    if (!before) { res.status(404).json({ status: 'error', message: 'user not found' }); return; }

    const result = adminUpdateUser(req.params.id, patch);
    if (result.error || !result.user) {
      res.status(400).json({ status: 'error', message: result.error || 'update failed' });
      return;
    }
    const after = adminGetUser(req.params.id);
    insertAudit(
      adminIpFrom(req), 'user.update', req.params.id,
      publicUserRow(before), after ? publicUserRow(after) : null,
    );
    res.json({ status: 'ok', user: result.user });
  });

  router.post('/users/:id/reset-password', requireAdmin, (req: Request, res: Response) => {
    const { newPassword } = req.body || {};
    const pw = typeof newPassword === 'string' ? newPassword : null;

    const before = adminGetUser(req.params.id);
    if (!before) { res.status(404).json({ status: 'error', message: 'user not found' }); return; }

    const result = adminResetPassword(req.params.id, pw);
    if (result.error || !result.user || !result.password) {
      res.status(400).json({ status: 'error', message: result.error || 'reset failed' });
      return;
    }
    // Audit records that a reset happened and the new pwdChangedAt, but
    // never the plaintext password (returned to the caller only here).
    insertAudit(adminIpFrom(req), 'user.reset_password', req.params.id, null, {
      pwdChangedAt: result.user.pwdChangedAt,
      generated: pw === null,
    });
    res.json({ status: 'ok', user: result.user, password: result.password });
  });

  router.delete('/users/:id', requireAdmin, async (req: Request, res: Response) => {
    const before = adminGetUser(req.params.id);
    if (!before) { res.status(404).json({ status: 'error', message: 'user not found' }); return; }

    let backupPath: string | null = null;
    try {
      backupPath = await backupDb(`user-${req.params.id.slice(0, 8)}`);
    } catch (err) {
      console.error('[admin] backup before user delete failed', err);
      res.status(500).json({ status: 'error', message: 'backup failed, delete aborted' });
      return;
    }

    const removed = adminDeleteUsers([req.params.id]);
    if (removed === 0) { res.status(404).json({ status: 'error', message: 'user not found' }); return; }
    cleanAvatarUploads([before]);
    insertAudit(
      adminIpFrom(req), 'user.delete', req.params.id,
      publicUserRow(before), { backup: backupPath },
    );
    res.json({ status: 'ok', backup: backupPath });
  });

  // Batch delete by explicit id list. The UI resolves the target set itself
  // (e.g. all users whose username starts with "bot") and sends the concrete
  // ids — the server never performs a wildcard delete, so an accidental empty
  // or over-broad prefix cannot wipe accounts the admin did not preview.
  router.post('/users/batch-delete', requireAdmin, async (req: Request, res: Response) => {
    const { ids } = (req.body || {}) as { ids?: unknown };
    if (!Array.isArray(ids) || ids.length === 0) {
      res.status(400).json({ status: 'error', message: 'ids must be a non-empty array' });
      return;
    }
    // Cap to keep the request bounded and the backup/audit row readable.
    const MAX_BATCH = 500;
    const idList = ids.filter((x): x is string => typeof x === 'string').slice(0, MAX_BATCH);
    if (idList.length === 0) {
      res.status(400).json({ status: 'error', message: 'ids must be a non-empty array' });
      return;
    }

    // Snapshot the rows that will be removed (for audit + avatar cleanup).
    const beforeRows = idList
      .map((id) => adminGetUser(id))
      .filter((u): u is AdminUserRow => u !== undefined);
    if (beforeRows.length === 0) {
      res.status(404).json({ status: 'error', message: 'no matching users found' });
      return;
    }

    let backupPath: string | null = null;
    try {
      backupPath = await backupDb(`users-batch-${beforeRows.length}`);
    } catch (err) {
      console.error('[admin] backup before batch user delete failed', err);
      res.status(500).json({ status: 'error', message: 'backup failed, delete aborted' });
      return;
    }

    const beforeIds = beforeRows.map((u) => u.id);
    const removed = adminDeleteUsers(beforeIds);
    cleanAvatarUploads(beforeRows);
    insertAudit(
      adminIpFrom(req), 'user.batch_delete', null,
      { count: removed, ids: beforeIds, usernames: beforeRows.map((u) => u.username) },
      { backup: backupPath },
    );
    res.json({ status: 'ok', deleted: removed, backup: backupPath });
  });

  // -- Matches --

  router.get('/matches', requireAdmin, (req: Request, res: Response) => {
    const limit = clampLimit(req.query.limit, 50, 200);
    const offset = clampOffset(req.query.offset);
    const matches = adminListMatches(limit, offset).map(publicMatchRow);
    res.json({ status: 'ok', total: adminCountMatches(), matches });
  });

  router.get('/matches/:id', requireAdmin, (req: Request, res: Response) => {
    const m = adminGetMatch(req.params.id);
    if (!m) { res.status(404).json({ status: 'error', message: 'match not found' }); return; }
    res.json({ status: 'ok', match: publicMatchRow(m) });
  });

  // Full god-view replay frames for a match (all hands + roles revealed).
  // Paginated so a large match is not returned as one giant response.
  router.get('/matches/:id/replay', requireAdmin, (req: Request, res: Response) => {
    const limit = clampLimit(req.query.limit, 200, 2000);
    const offset = clampOffset(req.query.offset);
    const result = adminGetMatchReplay(req.params.id, limit, offset);
    if (result === undefined) {
      res.status(404).json({ status: 'error', message: 'replay not found' });
      return;
    }
    res.json({ status: 'ok', frames: result.frames, total: result.total });
  });

  router.delete('/matches/:id', requireAdmin, async (req: Request, res: Response) => {
    const before = adminGetMatch(req.params.id);
    if (!before) { res.status(404).json({ status: 'error', message: 'match not found' }); return; }

    // Back up the live DB before any destructive write so a mistaken or
    // malicious deletion is always recoverable from data/backups/.
    let backupPath: string | null = null;
    try {
      backupPath = await backupDb(`match-${req.params.id.slice(0, 8)}`);
    } catch (err) {
      console.error('[admin] backup before delete failed', err);
      res.status(500).json({ status: 'error', message: 'backup failed, delete aborted' });
      return;
    }

    const ok = adminDeleteMatch(req.params.id);
    if (!ok) { res.status(404).json({ status: 'error', message: 'match not found' }); return; }
    insertAudit(
      adminIpFrom(req), 'match.delete', req.params.id,
      publicMatchRow(before), { backup: backupPath },
    );
    res.json({ status: 'ok', backup: backupPath });
  });

  // -- Audit --

  router.get('/audit', requireAdmin, (req: Request, res: Response) => {
    const limit = clampLimit(req.query.limit, 50, 200);
    const offset = clampOffset(req.query.offset);
    const rows = listAudit(limit, offset).map((r: AuditRow) => ({
      id: r.id,
      ts: r.ts,
      ip: r.ip,
      action: r.action,
      targetId: r.target_id,
      before: r.before_json ? JSON.parse(r.before_json) : null,
      after: r.after_json ? JSON.parse(r.after_json) : null,
    }));
    res.json({ status: 'ok', total: countAudit(), audit: rows });
  });

  return router;
}
