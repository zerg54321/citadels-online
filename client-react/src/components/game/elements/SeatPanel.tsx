import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DistrictId, Move, MoveType, PlayerBoard,
} from 'citadels-common';
import Modal from '@/components/common/Modal';
import { cn } from '@/utils/cn';
import {
  useAppStore,
  useGameProgress,
  useCurrentPlayerId,
  selectPlayerFromId,
  selectDistrictDestroyPrice,
  selectPlayerPosition,
} from '@/store';
import CharacterCard from './CharacterCard';
import DistrictCard from './DistrictCard';

type BoardWithCrown = PlayerBoard & { crown: boolean };

interface SeatPanelProps {
  playerId: string;
  board: BoardWithCrown;
  pickOrder?: number;
  destroyMode?: boolean;
  exchangeHandMode?: boolean;
  stash?: number;
  relation?: 'self' | 'ally' | 'enemy';
}

// Mirrors Vue elements/SeatPanel.vue. mapGetters → hooks + selectors.
// pendingDestroy data → useState. AppModal → Modal.
export default function SeatPanel({
  playerId,
  board,
  pickOrder = 1,
  destroyMode = false,
  exchangeHandMode = false,
  stash = 0,
  relation = 'enemy',
}: SeatPanelProps) {
  const { t } = useTranslation();
  const gameState = useAppStore((s) => s.gameState);
  const sendMove = useAppStore((s) => s.sendMove);
  const gameProgress = useGameProgress();
  const currentPlayerId = useCurrentPlayerId();
  const [pendingDestroy, setPendingDestroy] = useState<DistrictId | null>(null);

  const getPlayer = selectPlayerFromId(gameState);
  const username = getPlayer(playerId)?.username || playerId;
  const isCurrentPlayer = currentPlayerId === playerId;
  const isActingNow = isCurrentPlayer && gameProgress === 'IN_GAME';

  const roleCard = (() => {
    const chars = (board?.characters || []) as Array<{ id: number; faceDown?: boolean; killed?: boolean; robbed?: boolean }>;
    if (!chars.length) {
      return {
        show: false, id: 0, faceDown: true, killed: false, robbed: false,
      };
    }
    const revealed = chars.find((c) => c.id > 0 && !c.faceDown);
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
  })();

  const isAllyTarget = relation === 'ally' || relation === 'self';
  const getDestroyPrice = selectDistrictDestroyPrice(gameState);
  const canDestroy = (name: DistrictId): boolean => {
    if (!destroyMode) return false;
    const cost = getDestroyPrice(playerId, name);
    return cost >= 0 && cost <= stash;
  };

  const getPlayerPos = selectPlayerPosition(gameState);
  const sendDestroyMove = async (name: DistrictId) => {
    try {
      const move: Move = {
        type: MoveType.WARLORD_DESTROY_DISTRICT,
        data: { player: getPlayerPos(playerId), card: name },
      };
      await sendMove(move);
    } catch (error) {
      console.log('error when sending move', error);
    }
  };

  const chooseCardDestroy = (name: DistrictId) => {
    if (!canDestroy(name)) return;
    if (isAllyTarget) {
      setPendingDestroy(name);
      return;
    }
    sendDestroyMove(name);
  };

  const exchangeHand = async () => {
    if (!exchangeHandMode) return;
    try {
      const move: Move = {
        type: MoveType.MAGICIAN_EXCHANGE_HAND,
        data: getPlayerPos(playerId),
      };
      await sendMove(move);
    } catch (error) {
      console.log('error when sending move', error);
    }
  };

  const city = board.city || [];

  return (
    <div className={cn('seat-panel', {
      'seat-panel--ally': relation === 'ally' || relation === 'self',
      'seat-panel--enemy': relation === 'enemy',
      'seat-panel--active': isCurrentPlayer,
      'seat-panel--acting': isActingNow,
    })}>
      <div className="seat-panel__main">
        <div className="seat-panel__banner">
          <span className="seat-panel__pick-no" title={t('ui.game.pick_order_tip')}>{pickOrder}</span>
          <span className="text-truncate flex-fill seat-panel__name">{username}</span>
          {board.crown && <span className="seat-panel__crown" title={t('ui.game.crown_holder')}>👑</span>}
          {relation === 'self' && <span className="seat-panel__tag">{t('ui.lobby.you')}</span>}
          {relation === 'ally' && <span className="seat-panel__tag">{t('ui.team.ally')}</span>}
          {relation === 'enemy' && <span className="seat-panel__tag">{t('ui.team.enemy_short')}</span>}
        </div>

        <div className="seat-panel__stats">
          <div className="seat-panel__stat" title={t('ui.game.stat_gold')}>
            <span className="seat-panel__stat-icon">🪙</span>
            <span className="seat-panel__stat-val">{board.stash ?? 0}</span>
          </div>
          <div
            className={cn('seat-panel__stat', { 'seat-panel__stat--click': exchangeHandMode })}
            title={t('ui.game.stat_hand')}
            onClick={exchangeHand}
          >
            <span className="seat-panel__stat-icon">🃏</span>
            <span className="seat-panel__stat-val">{(board.hand || []).length}</span>
          </div>
          <div className="seat-panel__stat seat-panel__stat--score" title={t('ui.game.stat_score')}>
            <span className="seat-panel__stat-icon">⭐</span>
            <span className="seat-panel__stat-val">{board.score?.total ?? 0}</span>
          </div>
          <div className="seat-panel__stat" title={t('ui.game.stat_city')}>
            <span className="seat-panel__stat-icon">🏛</span>
            <span className="seat-panel__stat-val">{(board.city || []).length}</span>
          </div>
        </div>

        <div className="seat-panel__body">
          <div className="seat-panel__city">
            {city.map((id, i) => id && (
              <DistrictCard
                key={i}
                districtId={id}
                small
                disabled={destroyMode && !canDestroy(id)}
                selectable={canDestroy(id)}
                onSelect={() => chooseCardDestroy(id)}
              />
            ))}
            {!city.length && <div className="seat-panel__city-empty">{t('ui.game.no_buildings')}</div>}
          </div>
          <div className="seat-panel__role">
            {gameProgress === 'IN_GAME' && roleCard.show && (
              <CharacterCard
                characterId={roleCard.id}
                faceDown={roleCard.faceDown}
                killed={roleCard.killed}
                robbed={roleCard.robbed}
                size="medium"
              />
            )}
          </div>
        </div>
      </div>

      <Modal
        show={pendingDestroy !== null}
        title={t('ui.game.destroy_confirm_title')}
        headerClass="bg-warning text-white"
        onClose={() => setPendingDestroy(null)}
        footer={(
          <>
            <button type="button" className="btn btn-secondary" onClick={() => setPendingDestroy(null)}>
              {t('ui.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (pendingDestroy !== null) {
                  sendDestroyMove(pendingDestroy);
                  setPendingDestroy(null);
                }
              }}
            >
              {t('ui.confirm')}
            </button>
          </>
        )}
      >
        <p>{t('ui.game.warn_destroy_ally', { name: username })}</p>
      </Modal>
    </div>
  );
}
