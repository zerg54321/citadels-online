import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Move, MoveType, DistrictId, TeamId, PlayerBoard,
} from 'citadels-common';
import Modal from '@/components/common/Modal';
import Emoji from '@/components/common/Emoji';
import { cn } from '@/utils/cn';
import {
  useAppStore,
  useGameProgress,
  useCurrentPlayerId,
  selectPlayerFromId,
  selectDistrictDestroyPrice,
  selectPlayerPosition,
} from '@/store';
import PlayerScore from './PlayerScore';
import DistrictCard from './DistrictCard';
import CharactersList from './CharactersList';

type BoardWithCrown = PlayerBoard & { crown: boolean };

interface PlayerCityProps {
  playerId: string;
  board: BoardWithCrown;
  destroyMode?: boolean;
  exchangeHandMode?: boolean;
  stash?: number;
}

// Mirrors Vue elements/PlayerCity.vue. mapGetters → useAppStore hooks +
// pure selectors operating on gameState. The pendingDestroy data field →
// useState. AppModal → Modal with children/footer props.
export default function PlayerCity({
  playerId,
  board,
  destroyMode = false,
  exchangeHandMode = false,
  stash = 0,
}: PlayerCityProps) {
  const { t } = useTranslation();
  const gameState = useAppStore((s) => s.gameState);
  const sendMove = useAppStore((s) => s.sendMove);
  const gameProgress = useGameProgress();
  const currentPlayerId = useCurrentPlayerId();

  const [pendingDestroy, setPendingDestroy] = useState<DistrictId | null>(null);

  const getPlayer = selectPlayerFromId(gameState);
  const player = getPlayer(playerId);
  const username = player?.username;
  const isCurrentPlayer = currentPlayerId === playerId;

  const teamClass = (() => {
    const team = player?.team;
    if (team === TeamId.A) return 'A';
    if (team === TeamId.B) return 'B';
    return '';
  })();

  const playerKillRobLabel = (() => {
    // board.characters is typed as { id }[] in common, but at runtime carries
    // killed/robbed flags set by the engine. Cast to access them.
    const chars = (board?.characters || []) as Array<{ id: number; killed?: boolean; robbed?: boolean }>;
    const hit = chars.find((c) => c.killed || c.robbed);
    if (!hit || !hit.id) return null;
    return {
      killed: Boolean(hit.killed),
      robbed: Boolean(hit.robbed),
      name: t(`characters.${hit.id}.name`),
    };
  })();

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
        data: {
          player: getPlayerPos(playerId),
          card: name,
        },
      };
      await sendMove(move);
    } catch (error) {
      console.log('error when sending move', error);
    }
  };

  const chooseCardDestroy = (name: DistrictId) => {
    if (!canDestroy(name)) return;
    const selfId = gameState?.self;
    const myTeam = selfId ? getPlayer(selfId)?.team : undefined;
    const theirTeam = player?.team;
    if (myTeam != null && theirTeam != null && myTeam === theirTeam) {
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

  return (
    <div className="w-100 card bg-secondary shadow-sm" style={{ minWidth: '9em' }}>
      <div className="p-1 text-light d-flex flex-column">
        <div className="bg-dark p-1 flex-fill rounded d-flex flex-column">
          <h5>
            <span className={cn('badge w-100', {
              'bg-primary': isCurrentPlayer && !teamClass,
              'bg-info': !isCurrentPlayer && teamClass === 'A',
              'bg-danger': !isCurrentPlayer && teamClass === 'B',
              'bg-primary border border-light': isCurrentPlayer && teamClass === 'A',
              'bg-danger border border-light': isCurrentPlayer && teamClass === 'B',
            })}>
              {username}
              {teamClass && <span className="small">({teamClass})</span>}
            </span>
          </h5>
          <p className="text-center">
            {board.crown && (
              <span className="badge badge-pill badge-danger p-2 mr-2"><Emoji emoji="👑" /></span>
            )}
            <span className="badge badge-pill badge-secondary p-2 mr-2">
              {board.stash} <Emoji emoji="🪙" />
            </span>
            <span
              className={cn('badge badge-pill p-2', {
                'badge-secondary': !exchangeHandMode,
                'badge-primary cursor-pointer': exchangeHandMode,
              })}
              onClick={exchangeHand}
              title={exchangeHandMode ? t('ui.game.actions.choose_hand') : ''}
            >
              {board.hand.length} <Emoji emoji="🃏" />
            </span>
            <span className="badge badge-pill badge-warning p-2 ml-2" title="实时总分">
              {board.score?.total ?? 0} 分
            </span>
          </p>
          {gameProgress === 'IN_GAME' && <CharactersList characters={board.characters} />}
          {playerKillRobLabel && (
            <div className="text-center small mt-1">
              {playerKillRobLabel.killed ? (
                <span className="badge badge-danger">💀 {playerKillRobLabel.name}</span>
              ) : playerKillRobLabel.robbed ? (
                <span className="badge badge-warning text-dark">💰 {playerKillRobLabel.name}</span>
              ) : null}
            </div>
          )}
        </div>
      </div>
      <div className="p-2 bg-secondary d-flex justify-content-center flex-wrap overflow-auto gap-2">
        {board.city.map((id, i) => (
          <DistrictCard
            key={i}
            districtId={id}
            disabled={destroyMode && !canDestroy(id)}
            selectable={canDestroy(id)}
            small
            onSelect={() => chooseCardDestroy(id)}
          />
        ))}
      </div>
      <div className="flex-fill" />
      <PlayerScore score={board.score} />

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
