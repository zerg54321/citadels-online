import {
  CharacterChoosingStateType as CCST,
  ClientTurnState,
  districts,
  GamePhase,
  GameProgress,
  MoveType,
  PlayerPosition,
} from 'citadels-common';
import GameState from '../game/GameState';
import GameSetupData from '../game/GameSetupData';
import { CharacterType, TurnState } from '../game/CharacterManager';
import { EngineAction, EngineActionType, EngineObservation, EnginePhase, EngineResult } from './types';

const CHARACTER_NAMES = [
  '刺客', '盗贼', '魔术师', '国王', '主教', '商人', '建筑师', '军阀',
];

function cardCost(card: string): number {
  return (districts as Record<string, { cost?: number }>)[card]?.cost ?? 99;
}

export class TrainingEngine {
  private gameState: GameState;
  private playerOrder: string[];
  private teamMap: Map<string, 'A' | 'B'>;

  constructor(playerNames: string[]) {
    if (playerNames.length !== 6) {
      throw new Error('TrainingEngine currently supports exactly 6 players for 3v3 mode.');
    }

    // offline engine: advance phase timers inline
    process.env.CITADELS_SYNC = '1';
    process.env.CITADELS_FAST = '1';

    this.gameState = new GameState(8);
    this.playerOrder = playerNames.map((_, index) => `p${index + 1}`);
    this.teamMap = new Map(this.playerOrder.map((id, index) => [id, index % 2 === 0 ? 'A' : 'B']));

    this.playerOrder.forEach((id, index) => {
      const playerName = playerNames[index];
      this.gameState.addPlayer(id, playerName, index === 0, true);
    });

    const setup = new GameSetupData(this.playerOrder, 8);
    this.gameState.setupGame(setup);
    this.gameState.progress = GameProgress.IN_GAME;
    if (this.gameState.board) {
      this.gameState.board.gamePhase = GamePhase.CHOOSE_CHARACTERS;
      this.advanceToFirstActionableCharacterState();
    }
  }

  getPlayerOrder(): string[] {
    return [...this.playerOrder];
  }

  getTeamMap(): Record<string, 'A' | 'B'> {
    return Object.fromEntries(this.teamMap);
  }

  isFinished(): boolean {
    return this.gameState.progress === GameProgress.FINISHED;
  }

  getMatchResult() {
    return {
      progress: this.gameState.progress,
      teamScores: this.gameState.teamScores,
      matchResult: this.gameState.matchResult,
    };
  }

  getObservation(playerId?: string): EngineObservation {
    // resolve legal first (may auto-advance phase)
    const legalActions = this.getLegalActions();
    return this.captureObservation(legalActions);
  }

  /** snapshot without re-running legal-action auto-advance */
  captureObservation(legalActions: EngineAction[] = []): EngineObservation {
    const board = this.gameState.board;
    const cm = board?.characterManager;
    const order = board?.playerOrder || this.playerOrder;
    const crownId = order[0] || null;

    const players = order.map((id) => {
      const meta = this.gameState.getPlayer(id);
      const pb = board?.players.get(id);
      const hand = [...(pb?.hand || [])];
      const city = [...(pb?.city || [])];
      const seat = order.indexOf(id);
      const chars: number[] = [];
      if (cm) {
        // CharacterPosition.PLAYER_1 === 3
        const offset = 3;
        cm.characters.forEach((pos, character) => {
          if (pos >= offset && pos - offset === seat) {
            chars.push(character);
          }
        });
      }
      return {
        id,
        name: meta?.username || id,
        team: (this.teamMap.get(id) || 'A') as 'A' | 'B',
        stash: pb?.stash ?? 0,
        hand,
        handCount: hand.length,
        city,
        citySize: city.length,
        complete: city.length >= this.gameState.completeCitySize,
        characters: chars,
        hasCrown: id === crownId,
      };
    });

    const char = cm?.getCurrentCharacter() ?? CharacterType.NONE;
    const turn = cm?.getClientTurnState();
    const killed = cm?.killedCharacter ?? CharacterType.NONE;
    const robbed = cm?.robbedCharacter ?? CharacterType.NONE;

    return {
      phase: this.toEnginePhase(),
      currentPlayerId: this.getCurrentActorId(),
      players,
      deckCount: board?.districtsDeck.cards.length || 0,
      graveyard: board?.graveyard,
      currentCharacter: char >= 0 && char < CHARACTER_NAMES.length
        ? CHARACTER_NAMES[char]
        : undefined,
      currentCharacterId: char >= 0 ? char : undefined,
      turnState: turn !== undefined ? ClientTurnState[turn] ?? String(turn) : undefined,
      killedCharacterId: killed >= 0 ? killed : undefined,
      killedCharacterName: killed >= 0 && killed < CHARACTER_NAMES.length
        ? CHARACTER_NAMES[killed] : undefined,
      robbedCharacterId: robbed >= 0 ? robbed : undefined,
      robbedCharacterName: robbed >= 0 && robbed < CHARACTER_NAMES.length
        ? CHARACTER_NAMES[robbed] : undefined,
      crownPlayerId: crownId,
      legalActions,
    };
  }

