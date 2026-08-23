export type PublicMatchPlayer = {
  seat: number;
  team: number;
  display_name: string;
  personal_score: number;
  is_ai: boolean;
  team_won: boolean;
};

export type PublicMatchItem = {
  id: string;
  game_mode: number;
  ranked: boolean;
  has_ai: boolean;
  team_score_a: number | null;
  team_score_b: number | null;
  match_result: number;
  started_at: string;
  ended_at: string;
  players: PublicMatchPlayer[];
};

async function getJson(path: string) {
  const res = await fetch(path);
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.status === 'error') {
    throw new Error(data.message || res.statusText || 'request failed');
  }
  return data;
}

// Public replay library API (see server/src/matches/routes.ts):
//   GET /api/matches          — finished match list (?includeAi=1 to include
//                               AI matches; hidden by default)
//   GET /api/matches/:id/replay — god-view replay frames, paginated
export default {
  list(includeAi: boolean, limit = 50, offset = 0): Promise<{ total: number; matches: PublicMatchItem[] }> {
    const q = new URLSearchParams({
      includeAi: includeAi ? '1' : '0',
      limit: String(limit),
      offset: String(offset),
    });
    return getJson(`/api/matches?${q.toString()}`);
  },

  replay(matchId: string, limit = 500, offset = 0): Promise<{ frames: unknown[]; total: number }> {
    const q = new URLSearchParams({ limit: String(limit), offset: String(offset) });
    return getJson(`/api/matches/${encodeURIComponent(matchId)}/replay?${q.toString()}`);
  },
};
