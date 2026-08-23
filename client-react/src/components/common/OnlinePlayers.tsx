import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { OnlineUserItem } from '@/api/rooms';
import { avatarUrl } from '@/utils/avatarUrl';

// Flowing avatar capsules answering "who is here right now". Status is
// encoded by a single coloured dot per capsule (grey idle / gold in lobby /
// bright gold playing / blue spectating) — no text chips, matching the
// room-list status dots the home panel already uses. The capsule flow is
// one-dimensional wrapped content: it adapts to any panel width without
// extra breakpoints, so the pad/mobile layouts of both host pages stay
// untouched. When the crowd exceeds COLLAPSED_COUNT the flow folds behind
// a "N more" toggle instead of pushing the room list / chat off-screen.

const COLLAPSED_COUNT = 9;

const STATUS_DOT_CLASS: Record<OnlineUserItem['status'], string> = {
  idle: 'online-players__dot--idle',
  lobby: 'online-players__dot--lobby',
  playing: 'online-players__dot--playing',
  spectating: 'online-players__dot--spectating',
};

interface OnlinePlayersProps {
  users: OnlineUserItem[];
  /** current account id — draws a gold ring around one's own capsule */
  selfUserId?: string;
}

export default function OnlinePlayers({ users, selfUserId }: OnlinePlayersProps) {
  const { t } = useTranslation();
  const [expanded, setExpanded] = useState(false);

  if (!users.length) return null;

  const overflowing = users.length > COLLAPSED_COUNT;
  const visible = overflowing && !expanded ? users.slice(0, COLLAPSED_COUNT) : users;
  const hiddenCount = users.length - visible.length;

  return (
    <section className="online-players">
      <div className="online-players__head">
        <span className="online-players__title">{t('ui.online.title')}</span>
        <span className="online-players__count">{users.length}</span>
      </div>
      <div className="online-players__flow">
        {visible.map((u) => (
          <span
            key={u.userId}
            className={`online-players__chip${u.userId === selfUserId ? ' online-players__chip--self' : ''}`}
            title={t(`ui.online.status_${u.status}`) as string}
          >
            <span className="online-players__avatar">
              <img src={avatarUrl(u.avatar) || '/avatars/01.png'} alt="" loading="lazy" />
            </span>
            <span className="online-players__name">{u.displayName}</span>
            <span className={`online-players__dot ${STATUS_DOT_CLASS[u.status]}`} />
          </span>
        ))}
        {overflowing && (
          <button
            type="button"
            className="online-players__more"
            onClick={() => setExpanded((v) => !v)}
          >
            {expanded
              ? t('ui.online.collapse')
              : t('ui.online.more', { n: hiddenCount })}
          </button>
        )}
      </div>
    </section>
  );
}
