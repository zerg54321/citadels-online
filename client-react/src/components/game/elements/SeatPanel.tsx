import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  DistrictId, Move, MoveType, PlayerBoard, PlayerRole,
} from 'citadels-common';
import Modal from '@/components/common/Modal';
import { cn } from '@/utils/cn';
import { avatarUrl } from '@/utils/avatarUrl';
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
import Emoji from '@/components/common/Emoji';

type BoardWithCrown = PlayerBoard & { crown: boolean };

interface SeatPanelProps {
  playerId: string;
  board: BoardWithCrown;
  pickOrder?: number;
  destroyMode?: boolean;
  exchangeHandMode?: boolean;
  stash?: number;
  relation?: 'self' | 'ally' | 'enemy';
  isSpectator?: boolean;
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
  isSpectator = false,
}: SeatPanelProps) {
  const { t } = useTranslation();
  const gameState = useAppStore((s) => s.gameState);
  const sendMove = useAppStore((s) => s.sendMove);
  const gameProgress = useGameProgress();
  const currentPlayerId = useCurrentPlayerId();
  const [pendingDestroy, setPendingDestroy] = useState<DistrictId | null>(null);

  const getPlayer = selectPlayerFromId(gameState);
  const player = getPlayer(playerId);
  const username = player?.username || playerId;
  const avatarSrc = player?.avatar ? avatarUrl(player.avatar) : '';
  const isCurrentPlayer = currentPlayerId === playerId;
  const isActingNow = isCurrentPlayer && gameProgress === 'IN_GAME';

  // Seat status tag: tell a disconnected seat apart from one that is being
  // auto-played (hosted). AI seats show nothing — they are always automated.
  // Offline takes priority: after a disconnect the seat also times out into
  // autoplay, but "offline" is the more meaningful signal to the table.
  const seatStatus = (() => {
    if (!player || player.role !== PlayerRole.PLAYER || player.isAi) return null;
    if (!player.online) return 'offline';
    if (player.isAutoplay) return 'hosted';
    return null;
  })();

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
    // Defense-in-depth: never swap with the Magician's own hand. BoardScreen
    // already excludes the self seat from exchange mode, but guard here too
    // so a self-swap can never fire from any caller — it is a no-op that
    // would waste the Magician's special action.
    if (relation === 'self') return;
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
    <div
      className={cn('seat-panel', {
        'seat-panel--ally': relation === 'ally' || relation === 'self',
        'seat-panel--enemy': relation === 'enemy',
        'seat-panel--active': isCurrentPlayer,
        'seat-panel--acting': isActingNow,
        'seat-panel--exchange': exchangeHandMode,
      })}
      onClick={exchangeHandMode ? exchangeHand : undefined}
    >
      <div className="seat-panel__main">
        <div className="seat-panel__banner">
          <span className="seat-panel__pick-no" title={t('ui.game.pick_order_tip')}>{pickOrder}</span>
          {avatarSrc && <img src={avatarSrc} alt="" className="seat-panel__avatar" />}
          <span className="text-truncate flex-fill seat-panel__name">{username}</span>
          {seatStatus && (
            <span className={`seat-panel__status seat-panel__status--${seatStatus}`}>
              {t(seatStatus === 'offline' ? 'ui.game.status_offline' : 'ui.game.status_hosted')}
            </span>
          )}
          <span className="seat-panel__chip seat-panel__chip--gold" title={t('ui.game.stat_gold')}>
            <span className="seat-panel__chip-icon"><Emoji emoji="🪙" /></span>
            <span className="seat-panel__chip-val">{board.stash ?? 0}</span>
          </span>
          <span
            className={cn('seat-panel__chip seat-panel__chip--hand', { 'seat-panel__chip--click': exchangeHandMode })}
            title={t('ui.game.stat_hand')}
          >
            <span className="card-back-icon" />
            <span className="seat-panel__chip-val">{(board.hand || []).length}</span>
          </span>
          <span className="seat-panel__chip seat-panel__chip--score" title={t('ui.game.stat_score')}>
            <span className="seat-panel__chip-icon">⭐</span>
            <span className="seat-panel__chip-val">{board.score?.total ?? 0}</span>
          </span>
          {board.crown && <span className="seat-panel__crown" title={t('ui.game.crown_holder')}>👑</span>}
          {relation === 'self' && <span className="seat-panel__tag">{t('ui.lobby.you')}</span>}
          {relation === 'ally' && <span className="seat-panel__tag">{isSpectator ? t('ui.team.a') : t('ui.team.ally')}</span>}
          {relation === 'enemy' && <span className="seat-panel__tag">{isSpectator ? t('ui.team.b') : t('ui.team.enemy_short')}</span>}
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
                staggerReveal
              />
            )}
          </div>
        </div>
      </div>

      <Modal
        show={pendingDestroy !== null}
        title={t('ui.game.destroy_confirm_title')}
        dialogClass="modal-dialog-centered modal-destroy-confirm"
        contentClass="lobby-modal destroy-confirm"
        titleClass="text-gold lobby-modal-title"
        headerClass="border-0 pb-2"
        onClose={() => setPendingDestroy(null)}
        footer={(
          <>
            <button type="button" className="btn btn-outline-gold" onClick={() => setPendingDestroy(null)}>
              {t('ui.cancel')}
            </button>
            <button
              type="button"
              className="btn btn-gold"
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
        <p className="text-parchment mb-0">{t('ui.game.warn_destroy_ally', { name: username })}</p>
      </Modal>
    </div>
  );
}
