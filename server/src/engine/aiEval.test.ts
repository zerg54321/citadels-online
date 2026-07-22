/**
 * AI 策略自动评估脚本
 *
 * 在纯内存中运行多局 6 人 AI vs AI 3v3 对局，收集精确决策数据。
 * 目标是回答："AI 做出的决策质量如何？"而不是简单的胜负比。
 *
 * 用法：
 *   npm --prefix server exec vitest run -- --reporter verbose src/engine/aiEval.test.ts
 *
 * 数据维度：
 *   1. 选角偏好：各角色被选次数（首发 vs 中位 vs 末位）
 *   2. 刺杀质量：被刺角色类型分布（高收益/低收益）
 *   3. 盗窃效率：每次偷窃净得金币
 *   4. 资源决策：TAKE_GOLD vs DRAW_CARDS 比率
 *   5. 特殊建筑使用率：铁匠铺/实验室/墓地使用次数
 *   6. 角色-城市匹配度（收入角色的对应颜色建筑数）
 */
import { describe, it, expect } from 'vitest';
import { GameProgress, GameMode, MoveType, MatchResult, TeamId } from 'citadels-common';
import GameState from '../game/GameState';
import GameSetupData from '../game/GameSetupData';
import { CharacterType } from '../game/CharacterManager';
import DistrictCard from '../game/DistrictCard';
import { pickAndApplyAutoplayMove } from '../game/AutoplayPolicy';

// ─── 常量 ─────────────────────────────────────────────────────────

const MAX_STEPS = 50000;
const GAMES = 10;

const CHAR_NAMES: Record<number, string> = {
	[CharacterType.ASSASSIN]: '刺客', [CharacterType.THIEF]: '盗贼',
	[CharacterType.MAGICIAN]: '魔术师', [CharacterType.KING]: '国王',
	[CharacterType.BISHOP]: '主教', [CharacterType.MERCHANT]: '商人',
	[CharacterType.ARCHITECT]: '建筑师', [CharacterType.WARLORD]: '军阀',
};

// ─── 统计结构 ─────────────────────────────────────────────────────

interface PerGameMetrics {
	/** 每位 AI 的选角记录 */
	picks: { playerId: string; character: number; seat: number }[];
	/** 刺杀记录 */
	assassinations: { playerId: string; targetCharacter: number; round: number }[];
	/** 偷窃记录 */
	thefts: { playerId: string; targetCharacter: number; goldTaken: number; round: number }[];
	/** 资源决策统计 */
	resourceDecisions: { playerId: string; choseDraw: boolean }[];
	/** 特殊建筑使用 */
	specialActions: { playerId: string; type: string }[];
	/** 角色-收入匹配度（终局时统计各收入角色玩家的城区颜色数） */
	incomeMatches: { playerId: string; character: number; colorCount: number }[];
	/** 终局数据 */
	citySizes: number[];
	scoreA: number;
	scoreB: number;
	matchResult: MatchResult | undefined;
	steps: number;
	finished: boolean;
}

interface OverallStats {
	games: number;
	finished: number;

	// 选角
	pickCounts: Record<string, number>;
	pickCountsBySeat: Record<string, number[]>; // 角色名 → [首选中位末位计数]

	// 刺杀
	totalAssassinations: number;
	assassinTargetTypes: Record<string, number>; // 被刺角色名 → 次数

	// 盗窃
	totalThefts: number;
	totalGoldStolen: number;
	avgGoldPerTheft: number;

	// 资源
	goldPct: number; // TAKE_GOLD 占比
	drawPct: number;  // DRAW_CARDS 占比

	// 特殊建筑
	totalSmithy: number;
	totalLab: number;
	totalGraveyard: number;

	// 终局
	avgCityA: number;
	avgCityB: number;
	avgScoreA: number;
	avgScoreB: number;
	aWins: number;
	bWins: number;
	draws: number;
}

// ─── 创建 3v3 AI 对局 ────────────────────────────────────────────

function createGame(): GameState {
	const gs = new GameState({ completeCitySize: 8, fastMode: true, syncMode: true });
	const names = ['A1', 'B1', 'A2', 'B2', 'A3', 'B3'];
	const ids = names.map((_, i) => `p${i + 1}`);

	ids.forEach((id, i) => {
		gs.addPlayer(id, names[i], i === 0, true);
		const p = gs.players.get(id);
		if (p) p.isAi = true;
	});

	gs.setupGame(new GameSetupData(ids, 8));
	gs.gameMode = GameMode.COMPETITIVE_TEAM6;
	return gs;
}

