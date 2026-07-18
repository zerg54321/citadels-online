import { Server } from 'socket.io';
import Debug from 'debug';
import {
  GameProgress,
  Move, MoveType, PlayerId, PlayerRole, RoomId,
} from 'citadels-common';
import InMemoryGameStore from '../gameManager/InMemoryGameStore';
import Player from '../game/Player';
import Room from '../gameManager/Room';
import { genPlayerId, genRoomId } from '../utils/idGenerator';
import ExtendedSocket from './ExtendedSocket';
import GameSetupData from '../game/GameSetupData';
import { verifyAuthToken } from '../auth/jwt';
import { getPublicUser } from '../db/users';
import { disposeTurnTimer, getTurnTimer } from '../gameManager/TurnTimer';

const debug = Debug('citadels-server');

const gameStore = new InMemoryGameStore();

/** Used by HTTP room list API */
export function getGameStore() {
  return gameStore;
}

function attachAuth(socket: ExtendedSocket) {
  const token = socket.handshake.auth?.token
    || socket.handshake.headers?.authorization?.toString().replace(/^Bearer\s+/i, '');
  if (!token || typeof token !== 'string') return;
  const payload = verifyAuthToken(token);
  if (!payload) return;
  const user = getPublicUser(payload.sub);
  if (!user) return;
  socket.userId = user.id;
  socket.displayName = user.displayName;
  socket.accountUsername = user.username;
}

