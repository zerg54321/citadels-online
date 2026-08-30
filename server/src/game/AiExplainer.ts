/**
 * AI 决策解释输出（AI Explain）
 *
 * 目的：让 AI 的每个决策点可观测——候选列表、各自评分、最终选中项。
 *
 * 使用方式：
 *   1. 本地/离线：调用 pickAndApplyAutoplayMove 时传入 explain 收集器，
 *      逐决策收到 AiExplainRecord（见 engine/aiExplain.test.ts 的示例）。
 *   2. 测试服务器：设置环境变量 AI_EXPLAIN=1，TurnTimer 会把每条决策
 *      以 [ai-explain] JSON 行打进服务端日志。生产环境不设置该变量，
 *      explain 为 undefined，策略行为与性能与现状完全一致。
 *
 * 设计约束：
 *   - 纯旁路观测：不改变任何决策逻辑，收集器抛异常也不影响对局。
 *   - 评分即策略真实使用的评分（含 scoreCharacterPick 内的 ±0.3 随机
 *     扰动），因此同一局面两次展示的分数可能略有浮动，属预期行为。
 */

import { CharacterType } from './CharacterManager';

/** 单个评分因子的构成（"这个分是怎么算出来的"） */
export interface AiExplainFactor {
	/** 因子名，如 "本回合预期收益EV" / "座位权重" / "队友误伤惩罚" */
	label: string;
	/** 该因子的贡献值（带符号；省略的因子贡献为 0 或不适用） */
	value: number;
}

export interface AiExplainCandidate {
	/** 候选的可读标签，如 "角色:军阀" / "建造:城堡(建造费5)" */
	label: string;
	/** 候选评分（策略真实使用的分值）；无法量化时省略 */
	score?: number;
	/** 评分的因子分解（各命名成分的加权和）；无法分解时省略 */
	factors?: AiExplainFactor[];
}

export interface AiExplainRecord {
	/** 回合号（1-based） */
	round: number;
	/** 策略版本 'v0'|'v1'|'v2'|'v3' */
	version: string;
	/** 决策者（座位名/用户名） */
	actor: string;
	/** 决策点标识，如 '选角' / '刺客目标' / '建造顺序' */
	decision: string;
	/** 候选列表，按策略偏好从高到低排序 */
	candidates: AiExplainCandidate[];
	/** 实际执行的选项标签 */
	chosen: string;
	/** 补充说明（如 '首发硬编码刺客' / 'V3 MCTS 覆盖规则评分'） */
	note?: string;
}

export type AiExplainCollector = (record: AiExplainRecord) => void;

/** 角色中文名（按 CharacterType 枚举值索引；客户端 ID = 枚举 + 1） */
export const CHAR_NAMES: Record<number, string> = {
	[CharacterType.ASSASSIN]: '刺客',
	[CharacterType.THIEF]: '盗贼',
	[CharacterType.MAGICIAN]: '魔术师',
	[CharacterType.KING]: '国王',
	[CharacterType.BISHOP]: '主教',
	[CharacterType.MERCHANT]: '商人',
	[CharacterType.ARCHITECT]: '建筑师',
	[CharacterType.WARLORD]: '军阀',
};

/** 数字保留 1 位小数，避免表格里出现长浮点 */
export function round1(n: number): number {
	return Math.round(n * 10) / 10;
}

/**
 * 把一条决策记录渲染成可读的多行文本（本地调试/测试输出用）。
 *
 * 示例：
 *   [R3] 选角 @A1 (v2)
 *     #1 角色:刺客   分 12.3
 *     #2 角色:军阀   分 10.1
 *     #3 角色:商人   分  7.8
 *   → 选 角色:军阀   （首发硬编码刺客被 MCTS 覆盖时在此注明）
 */
export function formatExplainRecord(r: AiExplainRecord): string {
	const lines: string[] = [];
	lines.push(`[R${r.round}] ${r.decision} @${r.actor} (${r.version})`);
	const shown = r.candidates.slice(0, 5);
	shown.forEach((c, i) => {
		const score = c.score === undefined ? '' : `  分 ${String(round1(c.score)).padStart(6)}`;
		lines.push(`  #${i + 1} ${c.label}${score}`);
		if (c.factors && c.factors.length > 0) {
			const breakdown = c.factors
				.map((f) => `${f.label} ${round1(f.value)}`)
				.join(' + ');
			lines.push(`      = ${breakdown}`);
		}
	});
	if (r.candidates.length > shown.length) {
		lines.push(`  …另有 ${r.candidates.length - shown.length} 个候选`);
	}
	lines.push(`→ 选 ${r.chosen}${r.note ? `   （${r.note}）` : ''}`);
	return lines.join('\n');
}
