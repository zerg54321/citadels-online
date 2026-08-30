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
  /** true when the logged-in user is a PLAYER of this in-progress game, even
   * with spectators off — lets the home list offer a "resume game" button. */
  canResume?: boolean;
  completeCitySize: number;
};

export type OnlineUserItem = {
  userId: string;
  displayName: string;
  avatar: { type: string; ref: string } | null;
  status: 'idle' | 'lobby' | 'playing' | 'spectating';
};

async function getJson(path: string, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'error') {
    throw new Error(data.message || res.statusText || 'request failed');
  }
  return data;
}

// Ported verbatim from the Vue client's api/rooms.ts.
export default {
  async list(token?: string | null): Promise<RoomListItem[]> {
    const data = await getJson('/api/rooms', token);
    return data.rooms || [];
  },

  /** Room list + logged-in online users with live status, in one poll.
   *  `token` lets the server tag each room with a per-user `canResume` flag. */
  async listWithOnline(
    token?: string | null,
  ): Promise<{ rooms: RoomListItem[]; online: OnlineUserItem[] }> {
    const data = await getJson('/api/rooms', token);
    return { rooms: data.rooms || [], online: data.online || [] };
  },
};
