import Debug from 'debug';
import {
  Move,
  MoveType,
  ClientTurnState,
  CharacterType,
  PlayerPosition,
  DistrictId,
} from 'citadels-common';
import type GameState from './GameState';
import { CharacterPosition, TurnState } from './CharacterManager';
import { roleNameZh, districtLabelZh, playerName } from './ActionLogger';

const debug = Debug('citadels-server');

export default class ActionExecutor {
  constructor(private state: GameState) {}

  decline(): boolean {
    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;

    if (cm.isUsingLaboratory) {
      cm.isUsingLaboratory = false;
      return true;
    }

    switch (cm.getClientTurnState()) {
      case ClientTurnState.ASSASSIN_KILL:
        cm.canDoSpecialAction[CharacterType.ASSASSIN] = false;
        break;
      case ClientTurnState.THIEF_ROB:
        cm.canDoSpecialAction[CharacterType.THIEF] = false;
        break;
      case ClientTurnState.MAGICIAN_EXCHANGE_HAND:
      case ClientTurnState.MAGICIAN_DISCARD_CARDS:
        cm.canDoSpecialAction[CharacterType.MAGICIAN] = false;
        break;
      case ClientTurnState.WARLORD_DESTROY_DISTRICT:
        cm.canDoSpecialAction[CharacterType.WARLORD] = false;
        break;
      case ClientTurnState.BUILD_DISTRICT:
      case ClientTurnState.GRAVEYARD_RECOVER_DISTRICT:
        break;
      case ClientTurnState.MERCHANT_TAKE_1_GOLD:
        cm.canDoSpecialAction[CharacterType.MERCHANT] = false;
        break;
      case ClientTurnState.ARCHITECT_DRAW_2_CARDS:
        cm.canDoSpecialAction[CharacterType.ARCHITECT] = false;
        break;

      default:
        return false;
    }

    cm.jumpToActionsState();
    return true;
  }

  doSpecialAction(move: Move): boolean {
    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return false;

    switch (cm.getClientTurnState()) {
      case ClientTurnState.TAKE_RESOURCES:
      case ClientTurnState.CHOOSE_ACTION:
        switch (move.type) {
          case MoveType.SMITHY_DRAW_CARDS:
            if (cm.hasUsedSmithy) {
              return false;
            }
            if (!player.city.includes('smithy')) {
              return false;
            }
            if (player.stash < 2) {
              return false;
            }
            player.stash -= 2;
            player.addCardsToHand(this.state.board.districtsDeck.drawCards(3));
            cm.hasUsedSmithy = true;
            break;

          case MoveType.LABORATORY_DISCARD_CARD:
            if (cm.hasUsedLaboratory || !player.city.includes('laboratory')) {
              return false;
            }
            cm.isUsingLaboratory = true;
            break;

          default:
            return false;
        }
        break;

      case ClientTurnState.LABORATORY_DISCARD_CARD:
      {
        if (move.type !== MoveType.LABORATORY_DISCARD_CARD) {
          return false;
        }
        if (!cm.isUsingLaboratory) {
          return false;
        }
        const card = move.data;
        if (player.takeCardFromHand(card) === null) {
          return false;
        }
        this.state.board.districtsDeck.discardCards(card);
        player.stash += 2;
        cm.isUsingLaboratory = false;
        cm.hasUsedLaboratory = true;
        break;
      }

      default:
        return false;
    }

    return true;
  }

  gatherResources(move: Move): boolean {
    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    if (cm.hasTakenResources) return false;
    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return false;

    this.autoCollectEarningsIfPending(player, cm);

    switch (move.type) {
      case MoveType.TAKE_GOLD:
        player.stash += 2;
        cm.goldFromResourcesThisTurn = 2;
        cm.hasTakenResources = true;
        break;

      case MoveType.DRAW_CARDS:
        {
          const hasObservatory = player.city.includes('observatory');
          const hasLibrary = player.city.includes('library');
          const cards = this.state.board.districtsDeck.drawCards(hasObservatory ? 3 : 2);

          if (cards.length === 0) {
            cm.hasTakenResources = true;
            break;
          }

          if (hasLibrary) {
            player.addCardsToHand(cards);
            cm.hasTakenResources = true;
          } else if (cards.length === 1) {
            player.addCardsToHand(cards);
            cm.hasTakenResources = true;
          } else {
            player.tmpHand = cards;
            cm.turnState += 1;
          }
        }
        break;

      default:
        return false;
    }

    return true;
  }

