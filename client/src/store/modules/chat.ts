import socket from '../../socket';

const CHAT_MESSAGES_MAX_LENGTH = 200;

export interface ChatState {
  chatMessages: Array<{ playerId: string; username: string; text: string; ts: number }>;
}

export const chatState = (): ChatState => ({
  chatMessages: [],
});

export const chatMutations = {
  addChatMessage(state: ChatState, msg: { playerId: string; username: string; text: string; ts: number }) {
    state.chatMessages.push(msg);
    if (state.chatMessages.length > CHAT_MESSAGES_MAX_LENGTH) {
      state.chatMessages.splice(0, state.chatMessages.length - CHAT_MESSAGES_MAX_LENGTH);
    }
  },
  clearChatMessages(state: ChatState) {
    state.chatMessages = [];
  },
};

export const chatActions = {
  sendChat({ state }: { state: ChatState }, text: string) {
    return new Promise((resolve, reject) => {
      if (!socket.connected) {
        return reject(new Error('You must be connected'));
      }
      return socket.emit('chat message', text, (res: any) => {
        if (res?.status === 'ok') return resolve(res);
        return reject(new Error(res?.message || 'chat failed'));
      });
    });
  },
};