import { useMemo } from 'react';
import { districts, type DistrictId } from 'citadels-common';
import DistrictCard from '@/components/game/elements/DistrictCard';

// Mirrors Vue CardsPreview.vue — shows every district card in both sizes.
export default function CardsPreview() {
  const cards = useMemo(() => Object.keys(districts) as DistrictId[], []);

  return (
    <div className="container-lg d-flex justify-content-center flex-wrap">
      {cards.map((card) => (
        <DistrictCard key={card} districtId={card} className="m-1" />
      ))}
      <div className="w-100" />
      {cards.map((card) => (
        <DistrictCard key={card} districtId={card} className="m-1" small />
      ))}
    </div>
  );
}
