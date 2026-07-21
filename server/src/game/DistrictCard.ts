import { DistrictId, districts } from 'citadels-common';
import { CharacterType } from './CharacterManager';

export enum DistrictType {
  NOBLE = 1,
  RELIGIOUS,
  TRADE,
  MILITARY,
  UNIQUE,
}

export default class DistrictCard {
  id: DistrictId;
  type: DistrictType;
  cost: number;
  extraPoints: number;

  constructor(id: DistrictId, type: DistrictType, cost: number, extraPoints: number) {
    this.id = id;
    this.type = type;
    this.cost = cost;
    this.extraPoints = extraPoints;
  }

  static getDistrictTypeFromCharacter(character: CharacterType) {
    switch (character) {
      case CharacterType.KING:
        return DistrictType.NOBLE;
      case CharacterType.BISHOP:
        return DistrictType.RELIGIOUS;
      case CharacterType.MERCHANT:
        return DistrictType.TRADE;
      case CharacterType.WARLORD:
        return DistrictType.MILITARY;
      default:
        return undefined;
    }
  }
}

type DistrictsMap = Map<DistrictId, { card: DistrictCard, count: number }>;

// create districts Map from JSON
export const ALL_DISTRICTS = (Object.keys(districts) as DistrictId[]).reduce(
  (res: DistrictsMap, districtId) => {
    // districts.json uses snake_case keys; only dragon_gate/university carry
    // `extra_points`, and `count` is omitted on single-copy districts. Cast to
    // a permissive shape so the union inferred from JSON doesn't trip TS.
    const raw = districts[districtId as keyof typeof districts] as {
      type: DistrictType;
      cost: number;
      count?: number;
      extra_points?: number;
    };
    // normalize snake_case JSON → camelCase DistrictCard fields so the rest
    // of the engine can use `card.extraPoints` uniformly.
    return res.set(districtId, {
      card: new DistrictCard(
        districtId,
        raw.type,
        raw.cost,
        raw.extra_points ?? 0,
      ),
      count: raw.count ?? 1,
    });
  }, new Map(),
);
