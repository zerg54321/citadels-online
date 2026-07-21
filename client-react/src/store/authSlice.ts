import { StateCreator } from 'zustand';
import socket from '../socket';

export interface AuthUser {
  id: string;
  username: string;
  displayName: string;
}

export interface AuthSlice {
  authToken: string | null;
  authUser: AuthUser | null;
  authReady: boolean;

  initAuth: () => void;
  setAuth: (token: string | null, user: AuthUser | null) => void;
  setAuthReady: (ready: boolean) => void;

  // Socket lifecycle — lives here because connect() needs authToken.
  connect: () => Promise<void>;
  reconnectSocket: () => void;
}

export const createAuthSlice: StateCreator<AuthSlice, [], [], AuthSlice> = (set, get) => ({
  authToken: null,
  authUser: null,
  authReady: false,

  initAuth() {
    const token = localStorage.getItem('authToken');
    const userJson = localStorage.getItem('authUser');
    const user = userJson ? (JSON.parse(userJson) as AuthUser) : null;
    set({ authToken: token, authUser: user, authReady: true });
  },

  setAuth(token, user) {
    if (token) localStorage.setItem('authToken', token);
    else localStorage.removeItem('authToken');
    if (user) localStorage.setItem('authUser', JSON.stringify(user));
    else localStorage.removeItem('authUser');
    set({ authToken: token, authUser: user });
  },

  setAuthReady(ready) {
    set({ authReady: ready });
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
