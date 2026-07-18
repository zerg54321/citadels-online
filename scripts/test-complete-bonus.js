/**
 * Unit-style check for complete-city bonuses (+4 first / +2 later)
 * without playing a full game — uses server modules via compiled dist.
 */
/* eslint-disable no-console */
const path = require('path');

// Load compiled server game modules
const GameState = require(path.join(__dirname, '../server/dist/game/GameState')).default;
const GameSetupData = require(path.join(__dirname, '../server/dist/game/GameSetupData')).default;
const { MoveType } = require(path.join(__dirname, '../common/dist/index.js'));

function assert(c, m) {
  if (!c) throw new Error(m);
}

function main() {
  const gs = new GameState();
  // six fake players
  const ids = ['p0', 'p1', 'p2', 'p3', 'p4', 'p5'];
  ids.forEach((id, i) => gs.addPlayer(id, `P${i}`, i === 0));

  const setup = new GameSetupData(ids, 7);
  assert(gs.validateGameSetup(setup), 'validate');
  gs.setupGame(setup);
  assert(gs.gameMode === 2, 'competitive mode'); // COMPETITIVE_TEAM6
  assert(gs.completeCitySize === 8, 'size 8');
  ids.forEach((id, seat) => {
    const p = gs.getPlayer(id);
    const exp = seat % 2 === 0 ? 1 : 2; // A=1 B=2
    assert(p.team === exp, `team seat ${seat}`);
  });

  // force boards nearly complete and mark complete bonuses
  const board = gs.board;
  const b0 = board.players.get('p0');
  const b1 = board.players.get('p1');
  // give 8 cheap temples-like by stuffing city arrays
  b0.city = ['manor', 'castle', 'palace', 'temple', 'church', 'monastery', 'cathedral', 'tavern'];
  b1.city = ['manor', 'castle', 'palace', 'temple', 'church', 'monastery', 'cathedral', 'market'];
  b0.firstToCompleteCity = true;
  b1.sameTurnCompleteCity = true;
  gs.cityCompletedThisMatch = true;
  gs.cityCompletedThisTurnPhase = true;

  // call private computeScores via finish path
  gs.computeScores = gs.computeScores || null;
  // access private method
  gs['computeScores']();

  assert(b0.score.extraPointsCompleteCity === 4, `p0 bonus ${b0.score.extraPointsCompleteCity}`);
  assert(b1.score.extraPointsCompleteCity === 2, `p1 bonus ${b1.score.extraPointsCompleteCity}`);
  assert(typeof b0.score.total === 'number' && b0.score.total > 0, 'p0 total');
  assert(gs.teamScores.A > 0 || gs.teamScores.B > 0, 'team scores set');
  assert([1, 2, 3].includes(gs.matchResult), `matchResult ${gs.matchResult}`);

  console.log('teamScores', gs.teamScores, 'matchResult', gs.matchResult);
  console.log('p0 total', b0.score.total, 'p1 total', b1.score.total);
  console.log('[test-complete-bonus] PASSED');
}

main();
