import {
  ClientGameState,
  ClientTurnState,
  PlayerId,
  CharacterChoosingStateType as CCST,
} from '../index';

/**
 * Derive a single player's FIRST-PERSON view from a stored god-view replay
 * frame. Replays persist omniscient snapshots (all hands + roles revealed);
 * this function re-applies the server's information-hiding rules on the
 * client so the replay can be watched from any seat without the server
 * storing per-player frames (7× storage) or re-simulating the game.
 *
 * The masking rules mirror the server exactly:
 *   BoardState.exportForPlayer / PlayerBoardState.exportForPlayer
 *   CharacterManager.exportPlayerCharacters / exportCharactersList
 * (with revealAll=false). A server-side golden test keeps them in sync:
 * it drives a full game and asserts, for every step and every player,
 * derivePlayerView(godFrame, p).board === getStateFromPlayer(p).board.
 *
 * ── Rules ──────────────────────────────────────────────────────────────
 * hands:   other players' hands/tmpHands → card-backs (id null), length kept
 * roles:   own role always face-up; others' only once their call number is
 *          reached (id <= current) or the round is over (turnState DONE)
 * center:  INITIAL/DONE lists are public; during put-aside nobody sees the
 *          candidate pool; during choose-character only the picker sees ids
 * aside:   already masked in the frame (face-down cards are id 0)
 */

type LoosePlayerBoard = {
  hand?: Array<unknown>;
  tmpHand?: Array<unknown>;
  characters?: Array<{
    id?: number;
    killed?: boolean;
    robbed?: boolean;
    faceDown?: boolean;
    hasRole?: boolean;
  }>;
} & Record<string, unknown>;

type LooseCenterList = {
  state?: { type?: number; player?: number };
  current?: number;
  callable?: Array<{
    id?: number;
    killed?: boolean;
    robbed?: boolean;
    faceUp?: boolean;
    discardedFaceUp?: boolean;
    selectable?: boolean;
    known?: boolean;
  }>;
  aside?: Array<unknown>;
} & Record<string, unknown>;

export function derivePlayerView(frame: ClientGameState, playerId: PlayerId): ClientGameState {
  const board = frame.board as unknown as
    | (Record<string, unknown> & {
      players?: Record<string, LoosePlayerBoard>;
      characters?: LooseCenterList;
      turnState?: ClientTurnState;
      playerOrder?: PlayerId[];
    })
    | undefined;

  // Unknown / malformed frame — return as-is rather than crash the replay.
  if (!board || !board.players) {
    return { ...frame, self: playerId };
  }

  const turnDone = board.turnState === ClientTurnState.DONE;
  // client-facing ids are internal+1 on both sides, so the ordinal
  // comparison is shift-invariant: internal (id <= current) ⟺ (cid <= ccurrent)
  const currentChar = board.characters?.current ?? 0;
  const order = board.playerOrder || [];
  const viewerPos = order.indexOf(playerId);

  // ── per-player boards: mask hands + re-mask role cards ─────────────────
  const players: Record<string, LoosePlayerBoard> = {};
  Object.entries(board.players).forEach(([pid, pb]) => {
    if (pid !== playerId) {
      // other players' hands → card-backs (length preserved)
      const hand = Array.isArray(pb.hand) ? Array(pb.hand.length).fill(null) : [];
      const tmpHand = Array.isArray(pb.tmpHand) ? Array(pb.tmpHand.length).fill(null) : [];
      // roles: visible only once call number reached / round done
      const characters = (pb.characters || []).map((c) => {
        const id = c.id ?? 0;
        const showFace = turnDone || (id !== 0 && id <= currentChar);
        return showFace
          ? { ...c, faceDown: false }
          : { ...c, id: 0, killed: false, robbed: false, faceDown: true };
      });
      players[pid] = { ...pb, hand, tmpHand, characters };
    } else {
      // own board: hands stay revealed, own role is always face-up — the
      // god frame already shows exactly what the owner sees
      players[pid] = pb;
    }
  });

  // ── center role list: re-apply picker-only visibility ──────────────────
  const chars = board.characters;
  let characters = chars;
  if (chars && Array.isArray(chars.callable) && chars.state) {
    const stateType = chars.state.type;
    const isPicker = viewerPos >= 0 && chars.state.player === viewerPos;
    if (stateType === CCST.PUT_ASIDE_FACE_UP || stateType === CCST.PUT_ASIDE_FACE_DOWN) {
      // blind put-aside: nobody (not even the picker) sees the pool ids
      characters = {
        ...chars,
        callable: chars.callable.map((c) => ({ ...c, id: 0, selectable: isPicker, known: false })),
      };
    } else if (stateType === CCST.PUT_ASIDE_FACE_DOWN_UP || stateType === CCST.CHOOSE_CHARACTER) {
      // only the player currently choosing sees the real ids
      characters = {
        ...chars,
        callable: chars.callable.map((c) => ({
          ...c,
          id: isPicker ? c.id : 0,
          selectable: isPicker,
          known: isPicker,
        })),
      };
    }
    // INITIAL / DONE (and anything else): public for everyone — keep as-is
  }

  return {
    ...frame,
    self: playerId,
    board: {
      ...board,
      players: players as ClientGameState['board']['players'],
      characters: characters as ClientGameState['board']['characters'],
    } as ClientGameState['board'],
  };
}
