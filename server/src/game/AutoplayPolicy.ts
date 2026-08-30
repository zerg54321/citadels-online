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
	GameProgress,
	Move,
	MoveType,
	TeamId,
	districts,
} from 'citadels-common';
import GameState from './GameState';
import { CharacterPosition, CharacterType } from './CharacterManager';
import DistrictCard, { ALL_DISTRICTS, DistrictType } from './DistrictCard';
import type { AiExplainCandidate, AiExplainCollector, AiExplainFactor } from './AiExplainer';
import { CHAR_NAMES, round1 } from './AiExplainer';

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
const GE_CARD = 2; // 早期基准：1张牌 ≈ 2金（抽牌机会成本）
const COMPLETE_DEFAULT = 8;

/** MoveType → 可读标签（仅用于解释输出） */
const MOVE_LABEL: Record<number, string> = {
	[MoveType.TAKE_GOLD]: '拿金',
	[MoveType.DRAW_CARDS]: '抽牌',
	[MoveType.TAKE_GOLD_EARNINGS]: '收租',
	[MoveType.BUILD_DISTRICT]: '建造',
	[MoveType.CHOOSE_CHARACTER]: '选角',
	[MoveType.ASSASSIN_KILL]: '刺杀',
	[MoveType.THIEF_ROB]: '偷窃',
	[MoveType.MAGICIAN_EXCHANGE_HAND]: '交换手牌',
	[MoveType.MAGICIAN_DISCARD_CARDS]: '弃牌换牌',
	[MoveType.WARLORD_DESTROY_DISTRICT]: '拆房',
	[MoveType.SMITHY_DRAW_CARDS]: '铁匠铺抽3牌',
	[MoveType.LABORATORY_DISCARD_CARD]: '实验室卖牌',
	[MoveType.GRAVEYARD_RECOVER_DISTRICT]: '墓地回收',
	[MoveType.FINISH_TURN]: '结束回合',
	[MoveType.DECLINE]: '放弃',
	[MoveType.AUTO]: '系统自动',
};
const moveLabel = (t: number): string => MOVE_LABEL[t] ?? `move:${t}`;

// ---------------------------------------------------------------------------
// 工具函数
// ---------------------------------------------------------------------------

/**
 * 动态卡牌边际价值：早期 2.0，中后期衰减至 ~1.0。
 *
 * 原理：初期牌稀缺（每回合只能抽 1 张），1 张牌≈ 2 金；
 * 中后期建筑师/铁匠铺/天文台图书馆/墓地持续产牌，
 * 边际价值递减至接近金币价值。
 */
function cardMarginalValue(gs: GameState, playerId: string): number {
	const hc = handCount(gs, playerId);
	const city = cityOf(gs, playerId);

	let v = 2.0;

	// 手牌越多，边际价值越低（囤牌收益递减）
	if (hc >= 2) v -= 0.2;
	if (hc >= 3) v -= 0.3;
	if (hc >= 5) v -= 0.3;

	// 产牌引擎降低牌的稀缺性
	if (hasDistrict(playerId, gs, 'smithy')) v -= 0.2;
	if (hasDistrict(playerId, gs, 'observatory')) v -= 0.15;
	if (hasDistrict(playerId, gs, 'library')) v -= 0.15;

	// 游戏进度：城市越大，牌越不再是瓶颈
	const progress = city.length / completeSize(gs);
	v -= progress * 0.3;

	return Math.max(1.0, v);
}

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

/** 返回本轮已被队友选走的角色列表（选角阶段用，感知队友已选） */
function allyPickedCharacters(gs: GameState, actorId: string): CharacterType[] {
	const cm = gs.board?.characterManager;
	if (!cm) return [];
	const result: CharacterType[] = [];
	for (let ch = 0; ch < CharacterType.CHARACTER_COUNT; ch += 1) {
		const pos = cm.characters[ch];
		if (pos < CharacterPosition.PLAYER_1) continue;
		const pid = gs.board?.playerOrder[pos - CharacterPosition.PLAYER_1];
		if (pid && pid !== actorId && isAlly(gs, actorId, pid)) result.push(ch as CharacterType);
	}
	return result;
}

