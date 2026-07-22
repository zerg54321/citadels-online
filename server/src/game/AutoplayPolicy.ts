/**
 * 自动托管策略（L2 Autoplay Policy）
 *
 * 核心模型：
 *   1 金币 = 1 GE
 *   1 张手牌 ≈ 2 GE（抽牌的机会成本）
 *
 * 设计原则：
 *   1. 先建后收：先盖建筑再手动收租，让新建城区参与当轮收入
 *   2. 经济第一：有铁匠铺时绝不二选一选牌（2金买1张 vs 2金买3张）
 *   3. 团队意识：保护队友资源，阻止对手发育
 *   4. 目标推理：利用公开信息缩小对手角色范围
 *
 * 用于超时托管和 AI 座位。支持 3v3 团队模式（TeamId A/B）。
 */

import {
	CharacterChoosingStateType as CCST,
	ClientTurnState,
	DistrictId,
	GamePhase,
	Move,
	MoveType,
	TeamId,
	districts,
} from 'citadels-common';
import GameState from './GameState';
import { CharacterPosition, CharacterType } from './CharacterManager';
import DistrictCard, { ALL_DISTRICTS, DistrictType } from './DistrictCard';

// ---------------------------------------------------------------------------
// 基础数据：卡牌造价/类型/额外分
// ---------------------------------------------------------------------------

const CARD_COST: Record<string, number> = Object.fromEntries(
	Object.entries(districts).map(([id, d]) => [id, (d as { cost?: number }).cost ?? 99]),
);

const CARD_TYPE: Record<string, number> = Object.fromEntries(
	Object.entries(districts).map(([id, d]) => [id, (d as { type?: number }).type ?? 0]),
);

const CARD_EXTRA: Record<string, number> = Object.fromEntries(
	Object.entries(districts).map(([id, d]) => {
		const extra = (d as { extra_points?: number }).extra_points ?? 0;
		return [id, extra];
	}),
);

const GE_GOLD = 1;
const GE_CARD = 2;
const COMPLETE_DEFAULT = 8;

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/** 逐个尝试 move 列表，返回第一个可行的 move */
function tryMoves(gameState: GameState, moves: Move[]): Move | null {
	for (const move of moves) {
		if (gameState.step(move)) {
			gameState.step({ type: MoveType.AUTO });
			return move;
		}
	}
	return null;
}

function costOf(id: string): number { return CARD_COST[id] ?? 99; }
function typeOf(id: string): number { return CARD_TYPE[id] ?? 0; }
function isUnique(id: string): boolean { return typeOf(id) === DistrictType.UNIQUE; }

/** 金币当量：手上总资产 */
function goldEquivalent(stash: number, handCount: number): number {
	return stash * GE_GOLD + handCount * GE_CARD;
}

// ---------------------------------------------------------------------------
// 队伍/状态查询
// ---------------------------------------------------------------------------

function teamOf(gs: GameState, playerId: string): TeamId {
	return gs.players.get(playerId)?.team ?? TeamId.NONE;
}

function isEnemy(gs: GameState, actorId: string, otherId: string): boolean {
	if (actorId === otherId) return false;
	const a = teamOf(gs, actorId);
	const b = teamOf(gs, otherId);
	if (a === TeamId.NONE || b === TeamId.NONE) return true;
	return a !== b;
}

function isAlly(gs: GameState, actorId: string, otherId: string): boolean {
	if (actorId === otherId) return true;
	const a = teamOf(gs, actorId);
	const b = teamOf(gs, otherId);
	if (a === TeamId.NONE || b === TeamId.NONE) return false;
	return a === b;
}

function cityOf(gs: GameState, playerId: string): DistrictId[] {
	return gs.board?.players.get(playerId)?.city ?? [];
}

function citySize(gs: GameState, playerId: string): number { return cityOf(gs, playerId).length; }

function stashOf(gs: GameState, playerId: string): number {
	return gs.board?.players.get(playerId)?.stash ?? 0;
}

function handOf(gs: GameState, playerId: string): DistrictId[] {
	return (gs.board?.players.get(playerId)?.hand || []).filter((c): c is DistrictId => c != null);
}

function handCount(gs: GameState, playerId: string): number { return handOf(gs, playerId).length; }

function completeSize(gs: GameState): number { return gs.completeCitySize || COMPLETE_DEFAULT; }

/** 王冠持有者 = playerOrder[0] */
function crownPlayerId(gs: GameState): string | null {
	return gs.board?.playerOrder[0] ?? null;
}

/** 获取某个角色在 playerOrder 中的座位，未分配返回 -1 */
function ownerSeatOfCharacter(gs: GameState, character: CharacterType): number {
	if (!gs.board || character < 0) return -1;
	const pos = gs.board.characterManager.characters[character];
	if (pos < CharacterPosition.PLAYER_1) return -1;
	return pos - CharacterPosition.PLAYER_1;
}

/** 获取某个角色的玩家 ID，未分配返回 null */
function ownerIdOfCharacter(gs: GameState, character: CharacterType): string | null {
	const seat = ownerSeatOfCharacter(gs, character);
	if (seat < 0 || !gs.board) return null;
	return gs.board.playerOrder[seat] ?? null;
}

/**
 * 角色是否已对全场"公开"——即人类玩家也能看到归属的状态。
 * 包括：当前正在行动的字符、已被刺杀/被偷、或面亮出放置的旁观牌。
 * 选角阶段其他玩家暗选的字符在此为 false，AI 不得据此获知归属（与人类一致）。
 */
function isRolePubliclyKnown(gs: GameState, character: CharacterType): boolean {
	const cm = gs.board?.characterManager;
	if (!cm) return false;
	if (cm.killedCharacter === character) return true;
	if (cm.robbedCharacter === character) return true;
	if (cm.getCurrentCharacter() === character) return true;
	const faceUpAside = cm.getCharactersAtPosition(CharacterPosition.ASIDE_FACE_UP) || [];
	if (faceUpAside.includes(character)) return true;
	return false;
}

/** 仅当角色已公开时才返回真实归属；否则返回 null */
function knownOwnerIfPublic(gs: GameState, character: CharacterType): string | null {
	if (!isRolePubliclyKnown(gs, character)) return null;
	return ownerIdOfCharacter(gs, character);
}

function countColorIn(list: string[], districtType: DistrictType | undefined): number {
	if (districtType === undefined) return 0;
	return list.filter((id) => typeOf(id) === districtType).length;
}

function cityColors(city: string[]): Set<number> {
	return new Set(city.map((id) => typeOf(id)).filter((t) => t >= 1 && t <= 5));
}

function missingColors(city: string[]): Set<number> {
	const have = cityColors(city);
	const miss = new Set<number>();
	for (let t = 1; t <= 5; t += 1) if (!have.has(t)) miss.add(t);
	return miss;
}

