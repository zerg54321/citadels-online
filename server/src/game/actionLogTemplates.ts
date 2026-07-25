import type { ActionFeedLine } from 'citadels-common';
import { playerName } from './ActionLogger';

// Each template returns a structured ActionFeedLine (kind + params) instead of
// a baked-in localized string, so the client can render the action log in its
// own language via formatActionFeedLine(). Player names are usernames (not
// localized); role ids and district ids are resolved to names client-side.
//
// IMPORTANT — role ids are 1-based client ids, NOT the 0-based CharacterType
// enum. The client's `characters` i18n array is 1-indexed (index 0 is a blank
// placeholder, index 1 = Assassin … index 8 = Warlord), matching the face-up
// card ids emitted by CharacterManager (`id: enumValue + 1`). Every `role`
// param below is therefore `enumValue + 1` so the client can do a direct
// `t(`characters.${role}.name`)` lookup. Passing the raw enum value here was
// an off-by-one bug that rendered "kill Warlord" as "kill Architect".

export function templateEarn(
  players: Map<string, { username: string }>,
  actorId: string,
  amount: number,
): ActionFeedLine {
  return { kind: 'earn', params: { player: playerName(players, actorId), amount } };
}

export function templateBuild(
  players: Map<string, { username: string }>,
  actorId: string,
  district: string,
): ActionFeedLine {
  return { kind: 'build', params: { player: playerName(players, actorId), district } };
}

export function templateEarnManual(
  players: Map<string, { username: string }>,
  actorId: string,
  amount: number,
): ActionFeedLine {
  return { kind: 'earn', params: { player: playerName(players, actorId), amount } };
}

export function templateKill(character: number): ActionFeedLine {
  return { kind: 'kill', params: { role: character + 1 } };
}

export function templateRob(character: number): ActionFeedLine {
  return { kind: 'rob', params: { role: character + 1 } };
}

export function templateRobMove(
  players: Map<string, { username: string }>,
  robbedPlayerId: string,
  robbedRole: number,
  amount: number,
  thiefId: string,
): ActionFeedLine {
  return {
    kind: 'rob_move',
    params: {
      player: playerName(players, robbedPlayerId),
      role: robbedRole + 1,
      amount,
      thief: playerName(players, thiefId),
    },
  };
}

export function templateRobMoveEmpty(
  players: Map<string, { username: string }>,
  robbedPlayerId: string,
  robbedRole: number,
): ActionFeedLine {
  return {
    kind: 'rob_move_empty',
    params: { player: playerName(players, robbedPlayerId), role: robbedRole + 1 },
  };
}

export function templateDestroy(
  players: Map<string, { username: string }>,
  actorId: string,
  victimId: string,
  district: string,
): ActionFeedLine {
  return {
    kind: 'destroy',
    params: {
      player: playerName(players, actorId),
      victim: playerName(players, victimId),
      district,
    },
  };
}

export function templateMagicianExchange(
  players: Map<string, { username: string }>,
  actorId: string,
  targetId: string,
): ActionFeedLine {
  return {
    kind: 'magician_exchange',
    params: { player: playerName(players, actorId), target: playerName(players, targetId) },
  };
}

export function templateMagicianDiscard(
  players: Map<string, { username: string }>,
  actorId: string,
  count: number,
  drewCount: number,
): ActionFeedLine {
  return {
    kind: 'magician_discard',
    params: { player: playerName(players, actorId), count, drew: drewCount },
  };
}
