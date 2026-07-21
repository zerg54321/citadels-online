import {
  CharacterType,
  CharacterChoosingStateType as CCST,
  ClientGameState,
  ClientTurnState,
  DistrictId,
  GameMode,
  GamePhase,
  GameProgress,
  MatchResult,
  PlayerId,
  PlayerPosition,
  PlayerRole,
  PlayerScore,
  TeamId,
  type PlayerBoard,
  type PlayerExtraData,
} from 'citadels-common';

/**
 * Mock ClientGameState for the /preview dev route. 6-player 3v3 competitive
 * game mid-action-phase, with self (p1) as the current King. Rich enough to
 * render every migrated component: team score bar, turn order, 5 opponent
 * seats + self strip, center character grid, player hand/city, action log,
 * action panel with countdown. Delete this file when RoomEntry/Lobby are
 * migrated and the full flow can reach BoardScreen with a live backend.
 */

const PIDS: PlayerId[] = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];
const NAMES = ['你', '赵云', '诸葛亮', '司马懿', '关羽', '张飞'];

function makeBoard(opts: Partial<PlayerBoard> = {}): PlayerBoard {
  return {
    stash: 3,
    hand: ['tavern', 'market'],
    tmpHand: [],
    city: ['manor'],
    score: { base: 1, total: 3 } as PlayerScore,
    characters: [{ id: CharacterType.NONE }],
    ...opts,
  };
}

const EMPTY_EXTRA: PlayerExtraData = {
  districtsToBuild: 0,
  canTakeEarnings: true,
  canDoSpecialAction: false,
  hasUsedLaboratory: false,
  hasUsedSmithy: false,
  earningsValue: 1,
};

export const mockGameState: ClientGameState = {
  progress: GameProgress.IN_GAME,
  gameMode: GameMode.COMPETITIVE_TEAM6,
  players: Object.fromEntries(
    PIDS.map((id, i) => [
      id,
      {
        id,
        username: NAMES[i],
        manager: i === 0,
        online: true,
        role: PlayerRole.PLAYER,
        team: i % 2 === 0 ? TeamId.A : TeamId.B,
        isAi: i >= 4,
      },
    ]),
  ) as ClientGameState['players'],
  self: 'p1',
  board: {
    players: {
      p1: makeBoard({
        stash: 5,
        hand: ['tavern', 'market', 'watchtower', 'temple', 'dragon_gate'],
        city: ['manor', 'castle', 'church'],
        score: { base: 5, extraPointsDistrictTypes: 2, total: 7 } as PlayerScore,
        characters: [{ id: CharacterType.KING }],
      }),
      p2: makeBoard({
        stash: 2,
        hand: ['docks', 'prison'],
        city: ['trading_post', 'harbor'],
        score: { base: 4, total: 4 } as PlayerScore,
        characters: [{ id: CharacterType.NONE }],
      }),
      p3: makeBoard({
        stash: 7,
        hand: ['monastery', 'keep'],
        city: ['palace', 'cathedral', 'watchtower'],
        score: { base: 7, extraPointsCompleteCity: 2, total: 9 } as PlayerScore,
        characters: [{ id: CharacterType.ARCHITECT }],
      }),
      p4: makeBoard({
        stash: 1,
        hand: ['barracks'],
        city: ['tavern'],
        score: { base: 1, total: 1 } as PlayerScore,
        characters: [{ id: CharacterType.NONE }],
      }),
      p5: makeBoard({
        stash: 4,
        hand: ['smithy', 'library', 'observatory'],
        city: ['market', 'town_hall'],
        score: { base: 4, total: 4 } as PlayerScore,
        characters: [{ id: CharacterType.NONE }],
      }),
      p6: makeBoard({
        stash: 6,
        hand: ['fortress', 'great_wall'],
        city: ['temple', 'monastery'],
        score: { base: 5, total: 5 } as PlayerScore,
        characters: [{ id: CharacterType.NONE }],
      }),
    } as ClientGameState['board']['players'],
    gamePhase: GamePhase.DO_ACTIONS,
    turnState: ClientTurnState.TAKE_RESOURCES,
    playerOrder: PIDS,
    currentPlayer: PlayerPosition.PLAYER_1,
    currentPlayerExtraData: EMPTY_EXTRA,
    characters: {
      state: { type: CCST.DONE, player: PlayerPosition.PLAYER_1 },
      current: CharacterType.KING,
      callable: [
        { id: CharacterType.ASSASSIN, killed: false, robbed: false },
        { id: CharacterType.THIEF, killed: false, robbed: false },
        { id: CharacterType.MAGICIAN, killed: false, robbed: false },
        { id: CharacterType.KING, killed: false, robbed: false },
        { id: CharacterType.BISHOP, killed: true, robbed: false },
        { id: CharacterType.MERCHANT, killed: false, robbed: true },
        { id: CharacterType.ARCHITECT, killed: false, robbed: false },
        { id: CharacterType.WARLORD, killed: false, robbed: false },
      ],
      aside: [{ id: CharacterType.NONE }],
    },
    graveyard: 'watchtower' as DistrictId,
  },
  settings: {
    completeCitySize: 8,
    actionTimeoutSeconds: 120,
  },
  turnDeadlineAt: Date.now() + 95000,
  actionFeed: [
    { text: '游戏开始', kind: 'info' },
    { text: '你选择了国王', kind: 'info' },
    { text: '诸葛亮 刺杀了 主教 💀', kind: 'kill' },
    { text: '关羽 偷取了 商人 💰', kind: 'rob' },
    { text: '你 收取了 2 金币', kind: 'info' },
    { text: '赵云 建造了 港口', kind: 'info' },
  ],
  matchResult: MatchResult.NONE,
  lastRoundSummary: null,
};
