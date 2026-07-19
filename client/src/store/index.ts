import { Socket } from 'socket.io-client';
import { createStore } from 'vuex';
import {
  ClientGameState,
  GameSetupData,
  PlayerId,
  RoomId,
  DistrictId,
} from 'citadels-common';
import socket from '../socket';
import { authState, authGetters, authMutations, authActions, AuthState } from './modules/auth';
import { gameState, gameGetters, gameMutations, gameActions, GameState } from './modules/game';
import { chatState, chatMutations, chatActions, ChatState } from './modules/chat';

export interface State {
  socket: Socket
  gameState: ClientGameState | undefined
  gameSetupData: GameSetupData
  selectedCards: DistrictId[]
  authToken: string | null
  authUser: AuthState['authUser']
  authReady: boolean
  currentRoomId: RoomId | null
  chatMessages: ChatState['chatMessages']
}

export const store = createStore<State>({
  state: {
    socket,
    ...authState(),
    ...gameState(),
    ...chatState(),
  } as State,

  getters: {
    isConnected(state) {
      return state.socket.connected;
    },
    ...authGetters,
    ...gameGetters,
  },

  mutations: {
    ...authMutations,
    ...gameMutations,
    ...chatMutations,
  },

  actions: {
    reconnectSocket({ state }) {
      socket.auth = state.authToken ? { token: state.authToken } : {};
      if (state.socket.connected) {
        state.socket.disconnect();
      }
    },

    connect({ state }) {
      socket.auth = state.authToken ? { token: state.authToken } : {};
      if (state.socket.connected) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        let cleanup = () => {};
        const onConnect = () => {
          cleanup();
          resolve();
        };
        const onError = (err: Error) => {
          cleanup();
          reject(err);
        };
        cleanup = () => {
          state.socket.off('connect', onConnect);
          state.socket.off('connect_error', onError);
        };
        state.socket.once('connect', onConnect);
        state.socket.once('connect_error', onError);
        state.socket.connect();
      });
    },

    ...authActions,
    ...gameActions,
    ...chatActions,
  },
});