  autoCollectEarningsIfPending(
    player: { stash: number; computeEarningsForCharacter: (c: CharacterType) => number },
    cm: { canTakeEarnings: boolean[]; getCurrentCharacter: () => CharacterType },
  ) {
    const character = cm.getCurrentCharacter();
    if (!cm.canTakeEarnings[character]) return;
    const amount = player.computeEarningsForCharacter(character);
    if (amount > 0) {
      player.stash += amount; // eslint-disable-line no-param-reassign
      const actorId = this.state.board?.getCurrentPlayerId();
      if (actorId) {
        this.state.pushAction(
          `${playerName(this.state.players, actorId)} 自动收租 +${amount} 金`,
          'earn',
        );
      }
    }
    cm.canTakeEarnings[character] = false; // eslint-disable-line no-param-reassign
  }

  chooseDistrictCard(move: Move): boolean {
    if (move.type !== MoveType.DRAW_CARDS) return false;

    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return false;

    const index = player.tmpHand.indexOf(move.data);
    if (index !== -1) {
      player.addCardsToHand([move.data]);
      player.tmpHand.splice(index, 1);
    }

    this.state.board.districtsDeck.discardCards(player.tmpHand);
    player.tmpHand = [];

    cm.hasTakenResources = true;
    cm.jumpToActionsState();

    return true;
  }

  buildDistrict(move: Move) {
    if (move.type !== MoveType.BUILD_DISTRICT) return false;

    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return false;

    if (cm.districtsToBuild[cm.getCurrentCharacter()] < 1) {
      return false;
    }

    if (!player.buildDistrict(move.data)) {
      return false;
    }

    {
      const actorId = this.state.board.getCurrentPlayerId();
      this.state.pushAction(
        `${playerName(this.state.players, actorId)} 建造了 ${districtLabelZh(String(move.data))}`,
        'build',
      );
    }

    cm.districtsToBuild[cm.getCurrentCharacter()] -= 1;

    if (move.data === 'haunted_quarter' && this.state.cityCompletedThisMatch) {
      player.hauntedQuarterBuiltInFinalRound = true;
    }

    if (player.city.length >= this.state.completeCitySize
        && !player.firstToCompleteCity
        && !player.sameTurnCompleteCity) {
      if (!this.state.cityCompletedThisMatch) {
        player.firstToCompleteCity = true;
        this.state.cityCompletedThisMatch = true;
        this.state.cityCompletedThisTurnPhase = true;
      } else if (this.state.cityCompletedThisTurnPhase) {
        player.sameTurnCompleteCity = true;
      } else {
        player.sameTurnCompleteCity = true;
      }
    }

    cm.jumpToActionsState();

    return true;
  }

  executeAction(move: Move): boolean {
    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return false;

    switch (move.type) {
      case MoveType.TAKE_GOLD:
      case MoveType.DRAW_CARDS:
        if (cm.getClientTurnState() !== ClientTurnState.TAKE_RESOURCES) return false;
        return this.gatherResources(move);

      case MoveType.BUILD_DISTRICT:
        if (cm.getClientTurnState() !== ClientTurnState.CHOOSE_ACTION
            && cm.getClientTurnState() !== ClientTurnState.TAKE_RESOURCES) {
          return false;
        }
        cm.jumpToBuildState();
        break;
      case MoveType.ASSASSIN_KILL:
        cm.turnState = TurnState.ASSASSIN_KILL;
        break;
      case MoveType.THIEF_ROB:
        cm.turnState = TurnState.THIEF_ROB;
        break;
      case MoveType.MAGICIAN_EXCHANGE_HAND:
        cm.turnState = TurnState.MAGICIAN_EXCHANGE_HAND;
        break;
      case MoveType.MAGICIAN_DISCARD_CARDS:
        cm.turnState = TurnState.MAGICIAN_DISCARD_CARDS;
        break;
      case MoveType.WARLORD_DESTROY_DISTRICT:
        cm.turnState = TurnState.WARLORD_DESTROY_DISTRICT;
        break;

      case MoveType.TAKE_GOLD_EARNINGS:
        if (cm.hasTakenResources) {
          return false;
        }
        if (!cm.canTakeEarnings[cm.getCurrentCharacter()]) {
          return false;
        }
        {
          const amount = player.computeEarningsForCharacter(cm.getCurrentCharacter());
          player.stash += amount;
          if (amount > 0) {
            this.state.pushAction(
              `${playerName(this.state.players, this.state.board.getCurrentPlayerId())} 收租 +${amount} 金`,
              'earn',
            );
          }
        }
        cm.canTakeEarnings[cm.getCurrentCharacter()] = false;
        break;
      case MoveType.MERCHANT_TAKE_1_GOLD:
      case MoveType.ARCHITECT_DRAW_2_CARDS:
        return false;

      default:
        return false;
    }

    return true;
  }

