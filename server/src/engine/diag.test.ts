/**
 * 快速诊断：forceAssassin 硬编码为什么不生效
 */
import { describe, it, expect } from 'vitest';
import { GameProgress, GameMode, MoveType, TeamId } from 'citadels-common';
import GameState from '../game/GameState';
import GameSetupData from '../game/GameSetupData';
import { pickV3 } from '../game/AutoplayPolicy';

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

describe('forceAssassin 诊断', () => {
	it('一局诊断', { timeout: 120000 }, () => {
		const gs = createGame();
		let steps = 0;
		while (steps < 500 && gs.progress !== GameProgress.FINISHED) {
			steps += 1;
			const move = pickV3(gs);
			if (move) continue;
			gs.step({ type: MoveType.AUTO });
		}
		expect(gs.progress).toBe(GameProgress.FINISHED);
	});
});
