import { Router, Response } from 'express';
import { getGameStore } from '../socket/server';

export function createRoomsRouter(): Router {
  const router = Router();

  /**
   * Public room list for lobby join / mid-game spectate.
   * Hides finished rooms by default (?includeFinished=1 to show).
   */
  router.get('/', (req, res: Response) => {
    try {
      const includeFinished = String(req.query.includeFinished || '') === '1';
      const store = getGameStore();
      const rooms = store.findAllRooms()
        .map((room) => room.getListItem())
        .filter((item) => {
          if (includeFinished) return true;
          return item.phase !== 'finished';
        })
        // in-game first, then lobby; more players first
        .sort((a, b) => {
          const order = { in_game: 0, lobby: 1, finished: 2 } as const;
          const d = order[a.phase] - order[b.phase];
          if (d !== 0) return d;
          return b.playerCount - a.playerCount;
        });

      res.json({
        status: 'ok',
        rooms,
        // hint for clients
        serverTime: new Date().toISOString(),
      });
    } catch (err) {
      console.error('[rooms] list failed', err);
      res.status(500).json({ status: 'error', message: 'failed to list rooms' });
    }
  });

  return router;
}