  killCharacter(move: Move) {
    if (move.type !== MoveType.ASSASSIN_KILL) return false;

    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const character = move.data - 1 as CharacterType;

    debug('kill', move.data ? CharacterType[character] : undefined);

    switch (character) {
      case CharacterType.THIEF:
      case CharacterType.MAGICIAN:
      case CharacterType.KING:
      case CharacterType.BISHOP:
      case CharacterType.MERCHANT:
      case CharacterType.ARCHITECT:
      case CharacterType.WARLORD:
        cm.killedCharacter = character;
        if (cm.robbedCharacter === character) {
          cm.robbedCharacter = CharacterType.NONE;
        }
        this.state.pushAction(`刺杀标记：${roleNameZh(character)}（持有者到其顺位再揭示）`, 'kill');
        cm.canDoSpecialAction[CharacterType.ASSASSIN] = false;
        cm.jumpToActionsState();
        return true;

      default:
        return false;
    }
  }

  robCharacter(move: Move) {
    if (move.type !== MoveType.THIEF_ROB) return false;

    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const character = move.data - 1 as CharacterType;

    debug('rob', move.data ? CharacterType[character] : undefined);

    if (character === cm.killedCharacter) {
      return false;
    }

    switch (character) {
      case CharacterType.MAGICIAN:
      case CharacterType.KING:
      case CharacterType.BISHOP:
      case CharacterType.MERCHANT:
      case CharacterType.ARCHITECT:
      case CharacterType.WARLORD:
        cm.robbedCharacter = character;
        this.state.pushAction(`偷窃标记：${roleNameZh(character)}（行动时夺金）`, 'rob');
        cm.canDoSpecialAction[CharacterType.THIEF] = false;
        cm.jumpToActionsState();
        return true;

      default:
        return false;
    }
  }

  moveRobbedGold() {
    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const robbedRole = cm.robbedCharacter;
    if (robbedRole < 0 || robbedRole === CharacterType.NONE) return false;

    const thiefPos = cm.characters[CharacterType.THIEF];
    const robbedPos = cm.characters[robbedRole];
    if (thiefPos < CharacterPosition.PLAYER_1 || robbedPos < CharacterPosition.PLAYER_1) {
      debug('moveRobbedGold: role not seated', {
        thiefPos, robbedPos, robbedRole, current: cm.getCurrentCharacter(),
      });
      return false;
    }

    const thiefId = this.state.board.playerOrder[thiefPos - CharacterPosition.PLAYER_1];
    const robbedPlayerId = this.state.board.playerOrder[robbedPos - CharacterPosition.PLAYER_1];
    if (!thiefId || !robbedPlayerId) return false;

    const thiefPlayer = this.state.board.players.get(thiefId);
    const robbedPlayer = this.state.board.players.get(robbedPlayerId);
    if (!thiefPlayer || !robbedPlayer) return false;

    if (thiefId !== robbedPlayerId) {
      const amount = robbedPlayer.stash;
      if (amount > 0) {
        thiefPlayer.stash += amount;
        robbedPlayer.stash = 0;
        this.state.pushAction(
          `${playerName(this.state.players, robbedPlayerId)} 的${roleNameZh(robbedRole)}被偷窃，${amount} 金币转移到 ${playerName(this.state.players, thiefId)}`,
          'rob',
        );
      } else {
        this.state.pushAction(
          `${playerName(this.state.players, robbedPlayerId)} 的${roleNameZh(robbedRole)}被偷窃，但没有金币`,
          'rob',
        );
      }
    }

    cm.robbedCharacter = CharacterType.NONE;
    return true;
  }

  exchangeHand(move: Move) {
    if (move.type !== MoveType.MAGICIAN_EXCHANGE_HAND) return false;

    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return false;
    const otherPlayer = this.state.board.players.get(this.state.board.playerOrder[move.data]);
    if (otherPlayer === undefined) return false;

    [player.hand, otherPlayer.hand] = [otherPlayer.hand, player.hand];
    cm.canDoSpecialAction[CharacterType.MAGICIAN] = false;
    cm.jumpToActionsState();
    return true;
  }

  discardCards(move: Move) {
    if (move.type !== MoveType.MAGICIAN_DISCARD_CARDS) return false;
    if (!Array.isArray(move.data)) {
      return false;
    }

    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return false;

    if (!cm.canDoSpecialAction[CharacterType.MAGICIAN]) {
      return false;
    }

    const cards: DistrictId[] = [];
    move.data.forEach((card) => {
      if (player.takeCardFromHand(card) !== null) {
        cards.push(card);
      }
    });
    this.state.board.districtsDeck.discardCards(cards);

    player.addCardsToHand(this.state.board.districtsDeck.drawCards(cards.length));

    cm.canDoSpecialAction[CharacterType.MAGICIAN] = false;
    cm.jumpToActionsState();
    return true;
  }

