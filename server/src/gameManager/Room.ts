import { Server } from 'socket.io';
import Debug from 'debug';
import {
  GameMode, GameProgress, PlayerRole, RoomId,
} from 'citadels-common';
import GameState from '../game/GameState';
import ExtendedSocket from '../socket/ExtendedSocket';
import { Observer } from '../utils/observerPattern';
import { saveFinishedMatch } from '../db/matches';
import { getTurnTimer } from './TurnTimer';

const debug = Debug('citadels-server');

export type RoomListItem = {
  roomId: RoomId;
  /** lobby | in_game | finished */
  phase: 'lobby' | 'in_game' | 'finished';
  status: 'open' | 'closed';
  gameMode: GameMode;
  playerCount: number;
  spectatorCount: number;
  maxPlayers: number;
  players: { username: string; online: boolean }[];
  canJoinAsPlayer: boolean;
  canSpectate: boolean;
  completeCitySize: number;
};

export default class Room implements Observer {
  roomId: RoomId;
  gameState: GameState;
  io: Server;

  constructor(roomId: RoomId, io: Server) {
    this.roomId = roomId;
    this.gameState = new GameState();
    this.io = io;

    this.gameState.attach(this);
  }

  getRoomInfo() {
    if (this.gameState.progress === GameProgress.IN_LOBBY) {
      return { status: 'open' };
    }
    return { status: 'closed' };
  }

  getListItem(): RoomListItem {
    const players = Array.from(this.gameState.players.values());
    const seated = players.filter((p) => p.role === PlayerRole.PLAYER);
    const spectators = players.filter((p) => p.role === PlayerRole.SPECTATOR);
    let phase: RoomListItem['phase'] = 'lobby';
    if (this.gameState.progress === GameProgress.IN_GAME) phase = 'in_game';
    if (this.gameState.progress === GameProgress.FINISHED) phase = 'finished';

    const inLobby = this.gameState.progress === GameProgress.IN_LOBBY;
    const inGame = this.gameState.progress === GameProgress.IN_GAME;

    return {
      roomId: this.roomId,
      phase,
      status: inLobby ? 'open' : 'closed',
      gameMode: this.gameState.gameMode,
      playerCount: seated.length,
      spectatorCount: spectators.length,
      maxPlayers: 6,
      players: seated.map((p) => ({
        username: p.username,
        online: p.online,
      })),
      canJoinAsPlayer: inLobby && seated.length < 6,
      canSpectate: inLobby || inGame,
      completeCitySize: this.gameState.completeCitySize,
    };
  }

  update(): void {
    this.tryPersistMatch();
    // Re-arm deadline / AI BEFORE sending state so the emitted turnDeadlineAt
    // reflects the freshly armed deadline. Previously send ran before arm,
    // which meant a state push carried the *previous* arm's deadline: entering
    // the choose-characters phase sent null (→ clients showed a dash) and the
    // newly armed deadline only went out on the next push. (pushUpdate calls
    // update with suppressArm=true, so onStateChanged is a no-op there.)
    if (this.gameState.progress === GameProgress.IN_GAME) {
      getTurnTimer(this).onStateChanged(false);
    }
    this.sendRoomStateToAllClients();
  }

  private tryPersistMatch() {
    if (this.gameState.progress !== GameProgress.FINISHED) return;
    if (this.gameState.matchPersisted) return;
    try {
      const id = saveFinishedMatch(this.roomId, this.gameState);
      if (id) {
        this.gameState.matchPersisted = true;
        debug(`[matches] saved ${id} room=${this.roomId}`);
      }
    } catch (err) {
      console.error('[matches] persist error', err);
    }
  }

  sendRoomStateToAllClients() {
    const clients = this.io.sockets.adapter.rooms.get(this.roomId);
    if (clients) {
      clients.forEach((clientId) => {
        const clientSocket: ExtendedSocket | undefined = this.io.sockets.sockets.get(clientId);
        if (clientSocket) {
          clientSocket.emit('update game state', this.gameState.getStateFromPlayer(clientSocket.playerId));
        }
      });
    }
  }
}
