import { DistrictId } from 'citadels-common';

export type PlayerName = string;
export type PlayerId = string;

export enum EnginePhase {
  SETUP = 'setup',
  CHARACTER_SELECTION = 'character_selection',
  ACTIONS = 'actions',
  FINISHED = 'finished',
}

export enum EngineActionType {
  CHOOSE_CHARACTER = 'choose_character',
  TAKE_GOLD = 'take_gold',
  DRAW_CARDS = 'draw_cards',
  TAKE_GOLD_EARNINGS = 'take_gold_earnings',
  BUILD_DISTRICT = 'build_district',
  ASSASSIN_KILL = 'assassin_kill',
  THIEF_ROB = 'thief_rob',
  MAGICIAN_EXCHANGE_HAND = 'magician_exchange_hand',
  MAGICIAN_DISCARD_CARDS = 'magician_discard_cards',
  MERCHANT_TAKE_1_GOLD = 'merchant_take_1_gold',
  ARCHITECT_DRAW_2_CARDS = 'architect_draw_2_cards',
  WARLORD_DESTROY_DISTRICT = 'warlord_destroy_district',
  GRAVEYARD_RECOVER_DISTRICT = 'graveyard_recover_district',
  SMITHY_DRAW_CARDS = 'smithy_draw_cards',
  LABORATORY_DISCARD_CARD = 'laboratory_discard_card',
  DECLINE = 'decline',
  FINISH_TURN = 'finish_turn',
}

export type EngineAction = {
  type: EngineActionType;
  playerId?: PlayerId;
  data?: unknown;
};

export type EngineObservation = {
  phase: EnginePhase;
  currentPlayerId: PlayerId | null;
  players: Array<{
    id: PlayerId;
    name: string;
    team: 'A' | 'B';
    stash: number;
    hand: DistrictId[];
    handCount: number;
    city: DistrictId[];
    citySize: number;
    complete: boolean;
    characters: number[];
    hasCrown: boolean;
  }>;
  deckCount: number;
  graveyard?: DistrictId;
  currentCharacter?: string;
  currentCharacterId?: number;
  turnState?: string;
  killedCharacterId?: number;
  killedCharacterName?: string;
  robbedCharacterId?: number;
  robbedCharacterName?: string;
  crownPlayerId?: string | null;
  legalActions: EngineAction[];
};

export type EngineResult = {
  ok: boolean;
  message?: string;
  observation?: EngineObservation;
};
