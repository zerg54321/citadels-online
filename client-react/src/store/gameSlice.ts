import { StateCreator } from 'zustand';
import {
  ClientGameState, GameSetupData, Move, PlayerRole, PlayerId, RoomId, DistrictId,
} from 'citadels-common';
import socket from '../socket';
import api from '../api';
import type { AuthSlice } from './authSlice';
import type { ChatSlice } from './chatSlice';

export interface GameSlice {
  gameState: ClientGameState | undefined;
  gameSetupData: GameSetupData;
  selectedCards: DistrictId[];
  currentRoomId: RoomId | null;

  // mutations
  setGameState: (gameState: ClientGameState) => void;
  setCurrentRoomId: (roomId: RoomId | null) => void;
  resetGameState: () => void;
  addPlayer: (player: any) => void;
  removePlayer: (playerId: PlayerId) => void;
  setPlayerOnline: (online: boolean, playerId?: PlayerId) => void;
  prepareGameSetupConfirmation: (cfg: { completeCitySize?: number; actionTimeoutSeconds?: number }) => void;
  setSelectedCards: (cards: DistrictId[]) => void;

  // actions
  createRoom: () => Promise<RoomId>;
  getRoomInfo: (roomId: RoomId) => Promise<any>;
  joinRoom: (params: { roomId: RoomId; playerId: PlayerId; username: string; asSpectator?: boolean }) => Promise<ClientGameState>;
  rejoinCurrentRoom: () => Promise<void>;
  leaveRoom: () => Promise<void>;
  leaveRoomSilent: () => Promise<void>;
  startGame: () => Promise<void>;
  sendMove: (move: Move) => Promise<void>;
  setAutoplay: (enabled: boolean) => Promise<any>;
  setLobbyRole: (role: 'player' | 'spectator') => Promise<any>;
  reorderLobbySeat: (payload: { playerId: string; direction: number }) => Promise<any>;
  addAiPlayer: () => Promise<any>;
  removeAiPlayer: (playerId: PlayerId) => Promise<any>;
}

