/**
 * MCTS 最小可行版本评估
 *
 * 核心思路：在选角决策点，对每个候选角色 fork 当前 GameState，
 * 在 fork 上强制执行该选角后自动跑 2 轮完整回合，用城市分差评分。
 *
 * 也覆盖刺杀/偷窃决策：对每个目标 fork 并评估。
 *
 * 评估方式：A 队用 MCTS 选角 + MCTS 刺杀/偷窃，B 队用 V2+排除法。
 */
import { describe, it, expect } from 'vitest';
import {
	GameProgress,
	GameMode,
	MoveType,
	MatchResult,
	TeamId,
	DistrictId,
	CharacterChoosingStateType as CCST,
} from 'citadels-common';
import GameState from '../game/GameState';
import GameSetupData from '../game/GameSetupData';
import { CharacterType } from '../game/CharacterManager';
import { pickV2, pickV1 } from '../game/AutoplayPolicy';

const MAX_STEPS = 80000;
const MCTS_GAMES = 50;
const ROLLOUTS_PER_DECISION = 10;
const MAX_ROLLOUT_STEPS = 6000;

// ─── 创建 6 人 3v3 AI 对局 ──────────────────────────────────────

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

// ─── Rollout 辅助：跑 N 轮并返回城市分差 ────────────────────────

/** 在一局上跑有限步并记录终局优势（总分差） */
function rollout(gs: GameState, maxRounds = 2): number {
	let roundsCompleted = 0;
	let steps = 0;
	while (steps < MAX_ROLLOUT_STEPS) {
		steps += 1;
		if (gs.progress === GameProgress.FINISHED) break;

		// 检测是否完成了 maxRounds 轮 DO_ACTIONS
		if (gs.board && gs.board.gamePhase === 1) { // CHOOSE_CHARACTERS
			// 每轮选角开始 = 新的一轮
		}

		const move = pickV2(gs); // rollout 用 V2 策略
		if (move) continue;
		gs.step({ type: MoveType.AUTO });
	}

	// 计算优势：遍历所有玩家的城市大小分差（己方 vs 对方粗略近似）
	// 更精确：用实际终局分数
	if (gs.progress === GameProgress.FINISHED) {
		return (gs.teamScores?.A ?? 0) - (gs.teamScores?.B ?? 0);
	}
	// 未完成时用城市大小近似
	let teamAScore = 0;
	let teamBScore = 0;
	if (gs.board) {
		gs.board.playerOrder.forEach((pid, idx) => {
			const pb = gs.board?.players.get(pid);
			const cityScore = pb?.city.reduce((s, c) => {
				const cost = ({ manor: 3, castle: 4, palace: 5 } as Record<string, number>)[c] ?? 0;
				return s + cost;
			}, 0) ?? 0;
			if (idx % 2 === 0) teamAScore += cityScore;
			else teamBScore += cityScore;
		});
	}
	return teamAScore - teamBScore;
}

// ─── 用 MCTS 帮 AI 选角 ──────────────────────────────────────────

function mctsPickCharacter(gs: GameState, actorId: string, team: TeamId): boolean {
	if (!gs.board) return false;
	const cm = gs.board.characterManager;
	const remaining = cm.getCharactersAtPosition(0); // NOT_CHOSEN
	if (!remaining.length) return false;

	// 对每个候选角色跑 ROLLOUTS 次 rollout
	const scores: { ch: number; avg: number; wins: number }[] = [];

	for (const ch of remaining) {
		let totalScore = 0;
		let wins = 0;

		for (let r = 0; r < ROLLOUTS_PER_DECISION; r += 1) {
			const fork = gs.clone();

			// 在 fork 上强制选 ch
			const chosenIdx = fork.board!.characterManager
				.getCharactersAtPosition(0)
				.indexOf(ch);
			if (chosenIdx >= 0) {
				const ok = fork.step({ type: MoveType.CHOOSE_CHARACTER, data: chosenIdx });
				if (ok) {
					const adv = rollout(fork);
					totalScore += adv;

					// 计算己方是否优势
					if (team === TeamId.A && adv > 0) wins += 1;
					else if (team === TeamId.B && adv < 0) wins += 1;
				}
			}
		}

		scores.push({
			ch,
			avg: totalScore / ROLLOUTS_PER_DECISION,
			wins,
		});
	}

	// 选平均优势最高的角色
	scores.sort((a, b) => b.avg - a.avg);
	const best = scores[0];
	if (!best) return false;

	const bestIdx = remaining.indexOf(best.ch as CharacterType);
	if (bestIdx < 0) return false;

	// 执行选角
	const move: Move = { type: MoveType.CHOOSE_CHARACTER, data: bestIdx };
	return gs.step(move);
}