  characterName(id: number): string {
    return CHARACTER_NAMES[id] ?? String(id);
  }

  getLegalActions(): EngineAction[] {
    if (this.isFinished() || !this.gameState.board) {
      return [];
    }

    const cm = this.gameState.board.characterManager;
    const phase = this.gameState.board.gamePhase;

    // auto-advance stuck AUTO phases
    if (phase === GamePhase.CHOOSE_CHARACTERS) {
      const ccs = cm.choosingState.getState();
      if (ccs.type === CCST.INITIAL || ccs.type === CCST.DONE) {
        this.gameState.step({ type: MoveType.AUTO });
      }
    }
    if (phase === GamePhase.DO_ACTIONS) {
      if (cm.turnState === TurnState.DONE || !cm.isCharacterPlayable(cm.getCurrentCharacter())) {
        this.gameState.step({ type: MoveType.AUTO });
      }
    }

    if (this.isFinished() || !this.gameState.board) {
      return [];
    }

    const board = this.gameState.board;
    const cm2 = board.characterManager;
    const actorId = this.getCurrentActorId();
    if (!actorId) {
      return [];
    }

    if (board.gamePhase === GamePhase.CHOOSE_CHARACTERS) {
      const ccs = cm2.choosingState.getState();
      if ([
        CCST.PUT_ASIDE_FACE_UP,
        CCST.PUT_ASIDE_FACE_DOWN,
        CCST.PUT_ASIDE_FACE_DOWN_UP,
        CCST.CHOOSE_CHARACTER,
      ].includes(ccs.type)) {
        const actions: EngineAction[] = [];
        for (let i = 0; i < 8; i += 1) {
          actions.push({ type: EngineActionType.CHOOSE_CHARACTER, playerId: actorId, data: i });
        }
        return actions;
      }
      return [];
    }

    if (board.gamePhase !== GamePhase.DO_ACTIONS) {
      return [];
    }

    const turnState = cm2.getClientTurnState();
    const player = board.players.get(actorId);
    if (!player) return [];
    const extra = cm2.exportCurrentPlayerExtraData();
    const actions: EngineAction[] = [];
    const hand = player.hand.filter((c) => c != null);
    // real rule: no duplicate district names in city
    const affordable = hand.filter(
      (c) => cardCost(c) <= player.stash && !player.city.includes(c),
    );
    const canEnterBuild = extra.districtsToBuild > 0 && affordable.length > 0;

    switch (turnState) {
      case ClientTurnState.TAKE_RESOURCES: {
        if (extra.canTakeEarnings) {
          actions.push({ type: EngineActionType.TAKE_GOLD_EARNINGS, playerId: actorId });
        }
        if (canEnterBuild) {
          actions.push({ type: EngineActionType.BUILD_DISTRICT, playerId: actorId });
        }
        if (hand.length === 0) {
          actions.push({ type: EngineActionType.DRAW_CARDS, playerId: actorId });
          actions.push({ type: EngineActionType.TAKE_GOLD, playerId: actorId });
        } else {
          actions.push({ type: EngineActionType.TAKE_GOLD, playerId: actorId });
          actions.push({ type: EngineActionType.DRAW_CARDS, playerId: actorId });
        }
        break;
      }
      case ClientTurnState.CHOOSE_CARD: {
        if (player.tmpHand.length === 0) {
          // deck exhausted mid-select — no-op pick to leave state
          actions.push({ type: EngineActionType.DRAW_CARDS, playerId: actorId, data: null });
        } else {
          player.tmpHand.forEach((card) => {
            actions.push({ type: EngineActionType.DRAW_CARDS, playerId: actorId, data: card });
          });
        }
        break;
      }
      case ClientTurnState.CHOOSE_ACTION: {
        if (extra.canTakeEarnings && !cm2.hasTakenResources) {
          actions.push({ type: EngineActionType.TAKE_GOLD_EARNINGS, playerId: actorId });
        }
        if (canEnterBuild) {
          actions.push({ type: EngineActionType.BUILD_DISTRICT, playerId: actorId });
        }
        if (extra.canDoSpecialAction) {
          const ch = cm2.getCurrentCharacter();
          if (ch === CharacterType.ASSASSIN) {
            actions.push({ type: EngineActionType.ASSASSIN_KILL, playerId: actorId });
          }
          if (ch === CharacterType.THIEF) {
            actions.push({ type: EngineActionType.THIEF_ROB, playerId: actorId });
          }
          if (ch === CharacterType.MAGICIAN) {
            actions.push({ type: EngineActionType.MAGICIAN_EXCHANGE_HAND, playerId: actorId });
            actions.push({ type: EngineActionType.MAGICIAN_DISCARD_CARDS, playerId: actorId });
          }
          if (ch === CharacterType.WARLORD) {
            actions.push({ type: EngineActionType.WARLORD_DESTROY_DISTRICT, playerId: actorId });
          }
        }
        actions.push({ type: EngineActionType.FINISH_TURN, playerId: actorId });
        break;
      }
      case ClientTurnState.BUILD_DISTRICT: {
        affordable
          .slice()
          .sort((a, b) => cardCost(a) - cardCost(b))
          .forEach((card) => {
            actions.push({ type: EngineActionType.BUILD_DISTRICT, playerId: actorId, data: card });
          });
        actions.push({ type: EngineActionType.DECLINE, playerId: actorId });
        break;
      }
      case ClientTurnState.ASSASSIN_KILL: {
        for (let cid = 2; cid <= 8; cid += 1) {
          actions.push({ type: EngineActionType.ASSASSIN_KILL, playerId: actorId, data: cid });
        }
        actions.push({ type: EngineActionType.DECLINE, playerId: actorId });
        break;
      }
      case ClientTurnState.THIEF_ROB: {
        for (let cid = 3; cid <= 8; cid += 1) {
          actions.push({ type: EngineActionType.THIEF_ROB, playerId: actorId, data: cid });
        }
        actions.push({ type: EngineActionType.DECLINE, playerId: actorId });
        break;
      }
      case ClientTurnState.MAGICIAN_EXCHANGE_HAND: {
        board.playerOrder.forEach((pid, index) => {
          if (pid !== actorId) {
            actions.push({
              type: EngineActionType.MAGICIAN_EXCHANGE_HAND,
              playerId: actorId,
              data: index,
            });
          }
        });
        actions.push({ type: EngineActionType.DECLINE, playerId: actorId });
        break;
      }
      case ClientTurnState.MAGICIAN_DISCARD_CARDS: {
        // discard all hand for simplicity, or decline
        if (hand.length > 0) {
          actions.push({
            type: EngineActionType.MAGICIAN_DISCARD_CARDS,
            playerId: actorId,
            data: [...hand],
          });
        }
        actions.push({ type: EngineActionType.DECLINE, playerId: actorId });
        break;
      }
      case ClientTurnState.WARLORD_DESTROY_DISTRICT: {
        board.playerOrder.forEach((pid, pos) => {
          if (pid === actorId) return;
          const other = board.players.get(pid);
          if (!other) return;
          other.city.forEach((card) => {
            actions.push({
              type: EngineActionType.WARLORD_DESTROY_DISTRICT,
              playerId: actorId,
              data: { player: pos, card },
            });
          });
        });
        actions.push({ type: EngineActionType.DECLINE, playerId: actorId });
        break;
      }
      case ClientTurnState.GRAVEYARD_RECOVER_DISTRICT:
      case ClientTurnState.LABORATORY_DISCARD_CARD:
        actions.push({ type: EngineActionType.DECLINE, playerId: actorId });
        break;
      default:
        break;
    }

    return actions;
  }

