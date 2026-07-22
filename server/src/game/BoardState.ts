import {
  DistrictId, GamePhase, PlayerId, PlayerPosition,
} from 'citadels-common';
import CharacterManager, { TurnState } from './CharacterManager';
import DistrictsDeck from './DistrictsDeck';
import PlayerBoardState from './PlayerBoardState';

export default class BoardState {
  // player city, hand and stash
  players: Map<PlayerId, PlayerBoardState>;

  // player order, first player has the crown
  playerOrder: Array<PlayerId>;

  // character manager
  characterManager: CharacterManager;

  // current game phase
  gamePhase: GamePhase;

  // district cards deck
  districtsDeck: DistrictsDeck;

  // graveyard (1 card)
  graveyard: DistrictId | undefined;

  // 初始选牌队列（每人二选一后进入选角阶段）
  initialCardSelectionQueue: PlayerId[];
  initialCardSelectionIndex: number;

  constructor(players: PlayerId[]) {
    this.players = new Map();
    this.playerOrder = [...players];
    this.characterManager = new CharacterManager(players.length);
    this.gamePhase = GamePhase.INITIAL;
    this.districtsDeck = new DistrictsDeck();
    this.initialCardSelectionQueue = [];
    this.initialCardSelectionIndex = 0;

    // 初始每人 2 金币 + 抽 2 张到 tmpHand（二选一）
    // 选完后保留的手牌移入 hand，弃牌放回牌库底
    players.forEach((playerId) => {
      this.players.set(playerId, new PlayerBoardState(2, this.districtsDeck.drawCards(2)));
      // PlayerBoardState 构造后，tmpHand 和 hand 是引用——drawCards(2) 返回的数组即 hand,
      // 需要把 hand 中的牌转存到 tmpHand，让 hand 为空
      const p = this.players.get(playerId)!;
      p.tmpHand = [...p.hand]; // 拷贝到 tmpHand
      p.hand = []; // 选完再移入 hand
    });

    this.initialCardSelectionQueue = [...players];
  }

  exportForPlayer(destPlayerId: PlayerId) {
    // whether the player can see all hands
    const destPlayerPos = this.playerOrder.indexOf(destPlayerId) as PlayerPosition;
    const seesAll = destPlayerPos === PlayerPosition.SPECTATOR;

    return {
      players: Object.fromEntries(
        Array.from(this.players).map((elem) => {
          const playerId = elem[0];
          const board = elem[1];
          const canSeeHand = seesAll || playerId === destPlayerId;
          const otherPlayerPos = this.playerOrder.indexOf(playerId) as PlayerPosition;
          return [playerId, {
            ...board.exportForPlayer(canSeeHand),
            characters: this.characterManager.exportPlayerCharacters(otherPlayerPos, destPlayerPos),
          }];
        }),
      ),
      gamePhase: this.gamePhase,
      turnState: this.characterManager.getClientTurnState(),
      playerOrder: this.playerOrder,
      currentPlayer: this.getCurrentPlayerPosition(),
      currentPlayerExtraData: {
        ...this.characterManager.exportCurrentPlayerExtraData(),
        earningsValue: this.players
          .get(this.getCurrentPlayerId())
          ?.computeEarningsForCharacter(this.characterManager.getCurrentCharacter()) ?? 0,
      },
      characters: this.characterManager.exportCharactersList(destPlayerPos),
      graveyard: this.graveyard,
    };
  }

  // current player (index of playerOrder)
  getCurrentPlayerPosition(): PlayerPosition {
    switch (this.gamePhase) {
      case GamePhase.INITIAL:
        // 初始二选一手牌阶段
        if (this.initialCardSelectionQueue.length > 0
            && this.initialCardSelectionIndex < this.initialCardSelectionQueue.length) {
          return this.playerOrder.indexOf(this.initialCardSelectionQueue[this.initialCardSelectionIndex]);
        }
        return PlayerPosition.SPECTATOR;
      case GamePhase.CHOOSE_CHARACTERS:
        return this.characterManager.choosingState.getState().player;
      case GamePhase.DO_ACTIONS:
        if (this.characterManager.turnState === TurnState.GRAVEYARD_RECOVER_DISTRICT) {
          // get player with graveyard
          const playerBoardEntry = [...this.players].find((p) => p[1].city.includes('graveyard'));
          if (playerBoardEntry !== undefined) {
            return this.playerOrder.indexOf(playerBoardEntry[0]);
          }
        }
        return this.characterManager.getCurrentPlayerPosition();

      default:
    }
    return PlayerPosition.SPECTATOR;
  }

  getCurrentPlayerId(): PlayerId {
    const pos = this.getCurrentPlayerPosition();
    if (pos < 0 || pos >= this.playerOrder.length) {
      return '' as PlayerId;
    }
    return this.playerOrder[pos];
  }
}
