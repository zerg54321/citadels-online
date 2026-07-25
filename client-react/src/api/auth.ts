import type { AuthUser } from '../store/authSlice';

export interface AuthResponse {
  status: 'ok' | 'error';
  message?: string;
  token?: string;
  user?: AuthUser;
}

async function request(
  path: string,
  options: RequestInit = {},
): Promise<AuthResponse> {
  // Merge headers explicitly: default Content-Type must survive when the
  // caller also passes headers (e.g. Authorization). A naive `...options`
  // after `headers` would let options.headers overwrite the whole headers
  // object and drop Content-Type — then express.json never parses the body
  // and the server returns "{field} is required" for PATCH /me and
  // POST /password (the login/register paths have no caller headers, so they
  // worked and masked the bug).
  const res = await fetch(path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...((options.headers as Record<string, string>) || {}),
    },
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      status: 'error',
      message: data.message || res.statusText || 'request failed',
    };
  }
  return data as AuthResponse;
}

// Ported verbatim from the Vue client's api/auth.ts.
export default {
  register(username: string, password: string, displayName?: string) {
    return request('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, displayName }),
    });
  },

  login(username: string, password: string) {
    return request('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    });
  },

  me(token: string) {
    return request('/api/auth/me', {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });
  },

  updateDisplayName(token: string, displayName: string) {
    return request('/api/auth/me', {
      method: 'PATCH',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ displayName }),
    });
  },

  changePassword(token: string, currentPassword: string, newPassword: string) {
    return request('/api/auth/password', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ currentPassword, newPassword }),
    });
  },

  // Avatar: list preset ids (GET /api/avatar/presets).
  getAvatarPresets(): Promise<{ status: 'ok' | 'error'; presets?: string[]; message?: string }> {
    return fetch('/api/avatar/presets').then((r) => r.json().catch(() => ({})));
  },

  // Avatar: pick a preset (POST /api/avatar/preset, JSON body).
  setAvatarPreset(token: string, ref: string) {
    return request('/api/avatar/preset', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: JSON.stringify({ ref }),
    });
  },

  // Avatar: upload a custom image (POST /api/avatar/upload, multipart).
  // Must NOT use the JSON `request()` helper — multipart bodies carry their
  // own Content-Type boundary, so we fetch directly and omit Content-Type
  // (the browser sets it automatically with the correct boundary).
  async uploadAvatar(token: string, file: File): Promise<AuthResponse> {
    const form = new FormData();
    form.append('avatar', file);
    const res = await fetch('/api/avatar/upload', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` },
      body: form,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      return { status: 'error', message: data.message || res.statusText || 'upload failed' };
    }
    return data as AuthResponse;
  },
};
