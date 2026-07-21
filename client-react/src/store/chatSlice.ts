import { StateCreator } from 'zustand';
import socket from '../socket';
import type { AuthSlice } from './authSlice';
import type { GameSlice } from './gameSlice';

const CHAT_MESSAGES_MAX_LENGTH = 200;

export interface ChatMessage {
  playerId: string;
  username: string;
  text: string;
  ts: number;
}

export interface ChatSlice {
  chatMessages: ChatMessage[];
  addChatMessage: (msg: ChatMessage) => void;
  clearChatMessages: () => void;
  sendChat: (text: string) => Promise<void>;
}

// Ported from the Vue client's store/modules/chat.ts. Chat lives in its own
// slice because messages are independent of game state. addChatMessage is
// called by the socket seam; sendChat emits to the server.
export const createChatSlice: StateCreator<ChatSlice & AuthSlice & GameSlice, [], [], ChatSlice> = (set) => ({
  chatMessages: [],

  addChatMessage(msg) {
    set((state) => {
      const next = [...state.chatMessages, msg];
      if (next.length > CHAT_MESSAGES_MAX_LENGTH) {
        return { chatMessages: next.slice(next.length - CHAT_MESSAGES_MAX_LENGTH) };
      }
      return { chatMessages: next };
    });
  },

  clearChatMessages() {
    set({ chatMessages: [] });
  },

  sendChat(text) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) {
        return reject(new Error('You must be connected'));
      }
      return socket.emit('chat message', text, (res: { status: string; message?: string }) => {
        if (res?.status === 'ok') return resolve();
        return reject(new Error(res?.message || 'chat failed'));
      });
    });
  },
});
