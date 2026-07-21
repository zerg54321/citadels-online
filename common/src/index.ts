import districtsJson from './districts.json';
import type { DistrictId } from './districts';

export const districts = districtsJson;

// View-layer pure functions (framework-agnostic; reusable by future React client)
// Note: view modules import types/enums from index, creating a static import
// cycle. This is safe at runtime because the view functions only reference
// those symbols inside function bodies, by which point index.ts has fully loaded.
// eslint-disable-next-line import/no-cycle
export { computeTeamScores } from './view/teamScores';
// eslint-disable-next-line import/no-cycle
export { getDistrictDestroyPrice } from './view/pricing';
// eslint-disable-next-line import/no-cycle
export { parseClientGameState } from './view/parseGameState';
// eslint-disable-next-line import/no-cycle
export {
  isSpectator,
  getMyTeam,
  getRelation,
  getSeatOrder,
  getTableSlots,
} from './view/boardLayout';
// eslint-disable-next-line import/no-cycle
export type { Relation, TableSlot } from './view/boardLayout';
// eslint-disable-next-line import/no-cycle
export { getStatusBarData } from './view/statusBar';
// eslint-disable-next-line import/no-cycle
export type {
  StatusBarData,
  StatusBarAction,
  StatusBarMessageType,
  GetStatusBarDataOptions,
} from './view/statusBar';

export type PlayerId = string;
export type RoomId = string;
export { DistrictId };

export enum GameProgress {
  IN_LOBBY = 1,
  IN_GAME,
  FINISHED,
}

/** competitive_team6 = 6p forced 3v3; casual = all other games */
export enum GameMode {
  CASUAL = 1,
  COMPETITIVE_TEAM6 = 2,
}

/** Team A = seats 0,2,4; Team B = seats 1,3,5 in playerOrder */
export enum TeamId {
  NONE = 0,
  A = 1,
  B = 2,
}

export enum MatchResult {
  NONE = 0,
  TEAM_A_WIN = 1,
  TEAM_B_WIN = 2,
  DRAW = 3,
  /** casual / non-team: no team winner */
  CASUAL_END = 4,
}

export enum PlayerRole {
  SPECTATOR = 1,
  PLAYER,
}

export enum GamePhase {
  INITIAL = 0,
  CHOOSE_CHARACTERS,
  DO_ACTIONS,
}

export enum CharacterChoosingStateType {
  INITIAL = 0,
  PUT_ASIDE_FACE_UP,
  PUT_ASIDE_FACE_DOWN,
  PUT_ASIDE_FACE_DOWN_UP,
  CHOOSE_CHARACTER,
  GET_ASIDE_FACE_DOWN,
  DONE,
}

export enum CharacterType {
  NONE = -1,
  ASSASSIN = 0,
  THIEF,
  MAGICIAN,
  KING,
  BISHOP,
  MERCHANT,
  ARCHITECT,
  WARLORD,
  CHARACTER_COUNT,
}

export enum PlayerPosition {
  SPECTATOR = -1,
  PLAYER_1,
  PLAYER_2,
  PLAYER_3,
  PLAYER_4,
  PLAYER_5,
  PLAYER_6,
  PLAYER_7,
}

export enum ClientTurnState {
  INITIAL = 0,
  TAKE_RESOURCES,
  CHOOSE_CARD,
  CHOOSE_ACTION,
  ASSASSIN_KILL,
  THIEF_ROB,
  MAGICIAN_EXCHANGE_HAND,
  MAGICIAN_DISCARD_CARDS,
  MERCHANT_TAKE_1_GOLD,
  ARCHITECT_DRAW_2_CARDS,
  WARLORD_DESTROY_DISTRICT,
  GRAVEYARD_RECOVER_DISTRICT,
  LABORATORY_DISCARD_CARD,
  BUILD_DISTRICT,
  DONE,
}

export interface PlayerScore {
  base?: number
  extraPointsStash?: number
  extraPointsHand?: number
  extraPointsDistrictTypes?: number
  extraPointsCompleteCity?: number
  total?: number
}

export type PlayerBoard = {
  stash: number
  hand: (DistrictId | null)[]
  tmpHand: (DistrictId | null)[]
  city: DistrictId[]
  score: PlayerScore
  characters: {
    id: CharacterType
  }[]
};

export type PlayerExtraData = {
  districtsToBuild: number
  canTakeEarnings: boolean
  canDoSpecialAction: boolean
  hasUsedLaboratory: boolean
  hasUsedSmithy: boolean
  earningsValue: number
};

export type TeamScores = {
  [TeamId.A]?: number
  [TeamId.B]?: number
};

export type ClientGameState = {
  progress: GameProgress
  gameMode: GameMode
  players: Record<PlayerId, {
    id: PlayerId
    username: string
    manager: boolean
    online: boolean
    role: PlayerRole
    userId?: string
    team: TeamId
    isAi?: boolean
    /** player is in autoplay / hosted mode */
    isAutoplay?: boolean
    hadEffectiveAiControl?: boolean
  }>
  self: PlayerId
  board: {
    players: Record<PlayerId, PlayerBoard>
    gamePhase: GamePhase
    turnState: ClientTurnState
    playerOrder: PlayerId[],
    currentPlayer: PlayerPosition,
    currentPlayerExtraData: PlayerExtraData
    characters: {
      state: {
        type: CharacterChoosingStateType
        player: PlayerPosition
      }
      current: CharacterType
      callable: {
        id: CharacterType
        killed: boolean
        robbed: boolean
      }[]
      aside: {
        id: CharacterType
      }[]
    }
    graveyard: DistrictId | undefined
  }
  settings: {
    completeCitySize: number
    /** action time limit in seconds (P4) */
    actionTimeoutSeconds: number
  }
  /** epoch ms when current actor's turn expires; null if none */
  turnDeadlineAt?: number | null
  /** set when progress is FINISHED (and for competitive during end) */
  teamScores?: { A: number; B: number }
  matchResult?: MatchResult
  /** last completed action-round summary (kill/rob/city snapshot) */
  lastRoundSummary?: string | null
  /** lobby seat order for 3v3 team preview */
  lobbyPlayerOrder?: PlayerId[]
  /** recent human-readable action feed for UI log */
  actionFeed?: Array<{ text: string; kind?: string }>
};

export type GameSetupData = {
  players: PlayerId[]
  completeCitySize: number
  /** action time limit seconds; default 120; clamp 10–180 (10 for tests) */
  actionTimeoutSeconds?: number
};

export enum MoveType {
  AUTO = 0,

  CHOOSE_CHARACTER,

  TAKE_GOLD,
  DRAW_CARDS,

  ASSASSIN_KILL,
  THIEF_ROB,
  MAGICIAN_EXCHANGE_HAND,
  MAGICIAN_DISCARD_CARDS,
  TAKE_GOLD_EARNINGS,
  MERCHANT_TAKE_1_GOLD,
  ARCHITECT_DRAW_2_CARDS,
  WARLORD_DESTROY_DISTRICT,

  GRAVEYARD_RECOVER_DISTRICT,
  SMITHY_DRAW_CARDS,
  LABORATORY_DISCARD_CARD,

  DECLINE,
  BUILD_DISTRICT,
  FINISH_TURN,
}

export interface Move {
  type: MoveType
  data?: any
}
