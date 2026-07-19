import { PlayerId, RoomId } from 'citadels-common';
import GameStore from './GameStore';
import Room from './Room';

export default class InMemoryGameStore extends GameStore {
  rooms: Map<RoomId, Room>;
  private playerRoomMap = new Map<PlayerId, RoomId>();

  constructor() {
    super();
    this.rooms = new Map();
  }

  findRoom(roomId: RoomId | undefined) {
    if (roomId === undefined) { return undefined; }
    return this.rooms.get(roomId);
  }

  saveRoom(roomId: RoomId, room: Room) {
    this.rooms.set(roomId, room);
    for (const pid of room.gameState.players.keys()) {
      this.playerRoomMap.set(pid, roomId);
    }
  }

  hasRoom(roomId: RoomId) {
    return this.rooms.has(roomId);
  }

  findAllRooms() {
    return [...this.rooms.values()];
  }

  removeRoom(roomId: RoomId) {
    this.rooms.delete(roomId);
    for (const [pid, rid] of this.playerRoomMap.entries()) {
      if (rid === roomId) {
        this.playerRoomMap.delete(pid);
      }
    }
  }

  findRoomByPlayerId(playerId: PlayerId) {
    const roomId = this.playerRoomMap.get(playerId);
    return roomId ? this.rooms.get(roomId) : undefined;
  }

  removePlayerFromRoom(playerId: PlayerId) {
    const roomId = this.playerRoomMap.get(playerId);
    if (!roomId) return;
    const room = this.rooms.get(roomId);
    if (!room) return;
    if (room.gameState.containsPlayer(playerId)) {
      room.gameState.removePlayer(playerId);
      room.io.to(room.roomId).emit('remove player', playerId);
      room.update();
    }
    this.playerRoomMap.delete(playerId);
  }
}
