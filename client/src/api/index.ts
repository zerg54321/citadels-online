import { Socket } from 'socket.io-client';
import {
  ClientGameState, GameSetupData, parseClientGameState, PlayerId, RoomId,
} from 'citadels-common';
import { RoomInfoResponse, StartGameReponse } from '../types/apiTypes';

export default {
  createRoom(socket: Socket) {
    return new Promise<RoomId>((resolve, reject) => {
      socket.emit('create room', (data: any) => {
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

  getRoomInfo(socket: Socket, roomId: RoomId) {
    return new Promise<RoomInfoResponse>((resolve) => {
      socket.emit('get room info', roomId, (data: RoomInfoResponse) => {
        resolve(data);
      });
    });
  },

  joinRoom(
    socket: Socket,
    roomId: RoomId,
    playerId: PlayerId,
    username: string,
    asSpectator = false,
  ) {
    return new Promise<ClientGameState>((resolve, reject) => {
      socket.emit('join room', roomId, playerId, username, asSpectator, (data: any) => {
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

  startGame(socket: Socket, gameSetupData: GameSetupData) {
    return new Promise<StartGameReponse>((resolve) => {
      socket.emit('start game', gameSetupData, (data: StartGameReponse) => {
        resolve(data);
      });
    });
  },
};
