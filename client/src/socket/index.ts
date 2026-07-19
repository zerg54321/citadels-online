import { io } from 'socket.io-client';
import { ClientGameState } from 'citadels-common';
import { store } from '../store';

const socket = io('/', {
  path: '/s/',
  autoConnect: false,
});

socket.onAny((event, ...args) => {
  console.debug('socket:', event, args);
});

socket.on('connect_error', (err) => {
  console.error('connection error:', err.message);
});

socket.on('connect', () => {
  console.log('connected with socket id', socket.id);
  // If we were in a room and the socket dropped, rejoin so start-game / moves still work
  const { currentRoomId, gameState } = store.state;
  if (currentRoomId && gameState) {
    store.dispatch('rejoinCurrentRoom').catch((err) => {
      console.error('rejoin after reconnect failed', err);
    });
  }
});
socket.on('disconnect', (reason) => {
  console.log('disconnected', reason);
});
socket.on('add player', (player) => {
  console.log(`player ${player.username} [${player.id}] added`);
  store.commit('addPlayer', player);
});
socket.on('remove player', (playerId) => {
  store.commit('removePlayer', playerId);
});
socket.on('joined room', (playerId) => {
  console.log(`player ${playerId} joined room`);
  store.commit('setPlayerOnline', { playerId, online: true });
});
socket.on('left room', (playerId) => {
  console.log(`player ${playerId} left room`);
  store.commit('setPlayerOnline', { playerId, online: false });
});
socket.on('disconnectPlayer', (playerId) => {
  store.commit('removePlayer', playerId);
});
socket.on('update game state', (data) => {
  const newGameState: ClientGameState = {
    progress: data.progress,
    gameMode: data.gameMode,
    players: new Map(data.players),
    self: data.self,
    board: {
      ...data.board,
      players: new Map(data.board?.players),
    },
    settings: data.settings,
    turnDeadlineAt: data.turnDeadlineAt ?? null,
    teamScores: data.teamScores,
    matchResult: data.matchResult,
    lastRoundSummary: data.lastRoundSummary ?? null,
    lobbyPlayerOrder: data.lobbyPlayerOrder || [],
    actionFeed: data.actionFeed || [],
  };
  store.commit('setGameState', newGameState);
});

socket.on('chat message', (msg) => {
  store.commit('addChatMessage', msg);
});

export default socket;