  applyAction(action: EngineAction): EngineResult {
    const playerId = action.playerId || this.getCurrentActorId() || this.playerOrder[0];
    if (!this.gameState.containsPlayer(playerId)) {
      return { ok: false, message: 'unknown player' };
    }

    const move = this.toGameMove(action);
    const ok = this.gameState.step(move);
    if (!ok) {
      return { ok: false, message: 'invalid action for current state' };
    }

    // flush AUTO transitions (sync mode runs them immediately)
    this.gameState.step({ type: MoveType.AUTO });
    return {
      ok: true,
      observation: this.getObservation(playerId),
    };
  }

  private advanceToFirstActionableCharacterState() {
    if (!this.gameState.board) return;
    const cm = this.gameState.board.characterManager;
    while (cm.choosingState.getState().type === CCST.INITIAL) {
      cm.choosingState.step();
    }
  }

  private getCurrentActorId(): string | null {
    if (!this.gameState.board) return null;
    if (this.gameState.board.gamePhase === GamePhase.CHOOSE_CHARACTERS) {
      const choosingPlayer = this.gameState.board.characterManager.choosingState.getState().player;
      if (choosingPlayer === undefined || choosingPlayer === PlayerPosition.SPECTATOR) {
        return null;
      }
      return this.playerOrder[Number(choosingPlayer)] || null;
    }
    const pos = this.gameState.board.getCurrentPlayerPosition();
    if (pos === PlayerPosition.SPECTATOR) return null;
    return this.gameState.board.playerOrder[pos] || null;
  }

