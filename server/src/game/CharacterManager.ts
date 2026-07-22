import {
  ClientTurnState, CharacterChoosingStateType as CCST, CharacterType, PlayerPosition,
} from 'citadels-common';
import { CharacterChoosingState } from './ChoosingState';

export { CharacterType };

const DEFAULT_DISTRICTS_TO_BUILD: Record<CharacterType, number> = {
  [CharacterType.ASSASSIN]: 1,
  [CharacterType.THIEF]: 1,
  [CharacterType.MAGICIAN]: 1,
  [CharacterType.KING]: 1,
  [CharacterType.BISHOP]: 1,
  [CharacterType.MERCHANT]: 1,
  [CharacterType.ARCHITECT]: 3,
  [CharacterType.WARLORD]: 1,
  [CharacterType.NONE]: 0,
  [CharacterType.CHARACTER_COUNT]: 0,
};

const CAN_TAKE_EARNINGS: Record<CharacterType, boolean> = {
  [CharacterType.ASSASSIN]: false,
  [CharacterType.THIEF]: false,
  [CharacterType.MAGICIAN]: false,
  [CharacterType.KING]: true,
  [CharacterType.BISHOP]: true,
  [CharacterType.MERCHANT]: true,
  [CharacterType.ARCHITECT]: false,
  [CharacterType.WARLORD]: true,
  [CharacterType.NONE]: false,
  [CharacterType.CHARACTER_COUNT]: false,
};

const CAN_DO_SPECIAL_ACTION: Record<CharacterType, boolean> = {
  [CharacterType.ASSASSIN]: true,
  [CharacterType.THIEF]: true,
  [CharacterType.MAGICIAN]: true,
  [CharacterType.KING]: false,
  [CharacterType.BISHOP]: false,
  [CharacterType.MERCHANT]: false,
  [CharacterType.ARCHITECT]: false,
  [CharacterType.WARLORD]: true,
  [CharacterType.NONE]: false,
  [CharacterType.CHARACTER_COUNT]: false,
};

export enum TurnState {
  INITIAL = 0,

  ASSASSIN_ACTIONS,
  ASSASSIN_CHOOSE_CARD,
  ASSASSIN_KILL,
  ASSASSIN_BUILD,

  THIEF_ACTIONS,
  THIEF_CHOOSE_CARD,
  THIEF_ROB,
  THIEF_BUILD,

  MAGICIAN_ACTIONS,
  MAGICIAN_CHOOSE_CARD,
  MAGICIAN_EXCHANGE_HAND,
  MAGICIAN_DISCARD_CARDS,
  MAGICIAN_BUILD,

  KING_ACTIONS,
  KING_CHOOSE_CARD,
  KING_BUILD,

  BISHOP_ACTIONS,
  BISHOP_CHOOSE_CARD,
  BISHOP_BUILD,

  MERCHANT_ACTIONS,
  MERCHANT_CHOOSE_CARD,
  MERCHANT_TAKE_1_GOLD,
  MERCHANT_BUILD,

  ARCHITECT_ACTIONS,
  ARCHITECT_CHOOSE_CARD,
  ARCHITECT_DRAW_2_CARDS,
  ARCHITECT_BUILD,

  WARLORD_ACTIONS,
  WARLORD_CHOOSE_CARD,
  WARLORD_DESTROY_DISTRICT,
  WARLORD_BUILD,

  GRAVEYARD_RECOVER_DISTRICT,

  DONE,
}

export enum CharacterPosition {
  NOT_CHOSEN = 0,
  ASIDE_FACE_UP,
  ASIDE_FACE_DOWN,
  PLAYER_1,
  PLAYER_2,
  PLAYER_3,
  PLAYER_4,
  PLAYER_5,
  PLAYER_6,
  PLAYER_7,
}

export default class CharacterManager {
  // player count between 2 and 7
  playerCount: number;

  // characters position on board, indexed by CharacterType
  characters!: Array<CharacterPosition>;

  // choosing state
  choosingState: CharacterChoosingState;

  // turn progress state
  turnState!: TurnState;

  // special character attributes
  killedCharacter!: CharacterType;
  robbedCharacter!: CharacterType;