/** 检查玩家城市中是否有某类特殊建筑 */
function hasDistrict(playerId: string, gs: GameState, district: DistrictId): boolean {
	return gs.board?.players.get(playerId)?.city.includes(district) ?? false;
}

// ---------------------------------------------------------------------------
// 节奏/终局检测
//   develop: 前期发展
//   sprint:  自己或队友接近建成，全力冲刺
//   deny:    对手即将建成，需要阻止
// ---------------------------------------------------------------------------

type TempoMode = 'develop' | 'sprint' | 'deny';

function maxEnemyCity(gs: GameState, actorId: string): number {
	let m = 0;
	gs.board?.playerOrder.forEach((pid) => {
		if (isEnemy(gs, actorId, pid)) m = Math.max(m, citySize(gs, pid));
	});
	return m;
}

function maxAllyCity(gs: GameState, actorId: string): number {
	let m = citySize(gs, actorId);
	gs.board?.playerOrder.forEach((pid) => {
		if (isAlly(gs, actorId, pid)) m = Math.max(m, citySize(gs, pid));
	});
	return m;
}

function detectTempo(gs: GameState, actorId: string): TempoMode {
	const limit = completeSize(gs);
	const enemyMax = maxEnemyCity(gs, actorId);
	const selfCity = citySize(gs, actorId);
	const allyMax = maxAllyCity(gs, actorId);

	// 对手濒临建成 → 阻止模式
	if (enemyMax >= limit - 1) return 'deny';
	// 自己/队友接近建成 → 冲刺模式
	if (enemyMax >= limit - 2 || selfCity >= limit - 2 || allyMax >= limit - 2) return 'sprint';
	return 'develop';
}

// ---------------------------------------------------------------------------
// A. 角色选角评分（选角阶段的决策核心）
// ---------------------------------------------------------------------------

/** 收入角色评分：统计我方城市/手牌中对应颜色数量 */
function taxRoleScore(city: string[], hand: string[], character: CharacterType): number {
	const dt = DistrictCard.getDistrictTypeFromCharacter(character);
	if (dt === undefined) return 0;
	const onBoard = countColorIn(city, dt);
	const inHand = countColorIn(hand, dt);
	return onBoard * 1.0 + inHand * 0.6; // 手牌中的潜在收益打折
}

/**
 * 选角评分：综合自身发展 + 团队保护 + 阻止对手
 *
 * 核心思想：
 * - 首发拿刺客可以防止对手拿到刺客后砍我/队友
 * - 高收益角色（建筑师/商人/军阀）在后期价值暴增
 * - 拿克制角色（刺客克高收益、主教克军阀、盗贼克商人）也有战略加分
 */
function scoreCharacterPick(
	gs: GameState,
	actorId: string,
	character: CharacterType,
	remaining: CharacterType[],
	useSeatWeights = true, // V1: 启用座位权重/口诀策略
): number {
	const city = cityOf(gs, actorId);
	const hand = handOf(gs, actorId);
	const stash = stashOf(gs, actorId);
	const hc = hand.length;
	const limit = completeSize(gs);
	const tempo = detectTempo(gs, actorId);
	const selfCity = city.length;
	const enemyMax = maxEnemyCity(gs, actorId);
	const crownId = crownPlayerId(gs);
	const allyHasCrown = crownId != null && crownId !== actorId && isAlly(gs, actorId, crownId);

	// 检查特殊建筑
	const hasLab = hasDistrict(actorId, gs, 'laboratory');
	const hasSmithy = hasDistrict(actorId, gs, 'smithy');

	let score = 0;
	const tSeat = gs.board?.playerOrder.indexOf(actorId) ?? -1;

	switch (character) {
	case CharacterType.ASSASSIN: {
		// 基础分 5，刺客的战略价值在于阻止对手高收益角色
		score = 5;
		// 中后期价值暴增——阻止对手冲刺
		if (tempo === 'deny' || tempo === 'sprint') score += 8;
		if (enemyMax >= limit - 2) score += 6;
		// 保护队友资源：队友有大量金币时刺盗贼保护，有大量手牌时刺魔术师
		let maxAllyGold = 0;
		let maxAllyHand = 0;
		gs.board?.playerOrder.forEach((pid) => {
			if (isAlly(gs, actorId, pid)) {
				maxAllyGold = Math.max(maxAllyGold, stashOf(gs, pid));
				maxAllyHand = Math.max(maxAllyHand, handCount(gs, pid));
			}
		});
		if (maxAllyGold >= 6) score += 5; // 队友有大量金币 → 选刺客保护
		if (maxAllyHand >= 4) score += 4; // 队友有大量手牌 → 选刺客保护
		if (maxAllyCity(gs, actorId) >= limit - 2) score += 5;
		break;
	}
	case CharacterType.THIEF: {
		// 对手金币多时有价值
		score = 3;
		let maxEnemyGold = 0;
		gs.board?.playerOrder.forEach((pid) => {
			if (isEnemy(gs, actorId, pid)) maxEnemyGold = Math.max(maxEnemyGold, stashOf(gs, pid));
		});
		score += Math.min(8, maxEnemyGold * 0.8);
		break;
	}
	case CharacterType.MAGICIAN: {
		// 手牌少时魔术师价值高（换对手的手牌）
		score = 3;
		if (hc === 0) score += 8;
		else if (hc <= 2) score += 4;
		// 对手手牌多时可以交换获益
		let maxEnemyHand = 0;
		gs.board?.playerOrder.forEach((pid) => {
			if (isEnemy(gs, actorId, pid)) maxEnemyHand = Math.max(maxEnemyHand, handCount(gs, pid));
		});
		if (maxEnemyHand > hc + 2) score += (maxEnemyHand - hc) * 1.2;
		break;
	}
	case CharacterType.KING: {
		// 国王：收入 + 王冠转移（决定下轮选角顺序）
		score = 3 + taxRoleScore(city, hand, CharacterType.KING) * 2;
		score += 2; // 王冠附加分
		if (allyHasCrown) score -= 6; // 队友已经有王冠了，不抢
		break;
	}
	case CharacterType.BISHOP: {
		// 主教：收入 + 防军阀
		score = 3 + taxRoleScore(city, hand, CharacterType.BISHOP) * 2;
		if (selfCity >= limit - 3) score += 5;
		if (tempo === 'sprint' || tempo === 'deny') score += 3;
		break;
	}
	case CharacterType.MERCHANT: {
		// 商人：收入 + 被动+1金 + 经济引擎
		score = 4 + taxRoleScore(city, hand, CharacterType.MERCHANT) * 2;
		if (stash < 6) score += 2; // 缺钱时商人价值高
		if (tempo === 'sprint') score += 4;
		// 有铁匠铺时商人价值更高（需要金币启动铁匠铺）
		if (hasSmithy) score += 3;
		// 有实验室时商人价值更高
		if (hasLab) score += 2;
		break;
	}
	case CharacterType.ARCHITECT: {
		// 建筑师：多建2房 + 3建造权，冲刺阶段的绝对核心
		score = 3;
		// 足够资源时建筑师非常强
		if (hc >= 2 && stash >= 4) score += 12;
		else if (hc >= 1 && stash >= 5) score += 8;
		else if (stash >= 7) score += 7;
		else score += Math.min(5, stash * 0.4 + hc * 0.5);
		if (tempo === 'sprint' && selfCity >= limit - 3) score += 10;
		if (selfCity >= limit - 2) score += 8;
		// 有实验室时建筑师价值更高：二选一2金 + 被动2牌 + 实验室卖1无用牌 = 3金1牌
		if (hasLab && hc >= 2) score += 4;
		break;
	}
	case CharacterType.WARLORD: {
		// 军阀：收入 + 拆建筑
		score = 3 + taxRoleScore(city, hand, CharacterType.WARLORD) * 2;
		if (enemyMax >= limit - 2) score += 12; // 对手接近完成，拆他！
		if (enemyMax >= limit - 1) score += 8;
		if (tempo === 'deny') score += 6;
		if (stash >= 2) score += 1; // 攒够了首付
		break;
	}
	default: score = 1;
	}

	// 轻微随机扰动，避免评分相同时总选同一个
	score += Math.random() * 0.3;
	if (!remaining.includes(character)) return -999;

	// V1 专属：座位权重 + 同色截断 + 功能建筑联动
	if (useSeatWeights) {
		score += seatWeights(gs, actorId, character, tSeat, selfCity, stash, hc);
		score += colorInterceptScore(gs, actorId, character, tSeat);
		if (hasSmithy || hasLab) {
			if (character === CharacterType.KING) score += 4;
		}
		// 图书馆+天文台双持：抽牌类角色的价值激增
		const hasLib = city.includes('library');
		const hasObs = city.includes('observatory');
		if (hasLib && hasObs) {
			if (character === CharacterType.ARCHITECT) score += 5;
			if (character === CharacterType.MAGICIAN) score += 3;
		}
	}

	return score;
}

