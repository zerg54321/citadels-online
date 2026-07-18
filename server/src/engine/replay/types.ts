/** Full table snapshot after an action (training/replay: hands visible) */
export type ReplayPlayerFrame = {
  id: string;
  name: string;
  team: 'A' | 'B';
  stash: number;
  hand: string[];
  handCount: number;
  city: string[];
  citySize: number;
  complete: boolean;
  /** character ids held this major round (0-based CharacterType), may be empty during selection */
  characters: number[];
  hasCrown: boolean;
};

export type ReplayFrame = {
  players: ReplayPlayerFrame[];
  deckCount: number;
  graveyard?: string;
  killedCharacter?: number;
  killedCharacterName?: string;
  robbedCharacter?: number;
  robbedCharacterName?: string;
  crownPlayerId?: string | null;
  phase: string;
  currentCharacter?: number;
  currentCharacterName?: string;
  currentPlayerId?: string | null;
};

export type ReplayEventTarget = {
  /** character id (1-based client style or 0-based) */
  characterId?: number;
  characterName?: string;
  /** seat index / player id for magician exchange / warlord */
  playerId?: string;
  playerName?: string;
  playerIndex?: number;
  card?: string;
};

export type ReplayEvent = {
  /** global step index */
  step: number;
  /** order within major round */
  order: number;
  phase: string;
  type: string;
  summary: string;
  detail: string;
  playerId: string | null;
  playerName?: string;
  /** 0-based CharacterType when in actions */
  characterId?: number;
  characterName?: string;
  /** raw action payload */
  data?: unknown;
  targets?: ReplayEventTarget[];
  deltas: {
    gold: number;
    hand: number;
    cityAdded: string[];
    cityRemoved: string[];
  };
  /** full table after this event */
  frameAfter: ReplayFrame;
};

/** One character's action block inside a major round */
export type ReplayCharacterBlock = {
  characterId: number;
  characterName: string;
  playerId: string | null;
  playerName: string;
  killed: boolean;
  eventOrders: number[];
};

/** One major round = character selection + all character turns */
export type ReplayMajorRound = {
  round: number;
  title: string;
  summary: string;
  frameStart: ReplayFrame;
  frameEnd: ReplayFrame;
  /** selection + action events in order */
  events: ReplayEvent[];
  /** playable characters in call order (skip killed may still appear as killed:true) */
  characterBlocks: ReplayCharacterBlock[];
};

export type ReplayRecord = {
  createdAt: string;
  version: 2;
  players: string[];
  teamMap: Record<string, 'A' | 'B'>;
  summary?: string;
  finished: boolean;
  maxCity: number;
  teamScores?: { A: number; B: number };
  matchResult?: number;
  /** major rounds (pages) */
  rounds: ReplayMajorRound[];
  /** flat steps for debugging */
  steps?: Array<{
    step: number;
    phase: string;
    type: string;
    playerId?: string | null;
  }>;
};