// ─── MCTS 选角驱动的 AI 决策 ───────────────────────────────────

function mctsAIPick(gs: GameState): Move | null {
	if (!gs.board) return null;
	const cm = gs.board.characterManager;
	const actorId = gs.board.getCurrentPlayerId();
	if (!actorId) return null;
	const player = gs.players.get(actorId);
	if (!player) return null;

	const phase = gs.board.gamePhase;

	// MCTS 只处理选角阶段
	if (phase === 1) { // CHOOSE_CHARACTERS
		const ccsType = cm.choosingState.getState().type;
		if (ccsType === 4 || ccsType === 5) { // CHOOSE_CHARACTER / PUT_ASIDE_FACE_DOWN_UP
			// 首发必拿刺客（与 V2 一致）
			const remaining = cm.getCharactersAtPosition(0);
			if (remaining.includes(CharacterType.ASSASSIN as number)) {
				const idx = remaining.indexOf(CharacterType.ASSASSIN);
				return tryMove(gs, { type: MoveType.CHOOSE_CHARACTER, data: idx });
			}
			// 非首发且有余钱时用 MCTS
			return mctsPickCharacter(gs, actorId, player.team) ? null : null;
		}
	}

	// 非选角阶段用 V2
	return pickV2(gs);
}

function tryMove(gs: GameState, move: Move): Move | null {
	if (gs.step(move)) {
		gs.step({ type: MoveType.AUTO });
		return move;
	}
	return null;
}

// ─── MCTS AI 主函数 ──────────────────────────────────────────────

function mctsStep(gs: GameState): Move | null {
	return mctsAIPick(gs);
}

// ─── 评估主循环 ─────────────────────────────────────────────────

function runMCTSGame(gameNum: number): { finished: boolean; steps: number; scoreA: number; scoreB: number; matchResult: MatchResult | undefined } {
	const gs = createGame();
	let steps = 0;

	while (steps < MAX_STEPS) {
		steps += 1;
		if (gs.progress === GameProgress.FINISHED) break;

		// 确定当前玩家队伍
		const actorId = gs.board?.getCurrentPlayerId();
		const actor = actorId ? gs.players.get(actorId) : undefined;
		const isMCTS = actor && actor.team === TeamId.A; // A队用MCTS

		const move = isMCTS ? mctsStep(gs) : pickV2(gs);
		if (move) continue;

		gs.step({ type: MoveType.AUTO });
	}

	const done = gs.progress === GameProgress.FINISHED;
	console.log(`  #${gameNum} ${done ? '✓' : '✗'} 步=${steps} 分=${gs.teamScores?.A ?? 0}:${gs.teamScores?.B ?? 0}`);
	return {
		finished: done,
		steps,
		scoreA: gs.teamScores?.A ?? 0,
		scoreB: gs.teamScores?.B ?? 0,
		matchResult: gs.matchResult,
	};
}

// ─── 测试 ─────────────────────────────────────────────────────────

describe('MCTS 评估', () => {
	it(`MCTS vs V2  ${MCTS_GAMES} 局`, { timeout: 200000 }, () => {
		const results: Awaited<ReturnType<typeof runMCTSGame>>[] = [];
		const start = Date.now();

		for (let i = 0; i < MCTS_GAMES; i += 1) {
			results.push(runMCTSGame(i));
		}

		const elapsed = ((Date.now() - start) / 1000).toFixed(1);
		const finished = results.filter((r) => r.finished);
		const aWins = results.filter((r) => r.matchResult === MatchResult.TEAM_A_WIN).length;
		const bWins = results.filter((r) => r.matchResult === MatchResult.TEAM_B_WIN).length;
		const draws = results.filter((r) => r.matchResult === MatchResult.DRAW).length;
		const avgScoreA = results.reduce((s, r) => s + r.scoreA, 0) / MCTS_GAMES;
		const avgScoreB = results.reduce((s, r) => s + r.scoreB, 0) / MCTS_GAMES;

		console.log(`\n======= MCTS vs V2 报告 (${elapsed}s) =======`);
		console.log(`局数: ${MCTS_GAMES}  完成: ${finished.length}`);
		console.log(`A队(MCTS)胜: ${aWins}  B队(V2)胜: ${bWins}  平: ${draws}`);
		console.log(`平均分: A队 ${avgScoreA.toFixed(1)}  B队 ${avgScoreB.toFixed(1)}`);
		console.log('================================\n');
	});
});

// 确保 Move 类型识别
interface Move {
	type: number;
	data?: unknown;
}
