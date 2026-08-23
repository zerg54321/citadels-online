export type RoomListItem = {
  roomId: string;
  phase: 'lobby' | 'in_game' | 'finished';
  status: 'open' | 'closed';
  gameMode: number;
  playerCount: number;
  spectatorCount: number;
  maxPlayers: number;
  players: { username: string; online: boolean }[];
  canJoinAsPlayer: boolean;
  canSpectate: boolean;
  /** room setting: false → spectate is disabled for this room */
  allowSpectators: boolean;
  completeCitySize: number;
};

export type OnlineUserItem = {
  userId: string;
  displayName: string;
  avatar: { type: string; ref: string } | null;
  status: 'idle' | 'lobby' | 'playing' | 'spectating';
};

// Ported verbatim from the Vue client's api/rooms.ts.
export default {
  async list(): Promise<RoomListItem[]> {
    const res = await fetch('/api/rooms');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === 'error') {
      throw new Error(data.message || res.statusText || 'failed to list rooms');
    }
    return data.rooms || [];
  },

  /** Room list + logged-in online users with live status, in one poll. */
  async listWithOnline(): Promise<{ rooms: RoomListItem[]; online: OnlineUserItem[] }> {
    const res = await fetch('/api/rooms');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === 'error') {
      throw new Error(data.message || res.statusText || 'failed to list rooms');
    }
    return { rooms: data.rooms || [], online: data.online || [] };
  },
};
