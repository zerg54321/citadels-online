import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAppStore } from '@/store';

// Mirrors Vue game/RoomChat.vue. The Vue `mounted` + `watch messages` auto-
// scroll becomes a useEffect on chatMessages. sendChat dispatches the slice
// action. Scoped SCSS extracted to _room-chat.scss.
export default function RoomChat() {
  const { t } = useTranslation();
  const chatMessages = useAppStore((s) => s.chatMessages);
  const sendChat = useAppStore((s) => s.sendChat);
  const selfId = useAppStore((s) => s.gameState?.self);
  const messageListRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Auto-scroll on new messages (mirrors Vue mounted + watch messages).
  useEffect(() => {
    const el = messageListRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [chatMessages]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = inputRef.current?.value.trim();
    if (!text) return;
    try {
      await sendChat(text);
      if (inputRef.current) inputRef.current.value = '';
    } catch (err) {
      // eslint-disable-next-line no-alert
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="room-chat">
      <div className="room-chat__title">{t('ui.lobby.chat_title')}</div>
      <div className="room-chat__messages" ref={messageListRef}>
        {!chatMessages.length && (
          <div className="room-chat__empty">{t('ui.lobby.chat_placeholder')}</div>
        )}
        {chatMessages.map((msg, i) => (
          <div
            key={i}
            className={`room-chat__msg${msg.playerId === selfId ? ' room-chat__msg--self' : ''}`}
          >
            <span className="room-chat__name">{msg.username}</span>
            <span className="room-chat__text">{msg.text}</span>
          </div>
        ))}
      </div>
      <form className="room-chat__form" onSubmit={send}>
        <input
          ref={inputRef}
          className="room-chat__input"
          placeholder={t('ui.lobby.chat_placeholder') as string}
          maxLength={200}
        />
        <button type="submit" className="btn btn-gold btn-sm">
          {t('ui.confirm')}
        </button>
      </form>
    </div>
  );
}
