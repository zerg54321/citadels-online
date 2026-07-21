import { StateCreator } from 'zustand';
import socket from '../socket';
import authApi from '../api/auth';
import type { GameSlice } from './gameSlice';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
}

export interface AuthSlice {
  authToken: string | null;
  authUser: AuthUser | null;
  authReady: boolean;

  initAuth: () => Promise<void>;
  setAuth: (token: string | null, user: AuthUser | null) => void;
  setAuthReady: (ready: boolean) => void;
  login: (username: string, password: string) => Promise<AuthUser>;
  register: (params: { username: string; password: string; displayName?: string }) => Promise<AuthUser>;
  logout: () => Promise<void>;
  updateDisplayName: (displayName: string) => Promise<AuthUser>;

  // Socket lifecycle — lives here because connect() needs authToken.
  connect: () => Promise<void>;
  reconnectSocket: () => void;
}

export const createAuthSlice: StateCreator<AuthSlice & GameSlice, [], [], AuthSlice> = (set, get) => ({
  authToken: null,
  authUser: null,
  authReady: false,

  initAuth() {
    const token = localStorage.getItem('authToken');
    const userJson = localStorage.getItem('authUser');
    const user = userJson ? (JSON.parse(userJson) as AuthUser) : null;
    socket.auth = token ? { token } : {};
    if (!token) {
      set({ authToken: token, authUser: user, authReady: true });
      return Promise.resolve();
    }
    return authApi.me(token).then((res) => {
      if (res.status === 'ok' && res.user) {
        set({ authToken: token, authUser: res.user, authReady: true });
      } else {
        localStorage.removeItem('authToken');
        localStorage.removeItem('authUser');
        set({ authToken: null, authUser: null, authReady: true });
      }
    }).catch(() => {
      localStorage.removeItem('authToken');
      localStorage.removeItem('authUser');
      set({ authToken: null, authUser: null, authReady: true });
    });
  },

  setAuth(token, user) {
    if (token) localStorage.setItem('authToken', token);
    else localStorage.removeItem('authToken');
    if (user) localStorage.setItem('authUser', JSON.stringify(user));
    else localStorage.removeItem('authUser');
    socket.auth = token ? { token } : {};
    set({ authToken: token, authUser: user });
  },

  setAuthReady(ready) {
    set({ authReady: ready });
  },

  async login(username, password) {
    const res = await authApi.login(username, password);
    if (res.status !== 'ok' || !res.token || !res.user) {
      throw new Error(res.message || 'login failed');
    }
    get().setAuth(res.token, res.user);
    get().reconnectSocket();
    return res.user;
  },

  async register({ username, password, displayName }) {
    const res = await authApi.register(username, password, displayName);
    if (res.status !== 'ok' || !res.token || !res.user) {
      throw new Error(res.message || 'register failed');
    }
    get().setAuth(res.token, res.user);
    get().reconnectSocket();
    return res.user;
  },

  async logout() {
    get().setAuth(null, null);
    get().resetGameState();
    get().reconnectSocket();
  },

  async updateDisplayName(displayName) {
    const { authToken } = get();
    if (!authToken) throw new Error('not logged in');
    const res = await authApi.updateDisplayName(authToken, displayName);
    if (res.status !== 'ok' || !res.token || !res.user) {
      throw new Error(res.message || 'update failed');
    }
    get().setAuth(res.token, res.user);
    return res.user;
  },

  connect() {
    const { authToken } = get();
    socket.auth = authToken ? { token: authToken } : {};
    if (socket.connected) return Promise.resolve();
    return new Promise<void>((resolve, reject) => {
      function onConnect() {
        socket.off('connect_error', onError);
        resolve();
      }
      function onError(err: Error) {
        socket.off('connect', onConnect);
        reject(err);
      }
      socket.once('connect', onConnect);
      socket.once('connect_error', onError);
      socket.connect();
    });
  },

  reconnectSocket() {
    const { authToken } = get();
    socket.auth = authToken ? { token: authToken } : {};
    if (socket.connected) {
      socket.disconnect();
    }
  },
});
