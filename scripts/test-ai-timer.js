/**
 * Live-room style: all AI seats + TurnTimer heartbeat must finish without human.
 */
/* eslint-disable no-console */
process.env.CITADELS_SYNC = '1';
process.env.CITADELS_FAST = '1';

const path = require('path');
const GameState = require(path.join(__dirname, '../server/dist/game/GameState')).default;
const GameSetupData = require(path.join(__dirname, '../server/dist/game/GameSetupData')).default;
const { getTurnTimer, disposeTurnTimer } = require(path.join(__dirname, '../server/dist/gameManager/TurnTimer'));
const { GameProgress, PlayerRole } = require(path.join(__dirname, '../common/dist/index.js'));

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function snapshot(gs) {
  const board = gs.board;
  if (!board) return {};
  const cm = board.characterManager;
  const actorId = board.getCurrentPlayerId();
  const actor = actorId ? gs.players.get(actorId) : null;
  return {
    phase: board.gamePhase,
    chooseType: cm.choosingState.getState().type,
    choosePlayer: cm.choosingState.getState().player,
    turnState: cm.turnState,
    clientTurn: cm.getClientTurnState(),
    char: cm.getCurrentCharacter(),
    playable: cm.isCharacterPlayable(cm.getCurrentCharacter()),
    actorId,
    actorName: actor?.username,
    isAi: actor?.isAi,
  };
}

async function main() {
  disposeTurnTimer('test-all-ai');
  const gs = new GameState();
  // 1 human + 5 AI (human will autoplay from start)
  const human = gs.addPlayer('human', 'Human', true, true, PlayerRole.PLAYER, 'u1');
  human.isAutoplay = true; // simulate always hosted
  for (let i = 0; i < 5; i += 1) {
    gs.addAiPlayer(`ai${i}`, `AI-${i + 1}`);
  }
  const ordered = ['human', 'ai0', 'ai1', 'ai2', 'ai3', 'ai4'];
  gs.setupGame(new GameSetupData(ordered, 8, 10));
  // ensure all autoplay
  ordered.forEach((id) => {
    const p = gs.players.get(id);
    p.isAutoplay = true;
    if (id !== 'human') p.isAi = true;
  });

  const room = {
    roomId: 'test-all-ai',
    gameState: gs,
    updateCount: 0,
    update() {
      this.updateCount += 1;
      if (gs.progress === GameProgress.IN_GAME) {
        getTurnTimer(this).onStateChanged(false);
      }
    },
  };

  gs.step(); // enter game
  room.update();
  getTurnTimer(room).onStateChanged();

  let last = '';
  let stuckTicks = 0;
  const start = Date.now();
  const maxMs = 60000;
  let lastLog = 0;

  while (Date.now() - start < maxMs && gs.progress !== GameProgress.FINISHED) {
    const s = snapshot(gs);
    const key = JSON.stringify(s);
    if (key === last) stuckTicks += 1;
    else {
      stuckTicks = 0;
      last = key;
    }
    if (Date.now() - lastLog > 3000) {
      lastLog = Date.now();
      const cities = Array.from(gs.board.players.values()).map((b) => b.city.length).join(',');
      console.log(`[t=${Math.round((Date.now() - start) / 1000)}s]`, s, 'cities', cities, 'upd', room.updateCount);
    }
    if (stuckTicks > 40) {
      console.error('STUCK', s);
      throw new Error('stalled');
    }
    await sleep(250);
  }

  disposeTurnTimer('test-all-ai');
  if (gs.progress !== GameProgress.FINISHED) {
    console.error('final', snapshot(gs));
    throw new Error(`not finished in ${maxMs}ms`);
  }
  console.log('[test-ai-timer] FINISHED in', Date.now() - start, 'ms updates', room.updateCount);
  console.log('[test-ai-timer] PASSED');
}

main().catch((e) => {
  console.error('[test-ai-timer] FAILED', e);
  process.exit(1);
});