  takeOneGold(move: Move) {
    if (move.type !== MoveType.MERCHANT_TAKE_1_GOLD) return false;
    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return false;

    if (!cm.canDoSpecialAction[CharacterType.MERCHANT]) {
      return false;
    }

    player.stash += 1;

    cm.canDoSpecialAction[CharacterType.MERCHANT] = false;
    cm.jumpToActionsState();
    return true;
  }

  drawTwoCards(move: Move) {
    if (move.type !== MoveType.ARCHITECT_DRAW_2_CARDS) return false;
    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return false;

    if (!cm.canDoSpecialAction[CharacterType.ARCHITECT]) {
      return false;
    }

    player.addCardsToHand(this.state.board.districtsDeck.drawCards(2));

    cm.canDoSpecialAction[CharacterType.ARCHITECT] = false;
    cm.jumpToActionsState();
    return true;
  }

  destroyDistrict(move: Move) {
    if (move.type !== MoveType.WARLORD_DESTROY_DISTRICT) return false;
    const data = {
      player: move.data?.player as PlayerPosition,
      card: move.data?.card as DistrictId,
    };

    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return false;
    const otherPlayer = this.state.board.players.get(this.state.board.playerOrder[data.player]);
    if (otherPlayer === undefined) return false;

    if (!cm.canDoSpecialAction[CharacterType.WARLORD]) {
      return false;
    }

    if (data.card === 'keep' || !otherPlayer.hasCardInCity(data.card)) {
      return false;
    }

    const isOtherPlayerBishop = (
      cm.characters[CharacterType.BISHOP] === data.player + CharacterPosition.PLAYER_1
    );
    if (isOtherPlayerBishop && cm.killedCharacter !== CharacterType.BISHOP) {
      return false;
    }

    if (otherPlayer.city.length >= this.state.completeCitySize) {
      return false;
    }

    const cost = otherPlayer.computeDestroyCost(data.card);
    const spendableGold = player.stash - cm.goldFromResourcesThisTurn;
    if (spendableGold < cost) {
      return false;
    }

    player.stash -= cost;
    otherPlayer.destroyDistrict(data.card);
    this.state.board.graveyard = data.card;

    {
      const actorId = this.state.board.getCurrentPlayerId();
      const victimId = this.state.board.playerOrder[data.player];
      this.state.pushAction(
        `${playerName(this.state.players, actorId)} 拆毁了 ${playerName(this.state.players, victimId)} 的 ${districtLabelZh(data.card)}`,
        'destroy',
      );
    }

    cm.canDoSpecialAction[CharacterType.WARLORD] = false;

    if (this.canRecoverFromGraveyard()) {
      cm.turnState = TurnState.GRAVEYARD_RECOVER_DISTRICT;
    } else {
      cm.jumpToActionsState();
    }

    return true;
  }

  canRecoverFromGraveyard() {
    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;

    const playerBoardEntry = [...this.state.board.players].find((p) => p[1].city.includes('graveyard'));

    if (playerBoardEntry === undefined) {
      return false;
    }

    const [playerId, playerBoard] = playerBoardEntry;

    if (playerBoard.stash < 1) {
      return false;
    }

    if (cm.characters[CharacterType.WARLORD]
        === this.state.board.playerOrder.indexOf(playerId) + CharacterPosition.PLAYER_1) {
      return false;
    }

    return true;
  }

  recoverFromGraveyard(move: Move) {
    if (move.type !== MoveType.GRAVEYARD_RECOVER_DISTRICT) return false;

    if (!this.state.board) return false;
    const cm = this.state.board.characterManager;
    const player = this.state.board.players.get(this.state.board.getCurrentPlayerId());
    if (player === undefined) return false;

    if (this.state.board.graveyard === undefined) {
      return false;
    }

    if (!player.city.includes('graveyard')) {
      return false;
    }

    if (player.stash < 1) {
      return false;
    }

    if (cm.characters[CharacterType.WARLORD]
        === this.state.board.getCurrentPlayerPosition() + CharacterPosition.PLAYER_1) {
      return false;
    }

    player.stash -= 1;

    player.addCardsToHand([this.state.board.graveyard]);
    this.state.board.graveyard = undefined;

    cm.jumpToActionsState();

    return true;
  }
}
