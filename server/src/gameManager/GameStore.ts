import { PlayerId, RoomId } from 'citadels-common';
import Room from './Room';

export default abstract class GameStore {
  abstract findRoom(roomId: RoomId): Room | undefined;

  abstract saveRoom(roomId: RoomId, room: Room): void;

  abstract hasRoom(roomId: RoomId): boolean;

  abstract findAllRooms(): Room[];

  abstract removeRoom(roomId: RoomId): void;

  abstract findRoomByPlayerId(playerId: PlayerId): Room | undefined;

  abstract removePlayerFromRoom(playerId: PlayerId): void;
}
