import { Router, Response } from 'express';
import { requireAuth, AuthedRequest } from '../auth/routes';
import { getRanking, listMatchesForUser } from '../db/matches';

export function createStatsRouter(): Router {
  const router = Router();

  router.get('/me/matches', requireAuth, (req: AuthedRequest, res: Response) => {
    try {
      const limit = Math.min(Number(req.query.limit) || 50, 100);
      const matches = listMatchesForUser(req.userId!, limit);
      res.json({ status: 'ok', matches });
    } catch (err) {
      console.error(err);
      res.status(500).json({ status: 'error', message: 'failed to load matches' });
    }
  });

  router.get('/ranking', (_req, res: Response) => {
    try {
      const limit = Math.min(Number((_req.query as any).limit) || 50, 100);
      const ranking = getRanking(limit);
      res.json({ status: 'ok', ranking });
    } catch (err) {
      console.error(err);
      res.status(500).json({ status: 'error', message: 'failed to load ranking' });
    }
  });

  return router;
}
