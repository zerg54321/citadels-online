import { StateCreator } from 'zustand';
import {
  ClientGameState, GameSetupData, Move, MoveType, PlayerRole, PlayerId, RoomId, DistrictId,
} from 'citadels-common';
import { recordIssuedKill } from '@/utils/avIssuedMoves';
import socket from '../socket';
import api from '../api';
import type { AuthSlice } from './authSlice';
import type { ChatSlice } from './chatSlice';

export interface GameSlice {
  gameState: ClientGameState | undefined;
  gameSetupData: GameSetupData;
  selectedCards: DistrictId[];
  currentRoomId: RoomId | null;
  isConnected: boolean;
  /**
   * Set by leaveRoom() to the room the local player just left. RoomEntryScreen
   * reads this on mount to suppress its auto-join: leaveRoom clears gameState
   * synchronously, which flips useIsInRoom to false and makes RoomScreen render
   * <RoomEntryScreen /> before the caller's navigate('/') runs — without this
   * guard RoomEntryScreen would immediately call joinRoom on the same room,
   * re-adding the player ("leave then instantly re-enter" bug). Cleared
   * shortly after by a timeout and on the next successful joinRoom.
   */
  recentlyLeftRoomId: RoomId | null;
  /**
   * Character ids (1-based, matching server `callable[].id`) the local player
   * has seen face-up during their own CHOOSE_CHARACTER pick this round. Used
   * by the assassin/thief target grid to grey out cards the player never saw
   * in their pick pool (the 天绝 card + characters chosen by earlier pickers),
   * so they can tell those apart from cards they actually observed. Reset at
   * each new round (when gamePhase returns to CHOOSE_CHARACTERS).
   */
  seenCharacterIds: number[];

  // mutations
  setGameState: (gameState: ClientGameState) => void;
  setCurrentRoomId: (roomId: RoomId | null) => void;
  setConnected: (connected: boolean) => void;
  resetGameState: () => void;
  addPlayer: (player: any) => void;
  removePlayer: (playerId: PlayerId) => void;
  setPlayerOnline: (online: boolean, playerId?: PlayerId) => void;
  prepareGameSetupConfirmation: (cfg: { completeCitySize?: number; actionTimeoutSeconds?: number }) => void;
  setGameSetupData: (data: Partial<GameSetupData>) => void;
  updateGameSetup: (setupData: { actionTimeoutSeconds?: number }) => Promise<void>;
  setSelectedCards: (cards: DistrictId[]) => void;
  setSeenCharacterIds: (updater: number[] | ((prev: number[]) => number[])) => void;
  resetSeenCharacterIds: () => void;

  // actions
  createRoom: () => Promise<RoomId>;
  getRoomInfo: (roomId: RoomId) => Promise<any>;
  joinRoom: (params: { roomId: RoomId; playerId: PlayerId; username: string; asSpectator?: boolean }) => Promise<ClientGameState>;
  rejoinCurrentRoom: () => Promise<void>;
  leaveRoom: () => Promise<void>;
  startGame: () => Promise<void>;
  sendMove: (move: Move) => Promise<void>;
  setAutoplay: (enabled: boolean) => Promise<any>;
  setLobbyRole: (role: 'player' | 'spectator') => Promise<any>;
  moveLobbySeat: (payload: { playerId: string; targetSlot: number }) => Promise<any>;
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
  isConnected: socket.connected,
  seenCharacterIds: [],
  recentlyLeftRoomId: null,

  setGameState: (gs) => set({ gameState: gs }),
  setCurrentRoomId: (roomId) => set({ currentRoomId: roomId }),
  setConnected: (connected) => set({ isConnected: connected }),
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

  setGameSetupData: (data) => set((state) => ({
    gameSetupData: { ...state.gameSetupData, ...data },
  })),

  updateGameSetup: async (setupData) => {
    if (!socket.connected) return;
    try {
      await api.updateGameSetup(socket, setupData);
    } catch (e) {
      console.error('update game setup failed', e);
    }
  },
  setSelectedCards: (cards) => set({ selectedCards: cards }),
  setSeenCharacterIds: (updater) => set((state) => ({
    seenCharacterIds: typeof updater === 'function' ? updater(state.seenCharacterIds) : updater,
  })),
  resetSeenCharacterIds: () => set({ seenCharacterIds: [] }),

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
    set({ currentRoomId: roomId, gameState: gs, recentlyLeftRoomId: null });
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
    const leavingRoomId = get().currentRoomId;
    try {
      if (socket.connected && leavingRoomId) {
        await new Promise<void>((resolve) => {
          let done = false;
          const finish = () => { if (!done) { done = true; resolve(); } };
          socket.emit('leave room', (res: any) => {
            if (res?.status !== 'ok') console.warn('leave room failed', res?.message);
            finish();
          });
          // Guard against a hung ack (e.g. socket drops mid-emit): without
          // this, resetGameState in `finally` would never run and the store
          // would keep currentRoomId/gameState, causing an auto-rejoin on the
          // next reconnect.
          setTimeout(finish, 3000);
        });
      }
    } catch (e) {
      console.warn('leave room error', e);
    } finally {
      if (socket.connected) socket.disconnect();
      // Record the room we just left BEFORE clearing gameState. RoomScreen
      // re-renders synchronously once gameState is undefined and would mount
      // RoomEntryScreen, whose auto-join would re-add us to this very room.
      // RoomEntryScreen checks recentlyLeftRoomId to skip that auto-join.
      set({ recentlyLeftRoomId: leavingRoomId });
      get().resetGameState();
      get().reconnectSocket();
      // Clear the guard after the leave/navigation race window has passed so
      // a later manual visit to the same room URL can auto-join normally.
      setTimeout(() => {
        if (get().recentlyLeftRoomId === leavingRoomId) {
          set({ recentlyLeftRoomId: null });
        }
      }, 2000);
    }
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
    // Record the locally-issued assassin kill target so the AV feed dispatcher
    // can self-identify as the assassin when `call_killed` arrives (D9: that
    // feed entry carries only the victim + killed role, never the assassin).
    if (move.type === MoveType.ASSASSIN_KILL && typeof move.data === 'number') {
      recordIssuedKill(move.data);
    }
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

  moveLobbySeat(payload) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) return reject(new Error('You must be connected'));
      socket.emit('move lobby seat', payload, (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        reject(new Error(res?.message || 'move seat failed'));
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
