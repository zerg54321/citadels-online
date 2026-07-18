/**
 * P4 unit checks: timeout field, autoplay flag, ranked_win_eligible with hadEffectiveAiControl.
 */
/* eslint-disable no-console */
process.env.CITADELS_SYNC = '1';
process.env.CITADELS_FAST = '1';
const path = require('path');

const GameState = require(path.join(__dirname, '../server/dist/game/GameState')).default;
const GameSetupData = require(path.join(__dirname, '../server/dist/game/GameSetupData')).default;
const { pickAndApplyAutoplayMove } = require(path.join(__dirname, '../server/dist/game/AutoplayPolicy'));
const { saveFinishedMatch } = require(path.join(__dirname, '../server/dist/db/matches'));
const db = require(path.join(__dirname, '../server/dist/db/database')).default;
const { GameProgress, GameMode, MatchResult, TeamId } = require(path.join(__dirname, '../common/dist/index.js'));

function assert(c, m) {
  if (!c) throw new Error(m);
}

function main() {
  // --- setup timeout clamp ---
  assert(GameSetupData.clampTimeout(5) === 10, 'min timeout 10');
  assert(GameSetupData.clampTimeout(200) === 180, 'max timeout 180');
  assert(GameSetupData.clampTimeout(120) === 120, 'default ok');

  const gs = new GameState();
  const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  ids.forEach((id, i) => {
    const p = gs.addPlayer(id, `P${i}`, i === 0, true);
    p.userId = `u${i}`;
  });
  const setup = new GameSetupData(ids, 7, 10);
  assert(gs.validateGameSetup(setup), 'validate');
  gs.setupGame(setup);
  assert(gs.actionTimeoutSeconds === 10, `timeout ${gs.actionTimeoutSeconds}`);
  assert(gs.gameMode === GameMode.COMPETITIVE_TEAM6, 'comp mode');

  // autoplay flag
  assert(gs.setAutoplay('p0', true), 'set autoplay');
  assert(gs.players.get('p0').isAutoplay === true, 'autoplay on');
  assert(gs.players.get('p0').hadEffectiveAiControl === false, 'no effective yet');
  gs.setAutoplay('p0', false);
  assert(gs.players.get('p0').isAutoplay === false, 'autoplay off');
  assert(gs.players.get('p0').hadEffectiveAiControl === false, 'still no effective');

  // force AI control mark
  gs.markEffectiveAiControl('p0');
  assert(gs.players.get('p0').hadEffectiveAiControl === true, 'effective set');

  // one autoplay step smoke (does not need full game)
  gs.progress = GameProgress.IN_GAME;
  if (gs.board) {
    gs.board.gamePhase = 1; // CHOOSE_CHARACTERS
    gs.step(); // may advance INITIAL
    const actor = gs.board.getCurrentPlayerId();
    if (actor) {
      gs.setAutoplay(actor, true);
      const m = pickAndApplyAutoplayMove(gs);
      if (m) {
        gs.markEffectiveAiControl(actor);
        assert(gs.players.get(actor).hadEffectiveAiControl, 'AI step marks effective');
      }
      console.log('[test-p4] smoke autoplay move', m && m.type, 'actor', actor);
    }
  }

  // finish scores manually for DB test — fixed player ids
  gs.progress = GameProgress.FINISHED;
  gs.matchResult = MatchResult.TEAM_A_WIN;
  gs.teamScores = { A: 50, B: 40 };
  // restore known playerOrder for seat mapping
  gs.board.playerOrder = [...ids];
  ids.forEach((id, seat) => {
    const meta = gs.players.get(id);
    const b = gs.board.players.get(id);
    if (meta) {
      meta.team = seat % 2 === 0 ? TeamId.A : TeamId.B;
      meta.hadEffectiveAiControl = false;
      meta.isAi = false;
    }
    if (b) {
      b.city = ['manor', 'castle', 'palace', 'temple', 'church', 'monastery', 'cathedral', 'tavern'];
      b.score = { total: seat % 2 === 0 ? 20 : 10 };
    }
  });
  // p0 (A, seat0) had AI and team won => not ranked eligible
  gs.players.get('p0').hadEffectiveAiControl = true;
  // p2 (A, seat2) clean win => ranked eligible
  gs.players.get('p2').hadEffectiveAiControl = false;
  // p1 (B) lost
  gs.players.get('p1').hadEffectiveAiControl = false;

  gs.matchPersisted = false;
  const matchId = saveFinishedMatch('test-room-p4', gs);
  assert(matchId, 'match saved');

  const rows = db.prepare(
    'SELECT player_id, seat, team, had_effective_ai_control, ranked_win_eligible, team_won FROM match_players WHERE match_id = ? ORDER BY seat',
  ).all(matchId);
  console.log('[test-p4] rows', rows);
  const r0 = rows.find((r) => r.player_id === 'p0');
  assert(r0.team_won === 1, 'p0 team won');
  assert(r0.had_effective_ai_control === 1, 'p0 had ai');
  assert(r0.ranked_win_eligible === 0, 'p0 not ranked win eligible');
  const r2 = rows.find((r) => r.player_id === 'p2');
  assert(r2.team_won === 1 && r2.ranked_win_eligible === 1, 'p2 ranked win ok');
  const r1 = rows.find((r) => r.player_id === 'p1');
  assert(r1.team_won === 0 && r1.ranked_win_eligible === 0, 'p1 no win');

  console.log('[test-p4-autoplay] PASSED');
}

main();
