import {
  useCallback, useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CharacterChoosingStateType as CCST,
  ClientTurnState,
  getTableSlots,
  isSpectator as isSpectatorOf,
  GamePhase,
  Move,
  MoveType,
  type TableSlot,
  type DistrictId,
} from 'citadels-common';
import { useStatusBarData } from '@/data/useStatusBarData';
import {
  useAppStore,
  useGameProgress,
  useGameState,
  useIsCurrentPlayerSelf,
  useCharactersList,
  selectPlayerFromId,
} from '@/store';
import { useTeamScores } from '@/hooks/useTeamScores';
import { useAvFeedDispatch } from '@/hooks/useAvFeedDispatch';
import { useAvStateDispatch } from '@/hooks/useAvStateDispatch';
import { playTurnSound } from '@/utils/sound';
import { playUi } from '@/utils/av';
import SeatPanel from './elements/SeatPanel';
import PlayerHand from './elements/PlayerHand';
import DistrictCard from './elements/DistrictCard';
import CharacterCard from './elements/CharacterCard';
import Emoji from '@/components/common/Emoji';
import ActionLog from './ActionLog';
import ActionPanel from './ActionPanel';
import CenterPanel from './CenterPanel';
import EndGameModal from './EndGameModal';

// Mirrors Vue BoardScreen.vue (561 lines). The orchestration component that
// assembles all migrated subcomponents. Vue data() → useState; computed →
// useMemo; mounted/beforeUnmount timers → useEffect with cleanup; watch
// blocks → useEffect on the watched dependency.
const COLLAPSE_BREAKPOINT = 1500;