  private toEnginePhase(): EnginePhase {
    if (!this.gameState.board) return EnginePhase.SETUP;
    if (this.gameState.progress === GameProgress.FINISHED) return EnginePhase.FINISHED;
    if (this.gameState.board.gamePhase === GamePhase.CHOOSE_CHARACTERS) {
      return EnginePhase.CHARACTER_SELECTION;
    }
    if (this.gameState.board.gamePhase === GamePhase.DO_ACTIONS) return EnginePhase.ACTIONS;
    return EnginePhase.SETUP;
  }

  private toGameMove(action: EngineAction) {
    switch (action.type) {
      case EngineActionType.CHOOSE_CHARACTER:
        return { type: MoveType.CHOOSE_CHARACTER, data: action.data };
      case EngineActionType.TAKE_GOLD:
        return { type: MoveType.TAKE_GOLD };
      case EngineActionType.DRAW_CARDS:
        return { type: MoveType.DRAW_CARDS, data: action.data };
      case EngineActionType.TAKE_GOLD_EARNINGS:
        return { type: MoveType.TAKE_GOLD_EARNINGS };
      case EngineActionType.BUILD_DISTRICT:
        return { type: MoveType.BUILD_DISTRICT, data: action.data };
      case EngineActionType.ASSASSIN_KILL:
        return { type: MoveType.ASSASSIN_KILL, data: action.data };
      case EngineActionType.THIEF_ROB:
        return { type: MoveType.THIEF_ROB, data: action.data };
      case EngineActionType.MAGICIAN_EXCHANGE_HAND:
        return { type: MoveType.MAGICIAN_EXCHANGE_HAND, data: action.data };
      case EngineActionType.MAGICIAN_DISCARD_CARDS:
        return { type: MoveType.MAGICIAN_DISCARD_CARDS, data: action.data };
      case EngineActionType.MERCHANT_TAKE_1_GOLD:
        return { type: MoveType.MERCHANT_TAKE_1_GOLD };
      case EngineActionType.ARCHITECT_DRAW_2_CARDS:
        return { type: MoveType.ARCHITECT_DRAW_2_CARDS };
      case EngineActionType.WARLORD_DESTROY_DISTRICT:
        return { type: MoveType.WARLORD_DESTROY_DISTRICT, data: action.data };
      case EngineActionType.GRAVEYARD_RECOVER_DISTRICT:
        return { type: MoveType.GRAVEYARD_RECOVER_DISTRICT };
      case EngineActionType.SMITHY_DRAW_CARDS:
        return { type: MoveType.SMITHY_DRAW_CARDS };
      case EngineActionType.LABORATORY_DISCARD_CARD:
        return { type: MoveType.LABORATORY_DISCARD_CARD, data: action.data };
      case EngineActionType.DECLINE:
        return { type: MoveType.DECLINE };
      case EngineActionType.FINISH_TURN:
        return { type: MoveType.FINISH_TURN };
      default:
        return { type: MoveType.AUTO };
    }
  }
}
