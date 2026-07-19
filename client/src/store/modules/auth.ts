import { AuthUser } from '../../types/authTypes';
import authApi from '../../api/auth';
import socket from '../../socket';

const AUTH_TOKEN_KEY = 'citadels_auth_token';

function setSocketAuthToken(token: string | null) {
  socket.auth = token ? { token } : {};
}

export interface AuthState {
  authToken: string | null;
  authUser: AuthUser | null;
  authReady: boolean;
}

export const authState = (): AuthState => ({
  authToken: localStorage.getItem(AUTH_TOKEN_KEY),
  authUser: null,
  authReady: false,
});

export const authGetters = {
  isLoggedIn(state: AuthState) {
    return Boolean(state.authToken && state.authUser);
  },
  authUser(state: AuthState) {
    return state.authUser;
  },
  authToken(state: AuthState) {
    return state.authToken;
  },
  authReady(state: AuthState) {
    return state.authReady;
  },
};

export const authMutations = {
  setAuth(state: AuthState, { token, user }: { token: string | null; user: AuthUser | null }) {
    state.authToken = token;
    state.authUser = user;
    if (token) {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
    } else {
      localStorage.removeItem(AUTH_TOKEN_KEY);
    }
    setSocketAuthToken(token);
  },
  setAuthReady(state: AuthState, ready: boolean) {
    state.authReady = ready;
  },
};

export const authActions = {
  async initAuth({ state, commit }: { state: AuthState; commit: any }) {
    setSocketAuthToken(state.authToken);
    if (!state.authToken) {
      commit('setAuthReady', true);
      return;
    }
    try {
      const res = await authApi.me(state.authToken);
      if (res.status === 'ok' && res.user) {
        commit('setAuth', { token: state.authToken, user: res.user });
      } else {
        commit('setAuth', { token: null, user: null });
      }
    } catch {
      commit('setAuth', { token: null, user: null });
    } finally {
      commit('setAuthReady', true);
    }
  },

  async register({ commit, dispatch }: { commit: any; dispatch: any },
    { username, password, displayName }: { username: string; password: string; displayName: string }) {
    const res = await authApi.register(username, password, displayName);
    if (res.status !== 'ok' || !res.token || !res.user) {
      throw new Error(res.message || 'register failed');
    }
    commit('setAuth', { token: res.token, user: res.user });
    await dispatch('reconnectSocket');
    return res.user;
  },

  async login({ commit, dispatch }: { commit: any; dispatch: any },
    { username, password }: { username: string; password: string }) {
    const res = await authApi.login(username, password);
    if (res.status !== 'ok' || !res.token || !res.user) {
      throw new Error(res.message || 'login failed');
    }
    commit('setAuth', { token: res.token, user: res.user });
    await dispatch('reconnectSocket');
    return res.user;
  },

  async logout({ commit, dispatch }: { commit: any; dispatch: any }) {
    commit('setAuth', { token: null, user: null });
    commit('resetGameState');
    await dispatch('reconnectSocket');
  },

  async updateDisplayName({ state, commit }: { state: AuthState; commit: any }, displayName: string) {
    if (!state.authToken) throw new Error('not logged in');
    const res = await authApi.updateDisplayName(state.authToken, displayName);
    if (res.status !== 'ok' || !res.token || !res.user) {
      throw new Error(res.message || 'update failed');
    }
    commit('setAuth', { token: res.token, user: res.user });
    return res.user;
  },
};
