import {
  ClientGameState,
  PlayerBoard,
  PlayerId,
  PlayerRole,
  TeamId,
} from '../index';

export type Relation = 'self' | 'ally' | 'enemy';

export type TableSlot = {
  playerId: PlayerId;
  pos: string;
  pickOrder: number;
  relation: Relation;
  board: PlayerBoard & { crown: boolean };
};

/**
 * Whether the current viewer (`gs.self`) is a spectator — either explicitly
 * tagged with `PlayerRole.SPECTATOR`, or simply not listed in `playerOrder`.
 */
export function isSpectator(gs: ClientGameState): boolean {
  const me = gs.players?.[gs.self];
  if (me?.role === PlayerRole.SPECTATOR) return true;
  const order = gs.board?.playerOrder || [];
  return !order.includes(gs.self);
}

/**
 * The team of the current viewer, or `null` when spectating / unassigned.
 */
export function getMyTeam(gs: ClientGameState, spectator: boolean): TeamId | null {
  if (spectator) return null;
  return gs.players?.[gs.self]?.team ?? null;
}

/**
 * Relationship of `playerId` to the current viewer.
 *
 * - `'self'`  when spectating (everyone is "self"-ish from a neutral view) OR
 *             when `playerId` is the viewer.
 * - `'ally'`  when both share the same team (and neither is `NONE`).
 * - `'enemy'` otherwise.
 *
 * Spectator fallback: when no team info is available, seat index parity
 * (even = ally, odd = enemy) is used so the board still gets a visual split.
 */
export function getRelation(
  gs: ClientGameState,
  playerId: PlayerId,
  spectator: boolean,
): Relation {
  if (spectator || playerId === gs.self) return 'self';
  const t = gs.players?.[playerId]?.team;
  const mine = getMyTeam(gs, spectator);
  if (mine == null || t == null || t === TeamId.NONE || mine === TeamId.NONE) {
    if (spectator) {
      const idx = (gs.board?.playerOrder || []).indexOf(playerId);
      return idx % 2 === 0 ? 'ally' : 'enemy';
    }
    return 'enemy';
  }
  return t === mine ? 'ally' : 'enemy';
}

/**
 * Player order rotated so the viewer sits at index 0.
 * For spectators (or when the viewer is not in the order), returns the
 * original order unchanged.
 */
export function getSeatOrder(gs: ClientGameState, spectator: boolean): PlayerId[] {
  const order = [...(gs.board?.playerOrder || [])];
  if (spectator || !order.length) return order;
  const idx = order.indexOf(gs.self);
  if (idx < 0) return order;
  return [...order.slice(idx), ...order.slice(0, idx)];
}

const EMPTY_BOARD: PlayerBoard = {
  stash: 0,
  hand: [],
  tmpHand: [],
  city: [],
  score: {},
  characters: [],
};

/**
 * Compute the full table-layout slots for rendering the board.
 *
 * Spectator layout: all seats laid out left-then-right by index
 *   (l1, l2, l3, r1, r2, ...).
 *
 * Player layout: viewer at center-bottom (handled by caller via `selfBoard`),
 * remaining 5 seats split as left-three (top-to-bottom: l1,l2,l3) and
 * right-two (r1,r2), with the viewer's left/right neighbours in seating
 * order.
 */
export function getTableSlots(gs: ClientGameState, spectator: boolean): TableSlot[] {
  const order = gs.board?.playerOrder || [];

  const pickOf = (playerId: PlayerId): number => {
    const idx = order.indexOf(playerId);
    return idx >= 0 ? idx + 1 : 0;
  };

  const mk = (playerId: PlayerId, pos: string): TableSlot => {
    const board = gs.board?.players?.[playerId] || EMPTY_BOARD;
    return {
      playerId,
      pos,
      pickOrder: pickOf(playerId),
      relation: getRelation(gs, playerId, spectator),
      board: {
        ...board,
        crown: order[0] === playerId,
      },
    };
  };

  if (spectator) {
    return order.map((pid: PlayerId, i: number) => {
      const pos = i < 3 ? `l${i + 1}` : `r${i - 2}`;
      return mk(pid, pos);
    });
  }

  const rotated = getSeatOrder(gs, spectator);
  const others = rotated.slice(1);
  const leftThree = others.slice(0, 3);
  const rightTwo = others.slice(3, 5);
  const leftTopToBottom = [...leftThree].reverse();
  const mapped = [
    ...leftTopToBottom.map((playerId: PlayerId, i: number) => ({
      playerId, pos: ['l1', 'l2', 'l3'][i],
    })),
    ...rightTwo.map((playerId: PlayerId, i: number) => ({
      playerId, pos: ['r1', 'r2'][i],
    })),
  ];
  return mapped.map((item) => mk(item.playerId, item.pos));
}