  // action restriction data
  hasTakenResources!: boolean;
  /** gold gained from this turn's regular TAKE_GOLD resource action (not earnings/lab) */
  goldFromResourcesThisTurn!: number;
  districtsToBuild!: number[];
  canTakeEarnings!: boolean[];
  canDoSpecialAction!: boolean[];
  isUsingLaboratory!: boolean;
  hasUsedLaboratory!: boolean;
  hasUsedSmithy!: boolean;

  constructor(playerCount: number) {
    this.playerCount = playerCount;
    this.choosingState = new CharacterChoosingState(playerCount);
    this.reset();
  }

  reset() {
    this.characters = Array(CharacterType.CHARACTER_COUNT).fill(CharacterPosition.NOT_CHOSEN);
    this.choosingState.reset();
    this.turnState = TurnState.INITIAL;
    this.killedCharacter = CharacterType.NONE;
    this.robbedCharacter = CharacterType.NONE;
    this.hasTakenResources = false;
    this.goldFromResourcesThisTurn = 0;
    this.districtsToBuild = Array.from(
      { length: CharacterType.CHARACTER_COUNT },
      (_, i) => DEFAULT_DISTRICTS_TO_BUILD[i as CharacterType],
    );
    this.canTakeEarnings = Array.from(
      { length: CharacterType.CHARACTER_COUNT },
      (_, i) => CAN_TAKE_EARNINGS[i as CharacterType],
    );
    // merchant/architect passives are auto-applied at turn start (not optional actions)
    this.canDoSpecialAction = Array.from(
      { length: CharacterType.CHARACTER_COUNT },
      (_, i) => CAN_DO_SPECIAL_ACTION[i as CharacterType],
    );
    this.isUsingLaboratory = false;
    this.hasUsedLaboratory = false;
    this.hasUsedSmithy = false;
  }

  clone(): CharacterManager {
    const c = new CharacterManager(this.playerCount);
    c.characters = [...this.characters];
    c.choosingState.stateNumber = this.choosingState.stateNumber;
    c.turnState = this.turnState;
    c.killedCharacter = this.killedCharacter;
    c.robbedCharacter = this.robbedCharacter;
    c.hasTakenResources = this.hasTakenResources;
    c.goldFromResourcesThisTurn = this.goldFromResourcesThisTurn;
    c.districtsToBuild = [...this.districtsToBuild];
    c.canTakeEarnings = [...this.canTakeEarnings];
    c.canDoSpecialAction = [...this.canDoSpecialAction];
    c.isUsingLaboratory = this.isUsingLaboratory;
    c.hasUsedLaboratory = this.hasUsedLaboratory;
    c.hasUsedSmithy = this.hasUsedSmithy;
    return c;
  }

  jumpToCharacter(character: CharacterType) {
    this.turnState = [
      TurnState.ASSASSIN_ACTIONS,
      TurnState.THIEF_ACTIONS,
      TurnState.MAGICIAN_ACTIONS,
      TurnState.KING_ACTIONS,
      TurnState.BISHOP_ACTIONS,
      TurnState.MERCHANT_ACTIONS,
      TurnState.ARCHITECT_ACTIONS,
      TurnState.WARLORD_ACTIONS,
    ][character] ?? TurnState.DONE;
    this.hasTakenResources = false;
    this.goldFromResourcesThisTurn = 0;
    this.hasUsedLaboratory = false;
    this.hasUsedSmithy = false;
  }

  jumpToNextCharacter() {
    // always land on next ordinal (including killed) so UI can reveal then skip
    const nextCharacter = this.getCurrentCharacter() + 1;
    this.jumpToCharacter(nextCharacter);
  }

  jumpToBuildState() {
    this.turnState = [
      TurnState.ASSASSIN_BUILD,
      TurnState.THIEF_BUILD,
      TurnState.MAGICIAN_BUILD,
      TurnState.KING_BUILD,
      TurnState.BISHOP_BUILD,
      TurnState.MERCHANT_BUILD,
      TurnState.ARCHITECT_BUILD,
      TurnState.WARLORD_BUILD,
    ][this.getCurrentCharacter()] ?? this.turnState;
  }

