import { Router, Response } from 'express';
import { GameProgress } from 'citadels-common';
import { getGameStore } from '../socket/server';
import { getOnlineUserEntries } from '../socket/onlineUsers';

/**
 * Derive a user's live status from the room store at request time. The
 * tracker only caches roomId/spectating; phase is read from the live room
 * so statuses stay accurate as games start and finish. Dead rooms
 * (auto-evacuated after the empty timeout) self-heal to 'idle'.
 */
function deriveStatus(roomId: string | undefined, spectating: boolean | undefined): string {
  if (!roomId) return 'idle';
  const room = getGameStore().findRoom(roomId);
  if (!room) return 'idle';
  const { progress } = room.gameState;
  if (progress === GameProgress.FINISHED) return 'idle';
  if (spectating) return 'spectating';
  return progress === GameProgress.IN_GAME ? 'playing' : 'lobby';
}

export default function createRoomsRouter(): Router {
  const router = Router();

  /**
   * Public room list for lobby join / mid-game spectate.
   * Hides finished rooms by default (?includeFinished=1 to show).
   * Also returns the logged-in users currently online, with a live status
   * per user (idle / lobby / playing / spectating).
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

      const online = getOnlineUserEntries()
        .map((entry) => ({
          userId: entry.userId,
          displayName: entry.displayName,
          avatar: entry.avatar ?? null,
          status: deriveStatus(entry.roomId, entry.spectating),
        }))
        .sort((a, b) => a.displayName.localeCompare(b.displayName));

      res.json({
        status: 'ok',
        rooms,
        online,
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
