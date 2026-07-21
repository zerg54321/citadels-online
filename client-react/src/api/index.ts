import type { Socket } from 'socket.io-client';
import {
  ClientGameState, GameSetupData, parseClientGameState, PlayerId, RoomId,
} from 'citadels-common';
import type { RoomInfoResponse, StartGameReponse } from '../types/apiTypes';

// Framework-agnostic socket emit wrappers — ported verbatim from the Vue
// client's api/index.ts. These are pure promise wrappers over socket.emit
// and do not depend on Vue/Vuex.
export default {
  createRoom(s: Socket) {
    return new Promise<RoomId>((resolve, reject) => {
      s.emit('create room', (data: any) => {
        if (data && typeof data === 'object' && data.status === 'ok' && data.roomId) {
          resolve(data.roomId);
          return;
        }
        if (typeof data === 'string') {
          resolve(data);
          return;
        }
        reject(new Error(data?.message || 'failed to create room'));
      });
    });
  },

  getRoomInfo(s: Socket, roomId: RoomId) {
    return new Promise<RoomInfoResponse>((resolve) => {
      s.emit('get room info', roomId, (data: RoomInfoResponse) => {
        resolve(data);
      });
    });
  },

  joinRoom(
    s: Socket,
    roomId: RoomId,
    playerId: PlayerId,
    username: string,
    asSpectator = false,
  ) {
    return new Promise<ClientGameState>((resolve, reject) => {
      s.emit('join room', roomId, playerId, username, asSpectator, (data: any) => {
        if (data === null) {
          return reject(Error('game state is null'));
        }
        if (data.status === 'error') {
          return reject(Error(data.message || 'join failed'));
        }
        if (data.status === 'ok' && data.gameState) {
          return resolve(parseClientGameState(data.gameState));
        }
        // legacy: raw game state
        if (data.progress !== undefined) {
          return resolve(parseClientGameState(data));
        }
        return reject(Error('join failed'));
      });
    });
  },

  startGame(s: Socket, gameSetupData: GameSetupData) {
    return new Promise<StartGameReponse>((resolve) => {
      s.emit('start game', gameSetupData, (data: StartGameReponse) => {
        resolve(data);
      });
    });
  },
};
