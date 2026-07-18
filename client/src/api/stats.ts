export type MyMatchItem = {
  matchId: string;
  gameMode: number;
  ranked: boolean;
  matchResult: number;
  teamScoreA: number | null;
  teamScoreB: number | null;
  team: number;
  personalScore: number;
  teamWon: boolean;
  rankedWinEligible: boolean;
  endedAt: string;
  startedAt: string;
  displayName: string;
};

export type RankingRow = {
  userId: string;
  displayName: string;
  rankedGames: number;
  rankedWins: number;
  rankedLosses: number;
  rankedDraws: number;
};

async function getJson(path: string, token?: string | null) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(path, { headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || res.statusText || 'request failed');
  }
  return data;
}

export default {
  myMatches(token: string) {
    return getJson('/api/stats/me/matches', token) as Promise<{ status: string; matches: MyMatchItem[] }>;
  },
  ranking() {
    return getJson('/api/stats/ranking') as Promise<{ status: string; ranking: RankingRow[] }>;
  },
};
