import { useEffect, useState } from 'react';
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

  const chooseCard = async (name: DistrictId) => {
    try {
      const move: Move = { type: MoveType.DRAW_CARDS, data: name };
      await sendMove(move);
    } catch (error) {
      console.log('error when sending move', error);
    }
  };

  const handleSelect = (index: number, next: boolean) => {
    setSelected((prev) => {
      const copy = [...prev];
      copy[index] = next;
      return copy;
    });
  };

  return (
    <div className="d-flex justify-content-start align-items-end overflow-auto">
      {board.crown && (
        <div className="crown card rounded-pill bg-danger p-3 m-2 shadow-sm">
          <Emoji emoji="👑" />
        </div>
      )}
      <div className="flex-grow-1 px-2 pb-2 d-flex overflow-hidden">
        {board.hand.map((id, i) => id && (
          <div key={i} className="district-card-wrapper pt-3">
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
      </div>
      {showTmpHand && (
        <div className="bg-secondary d-flex justify-content-start pl-2 py-2 my-n2">
          {board.tmpHand.map((id, i) => id && (
            <DistrictCard
              key={i}
              districtId={id}
              className="mr-2"
              selectable={showTmpHand}
              onSelect={() => chooseCard(id)}
            />
          ))}
        </div>
      )}
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