function useLogCollapsed() {
  const [collapsed, setCollapsed] = useState(() => window.innerWidth <= COLLAPSE_BREAKPOINT);
  useEffect(() => {
    const onResize = () => setCollapsed(window.innerWidth <= COLLAPSE_BREAKPOINT);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const toggle = useCallback(() => setCollapsed(v => !v), []);
  return [collapsed, toggle] as const;
}

export default function BoardScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [logCollapsed, toggleLogCollapsed] = useLogCollapsed();

  const gameState = useGameState();
  const gameProgress = useGameProgress();
  const isCurrentPlayerSelf = useIsCurrentPlayerSelf();
  const charactersList = useCharactersList();

  // D5: feed-driven AV dispatch (earn/build/destroy/settle/turn-handoff) and
  // state-diff AV dispatch (draw + win/lose stinger). Both are edge-triggered
  // and no-op until a genuinely new feed entry / state transition arrives.
  useAvFeedDispatch();
  useAvStateDispatch();
  const sendMoveStore = useAppStore((s) => s.sendMove);
  const leaveRoomStore = useAppStore((s) => s.leaveRoom);
  const setAutoplayStore = useAppStore((s) => s.setAutoplay);
  const setSeenCharacterIdsStore = useAppStore((s) => s.setSeenCharacterIds);
  const resetSeenCharacterIdsStore = useAppStore((s) => s.resetSeenCharacterIds);

  // --- local UI state (was Vue data()) ---
  const [nowMs, setNowMs] = useState(Date.now());
  const [autoplayBusy, setAutoplayBusy] = useState(false);
  const [eventBanner, setEventBanner] = useState('');
  const [showEndModal, setShowEndModal] = useState(true);
  const eventBannerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // --- crown + pickOrder come straight from the live playerOrder ---
  // The server no longer rotates playerOrder when the King is revealed
  // (rotation now happens at finishTurnPhase, i.e. the next round boundary),
  // so during DO_ACTIONS playerOrder is stable and the crown (playerOrder[0])
  // and each seat's pickOrder need no client-side freezing/snapshot.


  // --- countdown timer (was Vue mounted()) ---
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  // --- seen-character snapshot for assassin/thief target veiling ---
  // While the local player is on their own CHOOSE_CHARACTER pick, the server
  // reveals the real ids of the cards still in their pool. We snapshot those
  // ids; later, in the kill/rob target grid, any card NOT in this set is
  // veiled grey — it is the 天绝 card or a card an earlier picker took, i.e.
  // one the player never observed. Merge as a sorted union so repeated state
  // pushes during the same pick are idempotent.
  useEffect(() => {
    if (!isCurrentPlayerSelf) return;
    const board = gameState?.board;
    if (!board || board.gamePhase !== GamePhase.CHOOSE_CHARACTERS) return;
    if (board.characters?.state?.type !== CCST.CHOOSE_CHARACTER) return;
    const callable = board.characters?.callable ?? [];
    const seen = callable
      .map((c) => c.id)
      .filter((id): id is number => typeof id === 'number' && id > 0);
    if (seen.length === 0) return;
    setSeenCharacterIdsStore((prev) => {
      const merged = Array.from(new Set([...prev, ...seen])).sort((a, b) => a - b);
      if (prev.length === merged.length && prev.every((v, i) => v === merged[i])) {
        return prev;
      }
      return merged;
    });
  }, [gameState, isCurrentPlayerSelf, setSeenCharacterIdsStore]);

  // --- reset seen-character snapshot when a new round's pick begins ---
  // gamePhase transitions from non-CHOOSE_CHARACTERS back to CHOOSE_CHARACTERS
  // at each new round; clear the previous round's snapshot so veiling reflects
  // the current round's 天绝 / pick order only.
  const prevPhaseRef = useRef<GamePhase | undefined>(undefined);
  useEffect(() => {
    const cur = gameState?.board?.gamePhase;
    const prev = prevPhaseRef.current;
    if (prev !== GamePhase.CHOOSE_CHARACTERS && cur === GamePhase.CHOOSE_CHARACTERS) {
      resetSeenCharacterIdsStore();
    }
    prevPhaseRef.current = cur;
  }, [gameState?.board?.gamePhase, resetSeenCharacterIdsStore]);

  // --- "your turn" sound during the action phase ---
  // Plays a short ding the moment it becomes the local player's turn to act
  // in DO_ACTIONS. Scoped to DO_ACTIONS (not CHOOSE_CHARACTERS) so the system-
  // auto 天绝 step — which briefly sets currentPlayer to PLAYER_1 — does not
  // false-fire. Each false→true edge fires exactly once per turn.
  const prevSelfTurnRef = useRef(false);
  useEffect(() => {
    const inActions = gameState?.board?.gamePhase === GamePhase.DO_ACTIONS;
    const selfTurn = inActions && isCurrentPlayerSelf;
    if (selfTurn && !prevSelfTurnRef.current) {
      playTurnSound();
    }
    prevSelfTurnRef.current = selfTurn;
  }, [gameState?.board?.gamePhase, isCurrentPlayerSelf]);

  // --- cleanup event banner timer on unmount (was Vue beforeUnmount) ---
  useEffect(() => () => {
    if (eventBannerTimer.current) clearTimeout(eventBannerTimer.current);
  }, []);

  // --- watch gameProgress → reset showEndModal when entering FINISHED ---
  useEffect(() => {
    if (gameProgress === 'FINISHED') setShowEndModal(true);
  }, [gameProgress]);

  const statusBar = useStatusBarData(gameState);

  // --- derived state (was Vue computed) ---
  const self = gameState?.self ?? '';
  const getPlayer = selectPlayerFromId(gameState);
  const selfMeta = self ? getPlayer(self) : undefined;
  const selfIsAutoplay = Boolean(selfMeta?.isAutoplay);
  const AUTOPLAY_TIMEOUT_LOCK_THRESHOLD = 3;
  const selfAutoplayLocked = (selfMeta?.autoplayTimeoutCount ?? 0) >= AUTOPLAY_TIMEOUT_LOCK_THRESHOLD;

  const countdownSecondsLeft = useMemo(() => {
    const deadline = gameState?.turnDeadlineAt;
    if (!deadline) return null;
    return Math.max(0, Math.ceil((deadline - nowMs) / 1000));
  }, [gameState?.turnDeadlineAt, nowMs]);

  const countdownText = useMemo(() => {
    if (selfIsAutoplay) return t('ui.game.countdown_autoplay');
    if (countdownSecondsLeft === null) return '—';
    const s = countdownSecondsLeft;
    const m = Math.floor(s / 60);
    const r = s % 60;
    return m > 0 ? `${m}:${String(r).padStart(2, '0')}` : `${s}s`;
  }, [selfIsAutoplay, countdownSecondsLeft, t]);

  const countdownUrgent = countdownSecondsLeft !== null && countdownSecondsLeft <= 15;

  // --- self countdown tick (last 10s of the local player's turn) ---
  // L1 local-only: only the local player hears it, and only on their own
  // turn. Fires once per whole-second change while <= 10s remaining.
  const prevCountdownRef = useRef<number | null>(null);
  useEffect(() => {
    if (!isCurrentPlayerSelf) {
      prevCountdownRef.current = null;
      return;
    }
    const s = countdownSecondsLeft;
    if (s === null) {
      prevCountdownRef.current = null;
      return;
    }
    if (s <= 10 && s !== prevCountdownRef.current) {
      playUi('self_countdown_tick');
    }
    prevCountdownRef.current = s;
  }, [countdownSecondsLeft, isCurrentPlayerSelf]);

  const isSpectator = useMemo(() => (gameState ? isSpectatorOf(gameState) : true), [gameState]);

  const tableSlots = useMemo<TableSlot[]>(() => {
    if (!gameState) return [];
    return getTableSlots(gameState, isSpectator);
  }, [gameState, isSpectator]);

  const selfBoard = useMemo(() => {
    if (isSpectator || !gameState) {
      return {
        stash: 0, hand: [], tmpHand: [], city: [], score: {}, characters: [], crown: false,
      } as const;
    }
    const board = gameState.board.players[self] as Record<string, unknown> | undefined;
    return {
      stash: 0,
      hand: [],
      tmpHand: [],
      city: [],
      score: {},
      characters: [],
      ...(board || {}),
      crown: (gameState?.board?.playerOrder?.[0] ?? '') === self,
    };
  }, [gameState, isSpectator, self]);

  const selfName = self ? (getPlayer(self)?.username || 'You') : 'You';
  const selfPickOrder = useMemo(() => {
    const order = gameState?.board?.playerOrder || [];
    const idx = order.indexOf(self);
    return idx >= 0 ? idx + 1 : 0;
  }, [gameState?.board?.playerOrder, self]);

  const displayActionFeed = useMemo(() => gameState?.actionFeed || [], [gameState?.actionFeed]);

  const selfRoleCard = useMemo(() => {
    const chars = (selfBoard?.characters || []) as Array<{ id: number; faceDown?: boolean; killed?: boolean; robbed?: boolean }>;
    if (!chars.length) {
      return {
        show: false, id: 0, faceDown: true, killed: false, robbed: false,
      };
    }
    const revealed = chars.find((c) => c.id > 0);
    if (revealed) {
      return {
        show: true,
        id: revealed.id,
        faceDown: false,
        killed: Boolean(revealed.killed),
        robbed: Boolean(revealed.robbed),
      };
    }
    return {
      show: true, id: 0, faceDown: true, killed: false, robbed: false,
    };
  }, [selfBoard]);

  const modeFlags = useMemo(() => {
    if (!gameState) {
      return {
        build: false,
        destroy: false,
        kill: false,
        rob: false,
        putAside: false,
        chooseChar: false,
        exchangeHand: false,
        discardCards: false,
        laboratory: false,
      };
    }
    const seated = !isSpectator && isCurrentPlayerSelf;
    const ts = gameState.board.turnState;
    const charStateType = gameState.board.characters?.state?.type;
    const putAside = seated && (charStateType === CCST.PUT_ASIDE_FACE_UP
      || charStateType === CCST.PUT_ASIDE_FACE_DOWN
      || charStateType === CCST.PUT_ASIDE_FACE_DOWN_UP);
    const chooseChar = seated && (charStateType === CCST.CHOOSE_CHARACTER || putAside);
    return {
      build: seated && ts === ClientTurnState.BUILD_DISTRICT,
      destroy: seated && ts === ClientTurnState.WARLORD_DESTROY_DISTRICT,
      kill: seated && ts === ClientTurnState.ASSASSIN_KILL,
      rob: seated && ts === ClientTurnState.THIEF_ROB,
      putAside,
      chooseChar,
      exchangeHand: seated && ts === ClientTurnState.MAGICIAN_EXCHANGE_HAND,
      discardCards: seated && ts === ClientTurnState.MAGICIAN_DISCARD_CARDS,
      laboratory: seated && ts === ClientTurnState.LABORATORY_DISCARD_CARD,
    };
  }, [gameState, isSpectator, isCurrentPlayerSelf]);

  const showTeamScores = useTeamScores();

  // --- handlers (was Vue methods) ---
  // Stable identity so ActionLog's effect doesn't re-fire on every render
  // (which would keep resetting the auto-clear timer).
  const showEvent = useCallback((text: string) => {
    setEventBanner(text);
    if (eventBannerTimer.current) clearTimeout(eventBannerTimer.current);
    eventBannerTimer.current = setTimeout(() => setEventBanner(''), 3500);
  }, []);

  // --- clear the transient event banner when a new round begins ---
  // Kill/rob banners (e.g. "军阀被刺杀不能行动") used to leak into the next
  // round's drafting phase. Clear them at the round boundary (gamePhase
  // returns to CHOOSE_CHARACTERS) and cancel any pending auto-clear timer.
  useEffect(() => {
    if (gameState?.board?.gamePhase === GamePhase.CHOOSE_CHARACTERS) {
      setEventBanner('');
      if (eventBannerTimer.current) {
        clearTimeout(eventBannerTimer.current);
        eventBannerTimer.current = undefined;
      }
    }
  }, [gameState?.board?.gamePhase]);

  const onCenterCharacterClick = async (ch: { selectable?: boolean; id: number }, index: number) => {
    if (!ch.selectable) return;
    let moveType = MoveType.CHOOSE_CHARACTER;
    let moveData: unknown = index;
    if (modeFlags.kill) {
      moveType = MoveType.ASSASSIN_KILL;
      moveData = ch.id;
    } else if (modeFlags.rob) {
      moveType = MoveType.THIEF_ROB;
      moveData = ch.id;
    }
    try {
      await sendMoveStore({ type: moveType, data: moveData } as Move);
    } catch (e) {
      console.log('character click failed', e);
    }
  };

  const sendMove = async (move: Move, target?: HTMLElement) => {
    if (target && target.blur) target.blur();
    try {
      await sendMoveStore(move);
    } catch (error) {
      console.log('error when sending move', error);
      playUi('ui_error');
    }
  };

  const toggleAutoplay = async () => {
    if (autoplayBusy) return;
    // 锁定托管时按钮已禁用,此处二次防护避免绕过
    if (selfIsAutoplay && selfAutoplayLocked) return;
    setAutoplayBusy(true);
    try {
      await setAutoplayStore(!selfIsAutoplay);
    } catch (error) {
      console.error('autoplay toggle failed', error);
    } finally {
      setAutoplayBusy(false);
    }
  };

  const backToLobby = async () => {
    try {
      await leaveRoomStore();
    } catch (e) {
      console.error('leave room failed', e);
    }
    navigate('/');
  };

  if (!gameState) return null;

  const selfCity = (selfBoard.city || []) as Array<DistrictId | null>;

  return (
    <div className="board-table">
      <div className="board-table__bg" />

      <div className={`board-table__stage${isSpectator ? ' board-table__stage--spectate' : ''}`}>
        {tableSlots.map((slot) => (
          <div key={slot.playerId} className={`board-table__slot board-table__slot--${slot.pos}`}>
            <SeatPanel
              playerId={slot.playerId}
              board={slot.board}
              pickOrder={slot.pickOrder}
              destroyMode={modeFlags.destroy}
              exchangeHandMode={modeFlags.exchangeHand && slot.relation !== 'self'}
              stash={(selfBoard.stash as number) || 0}
              relation={slot.relation}
              isSpectator={isSpectator}
            />
          </div>
        ))}

        <CenterPanel
          gameProgress={gameProgress}
          charactersList={charactersList || {}}
          gameState={gameState}
          killMode={modeFlags.kill}
          robMode={modeFlags.rob}
          chooseCharacterMode={modeFlags.chooseChar}
          eventBanner={eventBanner}
          countdownText={countdownText}
          countdownUrgent={countdownUrgent}
          onSelectCharacter={onCenterCharacterClick}
        />

        {!isSpectator && (
          <div className="board-table__slot board-table__slot--self">
            <div className="board-table__self-wrap">
              <div className={`board-table__self-panel${gameProgress === 'IN_GAME' && isCurrentPlayerSelf ? ' board-table__self-panel--acting' : ''}`}>
                <div className="board-table__self-banner">
                  <span className="board-table__self-pick">{selfPickOrder}</span>
                  <span className="text-truncate flex-fill board-table__self-name">{selfName}</span>
                  <span className="seat-panel__chip seat-panel__chip--gold" title={t('ui.game.stat_gold')}>
                    <span className="seat-panel__chip-icon"><Emoji emoji="🪙" /></span>
                    <span className="seat-panel__chip-val">{(selfBoard.stash as number) ?? 0}</span>
                  </span>
                  <span className="seat-panel__chip seat-panel__chip--hand" title={t('ui.game.stat_hand')}>
                    <span className="card-back-icon" />
                    <span className="seat-panel__chip-val">{(selfBoard.hand || []).length}</span>
                  </span>
                  <span className="seat-panel__chip seat-panel__chip--score" title={t('ui.game.stat_score')}>
                    <span className="seat-panel__chip-icon">⭐</span>
                    <span className="seat-panel__chip-val">{(selfBoard.score as { total?: number } | undefined)?.total ?? 0}</span>
                  </span>
                  {(selfBoard as { crown?: boolean }).crown && (
                    <span className="seat-panel__crown" title={t('ui.game.crown_holder')}>👑</span>
                  )}
                  <span className="seat-panel__tag">{t('ui.lobby.you')}</span>
                </div>
                <div className="board-table__self-body">
                  {(selfBoard.tmpHand || []).length > 0 && selfCity.length === 0 ? (
                    <div className="tmp-hand-pick">
                      <span className="tmp-hand-pick__hint">
                        {t('ui.game.messages.choose_card_prompt')}
                      </span>
                      <div className="tmp-hand-pick__cards">
                        {(selfBoard.tmpHand || []).map((id: string, i: number) => id && (
                          <div key={i} className="tmp-hand-pick__slot">
                            <DistrictCard
                              districtId={id as DistrictId}
                              selectable
                              onSelect={() => {
                                sendMove({ type: MoveType.DRAW_CARDS, data: id }).catch((e: unknown) => console.log('error when sending move', e));
                              }}
                            />
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <>
                      <div className="board-table__self-city">
                        {selfCity.map((id, i) => id && <DistrictCard key={`city-${i}`} districtId={id} small />)}
                        {!selfCity.length && <div className="seat-panel__city-empty">{t('ui.game.no_buildings')}</div>}
                      </div>
                      {/* 非首轮二选一候选牌：放在已建建筑右侧、角色牌左侧（self-body 行内）。
                          默认隐藏（PC/iPad 仍在手牌区内联展示，见 PlayerHand --inline），
                          仅移动端经 .game-stage--mobile 作用域显示，避免手牌过多时叠加。 */}
                      {(selfBoard.tmpHand || []).length > 0 && selfCity.length > 0 && (
                        <div className="tmp-hand-pick tmp-hand-pick--body">
                          <span className="tmp-hand-pick__hint">
                            {t('ui.game.messages.choose_card_prompt')}
                          </span>
                          <div className="tmp-hand-pick__cards">
                            {(selfBoard.tmpHand || []).map((id: string, i: number) => id && (
                              <div key={i} className="tmp-hand-pick__slot">
                                <DistrictCard
                                  districtId={id as DistrictId}
                                  selectable
                                  onSelect={() => {
                                    sendMove({ type: MoveType.DRAW_CARDS, data: id }).catch((e: unknown) => console.log('error when sending move', e));
                                  }}
                                />
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="board-table__self-role">
                        {gameProgress === 'IN_GAME' && selfRoleCard.show && (
                          <CharacterCard
                            characterId={selfRoleCard.id}
                            faceDown={selfRoleCard.faceDown}
                            killed={selfRoleCard.killed}
                            robbed={selfRoleCard.robbed}
                            size="medium"
                            staggerReveal
                          />
                        )}
                        {gameProgress === 'IN_GAME' && !selfRoleCard.show && (
                          <div className="board-table__self-role-empty" title={t('ui.game.character_unknown')}>
                            <span>？</span>
                          </div>
                        )}
                      </div>
                    </>
                  )}
                </div>
                <div className="board-table__self-hand">
                  <PlayerHand
                    board={selfBoard as Parameters<typeof PlayerHand>[0]['board']}
                    buildMode={modeFlags.build}
                    discardCardsMode={modeFlags.discardCards}
                    laboratoryMode={modeFlags.laboratory}
                  />
                </div>
              </div>
            </div>

            <ActionPanel
              actions={(statusBar.actions ?? []).map((a) => ({
                title: a.title,
                move: a.move,
                args: a.args ? Object.fromEntries(a.args.map((v, i) => [String(i), v])) : undefined,
              }))}
              gameProgress={gameProgress}
              countdownText={countdownText}
              countdownUrgent={countdownUrgent}
              isAutoplay={selfIsAutoplay}
              autoplayBusy={autoplayBusy}
              autoplayLocked={selfAutoplayLocked}
              onAction={sendMove}
              onToggleAutoplay={toggleAutoplay}
            />
          </div>
        )}

        <ActionLog
          displayActionFeed={displayActionFeed}
          onShowEvent={showEvent}
          collapsed={logCollapsed}
          onToggleCollapsed={toggleLogCollapsed}
        />
      </div>

      <EndGameModal
        show={gameProgress === 'FINISHED' && showEndModal}
        gameState={gameState}
        selfId={self}
        isSpectator={isSpectator}
        showTeamScores={showTeamScores}
        getPlayerFromId={getPlayer}
        onClose={() => setShowEndModal(false)}
        onLeave={backToLobby}
      />

      {gameProgress === 'FINISHED' && !showEndModal && (
        <div className="board-table__end-bar">
          <button type="button" className="endgame-btn endgame-btn--secondary" onClick={() => setShowEndModal(true)}>
            {t('ui.score.show_result')}
          </button>
          <button type="button" className="endgame-btn endgame-btn--primary" onClick={backToLobby}>
            {t('ui.score.leave_room')}
          </button>
        </div>
      )}
    </div>
  );
}