export function initSocket(io: Server) {
  io.on('connection', (socket: ExtendedSocket) => {
    debug(`user '${socket.id}' connected`);
    attachAuth(socket);

    socket.on('disconnect', () => {
      debug(`user '${socket.id}' disconnected`);

      if (socket.roomId && socket.playerId) {
        const roomId = socket.roomId;
        const room = gameStore.findRoom(roomId);
        if (room) {
          const player = room.gameState.getPlayer(socket.playerId);
          if (player) player.online = false;
          socket.to(roomId).emit('left room', socket.playerId);

          // remove empty rooms once the last socket leaves (sim bots, abandoned games)
          setImmediate(() => {
            const clients = io.sockets.adapter.rooms.get(roomId);
            if (!clients || clients.size === 0) {
              disposeTurnTimer(roomId);
              gameStore.removeRoom(roomId);
              debug(`removed empty room ${roomId}`);
            }
          });
        }
      }
    });

    socket.on('create room', (callback) => {
      if (!socket.userId) {
        callback({ status: 'error', message: 'login required to create a room' });
        return;
      }

      let roomId;
      do {
        roomId = genRoomId();
      } while (gameStore.hasRoom(roomId));
      socket.roomId = roomId;

      const room = new Room(socket.roomId, io);
      gameStore.saveRoom(room.roomId, room);

      socket.join(socket.roomId);
      socket.emit('joined room', socket.roomId);

      debug('created room', socket.roomId);
      callback({ status: 'ok', roomId: socket.roomId });
    });

    socket.on('get room info', (roomId, callback) => {
      const room = gameStore.findRoom(roomId);
      if (room) {
        callback(room.getRoomInfo());
      } else {
        callback({ status: 'not found' });
      }
    });

    socket.on('join room', (
      roomId: RoomId,
      playerId: PlayerId,
      username: string,
      asSpectator: boolean,
      callback,
    ) => {
      // backward compatible: old clients may omit asSpectator and pass callback 4th
      let spectator = false;
      let cb = callback;
      if (typeof asSpectator === 'function') {
        cb = asSpectator as unknown as typeof callback;
        spectator = false;
      } else {
        spectator = Boolean(asSpectator);
      }

      const room = gameStore.findRoom(roomId);
      let player: Player | undefined;

      if (!room) {
        cb({ status: 'error', message: 'room not found' });
        return;
      }

      // reconnect by playerId if already in room
      if (playerId && room.gameState.containsPlayer(playerId)) {
        player = room.gameState.getPlayer(playerId);
        if (!player) {
          cb({ status: 'error', message: 'player id is invalid' });
          return;
        }
        // if seat is bound to a user, require same user
        if (player.userId && player.userId !== socket.userId) {
          cb({ status: 'error', message: 'this seat belongs to another account' });
          return;
        }
        socket.playerId = playerId;
        player.online = true;
        if (socket.displayName) {
          player.username = socket.displayName;
        }
      } else if (socket.userId) {
        // reconnect by userId
        const existing = room.gameState.findPlayerByUserId(socket.userId);
        if (existing) {
          socket.playerId = existing.id;
          existing.online = true;
          if (socket.displayName) {
            existing.username = socket.displayName;
          }
          player = existing;
        }
      }

      if (!player) {
        const roomOpen = room.getRoomInfo().status === 'open';
        if (!roomOpen && !spectator) {
          cb({ status: 'error', message: 'room is closed' });
          return;
        }

        if (spectator || !roomOpen) {
          if (!socket.userId) {
            // anonymous spectator: temporary player id for state view only
            socket.playerId = genPlayerId();
            player = room.gameState.addPlayer(
              socket.playerId,
              username || `Spectator ${socket.playerId.slice(0, 4)}`,
              false,
              true,
              PlayerRole.SPECTATOR,
            );
          } else {
            socket.playerId = genPlayerId();
            player = room.gameState.addPlayer(
              socket.playerId,
              socket.displayName || socket.accountUsername || username || 'Spectator',
              false,
              true,
              PlayerRole.SPECTATOR,
              socket.userId,
            );
          }
          socket.to(roomId).emit('add player', {
            id: player.id,
            username: player.username,
            manager: player.manager,
            online: player.online,
            role: player.role,
            userId: player.userId,
          });
        } else {
          // join as player — login required
          if (!socket.userId) {
            cb({ status: 'error', message: 'login required to join as player' });
            return;
          }
          socket.playerId = genPlayerId();
          const hasPlayerSeat = Array.from(room.gameState.players.values())
            .some((p) => p.role === PlayerRole.PLAYER);
          player = room.gameState.addPlayer(
            socket.playerId,
            socket.displayName || socket.accountUsername || username || 'Player',
            !hasPlayerSeat,
            true,
            PlayerRole.PLAYER,
            socket.userId,
          );
          socket.to(roomId).emit('add player', {
            id: player.id,
            username: player.username,
            manager: player.manager,
            online: player.online,
            role: player.role,
            userId: player.userId,
          });
          debug('added player', player.id);
        }
      }

      socket.roomId = roomId;
      socket.join(socket.roomId);
      socket.to(socket.roomId).emit('joined room', socket.playerId);

      cb({
        status: 'ok',
        gameState: room.gameState.getStateFromPlayer(socket.playerId),
      });
    });

    socket.on('add ai player', (callback) => {
      const room = gameStore.findRoom(socket.roomId);
      if (!room) {
        callback({ status: 'error', message: 'room id is invalid' });
        return;
      }
      const manager = room.gameState.getPlayer(socket.playerId);
      if (!manager?.manager) {
        callback({ status: 'error', message: 'you must be a manager' });
        return;
      }
      if (room.gameState.progress !== GameProgress.IN_LOBBY) {
        callback({ status: 'error', message: 'game already started' });
        return;
      }
      const AI_NAMES = [
        'Alice', 'Bob', 'Carol', 'Dave', 'Eve', 'Frank',
        'Grace', 'Heidi', 'Ivan', 'Judy', 'Mallory', 'Niaj',
        'Olivia', 'Peggy', 'Rupert', 'Sybil', 'Trent', 'Victor',
      ];
      const used = new Set(
        Array.from(room.gameState.players.values()).map((p) => p.username.toLowerCase()),
      );
      const base = AI_NAMES.find((n) => !used.has(`${n}(ai)`.toLowerCase()) && !used.has(n.toLowerCase()))
        || `Guest${Math.floor(Math.random() * 900 + 100)}`;
      const name = `${base}(AI)`;
      const id = genPlayerId();
      const player = room.gameState.addAiPlayer(id, name);
      if (!player) {
        callback({ status: 'error', message: 'cannot add AI (lobby full or not in lobby)' });
        return;
      }
      const payload = {
        id: player.id,
        username: player.username,
        manager: player.manager,
        online: player.online,
        role: player.role,
        userId: player.userId,
        isAi: true,
        isAutoplay: true,
        team: player.team,
      };
      room.io.to(room.roomId).emit('add player', payload);
      room.update();
      callback({ status: 'ok', player: payload });
    });

    socket.on('remove ai player', (playerId: PlayerId, callback) => {
      const room = gameStore.findRoom(socket.roomId);
      if (!room) {
        callback({ status: 'error', message: 'room id is invalid' });
        return;
      }
      const manager = room.gameState.getPlayer(socket.playerId);
      if (!manager?.manager) {
        callback({ status: 'error', message: 'you must be a manager' });
        return;
      }
      if (!room.gameState.removeAiPlayer(playerId)) {
        callback({ status: 'error', message: 'cannot remove this AI' });
        return;
      }
      room.io.to(room.roomId).emit('remove player', playerId);
      room.update();
      callback({ status: 'ok' });
    });

    socket.on('start game', (serializedGameSetupData, callback) => {
      const room = gameStore.findRoom(socket.roomId);
      if (!room) {
        callback({ status: 'error', message: 'room id is invalid' });
        return;
      }

      const player = room.gameState.getPlayer(socket.playerId);
      if (!player) {
        callback({ status: 'error', message: 'player id is invalid' });
        return;
      }

      if (!player.manager) {
        callback({ status: 'error', message: 'you must be a manager' });
        return;
      }

      const gameSetupData = GameSetupData.fromJSON(serializedGameSetupData);

      if (!room.gameState.validateGameSetup(gameSetupData)) {
        callback({ status: 'error', message: 'setup data is invalid' });
        return;
      }

      room.gameState.setupGame(gameSetupData);
      debug(`game in room ${room.roomId} has been set up`);

      if (room.gameState.step()) {
        room.update();
      }
      getTurnTimer(room).onStateChanged();
      room.update();

      callback({ status: 'ok' });
    });

    socket.on('set lobby role', (roleRaw: string, callback) => {
      const room = gameStore.findRoom(socket.roomId);
      if (!room) {
        callback({ status: 'error', message: 'room id is invalid' });
        return;
      }
      const player = room.gameState.getPlayer(socket.playerId);
      if (!player) {
        callback({ status: 'error', message: 'player id is invalid' });
        return;
      }
      if (room.gameState.progress !== GameProgress.IN_LOBBY) {
        callback({ status: 'error', message: 'game already started' });
        return;
      }
      const role = roleRaw === 'spectator' ? PlayerRole.SPECTATOR : PlayerRole.PLAYER;
      if (role === PlayerRole.PLAYER && !socket.userId) {
        callback({ status: 'error', message: 'login required to join as player' });
        return;
      }
      if (!room.gameState.setLobbyRole(player.id, role)) {
        callback({ status: 'error', message: 'cannot change role (room full or invalid)' });
        return;
      }
      room.update();
      callback({ status: 'ok', role: player.role, team: player.team });
    });

    // manager: reorder a seated player (payload: { playerId, direction: -1|1 })
    socket.on('reorder lobby seat', (payload: { playerId: string; direction: number }, callback) => {
      const room = gameStore.findRoom(socket.roomId);
      if (!room) {
        callback({ status: 'error', message: 'room id is invalid' });
        return;
      }
      const manager = room.gameState.getPlayer(socket.playerId);
      if (!manager?.manager) {
        callback({ status: 'error', message: 'you must be a manager' });
        return;
      }
      if (room.gameState.progress !== GameProgress.IN_LOBBY) {
        callback({ status: 'error', message: 'game already started' });
        return;
      }
      const dir = payload?.direction < 0 ? -1 : 1;
      if (!room.gameState.moveLobbySeat(payload?.playerId, dir as -1 | 1)) {
        callback({ status: 'error', message: 'cannot move seat' });
        return;
      }
      room.update();
      callback({ status: 'ok' });
    });

    socket.on('set autoplay', (enabled: boolean, callback) => {
      const room = gameStore.findRoom(socket.roomId);
      if (!room) {
        callback({ status: 'error', message: 'room id is invalid' });
        return;
      }
      const player = room.gameState.getPlayer(socket.playerId);
      if (!player) {
        callback({ status: 'error', message: 'player id is invalid' });
        return;
      }
      if (player.role !== PlayerRole.PLAYER) {
        callback({ status: 'error', message: 'spectators cannot autoplay' });
        return;
      }
      room.gameState.setAutoplay(player.id, Boolean(enabled));
      getTurnTimer(room).onStateChanged();
      room.update();
      callback({ status: 'ok', isAutoplay: player.isAutoplay });
    });

    socket.on('make move', (move: Move, callback) => {
      const room = gameStore.findRoom(socket.roomId);
      if (!room) {
        callback({ status: 'error', message: 'room id is invalid' });
        return;
      }

      const player = room.gameState.getPlayer(socket.playerId);
      if (!player) {
        callback({ status: 'error', message: 'player id is invalid' });
        return;
      }

      if (player.id !== room.gameState.board?.getCurrentPlayerId()) {
        callback({ status: 'error', message: 'you must be the current player' });
        return;
      }

      // human moves while autoplay: reject (must cancel first) unless they cancel via set autoplay
      if (player.isAutoplay && !player.isAi) {
        callback({ status: 'error', message: 'autoplay enabled — cancel autoplay to play' });
        return;
      }

      if (move.type === MoveType.AUTO) {
        callback({ status: 'error', message: 'invalid move' });
        return;
      }

      if (!room.gameState.step(move)) {
        callback({ status: 'error', message: 'invalid move' });
        return;
      }

      room.gameState.step();
      getTurnTimer(room).resetDeadlineAfterHumanMove();
      room.update();
      callback({ status: 'ok' });
    });
  });
}

export default { initSocket };