  jumpToActionsState() {
    this.turnState = [
      TurnState.ASSASSIN_ACTIONS,
      TurnState.THIEF_ACTIONS,
      TurnState.MAGICIAN_ACTIONS,
      TurnState.KING_ACTIONS,
      TurnState.BISHOP_ACTIONS,
      TurnState.MERCHANT_ACTIONS,
      TurnState.ARCHITECT_ACTIONS,
      TurnState.WARLORD_ACTIONS,
    ][this.getCurrentCharacter()] ?? this.turnState;
  }

  isCharacterPlayable(character: CharacterType): boolean {
    switch (this.characters[character]) {
      case CharacterPosition.PLAYER_1:
      case CharacterPosition.PLAYER_2:
      case CharacterPosition.PLAYER_3:
      case CharacterPosition.PLAYER_4:
      case CharacterPosition.PLAYER_5:
      case CharacterPosition.PLAYER_6:
      case CharacterPosition.PLAYER_7:
        return character !== this.killedCharacter;
      default:
        return false;
    }
  }

  static getAllCharacters() {
    return Array.from(Array(CharacterType.CHARACTER_COUNT).keys()) as CharacterType[];
  }

  /** public: used by AutoplayPolicy L2 drafting */
  public getCharactersAtPosition(pos: CharacterPosition): CharacterType[] {
    return this.characters.reduce((characters, position, character) => {
      if (position === pos) characters.push(character);
      return characters;
    }, new Array<CharacterType>());
  }

  getCurrentCharacter(): CharacterType {
    switch (this.turnState) {
      case TurnState.ASSASSIN_ACTIONS:
      case TurnState.ASSASSIN_CHOOSE_CARD:
      case TurnState.ASSASSIN_KILL:
      case TurnState.ASSASSIN_BUILD:
        return CharacterType.ASSASSIN;
      case TurnState.THIEF_ACTIONS:
      case TurnState.THIEF_CHOOSE_CARD:
      case TurnState.THIEF_ROB:
      case TurnState.THIEF_BUILD:
        return CharacterType.THIEF;
      case TurnState.MAGICIAN_ACTIONS:
      case TurnState.MAGICIAN_CHOOSE_CARD:
      case TurnState.MAGICIAN_EXCHANGE_HAND:
      case TurnState.MAGICIAN_DISCARD_CARDS:
      case TurnState.MAGICIAN_BUILD:
        return CharacterType.MAGICIAN;
      case TurnState.KING_ACTIONS:
      case TurnState.KING_CHOOSE_CARD:
      case TurnState.KING_BUILD:
        return CharacterType.KING;
      case TurnState.BISHOP_ACTIONS:
      case TurnState.BISHOP_CHOOSE_CARD:
      case TurnState.BISHOP_BUILD:
        return CharacterType.BISHOP;
      case TurnState.MERCHANT_ACTIONS:
      case TurnState.MERCHANT_CHOOSE_CARD:
      case TurnState.MERCHANT_TAKE_1_GOLD:
      case TurnState.MERCHANT_BUILD:
        return CharacterType.MERCHANT;
      case TurnState.ARCHITECT_ACTIONS:
      case TurnState.ARCHITECT_CHOOSE_CARD:
      case TurnState.ARCHITECT_DRAW_2_CARDS:
      case TurnState.ARCHITECT_BUILD:
        return CharacterType.ARCHITECT;
      case TurnState.WARLORD_ACTIONS:
      case TurnState.WARLORD_CHOOSE_CARD:
      case TurnState.WARLORD_DESTROY_DISTRICT:
      case TurnState.WARLORD_BUILD:
      case TurnState.GRAVEYARD_RECOVER_DISTRICT:
        return CharacterType.WARLORD;
      default:
        return CharacterType.NONE;
    }
  }

  getCurrentPlayerPosition(): PlayerPosition {
    const pos = this.characters[this.getCurrentCharacter()];
    switch (pos) {
      case CharacterPosition.PLAYER_1:
      case CharacterPosition.PLAYER_2:
      case CharacterPosition.PLAYER_3:
      case CharacterPosition.PLAYER_4:
      case CharacterPosition.PLAYER_5:
      case CharacterPosition.PLAYER_6:
      case CharacterPosition.PLAYER_7:
        return pos - CharacterPosition.PLAYER_1;

      default:
        break;
    }

    return PlayerPosition.SPECTATOR;
  }

