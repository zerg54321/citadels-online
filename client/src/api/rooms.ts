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
  completeCitySize: number;
};

export default {
  async list(): Promise<RoomListItem[]> {
    const res = await fetch('/api/rooms');
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.status === 'error') {
      throw new Error(data.message || res.statusText || 'failed to list rooms');
    }
    return data.rooms || [];
  },
};
