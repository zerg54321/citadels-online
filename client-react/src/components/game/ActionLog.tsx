import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { formatActionFeedLine, type ActionFeedLine } from 'citadels-common';
import { useAppStore } from '@/store';
import type { ChatMessage } from '@/store/chatSlice';
import { useGameStage } from './gameStageContext';

interface ActionLogProps {
  displayActionFeed: ActionFeedLine[];
  onShowEvent?: (text: string) => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
}

// The panel merges the game action feed and room chat into a single
// scrolling timeline. Two checkboxes below the list let the user toggle
// visibility of each content type. Chat reuses the existing chatSlice store
// (chatMessages / sendChat) and the global 'chat message' socket listener —
// no server changes needed.

// kinds that highlight the CenterPanel event banner
const BANNER_KINDS = new Set(['kill', 'rob', 'rob_move', 'rob_move_empty', 'call_killed']);
// kinds that get the red "kill" log-item styling
const KILL_STYLE_KINDS = new Set(['kill', 'call_killed']);
// kinds that get the amber "warn" log-item styling
const WARN_STYLE_KINDS = new Set(['rob', 'rob_move', 'rob_move_empty', 'warn']);

type UnifiedItem =
  | { type: 'action'; data: ActionFeedLine; key: string }
  | { type: 'chat'; data: ChatMessage; key: string };