  getClientTurnState(): ClientTurnState {
    if (this.isUsingLaboratory) {
      return ClientTurnState.LABORATORY_DISCARD_CARD;
    }
    switch (this.turnState) {
      case TurnState.ASSASSIN_ACTIONS:
      case TurnState.THIEF_ACTIONS:
      case TurnState.MAGICIAN_ACTIONS:
      case TurnState.KING_ACTIONS:
      case TurnState.BISHOP_ACTIONS:
      case TurnState.MERCHANT_ACTIONS:
      case TurnState.ARCHITECT_ACTIONS:
      case TurnState.WARLORD_ACTIONS:
        // merchant/architect passives are auto-applied at turn start
        if (!this.hasTakenResources) {
          return ClientTurnState.TAKE_RESOURCES;
        }
        return ClientTurnState.CHOOSE_ACTION;

      case TurnState.ASSASSIN_CHOOSE_CARD:
      case TurnState.THIEF_CHOOSE_CARD:
      case TurnState.MAGICIAN_CHOOSE_CARD:
      case TurnState.KING_CHOOSE_CARD:
      case TurnState.BISHOP_CHOOSE_CARD:
      case TurnState.MERCHANT_CHOOSE_CARD:
      case TurnState.ARCHITECT_CHOOSE_CARD:
      case TurnState.WARLORD_CHOOSE_CARD:
        return ClientTurnState.CHOOSE_CARD;
      case TurnState.ASSASSIN_KILL:
        return ClientTurnState.ASSASSIN_KILL;
      case TurnState.THIEF_ROB:
        return ClientTurnState.THIEF_ROB;
      case TurnState.MAGICIAN_EXCHANGE_HAND:
        return ClientTurnState.MAGICIAN_EXCHANGE_HAND;
      case TurnState.MAGICIAN_DISCARD_CARDS:
        return ClientTurnState.MAGICIAN_DISCARD_CARDS;
      case TurnState.MERCHANT_TAKE_1_GOLD:
        return ClientTurnState.MERCHANT_TAKE_1_GOLD;
      case TurnState.ARCHITECT_DRAW_2_CARDS:
        return ClientTurnState.ARCHITECT_DRAW_2_CARDS;
      case TurnState.WARLORD_DESTROY_DISTRICT:
        return ClientTurnState.WARLORD_DESTROY_DISTRICT;
      case TurnState.GRAVEYARD_RECOVER_DISTRICT:
        return ClientTurnState.GRAVEYARD_RECOVER_DISTRICT;
      case TurnState.ASSASSIN_BUILD:
      case TurnState.THIEF_BUILD:
      case TurnState.MAGICIAN_BUILD:
      case TurnState.KING_BUILD:
      case TurnState.BISHOP_BUILD:
      case TurnState.MERCHANT_BUILD:
      case TurnState.ARCHITECT_BUILD:
      case TurnState.WARLORD_BUILD:
        return ClientTurnState.BUILD_DISTRICT;
      case TurnState.DONE:
        return ClientTurnState.DONE;
      default:
        return ClientTurnState.INITIAL;
    }
  }

  exportPlayerCharacters(pos: PlayerPosition, dest: PlayerPosition) {
    // Official reveal rule:
    // - own cards always visible
    // - others only when that character's call order is reached (id <= current)
    // - killed/robbed does NOT reveal who owns the role early — only the role number
    //   is marked on the global 1–8 list; owner is shown when that role is called
    const canSee = dest === PlayerPosition.SPECTATOR
      || dest === pos
      || this.turnState === TurnState.DONE;
    const characterPos = pos + CharacterPosition.PLAYER_1 as CharacterPosition;
    const currentCharacter = this.getCurrentCharacter();

    const held = this.getCharactersAtPosition(characterPos);
    if (!held.length) {
      return [];
    }
    return held.map((id) => {
      const isKilled = id === this.killedCharacter;
      const isRobbed = id === this.robbedCharacter;
      // reveal identity only when this role's turn is current or has passed
      // (own cards always face-up for the owner via canSee)
      const turnReached = id !== CharacterType.NONE && id <= currentCharacter;
      const showFace = canSee || turnReached;
      return {
        // client: id 0 + faceDown = card back; id 1-8 = face up
        id: showFace ? id + 1 : 0,
        killed: showFace && isKilled,
        robbed: showFace && isRobbed,
        faceDown: !showFace,
        // true once player has been dealt a role (for UI to always show a card)
        hasRole: true,
      };
    });
  }