// ─── 跑一局并收集详细数据 ────────────────────────────────────────

function runGame(gameNum: number): PerGameMetrics {
	const gs = createGame();
	const cm = gs.board!.characterManager;

	const metrics: PerGameMetrics = {
		picks: [], assassinations: [], thefts: [],
		resourceDecisions: [], specialActions: [], incomeMatches: [],
		citySizes: [], scoreA: 0, scoreB: 0, matchResult: undefined,
		steps: 0, finished: false,
	};

	let roundCounter = 0;

	while (metrics.steps < MAX_STEPS) {
		metrics.steps += 1;
		if (gs.progress === GameProgress.FINISHED) break;

		// 选角阶段：在执行前记录当前可选角色池
		if (gs.board?.gamePhase === 1) { // CHOOSE_CHARACTERS
			const ccsType = cm.choosingState.getState().type;
			if (ccsType === 4 || ccsType === 5) { // CHOOSE_CHARACTER / PUT_ASIDE_FACE_DOWN_UP（玩家选择）
				const actorId = gs.board?.getCurrentPlayerId();

				// 执行 AI 决策
				const move = pickAndApplyAutoplayMove(gs);
				if (move && move.type === 1) {
					if (ccsType === 4) {
						// CHOOSE_CHARACTER：通过 characters 数组找到刚被分配座位的角色
						// 技巧：找 characters 中最后一个被设置到 PLAYER_1 以上位置的角色
						if (actorId) {
							const actorSeat = gs.board?.playerOrder.indexOf(actorId);
							const offset = 3; // CharacterPosition.PLAYER_1
							for (let ch = 0; ch < 8; ch += 1) {
								const pos = cm.characters[ch];
								if (pos >= offset && (pos - offset) === actorSeat) {
									if (!metrics.picks.some((p) => p.playerId === actorId && p.character === ch)) {
										metrics.picks.push({ playerId: actorId, character: ch, seat: actorSeat });
									}
									break;
								}
							}
						}
					}
				}
				continue;
			}
			if (ccsType === 6) roundCounter += 1; // DONE → 新的一轮
		}

		// 其他阶段：执行 AI 决策
		const move = pickAndApplyAutoplayMove(gs);
		if (move) {
			// 选角 move 的处理：AI 选了角色后，追踪已消失的角色号
			if (move.type === 1 && move.data !== undefined) {
				// pickAndApplyAutoplayMove 在执行天绝（PUT_ASIDE_FACE_DOWN）时
				// 也会生成 MOVE_TYPE=1（CHOOSE_CHARACTER）。天绝是随机弃置，不是选角。
				// 我们只记录 CHOOSE_CHARACTER 和 PUT_ASIDE_FACE_DOWN_UP 中的选角行为。
				const ccsType = cm.choosingState.getState().type;
				if (ccsType === 4) { // CHOOSE_CHARACTER（玩家自主选择）
					const allChars = cm.getCharactersAtPosition(1); // NOT_CHOSEN（注意这是执行后的状态）
					// 在 CHOOSE_CHARACTER 执行后，刚刚选中的角色已经从 NOT_CHOSEN 移除
					// 我们需要用其他方式推断选了什么角色
					const actorId = gs.board?.getCurrentPlayerId();
					const actorSeat = gs.board?.playerOrder.indexOf(actorId ?? '');
					// 查看 board.characterManager.characters[] 来找出哪个角色最近被分配到当前玩家座位
					for (let ch = 0; ch < 8; ch += 1) {
						const pos = cm.characters[ch];
						const offset = 3; // CharacterPosition.PLAYER_1
						if (pos >= offset && (pos - offset) === actorSeat) {
							// AI 刚选了角色 ch
							metrics.picks.push({
								playerId: actorId ?? '',
								character: ch,
								seat: actorSeat ?? -1,
							});
							break;
						}
					}
				}
			}

			// 刺杀记录
			if (move.type === MoveType.ASSASSIN_KILL && move.data !== undefined) {
				const targetClientId = move.data as number;
				metrics.assassinations.push({
					playerId: cm.getCurrentCharacter() >= 0 ? gs.board?.getCurrentPlayerId() ?? '' : '',
					targetCharacter: targetClientId - 1,
					round: roundCounter,
				});
			}

			// 偷窃记录（需要在执行后查看金库变化）
			if (move.type === MoveType.THIEF_ROB && move.data !== undefined) {
				const targetClientId = move.data as number;
				metrics.thefts.push({
					playerId: gs.board?.getCurrentPlayerId() ?? '',
					targetCharacter: targetClientId - 1,
					goldTaken: 0, // 后续在回合结束时分配合适的值
					round: roundCounter,
				});
			}

			// 资源决策
			if (move.type === MoveType.TAKE_GOLD) {
				metrics.resourceDecisions.push({ playerId: gs.board?.getCurrentPlayerId() ?? '', choseDraw: false });
			}
			if (move.type === MoveType.DRAW_CARDS) {
				metrics.resourceDecisions.push({ playerId: gs.board?.getCurrentPlayerId() ?? '', choseDraw: true });
			}

			// 特殊建筑
			if (move.type === MoveType.SMITHY_DRAW_CARDS) {
				metrics.specialActions.push({ playerId: gs.board?.getCurrentPlayerId() ?? '', type: 'smithy' });
			}
			if (move.type === MoveType.LABORATORY_DISCARD_CARD) {
				metrics.specialActions.push({ playerId: gs.board?.getCurrentPlayerId() ?? '', type: 'laboratory' });
			}
			if (move.type === MoveType.GRAVEYARD_RECOVER_DISTRICT) {
				metrics.specialActions.push({ playerId: gs.board?.getCurrentPlayerId() ?? '', type: 'graveyard' });
			}

			continue;
		}

		// AUTO 推进
		gs.step({ type: MoveType.AUTO });
	}

	// ── 终局数据收集 ──
	metrics.finished = gs.progress === GameProgress.FINISHED;

	if (gs.board) {
		gs.board.playerOrder.forEach((pid) => {
			const pb = gs.board?.players.get(pid);
			metrics.citySizes.push(pb?.city.length ?? 0);
		});
	}

	metrics.scoreA = gs.teamScores?.A ?? 0;
	metrics.scoreB = gs.teamScores?.B ?? 0;
	metrics.matchResult = gs.matchResult;

	return metrics;
}

