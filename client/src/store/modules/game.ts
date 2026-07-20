import { ClientGameState, GameProgress, GameSetupData, Move, PlayerRole, PlayerId, RoomId, DistrictId, districts, CharacterType } from 'citadels-common';
import socket from '../../socket';
import api from '../../api';
import { State } from '../index';

export interface GameState {
  gameState: ClientGameState | undefined;
  gameSetupData: GameSetupData;
  selectedCards: DistrictId[];
  currentRoomId: RoomId | null;
}

export const gameState = (): GameState => ({
  gameState: undefined,
  gameSetupData: {
    players: [],
    completeCitySize: 7,
    actionTimeoutSeconds: 120,
  },
  selectedCards: [],
  currentRoomId: null,
});

export const gameGetters = {
  isInRoom(state: GameState) {
    return state.gameState !== undefined;
  },
  gameState(state: GameState) {
    return state.gameState;
  },
  gameProgress(state: GameState) {
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
  gameSetupData(state: GameState) {
    return state.gameSetupData;
  },
  getPlayerFromId(state: GameState) {
    return (playerId: PlayerId) => state.gameState?.players[playerId];
  },
  getDistrictFromId() {
    return (districtId: DistrictId) => districts[districtId as keyof typeof districts];
  },
  charactersList(state: GameState) {
    return {
      ...state.gameState?.board.characters,
    };
  },
  currentPlayerId(state: GameState) {
    if (state.gameState === undefined) return undefined;
    return state.gameState.board.playerOrder[state.gameState.board.currentPlayer];
  },
  isCurrentPlayerSelf(state: GameState, getters: any) {
    return state.gameState !== undefined && state.gameState.self === getters.currentPlayerId;
  },
  getDistrictDestroyPrice(state: GameState, getters: any) {
    return (playerId: PlayerId, districtId: DistrictId) => {
      if (districtId === 'keep') return -1;

      if (state.gameState === undefined) return -1;
      const player = state.gameState.board.players[playerId];
      if (player === undefined) return -1;

      if (player.city.length >= state.gameState.settings.completeCitySize) return -1;

      const isBishopDead = state.gameState.board.characters.callable.find(
        ({ id }) => id === CharacterType.BISHOP + 1,
      )?.killed ?? false;
      const isPlayerBishop = player.characters.some(({ id }) => id === CharacterType.BISHOP + 1);
      if (!isBishopDead && isPlayerBishop) return -1;

      const discount = (
        player.city.includes('great_wall') && districtId !== 'great_wall'
      ) ? 0 : 1;

      return Math.max(getters.getDistrictFromId(districtId)?.cost - discount, 0);
    };
  },
  getPlayerPosition(state: GameState) {
    return (playerId: PlayerId) => state.gameState?.board.playerOrder.indexOf(playerId);
  },
  selectedCards(state: GameState) {
    return state.selectedCards;
  },
};

export const gameMutations = {
  setGameState(state: GameState, gameState: ClientGameState) {
    state.gameState = gameState;
  },
  setCurrentRoomId(state: GameState, roomId: RoomId | null) {
    state.currentRoomId = roomId;
  },
  resetGameState(state: GameState) {
    state.gameState = undefined;
    state.currentRoomId = null;
  },
  addPlayer(state: GameState, player: any) {
    if (state.gameState !== undefined) {
      state.gameState.players[player.id] = player;
    }
  },
  removePlayer(state: GameState, playerId: PlayerId) {
    if (state.gameState !== undefined) {
      delete state.gameState.players[playerId];
    }
  },
  setPlayerOnline(state: GameState, { playerId, online }: { playerId: PlayerId; online: boolean }) {
    if (state.gameState !== undefined) {
      const player = state.gameState.players[playerId];
      if (player) {
        player.online = online;
      }
    }
  },
  prepareGameSetupConfirmation(state: GameState, { completeCitySize, actionTimeoutSeconds }: { completeCitySize: number; actionTimeoutSeconds: number }) {
    const order = state.gameState?.lobbyPlayerOrder;
    if (Array.isArray(order) && order.length) {
      state.gameSetupData.players = order.filter((id) => {
        const p = state.gameState?.players[id];
        return p && p.role === PlayerRole.PLAYER;
      });
    } else {
      state.gameSetupData.players = Object.values(state.gameState?.players || {})
        .filter((player) => player.role === PlayerRole.PLAYER)
        .map((player) => player.id);
    }
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
  setSelectedCards(state: GameState, { cards }: { cards: DistrictId[] }) {
    state.selectedCards = cards;
  },
};

export const gameActions = {
  async createRoom({ state, dispatch }: { state: State; dispatch: any }) {
    if (!state.authToken) {
      throw new Error('login required');
    }
    await dispatch('connect');
    return api.createRoom(socket);
  },

  async getRoomInfo({ dispatch }: { dispatch: any }, roomId: RoomId) {
    await dispatch('connect');
    return api.getRoomInfo(socket, roomId);
  },

  async joinRoom({ state, commit, dispatch }: { state: GameState; commit: any; dispatch: any }, {
    roomId, playerId, username, asSpectator = false,
  }: { roomId: RoomId; playerId: PlayerId; username: string; asSpectator?: boolean }) {
    await dispatch('connect');
    const gameState = await api.joinRoom(
      socket,
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

  async rejoinCurrentRoom({ state, dispatch }: { state: GameState; dispatch: any }) {
    if (!state.currentRoomId || !state.gameState) return;
    const playerId = state.gameState.self;
    const self = state.gameState.players[playerId];
    const asSpectator = self?.role === PlayerRole.SPECTATOR;
    await dispatch('joinRoom', {
      roomId: state.currentRoomId,
      playerId,
      username: state.gameState?.players[playerId]?.username || '',
      asSpectator,
    });
  },

  async leaveRoom({ state, commit, dispatch }: { state: GameState; commit: any; dispatch: any }) {
    try {
      if (socket.connected && state.currentRoomId) {
        await new Promise<void>((resolve) => {
          socket.emit('leave room', (res: any) => {
            if (res?.status === 'ok') resolve();
            else {
              console.warn('leave room failed', res?.message);
              resolve();
            }
          });
        });
      }
    } catch (e) {
      console.warn('leave room error', e);
    } finally {
      if (socket.connected) {
        socket.disconnect();
      }
      commit('resetGameState');
      dispatch('reconnectSocket');
    }
  },

  leaveRoomSilent({ state }: { state: GameState }) {
    if (!socket.connected || !state.currentRoomId) return Promise.resolve();
    return new Promise<void>((resolve) => {
      socket.emit('leave room', (res: any) => {
        if (res?.status === 'ok') resolve();
        else {
          console.warn('leave room silent failed', res?.message);
          resolve();
        }
      });
    });
  },

  async startGame({ state, dispatch }: { state: GameState; dispatch: any }) {
    if (!socket.connected) {
      await dispatch('connect');
      await dispatch('rejoinCurrentRoom');
    }
    const response = await api.startGame(socket, state.gameSetupData);
    switch (response.status) {
      case 'error':
        throw new Error(`Error when starting game: ${response.message}`);
      case 'ok':
        break;
      default:
        throw new Error(`Unknown response type: ${response.status}`);
    }
  },

  sendMove({ state }: { state: GameState }, move: Move) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) {
        return reject(new Error('You must be connected'));
      }
      return socket.emit('make move', move, (res: any) => {
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

  setAutoplay({ state }: { state: GameState }, enabled: boolean) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) {
        return reject(new Error('You must be connected'));
      }
      return socket.emit('set autoplay', enabled, (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        return reject(new Error(res?.message || 'set autoplay failed'));
      });
    });
  },

  setLobbyRole({ state }: { state: GameState }, role: 'player' | 'spectator') {
    return new Promise((resolve, reject) => {
      if (!socket.connected) {
        return reject(new Error('You must be connected'));
      }
      return socket.emit('set lobby role', role, (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        return reject(new Error(res?.message || 'set lobby role failed'));
      });
    });
  },

  reorderLobbySeat({ state }: { state: GameState }, payload: { playerId: string; direction: number }) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) {
        return reject(new Error('You must be connected'));
      }
      return socket.emit('reorder lobby seat', payload, (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        return reject(new Error(res?.message || 'reorder failed'));
      });
    });
  },

  addAiPlayer({ state }: { state: GameState }) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) {
        return reject(new Error('You must be connected'));
      }
      return socket.emit('add ai player', (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        return reject(new Error(res?.message || 'add ai failed'));
      });
    });
  },

  removeAiPlayer({ state }: { state: GameState }, playerId: PlayerId) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) {
        return reject(new Error('You must be connected'));
      }
      return socket.emit('remove ai player', playerId, (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        return reject(new Error(res?.message || 'remove ai failed'));
      });
    });
  },
};