  exportCurrentPlayerExtraData() {
    const character = this.getCurrentCharacter();
    return {
      districtsToBuild: this.districtsToBuild[character],
      canTakeEarnings: this.canTakeEarnings[character],
      canDoSpecialAction: this.canDoSpecialAction[character],
      hasUsedLaboratory: this.hasUsedLaboratory,
      hasUsedSmithy: this.hasUsedSmithy,
    };
  }

  exportCharactersList(dest: PlayerPosition) {
    let characters = {};

    switch (this.choosingState.getState().type) {
      case CCST.INITIAL:
        characters = CharacterManager.exportListInitial();
        break;
      case CCST.PUT_ASIDE_FACE_UP:
      case CCST.PUT_ASIDE_FACE_DOWN:
        characters = this.exportListPutAside(dest);
        break;
      case CCST.PUT_ASIDE_FACE_DOWN_UP:
      case CCST.CHOOSE_CHARACTER:
        characters = this.exportListChooseCard(dest);
        break;
      case CCST.DONE:
        characters = this.exportListDone();
        break;
      default:
    }

    return {
      state: this.choosingState.getState(),
      ...characters,
    };
  }

  private getAsideCards() {
    return [
      ...(this.getCharactersAtPosition(CharacterPosition.ASIDE_FACE_DOWN)?.map(() => ({
        id: 0,
        faceDown: true,
        faceUp: false,
        known: false,
      })) || []),
      ...(this.getCharactersAtPosition(CharacterPosition.ASIDE_FACE_UP)?.map((characterType) => ({
        id: characterType + 1,
        faceDown: false,
        faceUp: true,
        known: true,
      })) || [])];
  }

  private static exportListInitial() {
    return {
      current: CharacterType.NONE + 1,
      callable: CharacterManager.getAllCharacters().map((characterType) => ({
        id: characterType + 1,
      })),
      aside: [],

    };
  }

  private exportListPutAside(dest: PlayerPosition) {
    return this.exportListChooseCard(dest, false);
  }