/** V1 座位权重 */
function seatWeights(
	gs: GameState, actorId: string, character: CharacterType,
	seat: number, selfCity: number, stash: number, hc: number,
): number {
	switch (seat) {
	case 1: // P2：防守位，必拿 238（盗贼魔术师军阀）
		if (character === CharacterType.THIEF) return 5;
		if (character === CharacterType.MAGICIAN) return 4;
		if (character === CharacterType.WARLORD) return 3;
		if (character === CharacterType.MERCHANT) return -3;
		if (character === CharacterType.ARCHITECT) return -3;
		break;
	case 2: // P3：中发，倾向发展/引擎角色
		if (character === CharacterType.KING) return 3;
		if (character === CharacterType.ARCHITECT) return 3;
		break;
	case 3: // P4：贱命拿官刀位（发育差时转为防守）
		if (selfCity <= 3 && stash <= 4 && hc <= 2) {
			if (character === CharacterType.WARLORD) return 6;
			if (character === CharacterType.MAGICIAN) return 4;
			if (character === CharacterType.THIEF) return 3;
		} else {
			if (character === CharacterType.MERCHANT) return 2;
			if (character === CharacterType.ARCHITECT) return 2;
		}
		break;
	case 4: case 5: // P5/P6：沉底，倾向经济/收尾
		if (character === CharacterType.MERCHANT) return 4;
		if (character === CharacterType.ARCHITECT) return 4;
		if (character === CharacterType.WARLORD) return 2;
		break;
	default: break;
	}
	return 0;
}

/** V1 同色截断：对手有大量同色时截断对应收入角色 */
function colorInterceptScore(
	gs: GameState, actorId: string, character: CharacterType, seat: number,
): number {
	if (!gs.board) return 0;
	const nextOpponents: string[] = [];
	for (let offset = 1; offset <= 3; offset += 1) {
		const idx = (seat + offset) % 6;
		const pid = gs.board?.playerOrder[idx];
		if (pid && isEnemy(gs, actorId, pid)) nextOpponents.push(pid);
	}
	if (nextOpponents.length === 0) return 0;

	const colorCounts = [0, 0, 0, 0, 0];
	nextOpponents.forEach((pid) => {
		cityOf(gs, pid).forEach((card) => {
			const t = typeOf(card);
			if (t >= 1 && t <= 5) colorCounts[t - 1] += 1;
		});
	});

	const charMap = [CharacterType.KING, CharacterType.BISHOP, CharacterType.MERCHANT, CharacterType.WARLORD];
	for (let t = 0; t < 4; t += 1) {
		if (colorCounts[t] >= 3 && character === charMap[t]) {
			const dt = t + 1 as DistrictType;
			const mySameColor = countColorIn(cityOf(gs, actorId), dt);
			if (mySameColor > 0) return colorCounts[t] * 3;
			return colorCounts[t] * 2;
		}
	}
	return 0;
}

/** 选角入口：决定选哪个角色。AI 首发必拿刺客。 */
function pickBestCharacterIndex(gs: GameState, actorId: string, useSeatWeights = true): number {
	if (!gs.board) return 0;
	const remaining = gs.board.characterManager.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
	if (!remaining.length) return 0;

	// 首发：如果有刺客，必拿刺客
	const assassinIdx = remaining.indexOf(CharacterType.ASSASSIN);
	if (assassinIdx >= 0) return assassinIdx;

	let bestIdx = 0;
	let bestScore = -1e9;
	remaining.forEach((ch, idx) => {
		const s = scoreCharacterPick(gs, actorId, ch, remaining, useSeatWeights);
		if (s > bestScore) { bestScore = s; bestIdx = idx; }
	});
	return bestIdx;
}

// ---------------------------------------------------------------------------
// B. 建造评分（决策该建哪张牌）
// ---------------------------------------------------------------------------

function buildScore(
	gs: GameState,
	actorId: string,
	card: DistrictId,
	tempo: TempoMode,
): number {
	const city = cityOf(gs, actorId);
	if (city.includes(card)) return -1000;
	const c = costOf(card);
	const extra = CARD_EXTRA[card] ?? 0;
	const t = typeOf(card);
	const miss = missingColors(city);
	const limit = completeSize(gs);
	const n = city.length;

	if (tempo === 'sprint' || tempo === 'deny') {
		// 冲刺/阻止模式：最短路径到 8 城
		let score = 20 - c * 3;
		if (miss.has(t)) score += 4; // 补颜色仍有一点价值
		if (n + 1 >= limit) score += 50; // 建了这个就完成 → 极高优先
		return score;
	}

	// 发展模式：优先高价值 + 补颜色 + 特殊功能
	let score = c * 2 + extra * 3;
	if (c >= 4) score += 4;
	if (isUnique(card)) score += 5;
	if (miss.has(t)) score += 6; // 补颜色，为终局五色 +3 分做准备
	// 特殊建筑价值
	if (card === 'keep') score += 3;
	if (card === 'great_wall') score += 2;
	if (card === 'school_of_magic') {
		// 魔法学校：仅缺 1 色时极高价值（凑五色 +3 分）
		if (miss.size === 1) score += 16;
		else if (miss.size === 0) score += 6; // 已有五色，学校本身高造价值
		else score += 4; // 缺多色，早建不重要
	}
	if (card === 'laboratory' || card === 'smithy') score += 3; // 功能建筑值得早建
	// 前期少建便宜货
	if (c <= 1 && stashOf(gs, actorId) >= 5 && n < limit - 3) score -= 3;
	return score;
}

