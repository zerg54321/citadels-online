import { io, type Socket } from 'socket.io-client';
import { parseClientGameState } from 'citadels-common';
import { useAppStore } from '../store';

// Single socket instance for the whole app. Path matches server's Socket.IO
// mount point (/s/) proxied to localhost:8081 in dev.
const socket: Socket = io('/', { path: '/s/', autoConnect: false });

// Inbound events are registered once here and pushed into the store.
// Components never register their own socket listeners �?same seam model as
// the Vue client's socket/index.ts.
socket.on('connect', () => {
  const { currentRoomId, gameState, rejoinCurrentRoom } = useAppStore.getState();
  if (currentRoomId && gameState) {
    rejoinCurrentRoom();
  }
});

socket.on('connect_error', (err: Error) => {
  console.error('[socket] connect_error', err);
});

socket.on('disconnect', () => {
  console.log('[socket] disconnected');
});

socket.on('add player', (player: unknown) => {
  useAppStore.getState().addPlayer(player);
});

socket.on('remove player', (playerId: unknown) => {
  useAppStore.getState().removePlayer(playerId as string);
});

socket.on('joined room', () => {
  useAppStore.getState().setPlayerOnline(true);
});

socket.on('left room', () => {
  useAppStore.getState().setPlayerOnline(false);
});

socket.on('disconnectPlayer', (playerId: unknown) => {
  useAppStore.getState().removePlayer(playerId as string);
});

socket.on('update game state', (data: unknown) => {
  useAppStore.getState().setGameState(parseClientGameState(data));
});

if (import.meta.env.DEV) {
  socket.onAny((event: string, ...args: unknown[]) => {
    console.log('[socket]', event, args);
  });
}

export default socket;
