import {
  Router,
  Request,
  Response,
  NextFunction,
} from 'express';
import { extractBearerToken, authenticateToken } from '../auth/jwt';
import {
  listPublicMatches,
  countPublicMatches,
  getPublicMatchReplay,
} from '../db/matches';

// Public replay library: finished matches are listable/viewable by anyone.
// Mounts at /api/matches (admin's own match API lives under /api/admin/...,
// so the paths never collide).

/** Resolve the caller's user id from the Authorization header when a valid
 * token is present; leave res.locals.userId undefined otherwise. Used by the
 * replay endpoint: public matches skip auth entirely, private ones (is_public=0)
 * require a participant — so auth is OPTIONAL here, never mandatory. */
function optionalAuth(req: Request, res: Response, next: NextFunction) {
  const token = extractBearerToken(req.header('authorization'));
  if (token) {
    const user = authenticateToken(token);
    if (user) res.locals.userId = user.id; // eslint-disable-line no-param-reassign
  }
  next();
}

function clampLimit(raw: unknown, def: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return def;
  return Math.min(Math.floor(n), max);
}

function clampOffset(raw: unknown): number {
  const n = Number(raw);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.floor(n);
}

export default function createMatchesRouter(): Router {
  const router = Router();

  /**
   * Public match list for the replay library.
   * Query:
   *   includeAi=1 — also list matches containing AI players (default: hide;
   *                 replays are for analyzing human games)
   *   limit/offset — pagination
   */
  router.get('/', (req, res: Response) => {
    try {
      const includeAi = String(req.query.includeAi || '') === '1';
      const limit = clampLimit(req.query.limit, 20, 100);
      const offset = clampOffset(req.query.offset);
      const matches = listPublicMatches(limit, offset, includeAi);
      res.json({ status: 'ok', total: countPublicMatches(includeAi), matches });
    } catch (err) {
      console.error('[matches] public list failed', err);
      res.status(500).json({ status: 'error', message: 'failed to list matches' });
    }
  });

  /**
   * Public replay frames for a match (god-view snapshots; the CLIENT derives
   * each player's first-person view from them — the server never ships
   * per-player frames). Paginated like the admin endpoint. Private matches
   * (is_public=0) are limited to their participants (JWT optional auth).
   */
  router.get('/:id/replay', optionalAuth, (req: Request, res: Response) => {
    try {
      const limit = clampLimit(req.query.limit, 200, 2000);
      const offset = clampOffset(req.query.offset);
      const userId = (res.locals.userId as string | undefined) ?? null;
      const result = getPublicMatchReplay(req.params.id, userId, limit, offset);
      if (!result.ok) {
        const status = result.reason === 'forbidden' ? 403 : 404;
        const message = result.reason === 'forbidden'
          ? 'this match is private'
          : 'replay not found';
        res.status(status).json({ status: 'error', message });
        return;
      }
      res.json({ status: 'ok', frames: result.frames, total: result.total });
    } catch (err) {
      console.error('[matches] public replay failed', err);
      res.status(500).json({ status: 'error', message: 'failed to load replay' });
    }
  });

  return router;
}
