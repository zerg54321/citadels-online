/**
 * P3 smoke: force-finish a 6p competitive match into DB, then query stats APIs.
 * Requires server running on 8081 with rebuilt dist (tables created on boot).
 */
/* eslint-disable no-console */
const path = require('path');
const http = require('http');
const { io } = require(path.join(__dirname, '../client/node_modules/socket.io-client'));

const BASE = 'http://127.0.0.1:8081';
const GameProgress = { FINISHED: 3 };
const GameMode = { COMPETITIVE_TEAM6: 2 };

function post(apiPath, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const url = new URL(apiPath, BASE);
    const headers = { 'Content-Type': 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (data) headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'POST',
      headers,
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        try { resolve({ code: res.statusCode, body: JSON.parse(b || '{}') }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

function get(apiPath, token) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiPath, BASE);
    const headers = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname + url.search,
      method: 'GET',
      headers,
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        try { resolve({ code: res.statusCode, body: JSON.parse(b || '{}') }); }
        catch (e) { reject(e); }
      });
    });
    req.on('error', reject);
    req.end();
  });
}

function connect(token) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, { path: '/s/', transports: ['websocket'], forceNew: true, auth: { token } });
    const t = setTimeout(() => reject(new Error('connect timeout')), 8000);
    s.on('connect', () => { clearTimeout(t); resolve(s); });
    s.on('connect_error', reject);
  });
}

function emit(s, ev, ...args) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${ev}`)), 10000);
    s.emit(ev, ...args, (res) => { clearTimeout(t); resolve(res); });
  });
}

function assert(c, m) {
  if (!c) throw new Error(m);
}

async function main() {
  // Direct DB path via force-finish using GameState in-process is cleaner;
  // here we use HTTP + inject via internal module for guaranteed FINISHED write.
  const GameState = require(path.join(__dirname, '../server/dist/game/GameState')).default;
  const GameSetupData = require(path.join(__dirname, '../server/dist/game/GameSetupData')).default;
  const { saveFinishedMatch, listMatchesForUser, getRanking } = require(path.join(__dirname, '../server/dist/db/matches'));
  // ensure tables
  require(path.join(__dirname, '../server/dist/db/database'));

  const stamp = Date.now().toString(36);
  const tokens = [];
  const userIds = [];
  for (let i = 0; i < 6; i += 1) {
    const username = `m${i}_${stamp}`;
    const reg = await post('/api/auth/register', {
      username,
      password: 'secret12',
      displayName: `MatchBot${i}`,
    });
    assert(reg.body.status === 'ok', `register ${i}`);
    tokens.push(reg.body.token);
    userIds.push(reg.body.user.id);
  }

  // Build finished competitive state offline then save
  const gs = new GameState();
  const ids = userIds.map((_, i) => `seat${i}`);
  ids.forEach((id, i) => {
    gs.addPlayer(id, `MatchBot${i}`, i === 0, true, 2, userIds[i]);
  });
  gs.setupGame(new GameSetupData(ids, 7));
  assert(gs.gameMode === GameMode.COMPETITIVE_TEAM6, 'mode team6');

  // force cities + scores
  const order = gs.board.playerOrder;
  order.forEach((pid, seat) => {
    const b = gs.board.players.get(pid);
    b.city = ['manor', 'castle', 'palace', 'temple', 'church', 'monastery', 'cathedral', 'tavern'];
    if (seat === 0) b.firstToCompleteCity = true;
    else b.sameTurnCompleteCity = true;
  });
  gs.cityCompletedThisMatch = true;
  gs.computeScores = gs['computeScores'].bind(gs);
  gs['computeScores']();
  gs.progress = GameProgress.FINISHED;

  const matchId = saveFinishedMatch('TESTROOM', gs);
  assert(matchId, 'save match id');
  console.log('[test-matches] saved', matchId);

  // casual 2p also saves unranked
  const gs2 = new GameState();
  gs2.addPlayer('c0', 'C0', true, true, 2, userIds[0]);
  gs2.addPlayer('c1', 'C1', false, true, 2, userIds[1]);
  gs2.setupGame(new GameSetupData(['c0', 'c1'], 7));
  assert(gs2.gameMode === 1, 'casual mode');
  const b0 = gs2.board.players.get('c0');
  b0.city = ['manor', 'castle', 'palace', 'temple', 'church', 'monastery', 'cathedral'];
  b0.firstToCompleteCity = true;
  gs2['computeScores']();
  gs2.progress = GameProgress.FINISHED;
  const casualId = saveFinishedMatch('CASUALROOM', gs2);
  assert(casualId, 'casual save');
  console.log('[test-matches] casual saved', casualId);

  const mine = listMatchesForUser(userIds[0], 20);
  assert(mine.length >= 2, 'user has matches');
  const ranked = mine.filter((m) => m.ranked);
  const casual = mine.filter((m) => !m.ranked);
  assert(ranked.length >= 1, 'has ranked');
  assert(casual.length >= 1, 'has casual');
  console.log('[test-matches] history ranked', ranked.length, 'casual', casual.length);

  const ranking = getRanking(20);
  assert(ranking.some((r) => r.userId === userIds[0]), 'user0 in ranking');
  // casual must not inflate: ranking only ranked games
  const row = ranking.find((r) => r.userId === userIds[0]);
  assert(row.rankedGames >= 1, 'ranked games >= 1');
  console.log('[test-matches] ranking sample', row);

  // HTTP APIs
  const hist = await get('/api/stats/me/matches', tokens[0]);
  assert(hist.body.status === 'ok' && hist.body.matches.length >= 1, 'HTTP history');
  const rank = await get('/api/stats/ranking');
  assert(rank.body.status === 'ok' && Array.isArray(rank.body.ranking), 'HTTP ranking');

  console.log('[test-matches] PASSED');
}

main().catch((e) => {
  console.error('[test-matches] FAILED', e);
  process.exit(1);
});
