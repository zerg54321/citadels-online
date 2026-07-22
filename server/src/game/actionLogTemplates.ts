import { roleNameZh, districtLabelZh, playerName } from './ActionLogger';

export function templateEarn(players: Map<string, { username: string }>, actorId: string, amount: number): string {
  return `${playerName(players, actorId)} 自动收租 +${amount} 金`;
}

export function templateBuild(players: Map<string, { username: string }>, actorId: string, district: string): string {
  return `${playerName(players, actorId)} 建造了 ${districtLabelZh(district)}`;
}

export function templateEarnManual(players: Map<string, { username: string }>, actorId: string, amount: number): string {
  return `${playerName(players, actorId)} 收租 +${amount} 金`;
}

export function templateKill(character: number): string {
  return `刺杀标记：${roleNameZh(character)}（持有者到其顺位再揭示）`;
}

export function templateRob(character: number): string {
  return `偷窃标记：${roleNameZh(character)}（行动时夺金）`;
}

export function templateRobMove(
  players: Map<string, { username: string }>,
  robbedPlayerId: string,
  robbedRole: number,
  amount: number,
  thiefId: string,
): string {
  return `${playerName(players, robbedPlayerId)} 的${roleNameZh(robbedRole)}被偷窃，${amount} 金币转移到 ${playerName(players, thiefId)}`;
}

export function templateRobMoveEmpty(
  players: Map<string, { username: string }>,
  robbedPlayerId: string,
  robbedRole: number,
): string {
  return `${playerName(players, robbedPlayerId)} 的${roleNameZh(robbedRole)}被偷窃，但没有金币`;
}

export function templateDestroy(
  players: Map<string, { username: string }>,
  actorId: string,
  victimId: string,
  district: string,
): string {
  return `${playerName(players, actorId)} 拆毁了 ${playerName(players, victimId)} 的 ${districtLabelZh(district)}`;
}

export function templateMagicianExchange(
  players: Map<string, { username: string }>,
  actorId: string,
  targetId: string,
): string {
  return `${playerName(players, actorId)} 与 ${playerName(players, targetId)} 交换了全部手牌`;
}

export function templateMagicianDiscard(
  players: Map<string, { username: string }>,
  actorId: string,
  count: number,
  drewCount: number,
): string {
  return `${playerName(players, actorId)} 弃 ${count} 张手牌，抽取 ${drewCount} 张新牌`;
}
