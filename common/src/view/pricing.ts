import {
  CharacterType,
  ClientGameState,
  DistrictId,
  PlayerId,
  districts,
} from '../index';

/**
 * Compute the cost for the Warlord to destroy a specific district of a
 * specific player, given a client-view game state.
 *
 * Returns `-1` (meaning "cannot destroy") when any of the following holds:
 *   - target district is `keep` (immune to destruction by rule)
 *   - game state is missing
 *   - target player is not on the board
 *   - target player has completed their city (no destruction after end)
 *   - target player is the Bishop AND the Bishop has not been assassinated
 *     (Bishop's city is protected while alive)
 *
 * Otherwise returns `max(cost - discount, 0)` where:
 *   - base `cost` is read from `districts[districtId].cost`
 *   - discount = 1 normally (destroying costs cost-1)
 *   - discount = 0 when the target player owns `great_wall` AND the target is
 *     not `great_wall` itself (great_wall raises the destruction cost of other
 *     districts by 1, i.e., removes the usual discount)
 *
 * Character ID convention: the client-view state stores character ids as
 * `CharacterType + 1` (1-based) — see project fact `client.character_id_convention`.
 * Hence the comparisons use `CharacterType.BISHOP + 1`.
 */
export function getDistrictDestroyPrice(
  gs: ClientGameState | undefined,
  playerId: PlayerId,
  districtId: DistrictId,
): number {
  if (districtId === 'keep') return -1;
  if (gs === undefined) return -1;

  const player = gs.board?.players?.[playerId];
  if (player === undefined) return -1;

  if (player.city.length >= gs.settings.completeCitySize) return -1;

  const isBishopDead = gs.board?.characters?.callable?.find(
    ({ id }) => id === CharacterType.BISHOP + 1,
  )?.killed ?? false;
  const isPlayerBishop = player.characters.some(
    ({ id }) => id === CharacterType.BISHOP + 1,
  );
  if (!isBishopDead && isPlayerBishop) return -1;

  const district = districts[districtId as keyof typeof districts];
  const baseCost = district?.cost ?? 0;

  const hasGreatWall = player.city.includes('great_wall');
  const discount = (hasGreatWall && districtId !== 'great_wall') ? 0 : 1;

  return Math.max(baseCost - discount, 0);
}
