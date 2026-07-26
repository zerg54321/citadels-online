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
 * - `'self'`  when `playerId` is the viewer (never for a true spectator,
 *             since spectators have no seat in `playerOrder` and thus are
 *             never passed as `playerId`).
 * - `'ally'`  when both share the same team (and neither is `NONE`).
 * - `'enemy'` otherwise.
 *
 * Spectator view: a spectator has no team of their own, so for the purposes
 * of visual team coloring we treat Team A as the viewer's "side" (→ ally /
 * blue) and Team B as the opposing side (→ enemy / red). This mirrors how
 * the score bar and end-game modal label A/B for spectators. When no team
 * info is available at all (e.g. lobby before teams assigned), seat-index
 * parity (even = ally, odd = enemy) keeps a visual split.
 */
export function getRelation(
  gs: ClientGameState,
  playerId: PlayerId,
  spectator: boolean,
): Relation {
  if (playerId === gs.self) return 'self';
  const t = gs.players?.[playerId]?.team;
  if (spectator) {
    if (t == null || t === TeamId.NONE) {
      const idx = (gs.board?.playerOrder || []).indexOf(playerId);
      return idx % 2 === 0 ? 'ally' : 'enemy';
    }
    return t === TeamId.A ? 'ally' : 'enemy';
  }
  const mine = getMyTeam(gs, spectator);
  if (mine == null || t == null || t === TeamId.NONE || mine === TeamId.NONE) {
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
 * Spectator layout: seats are positioned by the STABLE lobby/entry order
 *   (`lobbyPlayerOrder`) so they never rearrange when the king changes.
 *   Positions follow a clockwise arrangement — left column top→bottom =
 *   seats 3,2,1 (l3,l2,l1); right column top→bottom = seats 4,5,6
 *   (r1,r2,r3). Crown and pickOrder still track the live `playerOrder`,
 *   so only the numbers/crown move, not the seats.
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
    // Fix seat POSITIONS by the stable lobby/entry order so seats never move
    // when the king changes (playerOrder rotates, but positions stay put).
    // Crown and pickOrder are still derived from the current playerOrder
    // inside `mk`, so only the numbers/crown icon move — not the seats.
    const fixedOrder = (gs.lobbyPlayerOrder?.length
      ? gs.lobbyPlayerOrder.filter((id) => order.includes(id))
      : order);
    // If filtering left some seats out (edge case), append them in playerOrder.
    const missing = order.filter((id) => !fixedOrder.includes(id));
    const seatOrder = [...fixedOrder, ...missing];
    return seatOrder.map((pid: PlayerId, i: number) => {
      // Clockwise layout: left column top→bottom = seats 3,2,1 (index 0→l3,
      // 1→l2, 2→l1); right column top→bottom = seats 4,5,6 (index 3→r1 …).
      const pos = i < 3 ? `l${3 - i}` : `r${i - 2}`;
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
