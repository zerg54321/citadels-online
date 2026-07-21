import {
  useEffect, useMemo, useRef, useState,
} from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  CharacterChoosingStateType as CCST,
  ClientTurnState,
  computeTeamScores,
  getMyTeam as getMyTeamOf,
  getTableSlots,
  isSpectator as isSpectatorOf,
  Move,
  MoveType,
  TeamId,
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
import SeatPanel from './elements/SeatPanel';
import PlayerHand from './elements/PlayerHand';
import DistrictCard from './elements/DistrictCard';
import CharacterCard from './elements/CharacterCard';
import TurnOrderBar from './TurnOrderBar';
import ActionLog from './ActionLog';
import ActionPanel from './ActionPanel';
import CenterPanel from './CenterPanel';
import EndGameModal from './EndGameModal';

// Mirrors Vue BoardScreen.vue (561 lines). The orchestration component that
// assembles all migrated subcomponents. Vue data() → useState; computed →
// useMemo; mounted/beforeUnmount timers → useEffect with cleanup; watch
// blocks → useEffect on the watched dependency.
export default function BoardScreen() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const gameState = useGameState();
  const gameProgress = useGameProgress();
  const isCurrentPlayerSelf = useIsCurrentPlayerSelf();
  const charactersList = useCharactersList();
  const sendMoveStore = useAppStore((s) => s.sendMove);
  const leaveRoomStore = useAppStore((s) => s.leaveRoom);
  const setAutoplayStore = useAppStore((s) => s.setAutoplay);

  // --- local UI state (was Vue data()) ---
  const [nowMs, setNowMs] = useState(Date.now());
  const [autoplayBusy, setAutoplayBusy] = useState(false);
  const [eventBanner, setEventBanner] = useState('');
  const [showEndModal, setShowEndModal] = useState(true);
  const eventBannerTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  // --- countdown timer (was Vue mounted()) ---
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

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

  const isSpectator = useMemo(() => (gameState ? isSpectatorOf(gameState) : true), [gameState]);
  const myTeam = useMemo(() => (gameState ? getMyTeamOf(gameState, isSpectator) : null), [gameState, isSpectator]);

  const tableSlots = useMemo<TableSlot[]>(() => (gameState ? getTableSlots(gameState, isSpectator) : []), [gameState, isSpectator]);

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
      crown: gameState.board.playerOrder[0] === self,
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

  const showTeamScores = useMemo(() => {
    if (!gameState?.board?.playerOrder) return false;
    return Object.values(gameState.players).some(
      (p) => p.team === TeamId.A || p.team === TeamId.B,
    );
  }, [gameState]);

  const liveTeamScores = useMemo(() => {
    if (!gameState) {
      return {
        A: 0, B: 0, myLabel: 'A', enemyLabel: 'B',
      };
    }
    const { A, B } = computeTeamScores(gameState);
    if (!isSpectator && myTeam === TeamId.B) {
      return {
        A: B, B: A, myLabel: 'B', enemyLabel: 'A',
      };
    }
    return {
      A, B, myLabel: 'A', enemyLabel: 'B',
    };
  }, [gameState, isSpectator, myTeam]);

  const turnOrderChips = useMemo(() => {
    const list = (charactersList?.callable || []) as Array<{ id: number; killed?: boolean; faceUp?: boolean; discardedFaceUp?: boolean }>;
    const current = charactersList?.current || 0;
    if (list.length) {
      return list.map((c, idx) => ({
        idx,
        id: c.id || 0,
        current: c.id === current && current !== 0,
        killed: Boolean(c.killed),
        faceUp: Boolean(c.faceUp || c.discardedFaceUp),
        tip: c.id ? t(`characters.${c.id}.name`) : t('ui.game.character_unknown'),
      }));
    }
    return [1, 2, 3, 4, 5, 6, 7, 8].map((id, idx) => ({
      idx, id, current: id === current, killed: false, faceUp: false, tip: '',
    }));
  }, [charactersList, t]);

  // --- handlers (was Vue methods) ---
  const showEvent = (text: string) => {
    setEventBanner(text);
    if (eventBannerTimer.current) clearTimeout(eventBannerTimer.current);
    eventBannerTimer.current = setTimeout(() => setEventBanner(''), 3500);
  };

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
    }
  };

  const toggleAutoplay = async () => {
    if (autoplayBusy) return;
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

  const leaveRoom = async () => {
    try {
      await leaveRoomStore();
      navigate('/');
    } catch (e) {
      console.error('leave room failed', e);
    }
  };

  if (!gameState) return null;

  const selfCity = (selfBoard.city || []) as Array<DistrictId | null>;

  return (
    <div className="board-table">
      <div className="board-table__bg" />

      <div className="board-table__top">
        {showTeamScores && (
          <div className="board-table__score-bar">
            <span className="board-table__team-a">
              {isSpectator ? t('ui.team.a') : t('ui.team.mine')} {liveTeamScores.A}
            </span>
            <span className="opacity-50">VS</span>
            <span className="board-table__team-b">
              {isSpectator ? t('ui.team.b') : t('ui.team.enemy')} {liveTeamScores.B}
            </span>
          </div>
        )}
        <TurnOrderBar turnOrderChips={turnOrderChips} gameProgress={gameProgress} />
        <button type="button" className="board-table__leave-btn" onClick={leaveRoom}>
          {t('ui.score.leave_room')}
        </button>
      </div>

      <div className={`board-table__stage${isSpectator ? ' board-table__stage--spectate' : ''}`}>
        {tableSlots.map((slot) => (
          <div key={slot.playerId} className={`board-table__slot board-table__slot--${slot.pos}`}>
            <SeatPanel
              playerId={slot.playerId}
              board={slot.board}
              pickOrder={slot.pickOrder}
              destroyMode={modeFlags.destroy}
              exchangeHandMode={modeFlags.exchangeHand}
              stash={(selfBoard.stash as number) || 0}
              relation={slot.relation}
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
          onSelectCharacter={onCenterCharacterClick}
        />

        {!isSpectator && (
          <div className="board-table__slot board-table__slot--self">
            <div className="board-table__self-wrap">
              <div className="board-table__self-panel">
                <div className="board-table__self-banner">
                  <span className="board-table__self-pick">{selfPickOrder}</span>
                  <span className="text-truncate flex-fill">{selfName}</span>
                  <span className="board-table__self-vp">⭐ {(selfBoard.score as { total?: number } | undefined)?.total ?? 0}</span>
                  {(selfBoard as { crown?: boolean }).crown && (
                    <span className="seat-panel__crown" title={t('ui.game.crown_holder')}>👑</span>
                  )}
                  <span className="seat-panel__tag">{t('ui.lobby.you')}</span>
                </div>
                <div className="board-table__self-body">
                  <div className="board-table__self-city">
                    {selfCity.map((id, i) => id && <DistrictCard key={`city-${i}`} districtId={id} small />)}
                    {!selfCity.length && <div className="seat-panel__city-empty">{t('ui.game.no_buildings')}</div>}
                  </div>
                  <div className="board-table__self-role">
                    {gameProgress === 'IN_GAME' && selfRoleCard.show && (
                      <CharacterCard
                        characterId={selfRoleCard.id}
                        faceDown={selfRoleCard.faceDown}
                        killed={selfRoleCard.killed}
                        robbed={selfRoleCard.robbed}
                        size="medium"
                      />
                    )}
                  </div>
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
              onAction={sendMove}
              onToggleAutoplay={toggleAutoplay}
            />
          </div>
        )}

        <ActionLog
          displayActionFeed={displayActionFeed as { text: string; kind: string }[]}
          onShowEvent={showEvent}
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
          <button type="button" className="btn btn-sm btn-warning mr-2" onClick={() => setShowEndModal(true)}>
            {t('ui.score.show_result')}
          </button>
          <button type="button" className="btn btn-sm btn-outline-light" onClick={backToLobby}>
            {t('ui.score.leave_room')}
          </button>
        </div>
      )}
    </div>
  );
}
