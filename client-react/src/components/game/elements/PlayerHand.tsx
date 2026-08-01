import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Move, MoveType, DistrictId, PlayerBoard, districts,
} from 'citadels-common';
import Emoji from '@/components/common/Emoji';
import { useAppStore } from '@/store';
import DistrictCard from './DistrictCard';

type BoardWithCrown = PlayerBoard & { crown: boolean };

interface PlayerHandProps {
  board: BoardWithCrown;
  buildMode?: boolean;
  discardCardsMode?: boolean;
  laboratoryMode?: boolean;
}

// Mirrors Vue elements/PlayerHand.vue. The Vue `data().selectedCards` + two
// deep watchers (board.hand change resets; selectedCards change commits to
// store + triggers build/lab move) become a useState + useEffect pair.
export default function PlayerHand({
  board,
  buildMode = false,
  discardCardsMode = false,
  laboratoryMode = false,
}: PlayerHandProps) {
  const sendMove = useAppStore((s) => s.sendMove);
  const setSelectedCards = useAppStore((s) => s.setSelectedCards);
  const { t } = useTranslation();

  const [selectedCards, setSelected] = useState<boolean[]>([]);

  const showTmpHand = board.tmpHand.length > 0;

  // Reset selection when hand changes (mirrors Vue watch board.hand).
  useEffect(() => {
    setSelected([]);
  }, [board.hand]);

  // Commit selection to store + trigger build/lab move when a card is picked
  // (mirrors Vue watch selectedCards).
  useEffect(() => {
    const cards: DistrictId[] = [];
    selectedCards.forEach((isSelected, index) => {
      if (isSelected) {
        const card = board.hand[index];
        if (card) cards.push(card);
      }
    });
    setSelectedCards(cards);

    if (cards.length > 0) {
      if (buildMode) {
        const move: Move = { type: MoveType.BUILD_DISTRICT, data: cards[0] };
        sendMove(move).catch((e) => console.log('error when sending move', e));
        setSelected([]);
      } else if (laboratoryMode) {
        const move: Move = { type: MoveType.LABORATORY_DISCARD_CARD, data: cards[0] };
        sendMove(move).catch((e) => console.log('error when sending move', e));
        setSelected([]);
      }
    }
    // discardCardsMode just toggles selectedCards state without a move;
    // the parent reads selectedCards from the store for the discard confirm.
  }, [selectedCards, buildMode, laboratoryMode, board.hand, sendMove, setSelectedCards]);

  const canBuild = (name: DistrictId): boolean => {
    if (!buildMode) return false;
    const data = districts[name as keyof typeof districts] as { cost?: number } | undefined;
    return !board.city.includes(name) && (data?.cost ?? 0) <= board.stash;
  };

  const chooseCard = (name: DistrictId) => {
    const move: Move = { type: MoveType.DRAW_CARDS, data: name };
    sendMove(move).catch((e) => console.log('error when sending move', e));
  };

  const handleSelect = (index: number, next: boolean) => {
    setSelected((prev) => {
      const copy = [...prev];
      copy[index] = next;
      return copy;
    });
  };

  return (
    <div className="d-flex justify-content-start align-items-end player-hand-root">
      <div className="flex-grow-1 px-2 pb-2 d-flex overflow-hidden">
        {board.hand.map((id, i) => id && (
          <div key={i} className="district-card-wrapper pt-1">
            <div className="district-card">
              <DistrictCard
                districtId={id}
                disabled={showTmpHand || (buildMode && !canBuild(id))}
                selectable={canBuild(id) || discardCardsMode || laboratoryMode}
                selected={selectedCards[i]}
                onSelect={(next) => handleSelect(i, next)}
              />
            </div>
          </div>
        ))}
        {/* 非首轮的二选一：城市有建筑时在手牌区内联展示（首轮由 BoardScreen 全幅展示） */}
        {showTmpHand && board.city.length > 0 && (
          <div className="tmp-hand-pick tmp-hand-pick--inline">
            <span className="tmp-hand-pick__hint">
              {t('ui.game.messages.choose_card_prompt')}
            </span>
            <div className="tmp-hand-pick__cards">
              {board.tmpHand.map((id, i) => id && (
                <div key={i} className="tmp-hand-pick__slot">
                  <DistrictCard
                    districtId={id}
                    selectable
                    onSelect={() => chooseCard(id)}
                  />
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div
        className="stash d-flex flex-column-reverse flex-wrap-reverse justify-content-start"
        style={{ width: `${2.5 * Math.ceil(board.stash / 5)}rem` }}
      >
        {Array.from({ length: board.stash }, (_, i) => (
          <Emoji key={i} emoji="🪙" />
        ))}
      </div>
    </div>
  );
}