  private exportListChooseCard(dest: PlayerPosition, canSee = true) {
    const { player } = this.choosingState.getState();
    const isSpectator = player === PlayerPosition.SPECTATOR;
    const canSeeList = canSee && (isSpectator || dest === player);

    return {
      // current character
      current: this.getCurrentCharacter() + 1,
      // callable characters: characters that have not been chosen
      callable: CharacterManager.getAllCharacters().filter(
        (characterType) => this.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN)
          ?.includes(characterType),
      ).map((characterType) => ({
        id: canSeeList ? characterType + 1 : 0,
        selectable: dest === player,
        known: canSeeList,
      })),
      // characters that are put aside
      aside: this.getAsideCards(),
    };
  }

  private exportListDone() {
    const faceUpAside = new Set(this.getCharactersAtPosition(CharacterPosition.ASIDE_FACE_UP) || []);
    // full 1–8 always; killed/robbed/face-up marked as soon as set (not delayed to that role's turn)
    return {
      current: this.getCurrentCharacter() + 1,
      callable: CharacterManager.getAllCharacters().map((characterType) => {
        const faceUp = faceUpAside.has(characterType);
        const killed = this.killedCharacter === characterType;
        const robbed = this.robbedCharacter === characterType;
        return {
          id: characterType + 1,
          killed,
          robbed,
          faceUp,
          discardedFaceUp: faceUp,
          known: true,
        };
      }),
      aside: this.getAsideCards(),
    };
  }

  chooseRandomCharacter(avoidKing = false): boolean {
    const characters = this.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
    if (characters.length === 0) return false;
    let index;

    do {
      index = Math.floor(Math.random() * characters.length);
    } while (avoidKing && characters.length > 1 && characters[index] === CharacterType.KING);

    return this.chooseCharacter(index);
  }

  /**
   * System-side aside when choosingState.player is SPECTATOR
   * (e.g. 6p final face-down after all players picked).
   */
  autoSpectatorAside(): boolean {
    const st = this.choosingState.getState();
    if (st.player !== PlayerPosition.SPECTATOR) return false;
    if (st.type === CCST.DONE || st.type === CCST.INITIAL) {
      return st.type === CCST.DONE;
    }
    if (st.type === CCST.PUT_ASIDE_FACE_DOWN || st.type === CCST.PUT_ASIDE_FACE_UP) {
      const characters = this.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
      if (characters.length === 0) {
        try {
          this.choosingState.step();
        } catch {
          return false;
        }
        this.drainSpectatorAutoSteps();
        return true;
      }
      if (st.type === CCST.PUT_ASIDE_FACE_UP) {
        this.characters[characters[0]] = CharacterPosition.ASIDE_FACE_UP;
      } else {
        this.characters[characters[0]] = CharacterPosition.ASIDE_FACE_DOWN;
      }
      this.choosingState.step();
      this.drainSpectatorAutoSteps();
      return true;
    }
    if (st.type === CCST.GET_ASIDE_FACE_DOWN) {
      const aside = this.getCharactersAtPosition(CharacterPosition.ASIDE_FACE_DOWN);
      if (aside.length > 0) {
        this.characters[aside[0]] = CharacterPosition.NOT_CHOSEN;
      }
      this.choosingState.step();
      this.drainSpectatorAutoSteps();
      return true;
    }
    return false;
  }

  private drainSpectatorAutoSteps() {
    while (this.choosingState.getState().player === PlayerPosition.SPECTATOR) {
      const st = this.choosingState.getState();
      if (st.type === CCST.DONE) return;
      if (st.type === CCST.GET_ASIDE_FACE_DOWN) {
        const aside = this.getCharactersAtPosition(CharacterPosition.ASIDE_FACE_DOWN);
        if (aside.length > 0) {
          this.characters[aside[0]] = CharacterPosition.NOT_CHOSEN;
        }
        this.choosingState.step();
        continue;
      }
      if (st.type === CCST.PUT_ASIDE_FACE_DOWN || st.type === CCST.PUT_ASIDE_FACE_UP) {
        const characters = this.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
        if (characters.length === 0) {
          this.choosingState.step();
          continue;
        }
        this.characters[characters[0]] = st.type === CCST.PUT_ASIDE_FACE_UP
          ? CharacterPosition.ASIDE_FACE_UP
          : CharacterPosition.ASIDE_FACE_DOWN;
        this.choosingState.step();
        continue;
      }
      break;
    }
  }

  chooseCharacter(index: number): boolean {
    const characters = this.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);

    if (index < 0 || index >= characters.length) {
      return false;
    }

    // spectator cannot "choose" as a player — use autoSpectatorAside
    if (this.choosingState.getState().player === PlayerPosition.SPECTATOR) {
      return this.autoSpectatorAside();
    }

    switch (this.choosingState.getState().type) {
      case CCST.PUT_ASIDE_FACE_UP:
        this.characters[characters[index]] = CharacterPosition.ASIDE_FACE_UP;
        break;

      case CCST.PUT_ASIDE_FACE_DOWN:
      case CCST.PUT_ASIDE_FACE_DOWN_UP:
        this.characters[characters[index]] = CharacterPosition.ASIDE_FACE_DOWN;
        break;

      case CCST.CHOOSE_CHARACTER:
        this.characters[characters[index]] = (
          this.choosingState.getState().player + CharacterPosition.PLAYER_1
        );
        break;

      default:
        // invalid state
        return false;
    }

    this.choosingState.step();
    this.drainSpectatorAutoSteps();

    return true;
  }

  shiftPlayerPosition(amount: number) {
    const offset = CharacterPosition.PLAYER_1;
    this.characters.forEach((character, i) => {
      switch (character) {
        case CharacterPosition.PLAYER_1:
        case CharacterPosition.PLAYER_2:
        case CharacterPosition.PLAYER_3:
        case CharacterPosition.PLAYER_4:
        case CharacterPosition.PLAYER_5:
        case CharacterPosition.PLAYER_6:
        case CharacterPosition.PLAYER_7:
          this.characters[i] = ((character - offset + this.playerCount - amount)
            % this.playerCount) + offset;
          break;

        default:
          break;
      }
    });
  }
}
