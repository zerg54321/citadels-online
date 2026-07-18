/**
 * 6-player competitive 3v3 auto simulation (L0: legal greedy moves).
 * Usage (repo root, server running on 8081; frontend optional for spectate):
 *   node scripts/sim-6p.js
 *   node scripts/sim-6p.js --max-steps 4000
 *   node scripts/sim-6p.js --watch
 *   node scripts/sim-6p.js --watch --delay 800 --max-steps 2000
 *
 * Spectate (browser, while script is still running):
 *   open the printed room URL → click 观战 / Spectate
 */
/* eslint-disable no-console */
const path = require('path');
const http = require('http');
const { io } = require(path.join(__dirname, '../client/node_modules/socket.io-client'));
const { districts } = require(path.join(__dirname, '../common/dist/index.js'));

const BASE = process.env.CITADELS_URL || 'http://127.0.0.1:8081';
const WEB = process.env.CITADELS_WEB || 'http://127.0.0.1:3000';
const WATCH = process.argv.includes('--watch');
const MAX_STEPS = Number((process.argv.find((a) => a.startsWith('--max-steps=')) || '').split('=')[1]
  || (process.argv.includes('--max-steps') ? process.argv[process.argv.indexOf('--max-steps') + 1] : (WATCH ? 4000 : 4000)));
const STEP_DELAY = Number((process.argv.find((a) => a.startsWith('--delay=')) || '').split('=')[1]
  || (process.argv.includes('--delay') ? process.argv[process.argv.indexOf('--delay') + 1] : (WATCH ? 600 : 20)));
const IDLE_DELAY = WATCH ? Math.max(STEP_DELAY, 500) : 80;

const CARD_COST = Object.fromEntries(
  Object.entries(districts).map(([id, d]) => [id, d.cost ?? 99]),
);

// Mirror common enums (numeric)
const GameProgress = { IN_LOBBY: 1, IN_GAME: 2, FINISHED: 3 };
const GameMode = { CASUAL: 1, COMPETITIVE_TEAM6: 2 };
const TeamId = { NONE: 0, A: 1, B: 2 };
const MatchResult = { NONE: 0, TEAM_A_WIN: 1, TEAM_B_WIN: 2, DRAW: 3, CASUAL_END: 4 };
const GamePhase = { INITIAL: 0, CHOOSE_CHARACTERS: 1, DO_ACTIONS: 2 };
const CCST = {
  INITIAL: 0,
  PUT_ASIDE_FACE_UP: 1,
  PUT_ASIDE_FACE_DOWN: 2,
  PUT_ASIDE_FACE_DOWN_UP: 3,
  CHOOSE_CHARACTER: 4,
  GET_ASIDE_FACE_DOWN: 5,
  DONE: 6,
};
const ClientTurnState = {
  INITIAL: 0,
  TAKE_RESOURCES: 1,
  CHOOSE_CARD: 2,
  CHOOSE_ACTION: 3,
  ASSASSIN_KILL: 4,
  THIEF_ROB: 5,
  MAGICIAN_EXCHANGE_HAND: 6,
  MAGICIAN_DISCARD_CARDS: 7,
  MERCHANT_TAKE_1_GOLD: 8,
  ARCHITECT_DRAW_2_CARDS: 9,
  WARLORD_DESTROY_DISTRICT: 10,
  GRAVEYARD_RECOVER_DISTRICT: 11,
  LABORATORY_DISCARD_CARD: 12,
  BUILD_DISTRICT: 13,
  DONE: 14,
};
const MoveType = {
  CHOOSE_CHARACTER: 1,
  TAKE_GOLD: 2,
  DRAW_CARDS: 3,
  ASSASSIN_KILL: 4,
  THIEF_ROB: 5,
  MAGICIAN_EXCHANGE_HAND: 6,
  MAGICIAN_DISCARD_CARDS: 7,
  TAKE_GOLD_EARNINGS: 8,
  MERCHANT_TAKE_1_GOLD: 9,
  ARCHITECT_DRAW_2_CARDS: 10,
  WARLORD_DESTROY_DISTRICT: 11,
  GRAVEYARD_RECOVER_DISTRICT: 12,
  SMITHY_DRAW_CARDS: 13,
  LABORATORY_DISCARD_CARD: 14,
  DECLINE: 15,
  BUILD_DISTRICT: 16,
  FINISH_TURN: 17,
};

