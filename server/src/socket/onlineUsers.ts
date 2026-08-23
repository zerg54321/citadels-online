import type { Avatar } from 'citadels-common';
import type ExtendedSocket from './ExtendedSocket';

/**
 * Global online-user registry (logged-in accounts only; anonymous spectators
 * are invisible by design). Maintained from socket connect/disconnect and
 * room join/leave so the home page can answer "who is here right now".
 *
 * A user may hold several sockets (multiple tabs); `socketCount` keeps the
 * entry alive until the last tab closes. `roomId`/`spectating` reflect the
 * last room joined — room phase is NOT cached here, it is derived from the
 * live room store when the API is served, so statuses stay accurate as
 * games start and finish.
 */
export type OnlineUserEntry = {
  userId: string;
  displayName: string;
  avatar?: Avatar;
  socketCount: number;
  roomId?: string;
  spectating?: boolean;
};

const onlineUsers = new Map<string, OnlineUserEntry>();

export function trackSocketConnect(socket: ExtendedSocket): void {
  if (!socket.userId) return;
  const existing = onlineUsers.get(socket.userId);
  if (existing) {
    existing.socketCount += 1;
    if (socket.displayName) existing.displayName = socket.displayName;
    if (socket.avatar) existing.avatar = socket.avatar;
  } else {
    onlineUsers.set(socket.userId, {
      userId: socket.userId,
      displayName: socket.displayName || socket.accountUsername || 'Player',
      avatar: socket.avatar,
      socketCount: 1,
    });
  }
}

export function trackSocketDisconnect(socket: ExtendedSocket): void {
  if (!socket.userId) return;
  const entry = onlineUsers.get(socket.userId);
  if (!entry) return;
  entry.socketCount -= 1;
  if (entry.socketCount <= 0) {
    onlineUsers.delete(socket.userId);
  }
}

export function trackRoomJoin(socket: ExtendedSocket, roomId: string, spectating: boolean): void {
  if (!socket.userId) return;
  const entry = onlineUsers.get(socket.userId);
  if (!entry) return;
  entry.roomId = roomId;
  entry.spectating = spectating;
}

export function trackRoomLeave(socket: ExtendedSocket): void {
  if (!socket.userId) return;
  const entry = onlineUsers.get(socket.userId);
  if (!entry) return;
  entry.roomId = undefined;
  entry.spectating = undefined;
}

export function getOnlineUserEntries(): OnlineUserEntry[] {
  return Array.from(onlineUsers.values());
}