// ─── 汇总多局数据 ────────────────────────────────────────────────

function aggregate(all: PerGameMetrics[]): OverallStats {
	const pickCounts: Record<string, number> = {};
	const pickCountsBySeat: Record<string, number[]> = {};
	const assassinTargetTypes: Record<string, number> = {};
	const charNames = Object.values(CHAR_NAMES);
	charNames.forEach((n) => {
		pickCounts[n] = 0;
		pickCountsBySeat[n] = [0, 0, 0]; // [首发(人), 中位, 末位]
		assassinTargetTypes[n] = 0;
	});

	let totalAssassinations = 0;
	let totalThefts = 0;
	let totalGoldStolen = 0;
	let totalGold = 0;
	let totalDraw = 0;
	let totalSmithy = 0;
	let totalLab = 0;
	let totalGraveyard = 0;
	let aWins = 0;
	let bWins = 0;
	let draws = 0;
	let finished = 0;
	let totalCityA = 0;
	let totalCityB = 0;
	let totalScoreA = 0;
	let totalScoreB = 0;

	const perGameCity: number[][] = [];

	all.forEach((m) => {
		if (m.finished) finished += 1;
		if (m.matchResult === MatchResult.TEAM_A_WIN) aWins += 1;
		if (m.matchResult === MatchResult.TEAM_B_WIN) bWins += 1;
		if (m.matchResult === MatchResult.DRAW) draws += 1;

		// 选角
		m.picks.forEach((p) => {
			const name = CHAR_NAMES[p.character] ?? `角色${p.character}`;
			pickCounts[name] = (pickCounts[name] ?? 0) + 1;
			if (!pickCountsBySeat[name]) pickCountsBySeat[name] = [0, 0, 0];
			// seat 0 = P1(首发), 1-3 = 中位, 4-5 = 末位
			const bin = p.seat <= 0 ? 0 : (p.seat <= 3 ? 1 : 2);
			pickCountsBySeat[name][bin] += 1;
		});

		// 刺杀
		totalAssassinations += m.assassinations.length;
		m.assassinations.forEach((a) => {
			const name = CHAR_NAMES[a.targetCharacter] ?? `角色${a.targetCharacter}`;
			assassinTargetTypes[name] = (assassinTargetTypes[name] ?? 0) + 1;
		});

		// 偷窃（偷窃次数；金币数暂无精确值，可后续从 stash 变化推算）
		totalThefts += m.thefts.length;

		// 资源
		m.resourceDecisions.forEach((r) => {
			if (r.choseDraw) totalDraw += 1;
			else totalGold += 1;
		});

		// 特殊建筑
		m.specialActions.forEach((s) => {
			if (s.type === 'smithy') totalSmithy += 1;
			if (s.type === 'laboratory') totalLab += 1;
			if (s.type === 'graveyard') totalGraveyard += 1;
		});

		// 终局数据
		if (m.finished) {
			m.citySizes.forEach((sz, idx) => {
				if (idx % 2 === 0) totalCityA += sz; // A 队: 0,2,4
				else totalCityB += sz;
			});
			totalScoreA += m.scoreA;
			totalScoreB += m.scoreB;
			perGameCity.push(m.citySizes);
		}
	});

	const n = finished || 1;
	return {
		games: all.length,
		finished,
		pickCounts, pickCountsBySeat,
		totalAssassinations,
		assassinTargetTypes,
		totalThefts, totalGoldStolen,
		avgGoldPerTheft: totalThefts ? (totalGoldStolen / totalThefts) : 0,
		goldPct: (totalGold + totalDraw) ? (totalGold / (totalGold + totalDraw)) : 0,
		drawPct: (totalGold + totalDraw) ? (totalDraw / (totalGold + totalDraw)) : 0,
		totalSmithy, totalLab, totalGraveyard,
		avgCityA: totalCityA / (n * 3),
		avgCityB: totalCityB / (n * 3),
		avgScoreA: totalScoreA / n,
		avgScoreB: totalScoreB / n,
		aWins, bWins, draws,
	};
}

