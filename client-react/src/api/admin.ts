import type { Avatar } from 'citadels-common';

export type AdminUser = {
  id: string;
  username: string;
  displayName: string;
  avatar: Avatar;
  pwdChangedAt: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminMatchPlayer = {
  user_id: string | null;
  player_id: string;
  seat: number;
  team: number;
  display_name: string;
  personal_score: number;
  is_ai: boolean;
  team_won: boolean;
};

export type AdminMatch = {
  id: string;
  roomId: string;
  gameMode: number;
  ranked: boolean;
  hasAi: boolean;
  completeCitySize: number;
  teamScoreA: number | null;
  teamScoreB: number | null;
  matchResult: number;
  startedAt: string;
  endedAt: string;
  players: AdminMatchPlayer[];
};

export type AdminAuditRow = {
  id: number;
  ts: string;
  ip: string;
  action: string;
  targetId: string | null;
  before: unknown;
  after: unknown;
};

async function adminRequest<T>(
  path: string,
  token: string,
  options: RequestInit = {},
): Promise<T> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  headers.Authorization = `Bearer ${token}`;
  if (options.headers) Object.assign(headers, options.headers as Record<string, string>);
  const res = await fetch(path, { ...options, headers });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || res.statusText || 'request failed');
  }
  return data as T;
}

export default {
  ping(token: string) {
    return adminRequest<{ status: string }>('/api/admin/ping', token);
  },
  users(token: string, limit = 50, offset = 0, prefix: string | undefined = undefined) {
    const qs = `limit=${limit}&offset=${offset}${prefix ? `&prefix=${encodeURIComponent(prefix)}` : ''}`;
    return adminRequest<{ status: string; total: number; users: AdminUser[] }>(
      `/api/admin/users?${qs}`,
      token,
    );
  },
  user(token: string, id: string) {
    return adminRequest<{ status: string; user: AdminUser }>(`/api/admin/users/${id}`, token);
  },
  updateUser(
    token: string,
    id: string,
    patch: { displayName?: string; avatarType?: string; avatarRef?: string },
  ) {
    return adminRequest<{ status: string; user: AdminUser }>(`/api/admin/users/${id}`, token, {
      method: 'PATCH',
      body: JSON.stringify(patch),
    });
  },
  resetPassword(token: string, id: string, newPassword?: string) {
    return adminRequest<{ status: string; user: AdminUser; password: string }>(
      `/api/admin/users/${id}/reset-password`,
      token,
      { method: 'POST', body: JSON.stringify(newPassword ? { newPassword } : {}) },
    );
  },
  deleteUser(token: string, id: string) {
    return adminRequest<{ status: string; backup: string }>(`/api/admin/users/${id}`, token, {
      method: 'DELETE',
    });
  },
  batchDeleteUsers(token: string, ids: string[]) {
    return adminRequest<{ status: string; deleted: number; backup: string }>(
      '/api/admin/users/batch-delete',
      token,
      { method: 'POST', body: JSON.stringify({ ids }) },
    );
  },
  matches(token: string, limit = 50, offset = 0) {
    return adminRequest<{ status: string; total: number; matches: AdminMatch[] }>(
      `/api/admin/matches?limit=${limit}&offset=${offset}`,
      token,
    );
  },
  match(token: string, id: string) {
    return adminRequest<{ status: string; match: AdminMatch }>(`/api/admin/matches/${id}`, token);
  },
  replay(token: string, id: string, limit = 200, offset = 0) {
    return adminRequest<{ status: string; frames: unknown[]; total: number }>(
      `/api/admin/matches/${id}/replay?limit=${limit}&offset=${offset}`,
      token,
    );
  },
  deleteMatch(token: string, id: string) {
    return adminRequest<{ status: string; backup: string }>(`/api/admin/matches/${id}`, token, {
      method: 'DELETE',
    });
  },
  audit(token: string, limit = 50, offset = 0) {
    return adminRequest<{ status: string; total: number; audit: AdminAuditRow[] }>(
      `/api/admin/audit?limit=${limit}&offset=${offset}`,
      token,
    );
  },
};