export const createGameSlice: StateCreator<GameSlice & AuthSlice & ChatSlice, [], [], GameSlice> = (set, get) => ({
  gameState: undefined,
  gameSetupData: {
    players: [],
    completeCitySize: 7,
    actionTimeoutSeconds: 120,
  },
  selectedCards: [],
  currentRoomId: null,

  setGameState: (gs) => set({ gameState: gs }),
  setCurrentRoomId: (roomId) => set({ currentRoomId: roomId }),
  resetGameState: () => {
    const { currentRoomId } = get();
    if (currentRoomId) localStorage.removeItem(currentRoomId);
    set({ gameState: undefined, currentRoomId: null });
    // Clear chat too — both slices share the merged store, so clearChatMessages
    // is reachable via get() even though it's defined in chatSlice.
    get().clearChatMessages();
  },
  addPlayer: (player) => set((state) => {
    if (state.gameState === undefined) return {};
    return { gameState: { ...state.gameState, players: { ...state.gameState.players, [player.id]: player } } };
  }),
  removePlayer: (playerId) => set((state) => {
    if (state.gameState === undefined) return {};
    const players = { ...state.gameState.players };
    delete players[playerId];
    return { gameState: { ...state.gameState, players } };
  }),
  setPlayerOnline: (online, playerId) => set((state) => {
    if (state.gameState === undefined || playerId === undefined) return {};
    const player = state.gameState.players[playerId];
    if (!player) return {};
    return { gameState: { ...state.gameState, players: { ...state.gameState.players, [playerId]: { ...player, online } } } };
  }),
  prepareGameSetupConfirmation: (cfg) => set((state) => {
    const order = state.gameState?.lobbyPlayerOrder;
    let players: PlayerId[];
    if (Array.isArray(order) && order.length) {
      players = order.filter((id) => {
        const p = state.gameState?.players[id];
        return p && p.role === PlayerRole.PLAYER;
      });
    } else {
      players = Object.values(state.gameState?.players || {})
        .filter((player) => player.role === PlayerRole.PLAYER)
        .map((player) => player.id);
    }
    const completeCitySize = players.length === 6 ? 8 : (cfg.completeCitySize ?? 7);
    const t = Number(cfg.actionTimeoutSeconds);
    const actionTimeoutSeconds = Number.isFinite(t) ? Math.min(180, Math.max(10, Math.round(t))) : 120;
    return {
      gameSetupData: {
        ...state.gameSetupData, players, completeCitySize, actionTimeoutSeconds,
      },
    };
  }),
  setSelectedCards: (cards) => set({ selectedCards: cards }),

  async createRoom() {
    if (!get().authToken) throw new Error('login required');
    await get().connect();
    return api.createRoom(socket);
  },

  async getRoomInfo(roomId) {
    await get().connect();
    return api.getRoomInfo(socket, roomId);
  },

  async joinRoom({
    roomId, playerId, username, asSpectator = false,
  }) {
    await get().connect();
    const gs = await api.joinRoom(socket, roomId, playerId, username, asSpectator);
    localStorage.setItem(roomId, gs.self);
    set({ currentRoomId: roomId, gameState: gs });
    return gs;
  },

  async rejoinCurrentRoom() {
    const { currentRoomId, gameState } = get();
    if (!currentRoomId || !gameState) return;
    const playerId = gameState.self;
    const self = gameState.players[playerId];
    const asSpectator = self?.role === PlayerRole.SPECTATOR;
    await get().joinRoom({
      roomId: currentRoomId,
      playerId,
      username: gameState.players[playerId]?.username || '',
      asSpectator,
    });
  },

  async leaveRoom() {
    try {
      if (socket.connected && get().currentRoomId) {
        await new Promise<void>((resolve) => {
          socket.emit('leave room', (res: any) => {
            if (res?.status !== 'ok') console.warn('leave room failed', res?.message);
            resolve();
          });
        });
      }
    } catch (e) {
      console.warn('leave room error', e);
    } finally {
      if (socket.connected) socket.disconnect();
      get().resetGameState();
      get().reconnectSocket();
    }
  },

  leaveRoomSilent() {
    if (!socket.connected || !get().currentRoomId) return Promise.resolve();
    return new Promise<void>((resolve) => {
      socket.emit('leave room', (res: any) => {
        if (res?.status !== 'ok') console.warn('leave room silent failed', res?.message);
        resolve();
      });
    });
  },

  async startGame() {
    if (!socket.connected) {
      await get().connect();
      await get().rejoinCurrentRoom();
    }
    const response = await api.startGame(socket, get().gameSetupData);
    if (response.status === 'error') throw new Error(`Error when starting game: ${response.message}`);
  },

  sendMove(move) {
    return new Promise<void>((resolve, reject) => {
      if (!socket.connected) return reject(new Error('You must be connected'));
      socket.emit('make move', move, (res: any) => {
        if (res.status === 'ok') return resolve();
        if (res.status === 'error') return reject(new Error(`Error when sending move: ${res.message}`));
        reject(new Error(`Unknown response type: ${res.status}`));
      });
    });
  },

  setAutoplay(enabled) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) return reject(new Error('You must be connected'));
      socket.emit('set autoplay', enabled, (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        reject(new Error(res?.message || 'set autoplay failed'));
      });
    });
  },

  setLobbyRole(role) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) return reject(new Error('You must be connected'));
      socket.emit('set lobby role', role, (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        reject(new Error(res?.message || 'set lobby role failed'));
      });
    });
  },

  reorderLobbySeat(payload) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) return reject(new Error('You must be connected'));
      socket.emit('reorder lobby seat', payload, (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        reject(new Error(res?.message || 'reorder failed'));
      });
    });
  },

  addAiPlayer() {
    return new Promise((resolve, reject) => {
      if (!socket.connected) return reject(new Error('You must be connected'));
      socket.emit('add ai player', (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        reject(new Error(res?.message || 'add ai failed'));
      });
    });
  },

  removeAiPlayer(playerId) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) return reject(new Error('You must be connected'));
      socket.emit('remove ai player', playerId, (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        reject(new Error(res?.message || 'remove ai failed'));
      });
    });
  },
});
