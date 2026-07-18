/**
 * P5: add AI seats, start 1 human + 5 AI, autoplay advances (smoke).
 */
/* eslint-disable no-console */
process.env.CITADELS_SYNC = '1';
process.env.CITADELS_FAST = '1';
const path = require('path');

const GameState = require(path.join(__dirname, '../server/dist/game/GameState')).default;
const GameSetupData = require(path.join(__dirname, '../server/dist/game/GameSetupData')).default;
const { pickAndApplyAutoplayMove } = require(path.join(__dirname, '../server/dist/game/AutoplayPolicy'));
const { GameProgress, GameMode, PlayerRole } = require(path.join(__dirname, '../common/dist/index.js'));

function assert(c, m) {
  if (!c) throw new Error(m);
}

function main() {
  const gs = new GameState();
  gs.addPlayer('human', 'Human', true, true, PlayerRole.PLAYER, 'user-h');

  for (let i = 0; i < 5; i += 1) {
    const p = gs.addAiPlayer(`ai${i}`, `AI-${i + 1}`);
    assert(p && p.isAi && p.isAutoplay, `add ai ${i}`);
  }
  assert(gs.getSeatedPlayerCount() === 6, '6 seats');
  // one more allowed (max 7)
  assert(gs.addAiPlayer('ai5', 'AI-6'), '7th ok');
  assert(gs.getSeatedPlayerCount() === 7, '7 seats');
  assert(gs.addAiPlayer('aiX', 'AI-X') === null, '8th blocked');
  assert(gs.removeAiPlayer('ai5'), 'remove ai');
  assert(gs.getSeatedPlayerCount() === 6, 'back to 6');

  const ids = Array.from(gs.players.values())
    .filter((p) => p.role === PlayerRole.PLAYER)
    .map((p) => p.id);
  const setup = new GameSetupData(ids, 7, 10);
  assert(gs.validateGameSetup(setup), 'validate');
  gs.setupGame(setup);
  assert(gs.hasAiPlayers === true, 'hasAi');
  // with AI: casual (unranked), not competitive ranked
  assert(gs.gameMode === GameMode.CASUAL, `mode casual with AI, got ${gs.gameMode}`);
  assert(gs.completeCitySize === 8, 'city 8 for 6p');

  gs.progress = GameProgress.IN_GAME;
  // run many autoplay steps
  let steps = 0;
  let moves = 0;
  while (steps < 500 && gs.progress !== GameProgress.FINISHED) {
    steps += 1;
    const actor = gs.board?.getCurrentPlayerId();
    if (!actor) {
      gs.step();
      continue;
    }
    const p = gs.players.get(actor);
    if (p && (p.isAi || p.isAutoplay)) {
      const m = pickAndApplyAutoplayMove(gs);
      if (m) {
        moves += 1;
        gs.markEffectiveAiControl(actor);
      } else {
        gs.step();
      }
    } else {
      // force human autoplay for smoke
      gs.setAutoplay(actor, true);
    }
  }
  console.log('[test-p5] steps', steps, 'moves', moves, 'progress', gs.progress, 'maxCity',
    Math.max(...Array.from(gs.board.players.values()).map((b) => b.city.length)));
  assert(moves >= 10, `expected some AI moves, got ${moves}`);
  console.log('[test-p5-ai] PASSED');
}

main();