function post(apiPath, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const url = new URL(apiPath, BASE);
    const req = http.request({
      hostname: url.hostname,
      port: url.port,
      path: url.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let b = '';
      res.on('data', (c) => { b += c; });
      res.on('end', () => {
        try {
          resolve({ code: res.statusCode, body: JSON.parse(b || '{}') });
        } catch (e) {
          reject(e);
        }
      });
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function connect(token, label) {
  return new Promise((resolve, reject) => {
    const s = io(BASE, {
      path: '/s/',
      transports: ['websocket'],
      forceNew: true,
      auth: token ? { token } : {},
    });
    const t = setTimeout(() => reject(new Error(`${label} connect timeout`)), 10000);
    s.on('connect', () => {
      clearTimeout(t);
      resolve(s);
    });
    s.on('connect_error', reject);
  });
}

function emit(socket, event, ...args) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout ${event}`)), 15000);
    socket.emit(event, ...args, (res) => {
      clearTimeout(t);
      resolve(res);
    });
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function playersMap(state) {
  if (!state?.players) return new Map();
  return new Map(state.players);
}

function boardPlayersMap(state) {
  if (!state?.board?.players) return new Map();
  return new Map(state.board.players);
}

function getPlayerBoard(state, playerId) {
  return boardPlayersMap(state).get(playerId);
}

function cardCost(card) {
  return CARD_COST[card] ?? 99;
}

/** cheapest affordable unique cards first (no duplicate names in city) */
function affordableBuilds(pb) {
  if (!pb) return [];
  const city = new Set(pb.city || []);
  const stash = pb.stash ?? 0;
  const hand = (pb.hand || []).filter((c) => c != null);
  return [...hand]
    .filter((c) => !city.has(c) && cardCost(c) <= stash)
    .sort((a, b) => cardCost(a) - cardCost(b));
}

function citySizes(state) {
  const order = state?.board?.playerOrder || [];
  return order.map((id) => {
    const pb = getPlayerBoard(state, id);
    return `${pb?.city?.length ?? 0}c/${pb?.stash ?? 0}g/${(pb?.hand || []).filter((c) => c != null).length}h`;
  }).join(' ');
}

/** L0: try moves until one succeeds (or return false). */
async function tryMoves(socket, moves) {
  for (const move of moves) {
    const res = await emit(socket, 'make move', move);
    if (res && res.status === 'ok') return { ok: true, move };
  }
  return { ok: false };
}

async function playOneStep(socket, state, label) {
  if (!state?.board) return { ok: false, reason: 'no board' };
  const board = state.board;
  const phase = board.gamePhase;
  const turnState = board.turnState;
  const charState = board.characters?.state?.type;
  const currentPos = board.currentPlayer;
  const currentId = board.playerOrder?.[currentPos];
  if (!currentId) return { ok: false, reason: 'no current player' };

  // only the current seat acts
  if (currentId !== state.self) {
    return { ok: false, reason: 'not self turn', skip: true };
  }

  if (phase === GamePhase.CHOOSE_CHARACTERS) {
    if ([CCST.PUT_ASIDE_FACE_UP, CCST.PUT_ASIDE_FACE_DOWN].includes(charState)) {
      return tryMoves(socket, [{ type: MoveType.CHOOSE_CHARACTER, data: 0 }]);
    }
    if ([CCST.CHOOSE_CHARACTER, CCST.PUT_ASIDE_FACE_DOWN_UP].includes(charState)) {
      const moves = [];
      for (let i = 0; i < 8; i += 1) moves.push({ type: MoveType.CHOOSE_CHARACTER, data: i });
      return tryMoves(socket, moves);
    }
    return { ok: false, reason: `charState ${charState}`, skip: true };
  }

  if (phase === GamePhase.DO_ACTIONS) {
    const pb = getPlayerBoard(state, currentId);
    const buildsLeft = board.currentPlayerExtraData?.districtsToBuild ?? 0;
    const canBuild = buildsLeft > 0 && affordableBuilds(pb).length > 0;
    const hand = (pb?.hand || []).filter((c) => c != null);
    const stash = pb?.stash ?? 0;

    if (turnState === ClientTurnState.TAKE_RESOURCES) {
      const moves = [];
      // earnings only legal before resources
      if (board.currentPlayerExtraData?.canTakeEarnings) {
        moves.push({ type: MoveType.TAKE_GOLD_EARNINGS });
      }
      // build with existing gold before taking resources
      if (canBuild) {
        moves.push({ type: MoveType.BUILD_DISTRICT });
      }
      // need cards if empty; need gold if can almost afford something; else alternate
      const cheapest = hand.length
        ? Math.min(...hand.map(cardCost))
        : 99;
      if (hand.length === 0) {
        moves.push({ type: MoveType.DRAW_CARDS }, { type: MoveType.TAKE_GOLD });
      } else if (stash < cheapest) {
        moves.push({ type: MoveType.TAKE_GOLD }, { type: MoveType.DRAW_CARDS });
      } else {
        // have gold for something — still take resources then build after
        moves.push({ type: MoveType.TAKE_GOLD }, { type: MoveType.DRAW_CARDS });
      }
      return tryMoves(socket, moves);
    }
    if (turnState === ClientTurnState.CHOOSE_CARD) {
      const tmp = (pb?.tmpHand || []).filter((c) => c != null);
      // prefer cheapest card for faster city growth
      const sorted = [...tmp].sort((a, b) => cardCost(a) - cardCost(b));
      const moves = sorted.map((card) => ({ type: MoveType.DRAW_CARDS, data: card }));
      if (moves.length === 0) moves.push({ type: MoveType.DRAW_CARDS, data: 0 });
      return tryMoves(socket, moves);
    }
    if (turnState === ClientTurnState.CHOOSE_ACTION) {
      const moves = [];
      if (canBuild) {
        moves.push({ type: MoveType.BUILD_DISTRICT });
      }
      moves.push({ type: MoveType.FINISH_TURN });
      moves.push({ type: MoveType.DECLINE });
      return tryMoves(socket, moves);
    }
    if (turnState === ClientTurnState.ASSASSIN_KILL) {
      const moves = [];
      for (let cid = 2; cid <= 8; cid += 1) moves.push({ type: MoveType.ASSASSIN_KILL, data: cid });
      moves.push({ type: MoveType.DECLINE });
      return tryMoves(socket, moves);
    }
    if (turnState === ClientTurnState.THIEF_ROB) {
      const moves = [];
      for (let cid = 3; cid <= 8; cid += 1) moves.push({ type: MoveType.THIEF_ROB, data: cid });
      moves.push({ type: MoveType.DECLINE });
      return tryMoves(socket, moves);
    }
    if (turnState === ClientTurnState.MERCHANT_TAKE_1_GOLD) {
      return tryMoves(socket, [
        { type: MoveType.MERCHANT_TAKE_1_GOLD },
        { type: MoveType.DECLINE },
      ]);
    }
    if (turnState === ClientTurnState.ARCHITECT_DRAW_2_CARDS) {
      return tryMoves(socket, [
        { type: MoveType.ARCHITECT_DRAW_2_CARDS },
        { type: MoveType.DECLINE },
      ]);
    }
    if (turnState === ClientTurnState.BUILD_DISTRICT) {
      const cards = affordableBuilds(pb);
      const moves = cards.map((card) => ({ type: MoveType.BUILD_DISTRICT, data: card }));
      moves.push({ type: MoveType.DECLINE });
      return tryMoves(socket, moves);
    }
    if ([
      ClientTurnState.MAGICIAN_EXCHANGE_HAND,
      ClientTurnState.MAGICIAN_DISCARD_CARDS,
      ClientTurnState.WARLORD_DESTROY_DISTRICT,
      ClientTurnState.GRAVEYARD_RECOVER_DISTRICT,
      ClientTurnState.LABORATORY_DISCARD_CARD,
    ].includes(turnState)) {
      return tryMoves(socket, [{ type: MoveType.DECLINE }]);
    }
    return { ok: false, reason: `turnState ${turnState}` };
  }

  return { ok: false, reason: `phase ${phase}`, skip: true };
}

function assert(cond, msg) {
  if (!cond) throw new Error(`ASSERT: ${msg}`);
}

async function main() {
  console.log(`[sim-6p] server ${BASE} maxSteps=${MAX_STEPS} watch=${WATCH} delay=${STEP_DELAY}ms`);
  const stamp = Date.now().toString(36);
  const users = [];
  for (let i = 0; i < 6; i += 1) {
    const username = `bot${i}_${stamp}`;
    const reg = await post('/api/auth/register', {
      username,
      password: 'secret12',
      displayName: `Bot${i}`,
    });
    assert(reg.body.status === 'ok' && reg.body.token, `register ${username}`);
    users.push({ username, token: reg.body.token, displayName: `Bot${i}` });
  }

  const sockets = [];
  const states = [];
  for (let i = 0; i < 6; i += 1) {
    const s = await connect(users[i].token, users[i].username);
    states[i] = null;
    s.on('update game state', (data) => {
      states[i] = data;
    });
    sockets.push(s);
  }

  const created = await emit(sockets[0], 'create room');
  assert(created.status === 'ok' && created.roomId, 'create room');
  const roomId = created.roomId;
  const watchUrl = `${WEB}/room/${roomId}`;
  console.log('[sim-6p] room', roomId);
  console.log('[sim-6p] ========================================');
  console.log('[sim-6p] SPECTATE (open while this script is running):');
  console.log(`[sim-6p]   ${watchUrl}`);
  console.log('[sim-6p]   → click 观战 / Spectate (login optional for spectate)');
  if (WATCH) {
    console.log(`[sim-6p] --watch: waiting 12s so you can open the page...`);
  }
  console.log('[sim-6p] ========================================');

  const playerIds = [];
  for (let i = 0; i < 6; i += 1) {
    const j = await emit(sockets[i], 'join room', roomId, '', '', false);
    assert(j.status === 'ok' && j.gameState, `join ${i}`);
    states[i] = j.gameState;
    playerIds.push(j.gameState.self);
  }
  console.log('[sim-6p] players', playerIds);

  if (WATCH) {
    await sleep(12000);
  }

  const start = await emit(sockets[0], 'start game', {
    players: playerIds,
    completeCitySize: 7, // server forces 8 for 6p
  });
  assert(start.status === 'ok', `start game: ${JSON.stringify(start)}`);
  console.log('[sim-6p] game started — if page still on lobby, refresh or re-open room URL and Spectate');

  // wait for IN_GAME
  const readyDeadline = Date.now() + 20000;
  while (Date.now() < readyDeadline) {
    if (states[0]?.progress === GameProgress.IN_GAME && states[0]?.board) break;
    await sleep(200);
  }
  assert(states[0]?.progress === GameProgress.IN_GAME, 'enter IN_GAME');
  assert(states[0]?.gameMode === GameMode.COMPETITIVE_TEAM6, 'gameMode competitive_team6');
  assert(states[0]?.settings?.completeCitySize === 8, 'completeCitySize 8');

  // team assignment: seats 0,2,4 = A ; 1,3,5 = B
  const order = states[0].board.playerOrder;
  assert(order.length === 6, 'playerOrder length 6');
  const pm = playersMap(states[0]);
  for (let seat = 0; seat < 6; seat += 1) {
    const pid = order[seat];
    const p = pm.get(pid);
    const expected = seat % 2 === 0 ? TeamId.A : TeamId.B;
    assert(p && p.team === expected, `seat ${seat} team expected ${expected} got ${p?.team}`);
  }
  console.log('[sim-6p] team assignment OK (A=0,2,4 B=1,3,5)');
  console.log(`[sim-6p] still spectating? ${watchUrl}`);

  let steps = 0;
  let movesOk = 0;
  let lastProgressLog = 0;
  while (steps < MAX_STEPS) {
    steps += 1;
    const s0 = states[0];
    if (s0?.progress === GameProgress.FINISHED) {
      console.log('[sim-6p] FINISHED at step', steps);
      break;
    }
    // find whose turn from any fresh state
    let acted = false;
    for (let i = 0; i < 6; i += 1) {
      const st = states[i];
      if (!st?.board || st.progress !== GameProgress.IN_GAME) continue;
      const cur = st.board.playerOrder?.[st.board.currentPlayer];
      if (cur !== st.self) continue;
      const result = await playOneStep(sockets[i], st, users[i].username);
      if (result.ok) {
        movesOk += 1;
        acted = true;
        if (movesOk - lastProgressLog >= (WATCH ? 5 : 40)) {
          lastProgressLog = movesOk;
          console.log(`[sim-6p] movesOk=${movesOk} phase=${st.board.gamePhase} turn=${st.board.turnState} cities=[${citySizes(st)}]`);
        }
        break;
      }
    }
    if (!acted) {
      // waiting for auto timers (INITIAL / character delays)
      await sleep(IDLE_DELAY);
    } else {
      await sleep(STEP_DELAY);
    }
  }

  const final = states[0];
  assert(final, 'final state');
  console.log('[sim-6p] final progress', final.progress, 'movesOk', movesOk, 'steps', steps);
  console.log('[sim-6p] cities', citySizes(final));
  console.log('[sim-6p] teamScores', final.teamScores, 'matchResult', final.matchResult);

  // Always assert mode/teams even if not finished
  assert(final.gameMode === GameMode.COMPETITIVE_TEAM6, 'final gameMode');

  // city growth report
  let maxCity = 0;
  if (final.board?.players) {
    for (const [, pb] of final.board.players) {
      maxCity = Math.max(maxCity, pb.city?.length ?? 0);
    }
  }
  console.log('[sim-6p] maxCity', maxCity);

  if (final.progress === GameProgress.FINISHED) {
    assert(final.teamScores && typeof final.teamScores.A === 'number', 'teamScores.A');
    assert(final.teamScores && typeof final.teamScores.B === 'number', 'teamScores.B');
    assert([
      MatchResult.TEAM_A_WIN,
      MatchResult.TEAM_B_WIN,
      MatchResult.DRAW,
    ].includes(final.matchResult), `matchResult ${final.matchResult}`);
    // consistency: compare totals
    if (final.teamScores.A > final.teamScores.B) {
      assert(final.matchResult === MatchResult.TEAM_A_WIN, 'A should win');
    } else if (final.teamScores.B > final.teamScores.A) {
      assert(final.matchResult === MatchResult.TEAM_B_WIN, 'B should win');
    } else {
      assert(final.matchResult === MatchResult.DRAW, 'should draw');
    }
    assert(maxCity >= 8, `expected someone to complete city (>=8), maxCity=${maxCity}`);
    // complete-city bonus +4 first / +2 later
    for (const [, pb] of final.board.players) {
      if (pb.city && pb.city.length >= 8 && pb.score?.extraPointsCompleteCity != null) {
        const bonus = pb.score.extraPointsCompleteCity;
        assert(bonus === 4 || bonus === 2, `complete city bonus must be 4 or 2, got ${bonus}`);
        console.log('[sim-6p] complete-city bonus', bonus, 'OK');
      }
    }
    console.log('[sim-6p] FINISHED assertions OK');
  } else {
    console.log('[sim-6p] WARN: did not finish within max steps (mode/team still OK)');
    assert(maxCity >= 1, `expected AI to build at least 1 district, maxCity=${maxCity}`);
  }

  sockets.forEach((s) => s.close());
  // allow server to process disconnects and drop empty room
  await sleep(300);
  try {
    const list = await new Promise((resolve, reject) => {
      http.get(`${BASE}/api/rooms`, (res) => {
        let b = '';
        res.on('data', (c) => { b += c; });
        res.on('end', () => {
          try { resolve(JSON.parse(b || '{}')); } catch (e) { reject(e); }
        });
      }).on('error', reject);
    });
    const leftover = (list.rooms || []).filter((r) => r.roomId === roomId);
    if (leftover.length === 0) {
      console.log('[sim-6p] room cleaned from lobby OK');
    } else {
      console.log('[sim-6p] WARN: room still listed', leftover[0].phase);
    }
  } catch (e) {
    console.log('[sim-6p] room list check skipped', e.message);
  }
  console.log('[sim-6p] PASSED');
  process.exit(0);
}

main().catch((err) => {
  console.error('[sim-6p] FAILED', err);
  process.exit(1);
});
