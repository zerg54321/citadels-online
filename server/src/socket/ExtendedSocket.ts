import { Socket } from 'socket.io';
import { Avatar, PlayerId, RoomId } from 'citadels-common';

export default interface ExtendedSocket extends Socket {
  roomId?: RoomId;
  playerId?: PlayerId;
  userId?: string;
  displayName?: string;
  accountUsername?: string;
  avatar?: Avatar;
  /** true when the handshake carried the admin token — this socket receives
   *  god-view (all hands/roles revealed) state pushes for OB. */
  isAdmin?: boolean;
}