function sortBuildCandidates(
	gs: GameState,
	actorId: string,
	affordable: DistrictId[],
	tempo: TempoMode,
): DistrictId[] {
	return [...affordable].sort(
		(a, b) => buildScore(gs, actorId, b, tempo) - buildScore(gs, actorId, a, tempo),
	);
}

// ---------------------------------------------------------------------------
// C. 目标预测与刺杀/偷窃/交换/摧毁决策
// ---------------------------------------------------------------------------

/**
 * V2：排除法角色预测
 *
 * 利用公开信息推理对手可能选的角色：
 * 1. 所有角色 = 刺客(0)~军阀(7)
 * 2. 从已知归属的角色中排除：已分配座位的 + 已亮面弃置的
 * 3. 对剩余候选按 scoreCharacterPick 打分
 * 4. 返回按分数降序排列的 Top-N
 *
 * 与 V1 的 predictLikelyRoles 相比：
 * - V1 仅根据城市颜色/手牌/金币推测对手可能"想选"的角色
 * - V2 额外排除"肯定不在池中"的角色（已选走的/已弃置的）
 * - V2 对候选池中的每个角色实际评分，而非仅用启发式规则
 */
function predictElimination(
	gs: GameState,
	targetId: string,
	actorId: string, // 评估者 ID（决定信息可见性）
	useSeatWeights: boolean,
): CharacterType[] {
	if (!gs.board) return [];
	const cm = gs.board.characterManager;

	// 收集所有已分配的角色（座位 ≥ PLAYER_1 或 ASIDE_* 状态）
	const assigned: CharacterType[] = [];
	for (let ch = 0; ch < 8; ch += 1) {
		const pos = cm.characters[ch];
		if (pos !== CharacterPosition.NOT_CHOSEN) {
			assigned.push(ch as CharacterType);
		}
	}

	// 候选角色 = 全部 8 个 - 已分配的
	const candidates: CharacterType[] = [];
	for (let ch = 0; ch < 8; ch += 1) {
		if (!assigned.includes(ch as CharacterType)) {
			candidates.push(ch as CharacterType);
		}
	}

	if (candidates.length === 0) return candidates;

	// 对候选角色用 scoreCharacterPick 打分，按分数降序排列
	const scored = candidates.map((ch) => ({
		ch,
		score: scoreCharacterPick(gs, targetId, ch, candidates, useSeatWeights),
	}));
	scored.sort((a, b) => b.score - a.score);
	return scored.map((s) => s.ch);
}

/**
 * V2 版 predictLikelyRoles（排除法 + 原有启发式）
 * 优先用排除法缩小范围，再用原有启发式做补充
 */
function predictLikelyRolesV2(
	gs: GameState,
	targetId: string,
	actorId: string, // 评估者
	useSeatWeights: boolean,
): CharacterType[] {
	// 先用排除法
	const eliminated = predictElimination(gs, targetId, actorId, useSeatWeights);
	if (eliminated.length <= 3) return eliminated;

	// 候选池仍较大（>3），用原有启发式进一步排序取 Top-3
	return eliminated.slice(0, 3);
}
function predictLikelyRoles(gs: GameState, targetId: string): CharacterType[] {
	const stash = stashOf(gs, targetId);
	const hc = handCount(gs, targetId);
	const city = cityOf(gs, targetId);
	const likely: { ch: CharacterType; w: number }[] = [];

	// 通过城市颜色推断收入角色
	([CharacterType.KING, CharacterType.BISHOP, CharacterType.MERCHANT, CharacterType.WARLORD] as CharacterType[]).forEach((ch) => {
		const w = taxRoleScore(city, [], ch);
		if (w > 0) likely.push({ ch, w });
	});

	// 高资源时可能选建筑师
	if (hc >= 2 && stash >= 4) likely.push({ ch: CharacterType.ARCHITECT, w: 6 });
	else if (stash >= 5) likely.push({ ch: CharacterType.ARCHITECT, w: 3 });

	// 接近完成时选建筑师或主教
	if (city.length >= completeSize(gs) - 2) {
		likely.push({ ch: CharacterType.ARCHITECT, w: 8 });
		likely.push({ ch: CharacterType.WARLORD, w: 5 });
		likely.push({ ch: CharacterType.BISHOP, w: 4 });
	}

	// 金币多时选商人的概率较高
	if (stash >= 4) likely.push({ ch: CharacterType.MERCHANT, w: 3 });

	// 手牌极少时可能选盗贼（偷别人的）
	if (hc <= 1 && stash <= 3) likely.push({ ch: CharacterType.THIEF, w: 2 });

	// 手牌多时可能选魔术师（可以和人换手牌）
	if (hc >= 3) likely.push({ ch: CharacterType.MAGICIAN, w: 2 });

	likely.sort((a, b) => b.w - a.w);
	const out: CharacterType[] = [];
	likely.forEach(({ ch }) => { if (!out.includes(ch)) out.push(ch); });
	return out;
}

/**
 * 计算刺杀目标的优先队列（客户端 ID 1-8）
 * 已知归属：砍高城市/高资源/高威胁角色
 * 未知归属：通过 predictLikelyRoles 缩小范围
 */