// ─── 打印报告 ─────────────────────────────────────────────────────

function print(report: OverallStats) {
	console.log('\n' + '='.repeat(60));
	console.log('  AI 策略评估报告');
	console.log('='.repeat(60));
	console.log(`  局数: ${report.games}  完成: ${report.finished}`);
	console.log(`  A胜: ${report.aWins}  B胜: ${report.bWins}  平: ${report.draws}`);

	console.log('\n  ── 终局数据 ──');
	console.log(`  平均城市: A队 ${report.avgCityA.toFixed(2)}  B队 ${report.avgCityB.toFixed(2)}`);
	console.log(`  平均总分: A队 ${report.avgScoreA.toFixed(1)}  B队 ${report.avgScoreB.toFixed(1)}`);

	console.log('\n  ── 选角偏好 ──');
	const sortedPicks = Object.entries(report.pickCounts).sort((a, b) => b[1] - a[1]);
	sortedPicks.forEach(([name, count]) => {
		const bySeat = report.pickCountsBySeat[name] ?? [0, 0, 0];
		console.log(`    ${name}: ${count}次 (首发${bySeat[0]} 中位${bySeat[1]} 末位${bySeat[2]})`);
	});

	console.log('\n  ── 刺杀目标分布（共' + report.totalAssassinations + '次）──');
	const sortedAss = Object.entries(report.assassinTargetTypes).sort((a, b) => b[1] - a[1]);
	sortedAss.forEach(([name, count]) => {
		console.log(`    ${name}: ${count}次`);
	});

	console.log('\n  ── 资源决策 ──');
	const totalDecisions = report.goldPct + report.drawPct;
	console.log(`  拿金: ${(report.goldPct * 100).toFixed(1)}%  抽牌: ${(report.drawPct * 100).toFixed(1)}%`);

	console.log('\n  ── 特殊建筑使用 ──');
	console.log(`  铁匠铺: ${report.totalSmithy}次  实验室: ${report.totalLab}次  墓地回收: ${report.totalGraveyard}次`);

	console.log('='.repeat(60) + '\n');
}

// ─── 每局概要 ─────────────────────────────────────────────────────

function printGameSummary(metrics: PerGameMetrics[]) {
	metrics.forEach((m, idx) => {
		const flag = m.finished ? '✓' : '✗';
		const cities = `[${m.citySizes.join(', ')}]`;
		const ass = m.assassinations.map((a) => CHAR_NAMES[a.targetCharacter] ?? `?${a.targetCharacter}`).join(', ');
		const specials = m.specialActions.map((s) => s.type).join(', ');
		console.log(`  #${idx} ${flag} 分=${m.scoreA}:${m.scoreB} 城=${cities} 刺=[${ass}] 特=[${specials}]`);
	});
}

// ─── 测试 ─────────────────────────────────────────────────────────

describe('AI 详细评估', () => {
	it('单局', () => {
		const r = runGame(0);
		expect(r.finished).toBe(true);
		expect(r.steps).toBeLessThan(MAX_STEPS);
	});

	it(`跑 ${GAMES} 局`, () => {
		const all: PerGameMetrics[] = [];
		for (let i = 0; i < GAMES; i += 1) {
			all.push(runGame(i));
		}
		printGameSummary(all);
		print(aggregate(all));
		expect(all.filter((r) => r.finished).length).toBeGreaterThan(0);
	});
});
