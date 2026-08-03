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
  useAppStore.getState().setConnected(true);
  const { currentRoomId, gameState, rejoinCurrentRoom } = useAppStore.getState();
  if (currentRoomId && gameState) {
    rejoinCurrentRoom();
  }
});

socket.on('connect_error', (err: Error) => {
  console.error('[socket] connect_error', err);
});

socket.on('disconnect', () => {
  useAppStore.getState().setConnected(false);
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
  // Ignore state pushes for a room we have already left. After leaveRoom
  // calls resetGameState(), currentRoomId is null, but a final in-flight
  // 'update game state' broadcast (server emits to the whole room before
  // processing our socket.leave) can still land here and would otherwise
  // repopulate gameState with the old (often FINISHED) state — causing a
  // freshly-joined lobby to show the previous game's scoreboard.
  if (!useAppStore.getState().currentRoomId) return;
  const newGameState = parseClientGameState(data);
  useAppStore.getState().setGameState(newGameState);
  // Sync gameSetupData with server-side settings so non-manager players
  // see the latest action timeout chosen by the manager in the lobby.
  if (newGameState?.settings?.actionTimeoutSeconds) {
    const state = useAppStore.getState();
    if (state.gameSetupData.actionTimeoutSeconds !== newGameState.settings.actionTimeoutSeconds) {
      state.setGameSetupData({ actionTimeoutSeconds: newGameState.settings.actionTimeoutSeconds });
    }
  }
});

socket.on('chat message', (msg: { playerId: string; username: string; text: string; ts: number }) => {
  useAppStore.getState().addChatMessage(msg);
});

if (import.meta.env.DEV) {
  socket.onAny((event: string, ...args: unknown[]) => {
    console.log('[socket]', event, args);
  });
}

export default socket;
