/**
 * AI 决策解释输出（AI Explain）演示/自检脚本
 *
 * 在内存中跑一局 6 人 AI 3v3 对局，用 explain 收集器抓取每个决策点，
 * 按可读格式打印出来——回答「AI 这一步为什么这么选」。
 *
 * 用法：
 *   npm --prefix server exec vitest run -- src/engine/aiExplain.test.ts
 *
 * 输出内容（每个决策点一条）：
 *   - 选角/扣牌：全部候选角色的规则评分（EV + 口诀先验）
 *   - 刺客/盗贼/魔术师/军阀目标：每个目标的 EV 分数
 *   - 建造顺序、二选一选牌：每张牌的建造评分
 *   - 资源行动/可选行动：优先级序（首个合法项被执行）
 *
 * 生产环境不受影响：TurnTimer 只有在 AI_EXPLAIN=1 时才传收集器，
 * 本测试则是显式传入收集器的离线用法示例。
 */
import { describe, it, expect } from 'vitest';
import { GameMode, GameProgress, MoveType } from 'citadels-common';
import GameState from '../game/GameState';
import GameSetupData from '../game/GameSetupData';
import { pickAndApplyAutoplayMove } from '../game/AutoplayPolicy';
import { formatExplainRecord, type AiExplainRecord } from '../game/AiExplainer';

const MAX_STEPS = 30000;

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

describe('AI 决策解释输出', () => {
	it('跑一局并打印每个决策点的候选与选择', () => {
		const gs = createGame();
		const records: AiExplainRecord[] = [];

		let steps = 0;
		while (steps < MAX_STEPS && gs.progress !== GameProgress.FINISHED) {
			steps += 1;
			const move = pickAndApplyAutoplayMove(gs, 'v2', true, (r) => records.push(r));
			if (!move) gs.step({ type: MoveType.AUTO });
		}

		// 基本健全性：一局下来必须有大量决策记录，且每条都有候选与选中项
		expect(records.length).toBeGreaterThan(50);
		records.forEach((r) => {
			expect(r.chosen.length).toBeGreaterThan(0);
			expect(r.candidates.length).toBeGreaterThan(0);
			expect(r.round).toBeGreaterThanOrEqual(0);
		});

		// 打印演示：每个决策点一条。关注的决策类型可用 decision 过滤，
		// 例如只看选角：records.filter(r => r.decision === '选角')
		// eslint-disable-next-line no-console
		console.log(`\n=== AI Explain 演示：共 ${records.length} 条决策记录，示例输出如下 ===\n`);
		// 选 12 条有分数的代表性记录（选角/目标类优先）
		const interesting = records
			.filter((r) => r.candidates.some((c) => c.score !== undefined))
			.slice(0, 12);
		interesting.forEach((r) => {
			// eslint-disable-next-line no-console
			console.log(formatExplainRecord(r));
		});
	});
});