function assassinTargets(gs: GameState, actorId: string, usePredictionV2 = false): number[] {
	if (!gs.board) return [];
	const cm = gs.board.characterManager;
	const tempo = detectTempo(gs, actorId);
	const limit = completeSize(gs);
	const allyNearWin = maxAllyCity(gs, actorId) >= limit - 2;
	const enemyNearWin = maxEnemyCity(gs, actorId) >= limit - 2;

	const scored: { clientId: number; score: number }[] = [];

	for (let ch = CharacterType.THIEF; ch <= CharacterType.WARLORD; ch += 1) {
		if (ch === cm.killedCharacter) continue;
		const ownerId = knownOwnerIfPublic(gs, ch);
		let score = 0;

		if (ownerId && isAlly(gs, actorId, ownerId)) {
			score = -200; // 不砍队友（已知归属）
		} else if (ownerId && isEnemy(gs, actorId, ownerId)) {
			// 已知是敌人：按对方城市/资源/角色评估
			score = citySize(gs, ownerId) * 4 + stashOf(gs, ownerId) + handCount(gs, ownerId);
			if (ch === CharacterType.WARLORD) score += 8;
			if (ch === CharacterType.ARCHITECT) score += 7;
			if (ch === CharacterType.MERCHANT) score += 4;
			if (ch === CharacterType.MAGICIAN) score += 3;
			if (citySize(gs, ownerId) >= limit - 2) score += 12;
		} else {
			// 未知归属：用 predictLikelyRoles 预测
			const predFn = usePredictionV2
				? (pid: string) => predictLikelyRolesV2(gs, pid, actorId, true)
				: (pid: string) => predictLikelyRoles(gs, pid);
			let pred = 1;
			gs.board.playerOrder.forEach((pid) => {
				if (!isEnemy(gs, actorId, pid)) return;
				const roles = predFn(pid);
				const idx = roles.indexOf(ch);
				if (idx >= 0) {
					const threat = citySize(gs, pid) * 2 + stashOf(gs, pid) * 0.5;
					pred = Math.max(pred, (6 - idx) + threat);
				}
			});
			score = pred;
			// 角色基础权重
			const baseW: Partial<Record<CharacterType, number>> = {
				[CharacterType.WARLORD]: enemyNearWin ? 10 : 4,
				[CharacterType.ARCHITECT]: enemyNearWin ? 9 : 3,
				[CharacterType.MERCHANT]: 3,
				[CharacterType.THIEF]: 2,
				[CharacterType.BISHOP]: 2,
				[CharacterType.MAGICIAN]: enemyNearWin ? 6 : 3, // 受刺杀目标统计修正：魔术师实际选角频率高，威胁应匹配
				[CharacterType.KING]: 2,
			};
			score += baseW[ch as CharacterType.THIEF | CharacterType.MAGICIAN | CharacterType.KING | CharacterType.BISHOP | CharacterType.MERCHANT | CharacterType.ARCHITECT | CharacterType.WARLORD] ?? 0;
		}

		// 保护队友：优先刺军阀/盗贼保护接近完成的队友
		if (allyNearWin) {
			if (ch === CharacterType.WARLORD) score += 12;
			if (ch === CharacterType.THIEF) score += 3;
		}
		if (tempo === 'deny' && ch === CharacterType.ARCHITECT) score += 6;
		if (tempo === 'deny' && ch === CharacterType.MERCHANT) score += 4;

		scored.push({ clientId: ch + 1, score });
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.filter((s) => s.score > -100).map((s) => s.clientId);
}

/**
 * 偷窃目标：优先偷富有的敌人
 * 已知归属：直接按金币量排序
 * 未知归属：预测高收入角色（商人/军阀）优先
 */
function thiefTargets(gs: GameState, actorId: string, usePredictionV2 = false): number[] {
	if (!gs.board) return [];
	const cm = gs.board.characterManager;
	const scored: { clientId: number; score: number }[] = [];

	const enemies = (gs.board.playerOrder || []).filter((pid) => isEnemy(gs, actorId, pid));
	enemies.sort((a, b) => stashOf(gs, b) - stashOf(gs, a));

	for (let ch = CharacterType.MAGICIAN; ch <= CharacterType.WARLORD; ch += 1) {
		if (ch === cm.killedCharacter || ch === cm.robbedCharacter) continue;
		const ownerId = knownOwnerIfPublic(gs, ch);
		let score = 0;

		if (ownerId && isAlly(gs, actorId, ownerId)) {
			score = -200;
		} else if (ownerId && isEnemy(gs, actorId, ownerId)) {
			score = stashOf(gs, ownerId) * 5 + citySize(gs, ownerId);
			if (ch === CharacterType.MERCHANT) score += 4; // 商人有钱
		} else {
			// 预测：优先偷可能选商人/军阀的富敌
			const predFn = usePredictionV2
				? (pid: string) => predictLikelyRolesV2(gs, pid, actorId, true)
				: (pid: string) => predictLikelyRoles(gs, pid);
			enemies.forEach((pid) => {
				const roles = predFn(pid);
				const idx = roles.indexOf(ch);
				if (idx >= 0) {
					score += stashOf(gs, pid) * (1 - idx * 0.15);
				}
			});
			if (ch === CharacterType.MERCHANT) score += 2;
			if (ch === CharacterType.WARLORD) score += 1.5;
			if (ch === CharacterType.ARCHITECT) score += 1;
		}
		scored.push({ clientId: ch + 1, score });
	}

	scored.sort((a, b) => b.score - a.score);
	return scored.filter((s) => s.score > -100).map((s) => s.clientId);
}

/** 魔术师交换目标：手牌数远多于我的敌人 */
function magicianExchangeTargets(gs: GameState, actorId: string): number[] {
	if (!gs.board) return [];
	const myHand = handCount(gs, actorId);
	const scored: { seat: number; score: number }[] = [];

	gs.board.playerOrder.forEach((pid, seat) => {
		if (!isEnemy(gs, actorId, pid)) return;
		const their = handCount(gs, pid);
		const deltaCards = their - myHand;
		if (deltaCards <= 0) return;
		const geGain = deltaCards * GE_CARD;
		scored.push({ seat, score: geGain * 10 + their });
	});
	scored.sort((a, b) => b.score - a.score);
	return scored.map((s) => s.seat);
}

type DestroyCandidate = { seat: number; card: DistrictId; score: number };

/**
 * 军阀摧毁目标
 *
 * 评分维度（按权重从高到低）：
 * 1. 阻止建成：目标城市即将满分（>= limit-1），直接给最高分
 * 2. 拆已全色：目标已有 5 种颜色（相当于额外赚回 3 分的五色加成）
 * 3. 建筑类型价值：铁匠铺/实验室/魔法学校 > 其他特殊建筑 > 普通建筑
 * 4. 同色密集：目标城市中同色建筑多 → 收租收益更大
 * 5. 目标城市规模：城市越大，摧毁越痛
 */
function warlordDestroyCandidates(gs: GameState, actorId: string): DestroyCandidate[] {
	const { board } = gs;
	if (!board) return [];
	const cm = board.characterManager;
	const me = board.players.get(actorId);
	if (!me) return [];
	const spendable = me.stash - cm.goldFromResourcesThisTurn;
	const limit = completeSize(gs);
	const tempo = detectTempo(gs, actorId);
	const out: DestroyCandidate[] = [];

	// 高价值建筑列表：拆这些对对手的打击最大
	const HIGH_VALUE_DISTRICTS: DistrictId[] = [
		'laboratory', 'smithy', 'school_of_magic',
		'library', 'observatory', 'graveyard',
		'great_wall', 'dragon_gate', 'university',
	];

	board.playerOrder.forEach((pid, seat) => {
		if (!isEnemy(gs, actorId, pid)) return;
		const other = board.players.get(pid);
		if (!other || other.city.length === 0) return;
		if (other.city.length >= limit) return; // 已经建成了，拆了也阻止不了

		const isBishop = cm.characters[CharacterType.BISHOP] === seat + CharacterPosition.PLAYER_1;
		if (isBishop && cm.killedCharacter !== CharacterType.BISHOP) return;

		// 计算目标城市的颜色分布（用于评分）
		const targetCity = other.city;
		const targetColors = new Map<number, number>(); // type → count
		targetCity.forEach((card) => {
			const t = typeOf(card);
			if (t >= 1 && t <= 4) targetColors.set(t, (targetColors.get(t) ?? 0) + 1);
		});
		const uniqueColors = cityColors(targetCity);
		const hasFullColorSet = uniqueColors.size >= 5; // 对手是否已凑齐五色（含紫色 5）

		targetCity.forEach((card) => {
			if (card === 'keep') return; // 城堡不可拆
			const cost = other.computeDestroyCost(card);
			if (cost > spendable) return;

	let score = 0;
	const tSeat = gs.board?.playerOrder.indexOf(actorId) ?? -1;

			// ----- 1. 阻止建成（最高优先级） -----
			if (other.city.length >= limit - 1) score += 50;
			else if (other.city.length >= limit - 2) score += 20;

			// ----- 2. 拆已全色建筑（相当于额外赚 3 分） -----
			if (hasFullColorSet) score += 15; // 对方已凑五色，拆一个可能破色

			// ----- 3. 高价值建筑 -----
			if (HIGH_VALUE_DISTRICTS.includes(card)) {
				const idx = HIGH_VALUE_DISTRICTS.indexOf(card);
				score += 15 - idx; // laboratory/smithy/school_of_magic = +15, 依次递减
			}

			// 特殊建筑（紫色）也有额外价值
			if (isUnique(card)) score += 5;

			// ----- 4. 同色密集：拆同色多的，降低对方收租收益 -----
			const cardType = typeOf(card);
			if (cardType >= 1 && cardType <= 4) {
				const sameColorCount = targetColors.get(cardType) ?? 0;
				if (sameColorCount >= 2) score += sameColorCount * 4; // 每多一个同色 +4
			}

			// ----- 5. 目标城市越大越值得拆 -----
			score += other.city.length * 4;

			// ----- 6. 冲刺/阻止模式加分 -----
			if (tempo === 'deny') score += 10;
			if (tempo === 'sprint') score += 5;

			// ----- 7. 拆后余量：拆完后剩下的钱还能再盖一栋吗？ -----
			// 能盖 → 高优先级（一拆一建，净赚）；不能盖 → 但对手濒临建成仍值得
			const afterDestroy = spendable - cost;
			const myHand = handOf(gs, actorId);
			const myCity = cityOf(gs, actorId);
			const canBuildAfterDestroy = myHand.some(
				(c) => costOf(c) <= afterDestroy && !myCity.includes(c),
			);
			if (canBuildAfterDestroy) {
				score += 12; // 拆完还能再盖，大幅加分
			} else if (other.city.length <= limit - 2) {
				score -= 5; // 对手没濒临完成，拆了自己又没钱盖，不太划算
			}
			// 对手濒临完成（>= limit-1）时，即使拆完没钱盖也要拆（阻止建成优先）——上面 already +50

			// 净收益：拆建筑花费 cost，但阻止了对方价值 card 的核心产出
			const cardValue = costOf(card) + (CARD_EXTRA[card] ?? 0);
			score += Math.max(0, cardValue - cost); // 拆越大越赚

			out.push({ seat, card, score });
		});
	});

	out.sort((a, b) => b.score - a.score);
	return out;
}

// ---------------------------------------------------------------------------
// D. 资源决策：拿金 vs 抽牌 vs 铁匠铺 vs 实验室
// ---------------------------------------------------------------------------

/**
 * 资源决策逻辑：
 *
 * 1. 有铁匠铺时：
 *    - 如果手牌少（< 3）：绝对不能选牌（应该先拿金，再用铁匠铺花 2 金抽 3 张）
 *    - 如果手牌多：拿金，用铁匠铺不如直接拿金盖房
 *
 * 2. 有实验室时：
 *    - 手牌有多余低价值牌 → 优先拿金后卖牌
 *
 * 3. 默认决策：
 *    - 有可建造的牌 → 拿金盖房
 *    - 手牌少 → 抽牌补充
 *    - 冲刺阶段 → 根据资源决定
 */
function shouldDrawCards(gs: GameState, actorId: string): boolean {
	const hc = handCount(gs, actorId);
	const stash = stashOf(gs, actorId);
	const hand = handOf(gs, actorId);
	const city = cityOf(gs, actorId);
	const hasSm = hasDistrict(actorId, gs, 'smithy');
	const hasLab = hasDistrict(actorId, gs, 'laboratory');
	const tempo = detectTempo(gs, actorId);

	// 有可建造的牌（手牌不重复且付得起）时，优先拿金币盖房
	const buildable = hand.filter((c) => costOf(c) <= stash && !city.includes(c));
	if (buildable.length > 0) return false;

	// 有铁匠铺且手牌少：拿金，用铁匠铺抽 3 张更划算
	if (hasSm && hc <= 2 && stash >= 2) return false;

	// 有实验室但手牌有多余垃圾：拿金，然后用实验室卖牌
	if (hasLab && hc >= 2 && stash >= 2) return false;

	// 手里有牌但建不起：仍然拿金
	if (hc > 0 && stash >= 2) return false;

	// 图书馆+天文台双持：抽牌极高价值（抽 3 张全保留）
	const hasLib = hasDistrict(actorId, gs, 'library');
	const hasObs = hasDistrict(actorId, gs, 'observatory');
	if (hasLib && hasObs && hc < 5) return true; // 双持：必抽牌

	// 手牌极少才抽牌
	if (hc < 2) return true;

	// 冲刺模式且没牌才抽
	if (tempo === 'sprint' && hc === 0) return true;

	// 有铁匠铺且手牌少且有金币：选择拿金用于铁匠铺
	if (hasSm && hc <= 1 && stash >= 1) return false;

	return false;
}

// ---------------------------------------------------------------------------
// 主入口：根据当前游戏的回合状态生成并执行下一步
// ---------------------------------------------------------------------------

export function pickAndApplyAutoplayMove(gameState: GameState, version: 'v0' | 'v1' | 'v2' = 'v2'): Move | null {
	if (!gameState.board) return null;
	const { board } = gameState;
	const cm = board.characterManager;
	const actorId = board.getCurrentPlayerId();
	if (!actorId) return null;
	const player = board.players.get(actorId);
	if (!player) return null;

	// =====================================================================
	// 初始二选一手牌阶段
	// =====================================================================
	if (board.gamePhase === GamePhase.INITIAL && board.initialCardSelectionQueue.length > 0) {
		if (player.tmpHand.length >= 1) {
			// 第 0 张是两张之一，随便选一张保留即可
			const card = player.tmpHand[0];
			return tryMoves(gameState, [{ type: MoveType.DRAW_CARDS, data: card }]);
		}
		return null;
	}

	// =====================================================================
	// 选角阶段
	// =====================================================================
	const useSeatWeights = version === 'v1' || version === 'v2';
	const usePredV2 = version === 'v2';

	if (board.gamePhase === GamePhase.CHOOSE_CHARACTERS) {
		const t = cm.choosingState.getState().type;
		if (t === CCST.PUT_ASIDE_FACE_UP || t === CCST.PUT_ASIDE_FACE_DOWN) {
			// 天绝/弃牌：把对自己最没用的牌丢掉
			const remaining = cm.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
			const scored = remaining.map((ch, idx) => ({
				idx, score: scoreCharacterPick(gameState, actorId, ch, remaining, useSeatWeights),
			}));
			scored.sort((a, b) => a.score - b.score);
			const moves = scored.map((s) => ({ type: MoveType.CHOOSE_CHARACTER, data: s.idx } as Move));
			if (!moves.length) moves.push({ type: MoveType.CHOOSE_CHARACTER, data: 0 });
			return tryMoves(gameState, moves);
		}
		if (t === CCST.CHOOSE_CHARACTER || t === CCST.PUT_ASIDE_FACE_DOWN_UP) {
			if (t === CCST.PUT_ASIDE_FACE_DOWN_UP) {
				const remaining = cm.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
				const order = remaining
					.map((ch, idx) => ({ idx, score: scoreCharacterPick(gameState, actorId, ch, remaining, useSeatWeights) }))
					.sort((a, b) => a.score - b.score);
				const moves = order.map((o) => ({ type: MoveType.CHOOSE_CHARACTER, data: o.idx } as Move));
				return tryMoves(gameState, moves.length ? moves : [{ type: MoveType.CHOOSE_CHARACTER, data: 0 }]);
			}
			const best = pickBestCharacterIndex(gameState, actorId, useSeatWeights);
			const moves: Move[] = [{ type: MoveType.CHOOSE_CHARACTER, data: best }];
			for (let i = 0; i < 8; i += 1) if (i !== best) moves.push({ type: MoveType.CHOOSE_CHARACTER, data: i });
			return tryMoves(gameState, moves);
		}
		return null;
	}

	if (board.gamePhase !== GamePhase.DO_ACTIONS) return null;

	// =====================================================================
	// 行动阶段
	// =====================================================================

	const turn = cm.getClientTurnState();
	const hand = handOf(gameState, actorId);
	const tempo = detectTempo(gameState, actorId);
	const character = cm.getCurrentCharacter();
	const canSpecial = cm.canDoSpecialAction[character] === true;
	const affordable = hand.filter((c) => costOf(c) <= player.stash && !player.city.includes(c));
	const buildOrder = sortBuildCandidates(gameState, actorId, affordable, tempo);
	const hasLab = hasDistrict(actorId, gameState, 'laboratory');
	const hasSmithy = hasDistrict(actorId, gameState, 'smithy');

	switch (turn) {

	// -----------------------------------------------------------------------
	// TAKE_RESOURCES: 准备获取资源（收租 → 建(先) → 手动收租 → 拿金/抽牌）
	// 策略：先建建筑，手动收租（新建城区参与收租），再拿资源
	// -----------------------------------------------------------------------
	case ClientTurnState.TAKE_RESOURCES: {
		const moves: Move[] = [];

		// 如果有收租权限，优先手动收租（如果已经建了建筑，建筑算入收租）
		if (cm.canTakeEarnings[character]) {
			moves.push({ type: MoveType.TAKE_GOLD_EARNINGS });
		}

		// 高优先级：如果可以建造，先建造（建筑会影响收租额）
		if (cm.districtsToBuild[character] > 0 && buildOrder.length) {
			moves.push({ type: MoveType.BUILD_DISTRICT });
		}

		// 如果是军阀且需要阻止对手，先攒金币
		if (character === CharacterType.WARLORD && tempo !== 'develop') {
			const destroys = warlordDestroyCandidates(gameState, actorId);
			if (!destroys.length && player.stash < 5) {
				moves.push({ type: MoveType.TAKE_GOLD }, { type: MoveType.DRAW_CARDS });
			}
		}

		// 最终资源选择：拿金 vs 抽牌
		if (shouldDrawCards(gameState, actorId)) {
			moves.push({ type: MoveType.DRAW_CARDS }, { type: MoveType.TAKE_GOLD });
		} else {
			moves.push({ type: MoveType.TAKE_GOLD }, { type: MoveType.DRAW_CARDS });
		}
		return tryMoves(gameState, moves);
	}

	// -----------------------------------------------------------------------
	// CHOOSE_CARD: 二选一选牌（保留哪张）
	// -----------------------------------------------------------------------
	case ClientTurnState.CHOOSE_CARD: {
		const tmp = [...player.tmpHand];
		// 有铁匠铺时：不应该进入此状态——二选一选牌等于 2 金买 1 张
		// 但既然已经进来了（被强制触发？），选评分最高的牌
		const scored = tmp.map((card) => ({
			card,
			score: buildScore(gameState, actorId, card, tempo) - costOf(card) * 0.1,
		}));
		scored.sort((a, b) => b.score - a.score);
		const moves = scored.map((s) => ({ type: MoveType.DRAW_CARDS, data: s.card } as Move));
		if (!moves.length) moves.push({ type: MoveType.DRAW_CARDS, data: null });
		return tryMoves(gameState, moves);
	}

	// -----------------------------------------------------------------------
	// CHOOSE_ACTION: 可选行动（特殊能力/建造/铁匠铺/实验室/结束回合）
	// -----------------------------------------------------------------------
	case ClientTurnState.CHOOSE_ACTION: {
		const moves: Move[] = [];

		// 铁匠铺：花 2 金抽 3 张（有铁匠铺且手牌少于 3 且够钱时使用）
		if (hasSmithy && !cm.hasUsedSmithy && player.stash >= 2 && hand.length < 3) {
			moves.push({ type: MoveType.SMITHY_DRAW_CARDS });
		}

		// 实验室：弃 1 牌换 1 金（有实验室且手牌多于 1 时，卖低价值牌）
		if (hasLab && !cm.hasUsedLaboratory && hand.length >= 2) {
			// 如果有可建造的牌，不卖；否则卖一张
			if (affordable.length === 0) {
				moves.push({ type: MoveType.LABORATORY_DISCARD_CARD });
			}
		}

		// 特殊能力
		if (canSpecial && character === CharacterType.ASSASSIN) {
			const t = assassinTargets(gameState, actorId, usePredV2);
			if (t.length) moves.push({ type: MoveType.ASSASSIN_KILL });
		}
		if (canSpecial && character === CharacterType.THIEF) {
			const t = thiefTargets(gameState, actorId, usePredV2);
			if (t.length) moves.push({ type: MoveType.THIEF_ROB });
		}
		if (canSpecial && character === CharacterType.MAGICIAN) {
			const seats = magicianExchangeTargets(gameState, actorId);
			if (seats.length) moves.push({ type: MoveType.MAGICIAN_EXCHANGE_HAND });
			else if (hand.length <= 1) moves.push({ type: MoveType.MAGICIAN_DISCARD_CARDS });
		}
		if (canSpecial && character === CharacterType.WARLORD) {
			const destroys = warlordDestroyCandidates(gameState, actorId);
			if (destroys.length) {
				if (tempo === 'deny' || tempo === 'sprint' || destroys[0].score >= 12) {
					moves.push({ type: MoveType.WARLORD_DESTROY_DISTRICT });
				}
			}
		}

		// 建造
		if (cm.districtsToBuild[character] > 0 && buildOrder.length) {
			moves.push({ type: MoveType.BUILD_DISTRICT });
		}

		// 军阀摧毁（如果还没推过）
		if (canSpecial && character === CharacterType.WARLORD) {
			const destroys = warlordDestroyCandidates(gameState, actorId);
			if (destroys.length && !moves.some((m) => m.type === MoveType.WARLORD_DESTROY_DISTRICT)) {
				moves.push({ type: MoveType.WARLORD_DESTROY_DISTRICT });
			}
		}

		moves.push({ type: MoveType.FINISH_TURN });
		moves.push({ type: MoveType.DECLINE });
		return tryMoves(gameState, moves);
	}

	// -----------------------------------------------------------------------
	// BUILD_DISTRICT: 选择要建造的城区
	// -----------------------------------------------------------------------
	case ClientTurnState.BUILD_DISTRICT: {
		const moves = buildOrder.map((c) => ({ type: MoveType.BUILD_DISTRICT, data: c } as Move));
		moves.push({ type: MoveType.DECLINE });
		return tryMoves(gameState, moves);
	}

	// -----------------------------------------------------------------------
	// 特殊能力状态（刺杀/偷窃/交换/摧毁/墓地/实验室）
	// -----------------------------------------------------------------------
	case ClientTurnState.ASSASSIN_KILL: {
		const targets = assassinTargets(gameState, actorId, usePredV2);
		const moves = targets.map((id) => ({ type: MoveType.ASSASSIN_KILL, data: id } as Move));
		for (let cid = 2; cid <= 8; cid += 1) if (!targets.includes(cid)) moves.push({ type: MoveType.ASSASSIN_KILL, data: cid });
		moves.push({ type: MoveType.DECLINE });
		return tryMoves(gameState, moves);
	}

	case ClientTurnState.THIEF_ROB: {
		const killedClientId = cm.killedCharacter >= 0 ? cm.killedCharacter + 1 : -1;
		const targets = thiefTargets(gameState, actorId, usePredV2).filter((id) => id !== killedClientId);
		const moves = targets.map((id) => ({ type: MoveType.THIEF_ROB, data: id } as Move));
		for (let cid = 3; cid <= 8; cid += 1) {
			if (cid === killedClientId) continue;
			if (!targets.includes(cid)) moves.push({ type: MoveType.THIEF_ROB, data: cid });
		}
		moves.push({ type: MoveType.DECLINE });
		return tryMoves(gameState, moves);
	}

	case ClientTurnState.MAGICIAN_EXCHANGE_HAND: {
		const seats = magicianExchangeTargets(gameState, actorId);
		const moves = seats.map((seat) => ({ type: MoveType.MAGICIAN_EXCHANGE_HAND, data: seat } as Move));
		board.playerOrder.forEach((pid, idx) => {
			if (pid !== actorId && isEnemy(gameState, actorId, pid) && !seats.includes(idx)) {
				moves.push({ type: MoveType.MAGICIAN_EXCHANGE_HAND, data: idx });
			}
		});
		moves.push({ type: MoveType.DECLINE });
		return tryMoves(gameState, moves);
	}

	case ClientTurnState.MAGICIAN_DISCARD_CARDS: {
		if (hand.length) {
			const m = tryMoves(gameState, [{ type: MoveType.MAGICIAN_DISCARD_CARDS, data: [...hand] }]);
			if (m) return m;
		}
		return tryMoves(gameState, [{ type: MoveType.DECLINE }]);
	}

	case ClientTurnState.WARLORD_DESTROY_DISTRICT: {
		const cands = warlordDestroyCandidates(gameState, actorId);
		const moves: Move[] = cands.map((c) => ({
			type: MoveType.WARLORD_DESTROY_DISTRICT,
			data: { player: c.seat, card: c.card },
		}));
		moves.push({ type: MoveType.DECLINE });
		return tryMoves(gameState, moves);
	}

	case ClientTurnState.GRAVEYARD_RECOVER_DISTRICT: {
		// 墓地回收：如果墓地有牌且不贵，回收
		if (board.graveyard !== undefined && player.stash >= 1) {
			return tryMoves(gameState, [{ type: MoveType.GRAVEYARD_RECOVER_DISTRICT, data: board.graveyard }]);
		}
		return tryMoves(gameState, [{ type: MoveType.DECLINE }]);
	}

	case ClientTurnState.LABORATORY_DISCARD_CARD: {
		// 实验室卖牌：选手牌中价值最低的牌卖掉
		if (hand.length > 0) {
			// 按造价从低到高排序，卖最便宜的牌
			const sorted = [...hand].sort((a, b) => costOf(a) - costOf(b));
			for (const card of sorted) {
				const m = tryMoves(gameState, [{ type: MoveType.LABORATORY_DISCARD_CARD, data: card }]);
				if (m) return m;
			}
		}
		return tryMoves(gameState, [{ type: MoveType.DECLINE }]);
	}

	default:
		return tryMoves(gameState, [{ type: MoveType.FINISH_TURN }, { type: MoveType.DECLINE }]);
	}
}

export default { pickAndApplyAutoplayMove };
export function pickV0(gs: GameState): Move | null {
	return pickAndApplyAutoplayMove(gs, 'v0');
}

/** V1 版本（含口诀座位权重+同色截断+墓地铁匠→国王） */
export function pickV1(gs: GameState): Move | null {
	return pickAndApplyAutoplayMove(gs, 'v1');
}

/** V2 版本（V1 + 排除法推理 + 特殊建筑联动尚未加入），用于 AB 对比评估 */
export function pickV2(gs: GameState): Move | null {
	return pickAndApplyAutoplayMove(gs, 'v2');
}

/** 导出评分函数供评估脚本使用 */
export { scoreCharacterPick, buildScore };