/** 返回本轮已被敌人选走的角色列表 */
function enemyPickedCharacters(gs: GameState, actorId: string): CharacterType[] {
	const cm = gs.board?.characterManager;
	if (!cm) return [];
	const result: CharacterType[] = [];
	for (let ch = 0; ch < CharacterType.CHARACTER_COUNT; ch += 1) {
		const pos = cm.characters[ch];
		if (pos < CharacterPosition.PLAYER_1) continue;
		const pid = gs.board?.playerOrder[pos - CharacterPosition.PLAYER_1];
		if (pid && isEnemy(gs, actorId, pid)) result.push(ch as CharacterType);
	}
	return result;
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

function countColorIn(list: string[], districtType: DistrictType | undefined): number {
	if (districtType === undefined) return 0;
	return list.filter((id) => typeOf(id) === districtType).length;
}

/** softmax：将渴望度数组转换为概率分布（温度 T 越大分布越平，越小越尖锐） */
function softmax(scores: number[], T = 4): number[] {
	if (!scores.length) return [];
	const mx = Math.max(...scores);
	const exps = scores.map((s) => Math.exp((s - mx) / T));
	const sum = exps.reduce((a, b) => a + b, 0);
	return exps.map((e) => e / sum);
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
 * 选角 EV 上下文：把选角时用到的公开信息一次性算好，避免 estimatePickEV 内重复计算
 */
interface PickEVContext {
	city: string[]; hand: string[]; stash: number; hc: number;
	selfCity: number; limit: number; tempo: TempoMode;
	enemyMax: number; allyHasCrown: boolean; hasLab: boolean; hasSmithy: boolean;
}

/**
 * 估算选择某角色本回合的预期收益（Expected Value，单位 GE = 金币当量）。
 *
 * 设计原则：
 *   - 只用公开信息（城市/手牌数/金库/已公开角色归属），不窥探手牌内容或对手暗选角色。
 *   - 确定性计算、不采样——富饶之城一回合收益大部分当回合兑现（收租/建造/偷抢），可直算。
 *   - 刺客首发由 forceAssassin 硬编码保证（见 pickBestCharacterIndex），此处刺客 EV 仅衡量
 *     "阻止对手高收益角色"的期望，用于非首发位或刺客已被天绝弃置时的选角。
 *
 * GE 换算：1 金 = 1 GE，1 张手牌 ≈ 2 GE（抽牌机会成本，见 GE_GOLD/GE_CARD）。
 */
function estimatePickEV(
	gs: GameState, actorId: string, character: CharacterType, ctx: PickEVContext,
): number {
	const {
		city, hand, stash, hc, selfCity, limit, tempo, enemyMax, allyHasCrown, hasLab, hasSmithy,
	} = ctx;
	const allyNearWin = maxAllyCity(gs, actorId) >= limit - 2;
	const enemyNearWin = enemyMax >= limit - 2;

	switch (character) {
	case CharacterType.ASSASSIN: {
		// 刺客无直接收入，EV = 阻止对手高收益角色的期望收益
		// 取每个对手"最可能角色"的估算收入，取最大威胁 × 命中权重
		let bestDenied = 0;
		gs.board?.playerOrder.forEach((pid) => {
			if (!isEnemy(gs, actorId, pid)) return;
			const roles = predictLikelyRoles(gs, pid);
			const top = roles[0];
			if (top === undefined) return;
			const income = taxRoleScore(cityOf(gs, pid), handOf(gs, pid), top);
			// 高资源对手被刺损失更大（含本回合建造/收租潜力）
			const threat = income + stashOf(gs, pid) * 0.2 + citySize(gs, pid) * 0.2;
			bestDenied = Math.max(bestDenied, threat);
		});
		let ev = Math.min(6, bestDenied * 0.5);
		if (allyNearWin) ev += 2; // 队友濒临建成 → 刺军阀/盗贼保护
		if (enemyNearWin || tempo === 'deny') ev += 2; // 对手濒临建成 → 阻止价值上升
		return ev;
	}
	case CharacterType.THIEF: {
		// 盗贼 EV = 偷到对手金库的期望。取富敌前两名金库之和 × 命中概率
		let topStash = 0;
		let secondStash = 0;
		gs.board?.playerOrder.forEach((pid) => {
			if (!isEnemy(gs, actorId, pid)) return;
			const s = stashOf(gs, pid);
			if (s > topStash) { secondStash = topStash; topStash = s; }
			else if (s > secondStash) secondStash = s;
		});
		// 命中概率 ≈ 0.6（目标角色未被刺且猜对富敌持有角色）
		let ev = Math.min(8, (topStash + secondStash) * 0.5 * 0.6);
		if (topStash >= 5) ev += 1; // 富敌越多越值
		return ev;
	}
	case CharacterType.MAGICIAN: {
		// 魔术师 EV = 换手牌收益（对手多出的手牌 × 动态卡值）或弃劣牌收益
		// 核心：空手套白狼——我手牌越少、敌人手牌越多，收益越大
		let maxEnemyHand = 0;
		gs.board?.playerOrder.forEach((pid) => {
			if (isEnemy(gs, actorId, pid)) maxEnemyHand = Math.max(maxEnemyHand, handCount(gs, pid));
		});
		const delta = Math.max(0, maxEnemyHand - hc);
		const cardVal = cardMarginalValue(gs, actorId);
		let ev = delta * cardVal * 0.5; // 换牌收益打折（不确定对手手牌质量）
		// 自己手牌极差（无牌可建）时弃牌换牌也有价值
		const buildable = hand.filter((c) => costOf(c) <= stash && !city.includes(c));
		if (buildable.length === 0 && hc >= 1) ev += 1.5;
		return ev;
	}
	case CharacterType.KING: {
		// 国王 EV = 黄色税收 + 王冠（下轮选角优先）+ 王冠转移价值
		let ev = taxRoleScore(city, hand, CharacterType.KING) * GE_GOLD;
		ev += allyHasCrown ? 0 : 1.5; // 王冠 ≈ 1.5 GE；队友已有王冠则不抢
		if (tempo === 'sprint' || tempo === 'deny') ev += 1; // 接近建成时王冠决定收尾顺序
		return ev;
	}
	case CharacterType.BISHOP: {
		// 主教 EV = 蓝色税收 + 防军阀摧毁的保护价值
		let ev = taxRoleScore(city, hand, CharacterType.BISHOP) * GE_GOLD;
		if (selfCity >= limit - 3) ev += 2; // 城市大 → 被军阀威胁，主教免疫价值上升
		if (tempo === 'sprint' || tempo === 'deny') ev += 1.5;
		return ev;
	}
	case CharacterType.MERCHANT: {
		// 商人 EV = 绿色税收 + 被动 +1 金（确定 GE）+ 缺钱/功能建筑联动
		let ev = taxRoleScore(city, hand, CharacterType.MERCHANT) * GE_GOLD + 1;
		if (stash < 6) ev += 1; // 缺钱时经济引擎更值
		if (hasSmithy) ev += 1.5; // 有铁匠铺需金币启动
		if (hasLab) ev += 1;
		if (tempo === 'sprint') ev += 2;
		return ev;
	}
	case CharacterType.ARCHITECT: {
		// 建筑师 EV = 2 张手牌(×动态卡值) + 可建造牌的建造收益期望
		const buildable = hand.filter((c) => costOf(c) <= stash + 2 && !city.includes(c));
		const cardVal = cardMarginalValue(gs, actorId);
		let ev = 2 * cardVal + buildable.length * 1.5;
		if (hc >= 2 && stash >= 4) ev += 2; // 资源充足时建造兑现率高
		if (selfCity >= limit - 2) ev += 2; // 冲刺收尾
		if (hasLab && hc >= 2) ev += 1.5;
		return ev;
	}
	case CharacterType.WARLORD: {
		// 军阀 EV = 红色税收 + 摧毁对手高价值建筑的期望收益
		let ev = taxRoleScore(city, hand, CharacterType.WARLORD) * GE_GOLD;
		// 摧毁价值：取对手最贵可拆建筑（公开）× 可负担概率
		let bestDestroy = 0;
		gs.board?.playerOrder.forEach((pid) => {
			if (!isEnemy(gs, actorId, pid)) return;
			cityOf(gs, pid).forEach((card) => {
				if (card === 'keep') return; // 城堡不可拆
				bestDestroy = Math.max(bestDestroy, costOf(card));
			});
		});
		// 摧毁花费 = cost-1；stash 够则兑现率高
		const affordable = stash >= bestDestroy - 1 ? 0.6 : 0.2;
		ev += bestDestroy * 0.4 * affordable;
		if (enemyNearWin) ev += 3; // 阻止建成
		if (tempo === 'deny') ev += 2;
		return ev;
	}
	default:
		return 1;
	}
}

/**
 * 选角评分：以 EV（预期收益，GE）为基础分，叠加人类口诀先验（座位权重/同色截断/特殊建筑联动）。
 *
 * 核心思想：
 * - 基础分 = estimatePickEV，确定性公开信息计算，可解释、零方差
 * - 首发拿刺客由 forceAssassin 硬编码保证（不依赖本评分）
 * - 口诀先验（seatWeights/colorIntercept/双持）叠在 EV 之上，保证 AI 像人预期那样选
 */
/**
 * 选角评分的因子分解：返回各命名成分（供解释输出展示），总和即评分。
 * scoreCharacterPick = 各因子之和；本函数是唯一事实来源，改评分结构必须改这里。
 */
function characterPickFactors(
	gs: GameState,
	actorId: string,
	character: CharacterType,
	remaining: CharacterType[],
	useSeatWeights = true,
	useTeamAware = true,
): AiExplainFactor[] {
	if (!remaining.includes(character)) return [{ label: '不可选', value: -999 }];

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
	const hasLab = hasDistrict(actorId, gs, 'laboratory');
	const hasSmithy = hasDistrict(actorId, gs, 'smithy');
	const tSeat = gs.board?.playerOrder.indexOf(actorId) ?? -1;

	const factors: AiExplainFactor[] = [];

	// 基础分 = 该角色本回合的预期收益（EV，单位 GE）
	factors.push({
		label: '本回合预期收益EV',
		value: estimatePickEV(gs, actorId, character, {
			city, hand, stash, hc, selfCity, limit, tempo, enemyMax, allyHasCrown, hasLab, hasSmithy,
		}),
	});

	// 轻微随机扰动，避免评分相同时总选同一个
	factors.push({ label: '随机扰动(≤0.3)', value: Math.random() * 0.3 });

	// V1 专属：座位权重 + 同色截断 + 功能建筑联动（人类口诀先验，叠在 EV 之上）
	if (useSeatWeights) {
		factors.push({ label: '座位权重', value: seatWeights(gs, actorId, character, tSeat, selfCity, stash, hc) });
		factors.push({ label: '同色截断', value: colorInterceptScore(gs, actorId, character, tSeat) });
		if (hasSmithy || hasLab) {
			if (character === CharacterType.KING) factors.push({ label: '功能建筑联动', value: 4 });
		}
		// 图书馆+天文台双持：抽牌类角色的价值激增
		const hasLib = city.includes('library');
		const hasObs = city.includes('observatory');
		if (hasLib && hasObs) {
			if (character === CharacterType.ARCHITECT) factors.push({ label: '双持图书馆+天文台', value: 5 });
			if (character === CharacterType.MAGICIAN) factors.push({ label: '双持图书馆+天文台', value: 3 });
		}
	}

	// 团队感知（仅选角时启用，预测时关闭以避免循环惩罚）
	if (useTeamAware) {
		factors.push({ label: '颜色亲和', value: colorAffinityBonus(gs, actorId, character) });
		factors.push({ label: '队友协同', value: teamSynergyScore(gs, actorId, character) });
	}

	return factors;
}

function scoreCharacterPick(
	gs: GameState,
	actorId: string,
	character: CharacterType,
	remaining: CharacterType[],
	useSeatWeights = true, // V1: 启用座位权重/口诀策略
	useTeamAware = true, // 团队感知：颜色亲和度 + 队友已选互补（预测时关闭）
): number {
	return characterPickFactors(gs, actorId, character, remaining, useSeatWeights, useTeamAware)
		.reduce((sum, f) => sum + f.value, 0);
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

/**
 * 颜色亲和度让牌：收入角色对应色系建筑多的玩家更适合拿该角色。
 * 若队友的亲和色建筑远多于我 → 减分（让给队友）；反之加分。
 * 仅对 KING/BISHOP/MERCHANT/WARLORD 生效。
 */
function colorAffinityBonus(gs: GameState, actorId: string, character: CharacterType): number {
	const dt = DistrictCard.getDistrictTypeFromCharacter(character);
	if (dt === undefined) return 0; // 非收入角色无亲和色

	const myColor = countColorIn(cityOf(gs, actorId), dt);

	// 找队友中该色建筑最多的
	let allyMaxColor = 0;
	gs.board?.playerOrder.forEach((pid) => {
		if (pid !== actorId && isAlly(gs, actorId, pid)) {
			allyMaxColor = Math.max(allyMaxColor, countColorIn(cityOf(gs, pid), dt));
		}
	});

	// 队友亲和色远多于我 → 让牌（减分）；我远多于队友 → 加分
	const diff = myColor - allyMaxColor;
	if (diff >= 2) return 2; // 我最适合拿这个
	if (diff <= -2) return -2; // 队友更适合，让给他
	return 0;
}

/**
 * 团队互补分：感知队友本轮已选角色，避免功能重叠。
 * - 队友已选进攻角色（刺客/盗贼）→ 我不需要再选（-3）
 * - 队友已选同类型收入角色 → 递减（-2）
 * - 队友已选建筑师 → 发展位已覆盖（-2）
 */
function teamSynergyScore(gs: GameState, actorId: string, character: CharacterType): number {
	const allyPicks = allyPickedCharacters(gs, actorId);
	if (!allyPicks.length) return 0;

	let penalty = 0;
	const INCOME_ROLES = [CharacterType.KING, CharacterType.BISHOP, CharacterType.MERCHANT, CharacterType.WARLORD];

	allyPicks.forEach((ch) => {
		if (ch === CharacterType.ASSASSIN || ch === CharacterType.THIEF) {
			// 队友已覆盖进攻，我不需要再选同类
			if (character === CharacterType.ASSASSIN || character === CharacterType.THIEF) penalty -= 3;
		} else if (INCOME_ROLES.includes(ch)) {
			// 队友已选收入角色，我选同类型收益递减
			if (character === ch) penalty -= 2;
		} else if (ch === CharacterType.ARCHITECT) {
			// 发展位已覆盖
			if (character === CharacterType.ARCHITECT) penalty -= 2;
		}
	});

	return penalty;
}

/** 选角入口：决定选哪个角色。AI 首发必拿刺客（forceAssassin=true 时）。 */
function pickBestCharacterIndex(gs: GameState, actorId: string, useSeatWeights = true, forceAssassin = true): number {
	if (!gs.board) return 0;
	const remaining = gs.board.characterManager.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
	if (!remaining.length) return 0;

	// 首发：如果有刺客，必拿刺客
	if (forceAssassin) {
		const assassinIdx = remaining.indexOf(CharacterType.ASSASSIN);
		if (assassinIdx >= 0) return assassinIdx;
	}

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
 * 概率推理：估算目标玩家持有池中各角色的概率分布（softmax over 选角渴望度）。
 *
 * 设计要点：
 * - 池中角色用 scoreCharacterPick 从目标玩家视角评分（座位权重反映选角倾向）
 * - 预测专用偏差修正：scoreCharacterPick 是为「自己选角」设计的，用作「预测他人」时
 *   有系统性偏差——建筑师基础EV恒定4GE(2牌)导致被过度预测，而真实玩家选角时
 *   收入需求权重更高。因此对建筑师施加 -1 预测折扣，对四个收入角色 +0.5 补偿。
 * - 叠加 ±0.75 噪声模拟人类非最优选角
 * - softmax(T=4.0) 输出与均匀先验按 0.8/0.2 混合，保证任何单一角色不会垄断目标
 * - 返回 { role → probability }，池外角色概率为 0
 */
function roleProbabilities(
	gs: GameState, targetId: string, pool: CharacterType[],
): Map<CharacterType, number> {
	const result = new Map<CharacterType, number>();
	if (!pool.length) return result;
	const INCOME_ROLES = [CharacterType.KING, CharacterType.BISHOP, CharacterType.MERCHANT, CharacterType.WARLORD];
	const desirability = pool.map((ch) => {
		let s = scoreCharacterPick(gs, targetId, ch, pool, true, false);
		// 预测偏差修正：建筑师基础EV恒定高估，收入角色被低估
		if (ch === CharacterType.ARCHITECT) s -= 1;
		if (INCOME_ROLES.includes(ch)) s += 0.5;
		return s + (Math.random() - 0.5) * 1.5;
	});
	const raw = softmax(desirability, 4);
	// 与均匀先验混合：模型 80% + 先验 20%
	const uniform = 1 / pool.length;
	pool.forEach((ch, i) => result.set(ch, raw[i] * 0.8 + uniform * 0.2));
	return result;
}

/** 构建行动阶段的候选角色池：全部角色 - 刺客(自己) - 明置旁观牌 */
function buildActionPhasePool(cm: { characters: CharacterPosition[] }): CharacterType[] {
	const pool: CharacterType[] = [];
	for (let ch = CharacterType.THIEF; ch < CharacterType.CHARACTER_COUNT; ch += 1) {
		if (cm.characters[ch] === CharacterPosition.ASIDE_FACE_UP) continue;
		pool.push(ch as CharacterType);
	}
	return pool;
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

	// 魔术师：手牌少时交换收益大（空手套白狼），尤其场上有人手牌多
	if (hc <= 1) {
		let maxOtherHand = 0;
		gs.board?.playerOrder.forEach((pid) => {
			if (pid !== targetId) maxOtherHand = Math.max(maxOtherHand, handCount(gs, pid));
		});
		if (hc === 0 && maxOtherHand >= 2) likely.push({ ch: CharacterType.MAGICIAN, w: 4 });
		else if (maxOtherHand >= 2) likely.push({ ch: CharacterType.MAGICIAN, w: 3 });
	}

	likely.sort((a, b) => b.w - a.w);
	const out: CharacterType[] = [];
	likely.forEach(({ ch }) => { if (!out.includes(ch)) out.push(ch); });
	return out;
}

/**
 * 计算刺杀目标的优先队列（客户端 ID 2-8）
 *
 * V3 概率推理版——核心转变：从「按角色打分」变为「按敌人打分」。
 *
 * 旧版缺陷：对每个角色独立评分（预测排名 + 固定角色权重 baseW），军阀 baseW
 * 最高且 predictLikelyRoles 对多种敌人画像都推荐军阀，导致刺客永远刺 8。
 *
 * 新模型：
 * 1. 用 roleProbabilities 估算每个敌人持有各角色的概率分布（softmax over 选角渴望度）
 * 2. 对每个 (敌人, 角色) 组合计算期望阻止价值 = P(持有) × V(阻止该角色)
 *    V 综合考虑：城市规模、金库、手牌、角色功能威胁、终局节奏
 * 3. 按组合 EV 降序输出——自然实现「先锁定最大威胁的敌人，再打他最可能的角色」
 */
function assassinTargetCombos(gs: GameState, actorId: string): { clientId: number; ev: number; factors: AiExplainFactor[] }[] {
	if (!gs.board) return [];
	const cm = gs.board.characterManager;
	const tempo = detectTempo(gs, actorId);
	const limit = completeSize(gs);
	const allyNearWin = maxAllyCity(gs, actorId) >= limit - 2;
	const enemyNearWin = maxEnemyCity(gs, actorId) >= limit - 2;
	const pool = buildActionPhasePool(cm);
	if (!pool.length) return [];

	// 按角色聚合：敌人阻止收益 gainEV 与队友持有概率 allyP
	const gainEV = new Map<CharacterType, number>();
	const allyP = new Map<CharacterType, number>();
	pool.forEach((ch) => { gainEV.set(ch, 0); allyP.set(ch, 0); });

	gs.board.playerOrder.forEach((pid) => {
		const enemy = isEnemy(gs, actorId, pid);
		const ally = pid !== actorId && isAlly(gs, actorId, pid);
		if (!enemy && !ally) return;
		const probs = roleProbabilities(gs, pid, pool);

		// 队友：累加其持有各角色的概率（用于误伤惩罚）
		if (ally) {
			probs.forEach((p, ch) => allyP.set(ch, (allyP.get(ch) ?? 0) + p));
			return;
		}

		// 敌人：计算逐角色阻止价值并累加期望收益
		const city = citySize(gs, pid);
		const stash = stashOf(gs, pid);
		const hc = handCount(gs, pid);
		const nearWin = city >= limit - 2;
		probs.forEach((p, ch) => {
			if (p < 0.01) return;
			// 阻止价值 V：该角色本回合能产生的综合收益（城市/资源/手牌 + 角色功能）
			let v = city * 2.5 + stash * 0.8 + hc * 1.2;
			switch (ch) {
			case CharacterType.WARLORD: {
				// 拆建筑是最具破坏性的行动——威胁随我方队伍建筑量增长
				// （用队伍最大城市而非刺客自己城市：军阀拆的是全队的楼）
				// 注：加成不宜过高，否则跨敌人求和后军阀 EV 被放大导致过度集中
				const teamMaxCity = maxAllyCity(gs, actorId);
				v += enemyNearWin ? 8 : (teamMaxCity >= 4 ? 4 : 3);
				break;
			}
			case CharacterType.ARCHITECT:
				// 抽2牌+建2栋：高威胁节奏角色，敌人手牌多时阻止价值高
				v += nearWin ? 12 : (hc >= 2 ? 5 : 3);
				break;
			case CharacterType.MERCHANT: v += 3; break; // 经济引擎
			case CharacterType.MAGICIAN: v += 3.5; break; // 换手牌破坏资源
			case CharacterType.THIEF: v += 2.5; break; // 偷窃队友
			case CharacterType.KING: v += 3; break; // 王冠(下轮先选) + 黄色收租
			case CharacterType.BISHOP: v += 2; break; // 蓝色收租 + 免疫拆
			default: break;
			}
			if (nearWin) v += 8; // 接近建成 → 阻止其任何角色都极有价值
			// 保护队友：刺军阀/盗贼降低队友被拆/被偷风险
			if (allyNearWin && ch === CharacterType.WARLORD) v += 6;
			if (allyNearWin && ch === CharacterType.THIEF) v += 3;
			if (tempo === 'deny' && ch === CharacterType.ARCHITECT) v += 5;

			gainEV.set(ch, (gainEV.get(ch) ?? 0) + p * v);
		});
	});

	// 净 EV = 敌人阻止收益 - 队友误伤成本
	// 误杀队友 = 浪费其整个回合（资产+角色收入损失），约 12 GE 当量
	const ALLY_KILL_PENALTY = 12;
	const combos = pool.map((ch) => {
		const gain = gainEV.get(ch) ?? 0;
		const allyPenalty = (allyP.get(ch) ?? 0) * ALLY_KILL_PENALTY;
		return {
			clientId: ch + 1,
			ev: gain - allyPenalty,
			factors: [
				{ label: '敌人阻止收益(P×V)', value: gain },
				{ label: '队友误伤惩罚(P×12)', value: -allyPenalty },
			],
		};
	});
	combos.sort((a, b) => b.ev - a.ev);
	return combos;
}

/** 刺杀目标优先队列（clientId 降序 EV）；带分数的版本见 assassinTargetCombos */
function assassinTargets(gs: GameState, actorId: string): number[] {
	return assassinTargetCombos(gs, actorId).map((c) => c.clientId);
}

/**
 * 偷窃目标优先队列（客户端 ID 3-8）
 *
 * V3 概率推理版——核心转变：从「角色加成」变为「期望金币最大化」。
 *
 * 旧版缺陷：对富敌 predictLikelyRoles 总推荐商人（stash>=4 即触发），叠加
 * 商人固定 +2 加成，导致盗贼永远偷 6 商人。
 *
 * 新模型：
 * 1. 对每个敌人估算「行动时预期金币」= 当前金库 + 按角色概率加权的收入期望
 *    （收入角色会先于盗贼行动并收租，金库会增长）
 * 2. 对每个 (敌人, 角色) 组合计算 EV = P(持有) × 预期金币
 * 3. 按 EV 降序输出——谁最富就偷谁最可能的角色，而非固定偷商人
 */
function thiefTargetCombos(gs: GameState, actorId: string): { clientId: number; ev: number; factors: AiExplainFactor[] }[] {
	if (!gs.board) return [];
	const cm = gs.board.characterManager;
	const limit = completeSize(gs);
	const pool = buildActionPhasePool(cm);
	if (!pool.length) return [];

	// 按角色聚合：敌人期望金币收益 gainEV 与队友持有概率 allyP
	const gainEV = new Map<CharacterType, number>();
	const allyP = new Map<CharacterType, number>();
	pool.forEach((ch) => { gainEV.set(ch, 0); allyP.set(ch, 0); });

	gs.board.playerOrder.forEach((pid) => {
		const enemy = isEnemy(gs, actorId, pid);
		const ally = pid !== actorId && isAlly(gs, actorId, pid);
		if (!enemy && !ally) return;
		const probs = roleProbabilities(gs, pid, pool);

		// 队友：累加其持有各角色的概率（用于误偷惩罚）
		if (ally) {
			probs.forEach((p, ch) => allyP.set(ch, (allyP.get(ch) ?? 0) + p));
			return;
		}

		// 敌人：计算逐角色期望金币并累加收益
		const stash = stashOf(gs, pid);
		const city = cityOf(gs, pid);
		const nearWin = city.length >= limit - 2;
		probs.forEach((p, ch) => {
			if (p < 0.01) return;
			// 预期金币 = 当前金库 + 该角色行动时的收租/被动收入
			let income = 0;
			switch (ch) {
			case CharacterType.MERCHANT: income = 1 + countColorIn(city, DistrictType.TRADE); break;
			case CharacterType.KING: income = countColorIn(city, DistrictType.NOBLE); break;
			case CharacterType.BISHOP: income = countColorIn(city, DistrictType.RELIGIOUS); break;
			case CharacterType.WARLORD: income = countColorIn(city, DistrictType.MILITARY); break;
			default: income = 0; break; // 盗贼/魔术师/建筑师无色系收入
			}
			const expectedGold = stash + income;
			// 敌人接近建成时偷窃的战术价值更高（拖延其建造节奏）
			const urgency = nearWin ? 1.3 : 1.0;
			// ×2 摇摆因子：偷敌人 X 金 = 我方+X 且敌方-X，相对差距摆动了 2X
			// 放大收益项使其主导排序，避免惩罚项噪声把目标推向旁观牌
			gainEV.set(ch, (gainEV.get(ch) ?? 0) + p * expectedGold * urgency * 2);
		});
	});

	// 净 EV = 敌人金币摇摆收益 - 队友误偷成本
	// 误偷队友：金币只是在队内转移（总量不变），但打乱其建造计划 + 浪费一次偷窃机会
	const ALLY_ROB_PENALTY = 4;
	const combos = pool.map((ch) => {
		const gain = gainEV.get(ch) ?? 0;
		const allyPenalty = (allyP.get(ch) ?? 0) * ALLY_ROB_PENALTY;
		return {
			clientId: ch + 1,
			ev: gain - allyPenalty,
			factors: [
				{ label: '敌人金币摇摆收益(P×预期金×2)', value: gain },
				{ label: '队友误偷惩罚(P×4)', value: -allyPenalty },
			],
		};
	});
	combos.sort((a, b) => b.ev - a.ev);
	return combos;
}

/** 偷窃目标优先队列（clientId 降序 EV）；带分数的版本见 thiefTargetCombos */
function thiefTargets(gs: GameState, actorId: string): number[] {
	return thiefTargetCombos(gs, actorId).map((c) => c.clientId);
}

/** 估算一手牌的总建造价值（用于魔术师交换决策） */
function handQuality(hand: DistrictId[], city: DistrictId[]): number {
	return hand.reduce((sum, card) => {
		if (city.includes(card)) return sum; // 重复牌价值 ≈ 0
		let v = costOf(card); // 基础价值 = 建造费用
		if (isUnique(card)) v += 2; // 特殊建筑额外价值
		return sum + v;
	}, 0);
}

/** 魔术师交换目标：综合手牌数量差和质量差，避免拿高价值牌换垃圾 */
function magicianExchangeScored(gs: GameState, actorId: string): { seat: number; score: number; factors: AiExplainFactor[] }[] {
	if (!gs.board) return [];
	const myHand = handOf(gs, actorId);
	const myCity = cityOf(gs, actorId);
	const myQuality = handQuality(myHand, myCity);
	const scored: { seat: number; score: number; factors: AiExplainFactor[] }[] = [];

	gs.board.playerOrder.forEach((pid, seat) => {
		if (!isEnemy(gs, actorId, pid)) return;
		const their = handCount(gs, pid);
		const deltaCards = their - myHand.length;
		if (deltaCards <= 0) return;
		// 数量收益：多出的牌 × 动态卡值
		const quantityGain = deltaCards * cardMarginalValue(gs, actorId);
		// 质量保护：我给出的牌越值钱，交换越不划算
		// 只有数量收益明显超过质量损失时才交换
		const qualityLoss = myQuality * 0.4;
		const netGain = quantityGain - qualityLoss;
		if (netGain <= 0) return;
		scored.push({
			seat,
			score: netGain * 10 + their,
			factors: [
				{ label: `数量收益(多${deltaCards}张×卡值)`, value: quantityGain },
				{ label: '质量损失(我方手牌×0.4)', value: -qualityLoss },
			],
		});
	});
	scored.sort((a, b) => b.score - a.score);
	return scored;
}

/** 魔术师交换目标优先队列（座位降序分）；带分数的版本见 magicianExchangeScored */
function magicianExchangeTargets(gs: GameState, actorId: string): number[] {
	return magicianExchangeScored(gs, actorId).map((s) => s.seat);
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
 * 资源决策逻辑（拿金 vs 抽牌）：
 *
 * 核心原则：手里的牌只有转化为建筑才是分数。
 * 囤积建不起的牌不仅不产生分数，还会增加被魔术师换牌的风险。
 *
 * 1. 手里有非重复牌 → 优先拿金（尽快把牌转化为建筑）
 *    - 例外：金币已足够建完所有有用牌且仍有富余 → 抽牌扩充选择
 *
 * 2. 手牌为空或全是重复死牌 → 抽牌换血
 *    - 例外：有铁匠铺 → 拿金（花 2 金抽 3 张远比二选一划算）
 *
 * 3. 图书馆+天文台双持 → 抽 3 张全保留，价值极高，优先抽牌
 */
function shouldDrawCards(gs: GameState, actorId: string): boolean {
	const stash = stashOf(gs, actorId);
	const hand = handOf(gs, actorId);
	const city = cityOf(gs, actorId);
	const hc = hand.length;
	const hasSm = hasDistrict(actorId, gs, 'smithy');
	const hasLib = hasDistrict(actorId, gs, 'library');
	const hasObs = hasDistrict(actorId, gs, 'observatory');

	// 图书馆+天文台双持：抽 3 张全保留，价值极高，手牌不满就抽
	if (hasLib && hasObs && hc < 5) return true;

	// 手里有非重复牌（无论当前是否建得起）：优先拿金币
	// 囤牌不能转化为分数，反而增加被魔术师换牌的风险；
	// 拿金才能把手里的牌尽快转化为建筑
	const useful = hand.filter((c) => !city.includes(c));
	if (useful.length > 0) {
		// 例外：金币已足够建完手里所有有用牌且仍有富余——
		// 资源溢出时继续拿金意义不大，抽牌扩充选择
		const needed = useful.reduce((sum, c) => sum + costOf(c), 0);
		return stash >= needed + 2;
	}

	// 手牌为空或全是重复死牌：
	// 有铁匠铺时拿金（花 2 金抽 3 张远比二选一划算），否则抽牌换血
	if (hasSm) return false;

	return true;
}

// ---------------------------------------------------------------------------
// 主入口：根据当前游戏的回合状态生成并执行下一步
// ---------------------------------------------------------------------------

export function pickAndApplyAutoplayMove(
	gameState: GameState,
	version: 'v0' | 'v1' | 'v2' | 'v3' = 'v2',
	forceAssassin = true,
	explain?: AiExplainCollector,
): Move | null {
	if (!gameState.board) return null;
	const { board } = gameState;
	const cm = board.characterManager;
	const actorId = board.getCurrentPlayerId();
	if (!actorId) return null;
	const player = board.players.get(actorId);
	if (!player) return null;

	// ── 解释输出（旁路观测）：不传 explain 时零开销，收集器异常也不影响对局 ──
	const record = (decision: string, candidates: AiExplainCandidate[], chosen: string, note?: string) => {
		if (!explain) return;
		try {
			explain({
				round: gameState.roundNumber,
				version,
				actor: gameState.players.get(actorId)?.username ?? actorId,
				decision,
				candidates,
				chosen,
				note,
			});
		} catch {
			// 观测器故障不应中断 AI 行动
		}
	};
	const charLabel = (ch: number) => `角色:${CHAR_NAMES[ch] ?? ch}`;
	// 选角候选（含因子分解）：分值 = 各因子之和，与 scoreCharacterPick 同源
	const pickCandidatesWithFactors = (chs: CharacterType[]) => chs
		.map((ch) => {
			const factors = characterPickFactors(gameState, actorId, ch, chs, useSeatWeights);
			return {
				ch,
				score: factors.reduce((s, f) => s + f.value, 0),
				// 展示时省略贡献可忽略的因子（如 0.1 以下的随机扰动）
				factors: factors.filter((f) => Math.abs(f.value) >= 0.1),
			};
		})
		.sort((a, b) => b.score - a.score);

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
	const useSeatWeights = version === 'v1' || version === 'v2' || version === 'v3';
	const useMCTS = version === 'v3';

	if (board.gamePhase === GamePhase.CHOOSE_CHARACTERS) {
		const t = cm.choosingState.getState().type;
		if (t === CCST.PUT_ASIDE_FACE_UP || t === CCST.PUT_ASIDE_FACE_DOWN) {
			// 天绝/弃牌：把对自己最没用的牌丢掉
			const remaining = cm.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
			const ranked = pickCandidatesWithFactors(remaining);
			const moves = [...ranked].reverse().map((s) => ({
				type: MoveType.CHOOSE_CHARACTER, data: remaining.indexOf(s.ch),
			} as Move));
			if (!moves.length) moves.push({ type: MoveType.CHOOSE_CHARACTER, data: 0 });
			const m = tryMoves(gameState, moves);
			const asideCh = m && typeof m.data === 'number' ? remaining[m.data] : undefined;
			record(
				t === CCST.PUT_ASIDE_FACE_UP ? '天绝扣牌(明置)' : '扣牌(暗置)',
				ranked.map((s) => ({
					label: charLabel(s.ch),
					score: round1(s.score),
					factors: s.factors,
				})),
				asideCh !== undefined ? charLabel(asideCh) : '（无）',
				'扣置评分最低的角色',
			);
			return m;
		}
		if (t === CCST.CHOOSE_CHARACTER || t === CCST.PUT_ASIDE_FACE_DOWN_UP) {
			if (t === CCST.PUT_ASIDE_FACE_DOWN_UP) {
				const remaining = cm.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
				const ranked = pickCandidatesWithFactors(remaining);
				const moves = [...ranked].reverse().map((o) => ({
					type: MoveType.CHOOSE_CHARACTER, data: remaining.indexOf(o.ch),
				} as Move));
				const m = tryMoves(gameState, moves.length ? moves : [{ type: MoveType.CHOOSE_CHARACTER, data: 0 }]);
				const asideCh = m && typeof m.data === 'number' ? remaining[m.data] : undefined;
				record(
					'末位选角(先选1扣1)',
					ranked.map((s) => ({
						label: charLabel(s.ch),
						score: round1(s.score),
						factors: s.factors,
					})),
					asideCh !== undefined ? charLabel(asideCh) : '（无）',
					'选评分最高、扣评分最低',
				);
				return m;
			}
			// pickBestCharacterIndex 在 forceAssassin=true 且刺客可用时硬编码返回刺客索引（首发必拿刺客）
			const best = pickBestCharacterIndex(gameState, actorId, useSeatWeights, forceAssassin);
			const moves: Move[] = [{ type: MoveType.CHOOSE_CHARACTER, data: best }];

			// V3 MCTS 选角：仅当未硬编码刺客（forceAssassin=false 或刺客不在池中）时才走 MCTS，
			// 避免 MCTS 覆盖首发必拿刺客的硬编码规则
			const remaining = cm.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
			const assassinAvailable = remaining.includes(CharacterType.ASSASSIN);
			if (useMCTS && !(forceAssassin && assassinAvailable)) {
				const meta = gameState.players.get(actorId);
				const mctsMove = mctsPick(gameState, actorId, remaining, meta?.team ?? TeamId.NONE);
				if (mctsMove) {
					const m = tryMoves(gameState, [mctsMove]);
					const ranked = pickCandidatesWithFactors(remaining);
					const mctsCh = typeof mctsMove.data === 'number' ? remaining[mctsMove.data] : undefined;
					record(
						'选角',
						ranked.map((s) => ({
							label: charLabel(s.ch),
							score: round1(s.score),
							factors: s.factors,
						})),
						mctsCh !== undefined ? charLabel(mctsCh) : '（无）',
						'V3 MCTS 覆盖规则评分（候选分列为规则评分，非 rollout 分）',
					);
					return m;
				}
			}

			// 解释用评分快照（与 pickBestCharacterIndex 各自独立计算，含 ±0.3 随机扰动，
			// 排名偶有浮动属预期）。仅在观测时计算，避免拖慢 rollout。
			const explainScores = explain ? pickCandidatesWithFactors(remaining) : [];
			for (let i = 0; i < 8; i += 1) if (i !== best) moves.push({ type: MoveType.CHOOSE_CHARACTER, data: i });
			const m = tryMoves(gameState, moves);
			record(
				'选角',
				explainScores.map((s) => ({
					label: charLabel(s.ch),
					score: round1(s.score),
					factors: s.factors,
				})),
				best < remaining.length ? charLabel(remaining[best]) : '（无）',
				forceAssassin && assassinAvailable ? '首发硬编码必拿刺客，评分仅作参考' : undefined,
			);
			return m;
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
	// A player whose city already reached the completion threshold cannot build
	// any more this round (see ActionExecutor.buildDistrict guard). Filter such
	// cases out of the build candidates so the AI does not waste a move slot on
	// a build that the executor will reject.
	const cityFull = player.city.length >= completeSize(gameState);
	const affordable = cityFull
		? []
		: hand.filter((c) => costOf(c) <= player.stash && !player.city.includes(c));
	const buildOrder = cityFull ? [] : sortBuildCandidates(gameState, actorId, affordable, tempo);
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
		// Magician 例外：魔术师没有色系收租，先建会触发 buildDistrict 的
		// "盖房即放弃技能" 规则，导致本回合无法再使用交换/弃牌技能。让魔术师
		// 把建造推迟到 CHOOSE_ACTION（那里 1175-1179 已优先推技能再推建造）。
		if (cm.districtsToBuild[character] > 0 && buildOrder.length
		    && character !== CharacterType.MAGICIAN) {
			moves.push({ type: MoveType.BUILD_DISTRICT });
		}

		// 如果是军阀且需要阻止对手，先攒金币
		if (character === CharacterType.WARLORD && tempo !== 'develop') {
			const destroys = warlordDestroyCandidates(gameState, actorId);
			if (!destroys.length && player.stash < 5) {
				moves.push({ type: MoveType.TAKE_GOLD }, { type: MoveType.DRAW_CARDS });
			}
		}

		// Magician 例外：技能必须在本轮拿资源（拿金/抽牌）之前使用，否则
		// gatherResources 会清除 canDoSpecialAction[MAGICIAN] 导致本回合
		// 无法再用交换/弃牌技能。故在此（资源选择之前）优先推技能。
		if (canSpecial && character === CharacterType.MAGICIAN) {
			const seats = magicianExchangeTargets(gameState, actorId);
			if (seats.length) {
				moves.push({ type: MoveType.MAGICIAN_EXCHANGE_HAND });
			} else if (hand.length > 0) {
				const allDuplicate = hand.every((c) => player.city.includes(c));
				if (hand.length <= 1 || affordable.length === 0 || allDuplicate) {
					moves.push({ type: MoveType.MAGICIAN_DISCARD_CARDS });
				}
			}
		}

		// 最终资源选择：拿金 vs 抽牌
		if (shouldDrawCards(gameState, actorId)) {
			moves.push({ type: MoveType.DRAW_CARDS }, { type: MoveType.TAKE_GOLD });
		} else {
			moves.push({ type: MoveType.TAKE_GOLD }, { type: MoveType.DRAW_CARDS });
		}
		const m = tryMoves(gameState, moves);
		record(
			'资源行动(优先级序)',
			moves.map((mv) => ({ label: moveLabel(mv.type) })),
			m ? moveLabel(m.type) : '（无）',
			'按优先级尝试，首个合法项被执行',
		);
		return m;
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
		const m = tryMoves(gameState, moves);
		record(
			'二选一选牌',
			scored.map((s) => ({ label: `牌:${s.card}(费${costOf(s.card)})`, score: round1(s.score) })),
			m && typeof m.data === 'string' ? `牌:${m.data}(费${costOf(m.data)})` : '（无）',
		);
		return m;
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
			const t = assassinTargets(gameState, actorId);
			if (t.length) moves.push({ type: MoveType.ASSASSIN_KILL });
		}
		if (canSpecial && character === CharacterType.THIEF) {
			const t = thiefTargets(gameState, actorId);
			if (t.length) moves.push({ type: MoveType.THIEF_ROB });
		}
		if (canSpecial && character === CharacterType.MAGICIAN) {
			const seats = magicianExchangeTargets(gameState, actorId);
			if (seats.length) {
				moves.push({ type: MoveType.MAGICIAN_EXCHANGE_HAND });
			} else if (hand.length > 0) {
				// 弃牌换牌：手牌≤1 / 无可建牌 / 全是重复牌
				const allDuplicate = hand.every((c) => player.city.includes(c));
				if (hand.length <= 1 || affordable.length === 0 || allDuplicate) {
					moves.push({ type: MoveType.MAGICIAN_DISCARD_CARDS });
				}
			}
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
		const m = tryMoves(gameState, moves);
		record(
			'可选行动(优先级序)',
			moves.map((mv) => ({ label: moveLabel(mv.type) })),
			m ? moveLabel(m.type) : '（无）',
			'按优先级尝试，首个合法项被执行',
		);
		return m;
	}

	// -----------------------------------------------------------------------
	// BUILD_DISTRICT: 选择要建造的城区
	// -----------------------------------------------------------------------
	case ClientTurnState.BUILD_DISTRICT: {
		const moves = buildOrder.map((c) => ({ type: MoveType.BUILD_DISTRICT, data: c } as Move));
		moves.push({ type: MoveType.DECLINE });
		const m = tryMoves(gameState, moves);
		record(
			'建造顺序',
			buildOrder.map((c) => ({ label: `牌:${c}(费${costOf(c)})`, score: round1(buildScore(gameState, actorId, c, tempo)) })),
			m && m.type === MoveType.BUILD_DISTRICT && typeof m.data === 'string'
				? `牌:${m.data}(费${costOf(m.data)})`
				: moveLabel(m?.type ?? MoveType.DECLINE),
		);
		return m;
	}

	// -----------------------------------------------------------------------
	// 特殊能力状态（刺杀/偷窃/交换/摧毁/墓地/实验室）
	// -----------------------------------------------------------------------
	case ClientTurnState.ASSASSIN_KILL: {
		const combos = assassinTargetCombos(gameState, actorId);
		const targets = combos.map((c) => c.clientId);
		const moves = targets.map((id) => ({ type: MoveType.ASSASSIN_KILL, data: id } as Move));
		for (let cid = 2; cid <= 8; cid += 1) if (!targets.includes(cid)) moves.push({ type: MoveType.ASSASSIN_KILL, data: cid });
		moves.push({ type: MoveType.DECLINE });
		const m = tryMoves(gameState, moves);
		record(
			'刺客目标',
			combos.map((c) => ({ label: charLabel(c.clientId - 1), score: round1(c.ev), factors: c.factors })),
			m && typeof m.data === 'number' ? charLabel(m.data - 1) : moveLabel(m?.type ?? MoveType.DECLINE),
			'EV = P(敌人持有)×阻止价值 − P(队友持有)×误伤惩罚',
		);
		return m;
	}

	case ClientTurnState.THIEF_ROB: {
		const killedClientId = cm.killedCharacter >= 0 ? cm.killedCharacter + 1 : -1;
		const combos = thiefTargetCombos(gameState, actorId).filter((c) => c.clientId !== killedClientId);
		const targets = combos.map((c) => c.clientId);
		const moves = targets.map((id) => ({ type: MoveType.THIEF_ROB, data: id } as Move));
		for (let cid = 3; cid <= 8; cid += 1) {
			if (cid === killedClientId) continue;
			if (!targets.includes(cid)) moves.push({ type: MoveType.THIEF_ROB, data: cid });
		}
		moves.push({ type: MoveType.DECLINE });
		const m = tryMoves(gameState, moves);
		record(
			'盗贼目标',
			combos.map((c) => ({ label: charLabel(c.clientId - 1), score: round1(c.ev), factors: c.factors })),
			m && typeof m.data === 'number' ? charLabel(m.data - 1) : moveLabel(m?.type ?? MoveType.DECLINE),
			'EV = P(敌人持有)×预期金币×摇摆因子 − 误偷队友惩罚',
		);
		return m;
	}

	case ClientTurnState.MAGICIAN_EXCHANGE_HAND: {
		const scored = magicianExchangeScored(gameState, actorId);
		const seats = scored.map((s) => s.seat);
		const moves = seats.map((seat) => ({ type: MoveType.MAGICIAN_EXCHANGE_HAND, data: seat } as Move));
		board.playerOrder.forEach((pid, idx) => {
			if (pid !== actorId && isEnemy(gameState, actorId, pid) && !seats.includes(idx)) {
				moves.push({ type: MoveType.MAGICIAN_EXCHANGE_HAND, data: idx });
			}
		});
		moves.push({ type: MoveType.DECLINE });
		const m = tryMoves(gameState, moves);
		record(
			'魔术师交换目标',
			scored.map((s) => ({ label: `座位${s.seat}`, score: round1(s.score), factors: s.factors })),
			m && typeof m.data === 'number' ? `座位${m.data}` : moveLabel(m?.type ?? MoveType.DECLINE),
			'净收益 = 数量收益 − 我方手牌质量损失',
		);
		return m;
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
		const m = tryMoves(gameState, moves);
		const chosenData = m && m.type === MoveType.WARLORD_DESTROY_DISTRICT && m.data
			? m.data as { player: number; card: DistrictId }
			: undefined;
		record(
			'军阀拆房目标',
			cands.map((c) => ({ label: `座位${c.seat}的${c.card}`, score: round1(c.score) })),
			chosenData ? `座位${chosenData.player}的${chosenData.card}` : moveLabel(m?.type ?? MoveType.DECLINE),
		);
		return m;
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

export default { pickAndApplyAutoplayMove, pickV3Unforced };
export function pickV0(gs: GameState): Move | null {
	return pickAndApplyAutoplayMove(gs, 'v0');
}

/** V1 版本 */
export function pickV1(gs: GameState): Move | null {
	return pickAndApplyAutoplayMove(gs, 'v1');
}

/** V2 版本（V1 + 排除法推理） */
export function pickV2(gs: GameState): Move | null {
	return pickAndApplyAutoplayMove(gs, 'v2');
}

/** V3 版本（V2 + MCTS 选角）—— 仅评估使用，非生产默认（生产默认 V2，见 docs/AI_ROADMAP.md 0.2） */
export function pickV3(gs: GameState): Move | null {
	return pickAndApplyAutoplayMove(gs, 'v3');
}

/** V3Unforced: V3 但首发不硬编码刺客，MCTS 自己 decide */
export function pickV3Unforced(gs: GameState): Move | null {
	return pickAndApplyAutoplayMove(gs, 'v3', false);
}

/** 导出评分函数供评估脚本使用 */
export { scoreCharacterPick, buildScore };

// =====================================================================
// V3：MCTS 选角（通过 rollout 模拟评估每个候选角色的长远影响）
// =====================================================================

const MCTS_ROLLOUTS = 10;
const MCTS_MAX_STEPS = 6000;

function mctsRollout(gs: GameState): number {
	let steps = 0;
	while (steps < MCTS_MAX_STEPS) {
		steps += 1;
		if (gs.progress === GameProgress.FINISHED) break;
		const move = pickAndApplyAutoplayMove(gs, 'v2');
		if (move) continue;
		gs.step({ type: MoveType.AUTO });
	}
	if (gs.progress === GameProgress.FINISHED) {
		return (gs.teamScores?.A ?? 0) - (gs.teamScores?.B ?? 0);
	}
	let teamAScore = 0;
	let teamBScore = 0;
	if (gs.board) {
		gs.board.playerOrder.forEach((pid, idx) => {
			const pb = gs.board?.players.get(pid);
			const cityScore = pb?.city.reduce((s, c) => s + (costOf(c) + (CARD_EXTRA[c] ?? 0)), 0) ?? 0;
			if (idx % 2 === 0) teamAScore += cityScore;
			else teamBScore += cityScore;
		});
	}
	return teamAScore - teamBScore;
}

function mctsPick(
	gs: GameState, actorId: string,
	remaining: number[],
	team: TeamId,
): Move | null {
	const scores: { ch: number; totalScore: number }[] = [];
	for (const ch of remaining) {
		let totalScore = 0;
		for (let r = 0; r < MCTS_ROLLOUTS; r += 1) {
			const fork = gs.clone();
			const idx = fork.board!.characterManager
				.getCharactersAtPosition(0)
				.indexOf(ch);
			if (idx >= 0) {
				const ok = fork.step({ type: MoveType.CHOOSE_CHARACTER, data: idx });
				if (ok) {
					const adv = mctsRollout(fork);
					totalScore += (team === TeamId.A) ? adv : -adv;
				}
			}
		}
		scores.push({ ch, totalScore });
	}
	scores.sort((a, b) => b.totalScore - a.totalScore);
	const best = scores[0];
	if (!best) return null;
	const bestIdx = remaining.indexOf(best.ch);
	if (bestIdx < 0) return null;
	return { type: MoveType.CHOOSE_CHARACTER, data: bestIdx };
}
