import { AuthResponse, AuthUser } from '../types/authTypes';

async function request(
  path: string,
  options: any = {},
): Promise<AuthResponse> {
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(options.headers || {}),
    },
    ...options,
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
};

export type { AuthUser };