export default function ActionLog({
  displayActionFeed, onShowEvent, collapsed, onToggleCollapsed,
}: ActionLogProps) {
  const { t } = useTranslation();
  const stage = useGameStage();

  // --- chat store (reused from lobby) ---
  const chatMessages = useAppStore((s) => s.chatMessages);
  const sendChat = useAppStore((s) => s.sendChat);
  const selfId = useAppStore((s) => s.gameState?.self);

  // --- filter checkboxes (default: show both) ---
  const [showActions, setShowActions] = useState(true);
  const [showChat, setShowChat] = useState(true);

  // --- unified timeline ---
  // Merges action feed items and chat messages in arrival order. Since
  // ActionFeedLine lacks timestamps, we track the last-seen length of each
  // source and append new items as they arrive at the client.
  const [unifiedList, setUnifiedList] = useState<UnifiedItem[]>([]);
  const prevFeedLen = useRef(0);
  const prevChatLen = useRef(0);

  const listRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLInputElement>(null);

  // Closing phase: when the user collapses the overlay drawer, keep it
  // mounted briefly so the slide-out animation can play before swapping to
  // the tab button.
  const [closing, setClosing] = useState(false);
  const prevCollapsedRef = useRef(collapsed);
  useEffect(() => {
    const prev = prevCollapsedRef.current;
    if (!prev && collapsed) setClosing(true);
    if (prev && !collapsed) setClosing(false);
    prevCollapsedRef.current = collapsed;
  }, [collapsed]);

  // Whether the scrollable list is currently rendered (for attaching the
  // scroll listener only when needed).
  const isListVisible = stage?.mode === 'dock' || (!collapsed && !closing);

  // Sticky scroll: only auto-scroll to newly appended entries while the
  // user is parked at the bottom.
  const stickyRef = useRef(true);
  useEffect(() => {
    if (!isListVisible) return;
    const el = listRef.current;
    if (!el) return;
    const onScroll = () => {
      stickyRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 24;
    };
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => el.removeEventListener('scroll', onScroll);
  }, [isListVisible]);

  // Append new items to the unified timeline as they arrive.
  useEffect(() => {
    const feedLen = displayActionFeed.length;
    const chatLen = chatMessages.length;

    // Detect feed reset (e.g. new game): rebuild from scratch.
    if (feedLen < prevFeedLen.current || chatLen < prevChatLen.current) {
      const fresh: UnifiedItem[] = [];
      for (let i = 0; i < feedLen; i += 1) {
        fresh.push({ type: 'action', data: displayActionFeed[i], key: `a-${i}` });
      }
      for (let i = 0; i < chatLen; i += 1) {
        fresh.push({ type: 'chat', data: chatMessages[i], key: `c-${i}` });
      }
      prevFeedLen.current = feedLen;
      prevChatLen.current = chatLen;
      setUnifiedList(fresh);
      return;
    }

    const newItems: UnifiedItem[] = [];
    for (let i = prevFeedLen.current; i < feedLen; i += 1) {
      newItems.push({ type: 'action', data: displayActionFeed[i], key: `a-${i}` });
    }
    for (let i = prevChatLen.current; i < chatLen; i += 1) {
      newItems.push({ type: 'chat', data: chatMessages[i], key: `c-${i}` });
    }
    if (newItems.length) {
      setUnifiedList((prev) => [...prev, ...newItems]);
    }
    prevFeedLen.current = feedLen;
    prevChatLen.current = chatLen;
  }, [displayActionFeed, chatMessages]);

  // Fire the CenterPanel event banner for kill/rob actions. Uses a
  // signature to avoid re-firing on re-renders that don't add new items.
  const lastSigRef = useRef<string | null>(null);
  useEffect(() => {
    const list = displayActionFeed;
    if (!Array.isArray(list) || !list.length) return;
    const last = list[list.length - 1];
    const sig = `${list.length}|${last?.kind ?? ''}|${JSON.stringify(last?.params ?? null)}|${last?.round ?? ''}`;
    if (sig !== lastSigRef.current) {
      lastSigRef.current = sig;
      if (last && BANNER_KINDS.has(last.kind)) {
        onShowEvent?.(formatActionFeedLine(last, t));
      }
    }
  }, [displayActionFeed, onShowEvent, t]);

  // Auto-scroll to bottom when new items arrive and user is sticky.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickyRef.current) el.scrollTop = el.scrollHeight;
  }, [unifiedList]);

  const handleSendChat = async (e: React.FormEvent) => {
    e.preventDefault();
    const text = chatInputRef.current?.value.trim();
    if (!text) return;
    try {
      await sendChat(text);
      if (chatInputRef.current) chatInputRef.current.value = '';
    } catch (err) {
      // eslint-disable-next-line no-alert
      window.alert(err instanceof Error ? err.message : String(err));
    }
  };

  // --- render helpers ---

  const renderCollapseArrow = () => (
    <span className="board-table__log-toggle" aria-hidden="true">
      <span className="board-table__log-arrow board-table__log-arrow--right">&#9654;</span>
    </span>
  );

  // Filter the unified list by the checkbox state.
  const visibleItems = useMemo(
    () => unifiedList.filter(
      (item) =>
        (item.type === 'action' && showActions)
        || (item.type === 'chat' && showChat),
    ),
    [unifiedList, showActions, showChat],
  );

  const renderList = () => (
    <div className="board-table__log-list" ref={listRef}>
      {visibleItems.map((item) =>
        (item.type === 'action' ? (
          item.data.kind === 'round' ? (
            <div key={item.key} className="board-table__log-round-sep">
              {t('ui.game.round_start', { n: item.data.round ?? '' })}
            </div>
          ) : (
            <div
              key={item.key}
              className={`board-table__log-item${WARN_STYLE_KINDS.has(item.data.kind) ? ' board-table__log-item--warn' : ''}${KILL_STYLE_KINDS.has(item.data.kind) ? ' board-table__log-item--kill' : ''}`}
            >
              {formatActionFeedLine(item.data, t)}
            </div>
          )
        ) : (
          <div
            key={item.key}
            className={`board-table__log-item board-table__log-item--chat${item.data.playerId === selfId ? ' board-table__log-item--chat-self' : ''}${item.data.role === 1 ? ' board-table__log-item--chat-ob' : ''}`}
          >
            <span className="board-table__log-chat-name">
              {item.data.role === 1 && (
                <span className="board-table__log-chat-ob-tag">{t('ui.lobby.spectator')}</span>
              )}
              {item.data.username}
            </span>
            <span className="board-table__log-chat-text">{item.data.text}</span>
          </div>
        )))}
      {!visibleItems.length && (
        <div className="board-table__log-item opacity-50">{t('ui.game.action_log_empty')}</div>
      )}
    </div>
  );

  const renderFilters = () => (
    <div className="board-table__log-filters">
      <label className="board-table__log-filter">
        <input
          type="checkbox"
          checked={showActions}
          onChange={(e) => setShowActions(e.target.checked)}
        />
        <span>{t('ui.game.show_actions')}</span>
      </label>
      <label className="board-table__log-filter">
        <input
          type="checkbox"
          checked={showChat}
          onChange={(e) => setShowChat(e.target.checked)}
        />
        <span>{t('ui.game.show_chat')}</span>
      </label>
    </div>
  );

  const renderChatForm = () => (
    <form className="board-table__log-chat-form" onSubmit={handleSendChat}>
      <input
        ref={chatInputRef}
        className="board-table__log-chat-input"
        placeholder={t('ui.lobby.chat_placeholder') as string}
        maxLength={200}
      />
      <button type="submit" className="btn btn-gold btn-sm">
        {t('ui.confirm')}
      </button>
    </form>
  );

  // Portal target comes from GameStage: dock mode → native-width panel
  // beside the canvas (PC); overlay mode → absolute host layered over the
  // canvas (iPad). Until the host mounts (first render) render nothing.
  const target = stage?.mode === 'dock' ? stage?.logDockEl : stage?.logOverlayEl;
  if (!target) return null;

  // Dock mode (PC, wide): the panel is permanent beside the canvas.
  if (stage?.mode === 'dock') {
    return createPortal(
      <div className="board-table__log board-table__log--dock">
        {renderList()}
        {renderFilters()}
        {renderChatForm()}
      </div>,
      target,
    );
  }

  // Overlay mode (iPad): a floating drawer over the board's right edge.
  // While closing, keep the drawer mounted with the slide-out animation.
  if (closing) {
    return createPortal(
      <div
        className="board-table__log-popout board-table__log-popout--open board-table__log-popout--closing"
        onAnimationEnd={() => setClosing(false)}
      >
        <div className="board-table__log-popout-inner">
          <div className="board-table__log-header" onClick={onToggleCollapsed}>
            {renderCollapseArrow()}
          </div>
          {renderList()}
          {renderFilters()}
          {renderChatForm()}
        </div>
      </div>,
      target,
    );
  }

  if (collapsed) {
    return createPortal(
      <button
        className="board-table__log-tab"
        onClick={onToggleCollapsed}
        title={t('ui.game.action_log_expand')}
      >
        <span className="board-table__log-tab-text">{t('ui.game.action_log')}</span>
        <span className="board-table__log-tab-arrow">&#9664;</span>
      </button>,
      target,
    );
  }

  return createPortal(
    <div className="board-table__log-popout board-table__log-popout--open" onClick={onToggleCollapsed}>
      <div className="board-table__log-popout-inner" onClick={(e) => e.stopPropagation()}>
        <div
          className="board-table__log-header board-table__log-header--clickable"
          onClick={onToggleCollapsed}
          title={t('ui.game.action_log_collapse')}
        >
          <span className="board-table__log-title">{t('ui.game.action_log')}</span>
          {renderCollapseArrow()}
        </div>
        {renderList()}
        {renderFilters()}
        {renderChatForm()}
      </div>
    </div>,
    target,
  );
}
