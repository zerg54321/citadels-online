import { Socket } from 'socket.io-client';
import { createStore } from 'vuex';
import {
  CharacterType,
  ClientGameState,
  GameProgress,
  GameSetupData,
  Move,
  PlayerRole,
  districts,
  PlayerId,
  RoomId,
  DistrictId,
} from 'citadels-common';
import socket from '../socket';
import api from '../api';
import authApi from '../api/auth';
import { AuthUser } from '../types/authTypes';

const AUTH_TOKEN_KEY = 'citadels_auth_token';

export interface State {
  socket: Socket
  gameState: ClientGameState | undefined
  gameSetupData: GameSetupData
  selectedCards: DistrictId[]
  authToken: string | null
  authUser: AuthUser | null
  authReady: boolean
  currentRoomId: RoomId | null
}

/** Set auth payload only — never disconnect here (would leave the game room). */
function setSocketAuthToken(token: string | null) {
  socket.auth = token ? { token } : {};
}

export const store = createStore<State>({
  state: {
    socket,
    gameState: undefined,
    gameSetupData: {
      players: [],
      completeCitySize: 7,
      actionTimeoutSeconds: 120,
    },
    selectedCards: [],
    authToken: localStorage.getItem(AUTH_TOKEN_KEY),
    authUser: null,
    authReady: false,
    currentRoomId: null,
  },

  getters: {
    isConnected(state) {
      return state.socket.connected;
    },
    isInRoom(state) {
      return state.gameState !== undefined;
    },
    gameState(state) {
      return state.gameState;
    },
    gameProgress(state) {
      switch (state.gameState?.progress) {
        case GameProgress.IN_LOBBY:
          return 'IN_LOBBY';
        case GameProgress.IN_GAME:
          return 'IN_GAME';
        case GameProgress.FINISHED:
          return 'FINISHED';
        default:
          return 'UNKNOWN';
      }
    },
    gameSetupData(state) {
      return state.gameSetupData;
    },
    getPlayerFromId(state) {
      return (playerId: PlayerId) => state.gameState?.players.get(playerId);
    },
    getDistrictFromId() {
      return (districtId: DistrictId) => districts[districtId as keyof typeof districts];
    },
    charactersList(state) {
      return {
        ...state.gameState?.board.characters,
      };
    },
    currentPlayerId(state) {
      if (state.gameState === undefined) return undefined;
      return state.gameState.board.playerOrder[state.gameState.board.currentPlayer];
    },
    isCurrentPlayerSelf(state, getters) {
      return state.gameState !== undefined && state.gameState.self === getters.currentPlayerId;
    },
    getDistrictDestroyPrice(state, getters) {
      return (playerId: PlayerId, districtId: DistrictId) => {
        if (districtId === 'keep') return -1;

        if (state.gameState === undefined) return -1;
        const player = state.gameState.board.players.get(playerId);
        if (player === undefined) return -1;

        if (player.city.length >= state.gameState.settings.completeCitySize) return -1;

        const isBishopDead = state.gameState.board.characters.callable.find(
          ({ id }) => id === CharacterType.BISHOP,
        )?.killed ?? false;
        const isPlayerBishop = player.characters.some(({ id }) => id === CharacterType.BISHOP);
        if (!isBishopDead && isPlayerBishop) return -1;

        const discount = (
          player.city.includes('great_wall') && districtId !== 'great_wall'
        ) ? 0 : 1;

        return Math.max(getters.getDistrictFromId(districtId)?.cost - discount, 0);
      };
    },
    getPlayerPosition(state) {
      return (playerId: PlayerId) => state.gameState?.board.playerOrder.indexOf(playerId);
    },
    selectedCards(state) {
      return state.selectedCards;
    },
    isLoggedIn(state) {
      return Boolean(state.authToken && state.authUser);
    },
    authUser(state) {
      return state.authUser;
    },
    authToken(state) {
      return state.authToken;
    },
    authReady(state) {
      return state.authReady;
    },
  },

  mutations: {
    setGameState(state, gameState) {
      state.gameState = gameState;
    },
    setCurrentRoomId(state, roomId: RoomId | null) {
      state.currentRoomId = roomId;
    },
    resetGameState(state) {
      state.gameState = undefined;
      state.currentRoomId = null;
    },
    addPlayer(state, player) {
      if (state.gameState !== undefined) {
        state.gameState.players.set(player.id, player);
      }
    },
    removePlayer(state, playerId) {
      if (state.gameState !== undefined) {
        const player = state.gameState.players.get(playerId);
        if (player !== undefined) {
          console.log(`${player} disconnected`);
          state.gameState.players.delete(playerId);
        }
      }
    },
    setPlayerOnline(state, { playerId, online }) {
      if (state.gameState !== undefined) {
        const player = state.gameState.players.get(playerId);
        if (player) {
          player.online = online;
        }
      }
    },
    prepareGameSetupConfirmation(state, { completeCitySize, actionTimeoutSeconds }) {
      const order = state.gameState?.lobbyPlayerOrder;
      if (Array.isArray(order) && order.length) {
        state.gameSetupData.players = order.filter((id) => {
          const p = state.gameState?.players.get(id);
          return p && p.role === PlayerRole.PLAYER;
        });
      } else {
        state.gameSetupData.players = Array.from(state.gameState?.players.values() || [])
          .filter((player) => player.role === PlayerRole.PLAYER)
          .map((player) => player.id);
      }
      // 6 players => competitive 3v3, city size forced to 8 on server
      if (state.gameSetupData.players.length === 6) {
        state.gameSetupData.completeCitySize = 8;
      } else {
        state.gameSetupData.completeCitySize = completeCitySize ?? 7;
      }
      const t = Number(actionTimeoutSeconds);
      state.gameSetupData.actionTimeoutSeconds = Number.isFinite(t)
        ? Math.min(180, Math.max(10, Math.round(t)))
        : 120;
    },
    setSelectedCards(state, { cards }) {
      state.selectedCards = cards;
    },
    setAuth(state, { token, user }: { token: string | null; user: AuthUser | null }) {
      state.authToken = token;
      state.authUser = user;
      if (token) {
        localStorage.setItem(AUTH_TOKEN_KEY, token);
      } else {
        localStorage.removeItem(AUTH_TOKEN_KEY);
      }
      setSocketAuthToken(token);
    },
    setAuthReady(state, ready: boolean) {
      state.authReady = ready;
    },
  },

  actions: {
    async initAuth({ state, commit }) {
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

    async register({ commit, dispatch }, { username, password, displayName }) {
      const res = await authApi.register(username, password, displayName);
      if (res.status !== 'ok' || !res.token || !res.user) {
        throw new Error(res.message || 'register failed');
      }
      commit('setAuth', { token: res.token, user: res.user });
      await dispatch('reconnectSocket');
      return res.user;
    },

    async login({ commit, dispatch }, { username, password }) {
      const res = await authApi.login(username, password);
      if (res.status !== 'ok' || !res.token || !res.user) {
        throw new Error(res.message || 'login failed');
      }
      commit('setAuth', { token: res.token, user: res.user });
      await dispatch('reconnectSocket');
      return res.user;
    },

    async logout({ commit, dispatch }) {
      commit('setAuth', { token: null, user: null });
      commit('resetGameState');
      await dispatch('reconnectSocket');
    },

    async updateDisplayName({ state, commit }, displayName: string) {
      if (!state.authToken) throw new Error('not logged in');
      const res = await authApi.updateDisplayName(state.authToken, displayName);
      if (res.status !== 'ok' || !res.token || !res.user) {
        throw new Error(res.message || 'update failed');
      }
      // Update token only; do not disconnect (would leave the room)
      commit('setAuth', { token: res.token, user: res.user });
      return res.user;
    },

    reconnectSocket({ state }) {
      setSocketAuthToken(state.authToken);
      if (state.socket.connected) {
        state.socket.disconnect();
      }
    },

    connect({ state }) {
      setSocketAuthToken(state.authToken);
      if (state.socket.connected) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const onConnect = () => {
          cleanup();
          resolve();
        };
        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };
        const cleanup = () => {
          state.socket.off('connect', onConnect);
          state.socket.off('connect_error', onError);
        };
        state.socket.once('connect', onConnect);
        state.socket.once('connect_error', onError);
        state.socket.connect();
      });
    },

    async createRoom({ state, dispatch }) {
      if (!state.authUser) {
        throw new Error('login required');
      }
      await dispatch('connect');
      return api.createRoom(state.socket);
    },

    async getRoomInfo({ state, dispatch }, roomId: RoomId) {
      await dispatch('connect');
      return api.getRoomInfo(state.socket, roomId);
    },

    async joinRoom({ state, commit, dispatch }, {
      roomId, playerId, username, asSpectator = false,
    }) {
      await dispatch('connect');
      const gameState = await api.joinRoom(
        state.socket,
        roomId,
        playerId,
        username,
        asSpectator,
      );
      localStorage.setItem(roomId, gameState.self);
      commit('setCurrentRoomId', roomId);
      commit('setGameState', gameState);
      return gameState;
    },

    /** Re-enter room after socket reconnect (keeps seat / manager). */
    async rejoinCurrentRoom({ state, dispatch }) {
      if (!state.currentRoomId || !state.gameState) return;
      const playerId = state.gameState.self;
      const self = state.gameState.players.get(playerId);
      const asSpectator = self?.role === PlayerRole.SPECTATOR;
      await dispatch('joinRoom', {
        roomId: state.currentRoomId,
        playerId,
        username: state.authUser?.displayName || self?.username || '',
        asSpectator,
      });
    },

    async startGame({ state, dispatch }) {
      if (!state.socket.connected) {
        await dispatch('connect');
        await dispatch('rejoinCurrentRoom');
      }
      const response = await api.startGame(state.socket, state.gameSetupData);
      switch (response.status) {
        case 'error':
          throw new Error(`Error when starting game: ${response.message}`);
        case 'ok':
          break;
        default:
          throw new Error(`Unknown response type: ${response.status}`);
      }
    },

    sendMove({ state }, move: Move) {
      return new Promise((resolve, reject) => {
        if (!state.socket.connected) {
          return reject(new Error('You must be connected'));
        }
        return state.socket.emit('make move', move, (res: any) => {
          if (res.status === 'ok') {
            return resolve(undefined);
          }
          if (res.status === 'error') {
            return reject(new Error(`Error when sending move: ${res.message}`));
          }
          return reject(new Error(`Unknown response type: ${res.status}`));
        });
      });
    },

    setAutoplay({ state }, enabled: boolean) {
      return new Promise((resolve, reject) => {
        if (!state.socket.connected) {
          return reject(new Error('You must be connected'));
        }
        return state.socket.emit('set autoplay', enabled, (res: any) => {
          if (res?.status === 'ok') return resolve(res);
          return reject(new Error(res?.message || 'set autoplay failed'));
        });
      });
    },

    setLobbyRole({ state }, role: 'player' | 'spectator') {
      return new Promise((resolve, reject) => {
        if (!state.socket.connected) {
          return reject(new Error('You must be connected'));
        }
        return state.socket.emit('set lobby role', role, (res: any) => {
          if (res?.status === 'ok') return resolve(res);
          return reject(new Error(res?.message || 'set lobby role failed'));
        });
      });
    },

    reorderLobbySeat({ state }, payload: { playerId: string; direction: number }) {
      return new Promise((resolve, reject) => {
        if (!state.socket.connected) {
          return reject(new Error('You must be connected'));
        }
        return state.socket.emit('reorder lobby seat', payload, (res: any) => {
          if (res?.status === 'ok') return resolve(res);
          return reject(new Error(res?.message || 'reorder failed'));
        });
      });
    },

    addAiPlayer({ state }) {
      return new Promise((resolve, reject) => {
        if (!state.socket.connected) {
          return reject(new Error('You must be connected'));
        }
        return state.socket.emit('add ai player', (res: any) => {
          if (res?.status === 'ok') return resolve(res);
          return reject(new Error(res?.message || 'add ai failed'));
        });
      });
    },

    removeAiPlayer({ state }, playerId: PlayerId) {
      return new Promise((resolve, reject) => {
        if (!state.socket.connected) {
          return reject(new Error('You must be connected'));
        }
        return state.socket.emit('remove ai player', playerId, (res: any) => {
          if (res?.status === 'ok') return resolve(res);
          return reject(new Error(res?.message || 'remove ai failed'));
        });
      });
    },
  },
});
