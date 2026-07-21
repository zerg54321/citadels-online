/**
 * L2 Autoplay Policy — Gold Equivalent (GE) + Tempo evaluation.
 *
 * Resource model:
 *   1 gold = 1 GE
 *   1 hand card ≈ 2 GE (draw opportunity cost)
 *
 * Used by timeout autoplay and AI seats. Team-aware for 3v3 (TeamId A/B).
 */
import {
  CharacterChoosingStateType as CCST,
  ClientTurnState,
  DistrictId,
  GamePhase,
  Move,
  MoveType,
  TeamId,
  districts,
} from 'citadels-common';
import GameState from './GameState';
import { CharacterPosition, CharacterType } from './CharacterManager';
import DistrictCard, { ALL_DISTRICTS, DistrictType } from './DistrictCard';

// ---------------------------------------------------------------------------
// Card / GE helpers
// ---------------------------------------------------------------------------

const CARD_COST: Record<string, number> = Object.fromEntries(
  Object.entries(districts).map(([id, d]) => [id, (d as { cost?: number }).cost ?? 99]),
);

const CARD_TYPE: Record<string, number> = Object.fromEntries(
  Object.entries(districts).map(([id, d]) => [id, (d as { type?: number }).type ?? 0]),
);

const CARD_EXTRA: Record<string, number> = Object.fromEntries(
  Object.entries(districts).map(([id, d]) => {
    const extra = (d as { extra_points?: number }).extra_points ?? 0;
    return [id, extra];
  }),
);

const GE_GOLD = 1;
const GE_CARD = 2;
const COMPLETE_DEFAULT = 8;

function tryMoves(gameState: GameState, moves: Move[]): Move | null {
  for (const move of moves) {
    if (gameState.step(move)) {
      gameState.step({ type: MoveType.AUTO });
      return move;
    }
  }
  return null;
}

function costOf(id: string): number {
  return CARD_COST[id] ?? 99;
}

function typeOf(id: string): number {
  return CARD_TYPE[id] ?? 0;
}

function isUnique(id: string): boolean {
  return typeOf(id) === DistrictType.UNIQUE;
}

function goldEquivalent(stash: number, handCount: number): number {
  return stash * GE_GOLD + handCount * GE_CARD;
}

// ---------------------------------------------------------------------------
// Board view helpers
// ---------------------------------------------------------------------------

function teamOf(gs: GameState, playerId: string): TeamId {
  return gs.players.get(playerId)?.team ?? TeamId.NONE;
}

function isEnemy(gs: GameState, actorId: string, otherId: string): boolean {
  if (actorId === otherId) return false;
  const a = teamOf(gs, actorId);
  const b = teamOf(gs, otherId);
  if (a === TeamId.NONE || b === TeamId.NONE) return true;
  return a !== b;
}

function isAlly(gs: GameState, actorId: string, otherId: string): boolean {
  if (actorId === otherId) return true;
  const a = teamOf(gs, actorId);
  const b = teamOf(gs, otherId);
  if (a === TeamId.NONE || b === TeamId.NONE) return false;
  return a === b;
}

function cityOf(gs: GameState, playerId: string): DistrictId[] {
  return gs.board?.players.get(playerId)?.city ?? [];
}

function citySize(gs: GameState, playerId: string): number {
  return cityOf(gs, playerId).length;
}

function stashOf(gs: GameState, playerId: string): number {
  return gs.board?.players.get(playerId)?.stash ?? 0;
}

function handOf(gs: GameState, playerId: string): DistrictId[] {
  return (gs.board?.players.get(playerId)?.hand || []).filter((c): c is DistrictId => c != null);
}

function handCount(gs: GameState, playerId: string): number {
  return handOf(gs, playerId).length;
}

function completeSize(gs: GameState): number {
  return gs.completeCitySize || COMPLETE_DEFAULT;
}

/** crown holder = playerOrder[0] */
function crownPlayerId(gs: GameState): string | null {
  return gs.board?.playerOrder[0] ?? null;
}

function ownerSeatOfCharacter(gs: GameState, character: CharacterType): number {
  if (!gs.board || character < 0) return -1;
  const pos = gs.board.characterManager.characters[character];
  if (pos < CharacterPosition.PLAYER_1) return -1;
  return pos - CharacterPosition.PLAYER_1;
}

function ownerIdOfCharacter(gs: GameState, character: CharacterType): string | null {
  const seat = ownerSeatOfCharacter(gs, character);
  if (seat < 0 || !gs.board) return null;
  return gs.board.playerOrder[seat] ?? null;
}

/**
 * 角色是否已对全场"公开"——即人类玩家也能看到归属的状态。
 * 包括：当前正在行动的字符、已被刺杀/被偷、或面亮出放置的旁观牌。
 * 选角阶段其他玩家暗选的字符在此为 false，AI 不得据此获知归属（与人类一致）。
 */
function isRolePubliclyKnown(gs: GameState, character: CharacterType): boolean {
  const cm = gs.board?.characterManager;
  if (!cm) return false;
  if (cm.killedCharacter === character) return true;
  if (cm.robbedCharacter === character) return true;
  if (cm.getCurrentCharacter() === character) return true;
  const faceUpAside = cm.getCharactersAtPosition(CharacterPosition.ASIDE_FACE_UP) || [];
  if (faceUpAside.includes(character)) return true;
  return false;
}

/** 仅当角色已公开时才返回真实归属；否则返回 null，迫使 AI 走预测。 */
function knownOwnerIfPublic(gs: GameState, character: CharacterType): string | null {
  if (!isRolePubliclyKnown(gs, character)) return null;
  return ownerIdOfCharacter(gs, character);
}

function countColorIn(list: string[], districtType: DistrictType | undefined): number {
  if (districtType === undefined) return 0;
  return list.filter((id) => typeOf(id) === districtType).length;
}

function cityColors(city: string[]): Set<number> {
  return new Set(city.map((id) => typeOf(id)).filter((t) => t >= 1 && t <= 5));
}

// ---------------------------------------------------------------------------
// Tempo / endgame detection
// ---------------------------------------------------------------------------

type TempoMode = 'develop' | 'sprint' | 'deny';

function maxEnemyCity(gs: GameState, actorId: string): number {
  let m = 0;
  gs.board?.playerOrder.forEach((pid) => {
    if (isEnemy(gs, actorId, pid)) m = Math.max(m, citySize(gs, pid));
  });
  return m;
}

function maxAllyCity(gs: GameState, actorId: string): number {
  let m = citySize(gs, actorId);
  gs.board?.playerOrder.forEach((pid) => {
    if (isAlly(gs, actorId, pid)) m = Math.max(m, citySize(gs, pid));
  });
  return m;
}

function detectTempo(gs: GameState, actorId: string): TempoMode {
  const limit = completeSize(gs);
  const enemyMax = maxEnemyCity(gs, actorId);
  const selfCity = citySize(gs, actorId);
  const allyMax = maxAllyCity(gs, actorId);

  // enemy near complete → deny (warlord) or sprint ourselves
  if (enemyMax >= limit - 1) return 'deny';
  if (enemyMax >= limit - 2 || selfCity >= limit - 2 || allyMax >= limit - 2) {
    return 'sprint';
  }
  return 'develop';
}

// ---------------------------------------------------------------------------
// A. Character drafting evaluation
// ---------------------------------------------------------------------------

function taxRoleScore(
  city: string[],
  hand: string[],
  character: CharacterType,
): number {
  const dt = DistrictCard.getDistrictTypeFromCharacter(character);
  const onBoard = countColorIn(city, dt);
  const inHand = countColorIn(hand, dt);
  // Score = city*1.0 + hand*0.6  (unbuilt tax potential)
  return onBoard * 1.0 + inHand * 0.6;
}

function scoreCharacterPick(
  gs: GameState,
  actorId: string,
  character: CharacterType,
  remaining: CharacterType[],
): number {
  const city = cityOf(gs, actorId);
  const hand = handOf(gs, actorId);
  const stash = stashOf(gs, actorId);
  const hc = hand.length;
  const limit = completeSize(gs);
  const tempo = detectTempo(gs, actorId);
  const selfCity = city.length;
  const enemyMax = maxEnemyCity(gs, actorId);
  const crownId = crownPlayerId(gs);
  const allyHasCrown = crownId != null && crownId !== actorId && isAlly(gs, actorId, crownId);

  let score = 0;

  switch (character) {
    case CharacterType.ASSASSIN: {
      score = 4;
      if (tempo === 'deny' || tempo === 'sprint') score += 6;
      if (enemyMax >= limit - 2) score += 5;
      // defensive: protect ally near win
      if (maxAllyCity(gs, actorId) >= limit - 2) score += 4;
      break;
    }
    case CharacterType.THIEF: {
      score = 3;
      // value high when enemies sit on gold
      let maxEnemyGold = 0;
      gs.board?.playerOrder.forEach((pid) => {
        if (isEnemy(gs, actorId, pid)) maxEnemyGold = Math.max(maxEnemyGold, stashOf(gs, pid));
      });
      score += Math.min(8, maxEnemyGold * 0.8);
      break;
    }
    case CharacterType.MAGICIAN: {
      score = 3;
      // empty / thin hand → magician high
      if (hc === 0) score += 8;
      else if (hc === 1) score += 5;
      // enemy with fat hand
      let maxEnemyHand = 0;
      gs.board?.playerOrder.forEach((pid) => {
        if (isEnemy(gs, actorId, pid)) maxEnemyHand = Math.max(maxEnemyHand, handCount(gs, pid));
      });
      if (maxEnemyHand > hc + 1) score += (maxEnemyHand - hc) * 1.5;
      break;
    }
    case CharacterType.KING: {
      score = 3 + taxRoleScore(city, hand, CharacterType.KING) * 2;
      // crown pass value
      score += 2;
      // 3v3: if ally already has crown, deprioritize king (leave for explosion roles)
      if (allyHasCrown) score -= 6;
      break;
    }
    case CharacterType.BISHOP: {
      score = 3 + taxRoleScore(city, hand, CharacterType.BISHOP) * 2;
      // protection vs warlord when near complete
      if (selfCity >= limit - 3) score += 4;
      if (tempo === 'sprint' || tempo === 'deny') score += 2;
      break;
    }
    case CharacterType.MERCHANT: {
      score = 4 + taxRoleScore(city, hand, CharacterType.MERCHANT) * 2;
      // merchant passive +1 gold already free; economy engine
      if (stash < 4) score += 2;
      if (tempo === 'sprint') score += 3;
      break;
    }
    case CharacterType.ARCHITECT: {
      score = 3;
      // dynamic: hand>=2 and gold>=4, or endgame sprint
      if (hc >= 2 && stash >= 4) score += 10;
      else if (hc >= 1 && stash >= 6) score += 7;
      else if (stash >= 8) score += 6;
      else score += Math.min(4, stash * 0.4 + hc * 0.5);
      if (tempo === 'sprint' && selfCity >= limit - 3) score += 8;
      if (selfCity >= limit - 2) score += 6;
      break;
    }
    case CharacterType.WARLORD: {
      score = 3 + taxRoleScore(city, hand, CharacterType.WARLORD) * 2;
      // destroy value when enemies near complete
      if (enemyMax >= limit - 2) score += 10;
      if (enemyMax >= limit - 1) score += 6;
      if (tempo === 'deny') score += 5;
      // can afford a destroy
      if (stash >= 2) score += 1;
      break;
    }
    default:
      score = 1;
  }

  // slight noise so AI doesn't always pick same role when tied
  score += Math.random() * 0.3;

  // only score if actually available
  if (!remaining.includes(character)) score = -999;
  return score;
}

function pickBestCharacterIndex(gs: GameState, actorId: string): number {
  if (!gs.board) return 0;
  const remaining = gs.board.characterManager.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
  if (!remaining.length) return 0;

  // 首发：如果有刺客，必拿刺客
  const assassinIdx = remaining.indexOf(CharacterType.ASSASSIN);
  if (assassinIdx >= 0) return assassinIdx;

  let bestIdx = 0;
  let bestScore = -1e9;
  remaining.forEach((ch, idx) => {
    const s = scoreCharacterPick(gs, actorId, ch, remaining);
    if (s > bestScore) {
      bestScore = s;
      bestIdx = idx;
    }
  });
  return bestIdx;
}

// ---------------------------------------------------------------------------
// B. Build evaluation
// ---------------------------------------------------------------------------

function missingColors(city: string[]): Set<number> {
  const have = cityColors(city);
  const miss = new Set<number>();
  for (let t = 1; t <= 5; t += 1) {
    if (!have.has(t)) miss.add(t);
  }
  return miss;
}

function buildScore(
  gs: GameState,
  actorId: string,
  card: DistrictId,
  tempo: TempoMode,
): number {
  const city = cityOf(gs, actorId);
  if (city.includes(card)) return -1000;
  const c = costOf(card);
  const extra = CARD_EXTRA[card] ?? 0;
  const t = typeOf(card);
  const miss = missingColors(city);
  const limit = completeSize(gs);
  const n = city.length;

  let score = 0;

  if (tempo === 'sprint' || tempo === 'deny') {
    // cheapest path to 8: invert cost (cheaper better), slight unique penalty if expensive
    score = 20 - c * 3;
    // still value completing 5 colors if one cheap piece fills it
    if (miss.has(t)) score += 4;
    // if this build reaches complete city size, huge
    if (n + 1 >= limit) score += 50;
    return score;
  }

  // develop: prefer big pieces / unique / color fill
  score = c * 2 + extra * 3;
  if (c >= 4) score += 4;
  if (isUnique(card)) score += 5;
  if (miss.has(t)) score += 6; // five-color bonus path
  // school_of_magic / keep / great_wall situational
  if (card === 'keep') score += 3;
  if (card === 'great_wall') score += 2;
  if (card === 'school_of_magic') score += 4;
  if (card === 'laboratory' || card === 'smithy') score += 2;
  // don't overbuild cheap trash when rich
  if (c <= 1 && stashOf(gs, actorId) >= 5 && n < limit - 3) score -= 3;
  return score;
}

function sortBuildCandidates(
  gs: GameState,
  actorId: string,
  affordable: DistrictId[],
  tempo: TempoMode,
): DistrictId[] {
  return [...affordable].sort(
    (a, b) => buildScore(gs, actorId, b, tempo) - buildScore(gs, actorId, a, tempo),
  );
}

// ---------------------------------------------------------------------------
// C. Predictive assassin / thief / magician / warlord
// ---------------------------------------------------------------------------

function predictLikelyRoles(gs: GameState, targetId: string): CharacterType[] {
  const stash = stashOf(gs, targetId);
  const hc = handCount(gs, targetId);
  const city = cityOf(gs, targetId);
  const likely: { ch: CharacterType; w: number }[] = [];

  // tax roles from city colors
  ([
    CharacterType.KING,
    CharacterType.BISHOP,
    CharacterType.MERCHANT,
    CharacterType.WARLORD,
  ] as CharacterType[]).forEach((ch) => {
    const w = taxRoleScore(city, [], ch);
    if (w > 0) likely.push({ ch, w: w + 1 });
  });

  if (hc >= 2 && stash >= 4) likely.push({ ch: CharacterType.ARCHITECT, w: 6 });
  if (stash >= 6) likely.push({ ch: CharacterType.ARCHITECT, w: 4 });
  if (hc === 0 || hc === 1) likely.push({ ch: CharacterType.MAGICIAN, w: 5 });
  if (stash >= 3) likely.push({ ch: CharacterType.MERCHANT, w: 3 });
  if (city.length >= completeSize(gs) - 2) {
    likely.push({ ch: CharacterType.ARCHITECT, w: 7 });
    likely.push({ ch: CharacterType.WARLORD, w: 5 });
    likely.push({ ch: CharacterType.BISHOP, w: 4 });
  }
  // rich player → thief target as merchant/warlord
  if (stash >= 5) {
    likely.push({ ch: CharacterType.MERCHANT, w: 4 });
    likely.push({ ch: CharacterType.WARLORD, w: 3 });
  }

  likely.sort((a, b) => b.w - a.w);
  const out: CharacterType[] = [];
  likely.forEach(({ ch }) => {
    if (!out.includes(ch)) out.push(ch);
  });
  return out;
}

function assassinTargets(gs: GameState, actorId: string): number[] {
  if (!gs.board) return [];
  const cm = gs.board.characterManager;
  const tempo = detectTempo(gs, actorId);
  const limit = completeSize(gs);
  const allyNearWin = maxAllyCity(gs, actorId) >= limit - 2;
  const enemyNearWin = maxEnemyCity(gs, actorId) >= limit - 2;

  const scored: { clientId: number; score: number }[] = [];

  for (let ch = CharacterType.THIEF; ch <= CharacterType.WARLORD; ch += 1) {
    if (ch === cm.killedCharacter) continue;
    const ownerId = knownOwnerIfPublic(gs, ch);
    let score = 0;

    if (ownerId && isAlly(gs, actorId, ownerId)) {
      score = -200; // never kill ally role if known
    } else if (ownerId && isEnemy(gs, actorId, ownerId)) {
      score = citySize(gs, ownerId) * 4 + stashOf(gs, ownerId) + handCount(gs, ownerId);
      if (ch === CharacterType.WARLORD) score += 8;
      if (ch === CharacterType.ARCHITECT) score += 7;
      if (ch === CharacterType.MERCHANT) score += 4;
      if (ch === CharacterType.MAGICIAN) score += 3;
      if (citySize(gs, ownerId) >= limit - 2) score += 12;
    } else {
      // hidden: predictive scan over enemies
      let pred = 1;
      gs.board.playerOrder.forEach((pid) => {
        if (!isEnemy(gs, actorId, pid)) return;
        const roles = predictLikelyRoles(gs, pid);
        const idx = roles.indexOf(ch);
        if (idx >= 0) {
          const threat = citySize(gs, pid) * 2 + stashOf(gs, pid) * 0.5;
          pred = Math.max(pred, (8 - idx) + threat);
        }
      });
      score = pred;
      // role base weights when unknown
      if (ch === CharacterType.WARLORD) score += enemyNearWin ? 10 : 4;
      if (ch === CharacterType.ARCHITECT) score += enemyNearWin ? 9 : 3;
      if (ch === CharacterType.MERCHANT) score += 3;
      if (ch === CharacterType.ASSASSIN) score += 0; // cannot kill assassin (loop starts thief)
      if (ch === CharacterType.THIEF) score += 2;
      if (ch === CharacterType.MAGICIAN) score += enemyNearWin ? 5 : 2;
    }

    // protect ally near win: prioritize killing enemy warlord / assassin-path roles
    if (allyNearWin) {
      if (ch === CharacterType.WARLORD) score += 12;
      if (ch === CharacterType.THIEF) score += 3;
    }
    if (tempo === 'deny' && ch === CharacterType.ARCHITECT) score += 6;
    if (tempo === 'deny' && ch === CharacterType.MERCHANT) score += 4;

    scored.push({ clientId: ch + 1, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > -100).map((s) => s.clientId);
}

function thiefTargets(gs: GameState, actorId: string): number[] {
  if (!gs.board) return [];
  const cm = gs.board.characterManager;
  const scored: { clientId: number; score: number }[] = [];

  // find richest enemies and their predicted roles
  const enemies = (gs.board.playerOrder || []).filter((pid) => isEnemy(gs, actorId, pid));
  enemies.sort((a, b) => stashOf(gs, b) - stashOf(gs, a));

  for (let ch = CharacterType.MAGICIAN; ch <= CharacterType.WARLORD; ch += 1) {
    if (ch === cm.killedCharacter || ch === cm.robbedCharacter) continue;
    const ownerId = knownOwnerIfPublic(gs, ch);
    let score = 0;

    if (ownerId && isAlly(gs, actorId, ownerId)) {
      score = -200;
    } else if (ownerId && isEnemy(gs, actorId, ownerId)) {
      score = stashOf(gs, ownerId) * 5 + citySize(gs, ownerId);
      if (ch === CharacterType.MERCHANT) score += 4;
    } else {
      // predictive: weight by how often rich enemies likely pick this role
      enemies.forEach((pid, rank) => {
        const roles = predictLikelyRoles(gs, pid);
        const idx = roles.indexOf(ch);
        if (idx >= 0) {
          score += stashOf(gs, pid) * (1.2 - rank * 0.15) * (1 - idx * 0.1);
        }
      });
      if (ch === CharacterType.MERCHANT) score += 2;
      if (ch === CharacterType.ARCHITECT) score += 2;
      if (ch === CharacterType.WARLORD) score += 1.5;
    }
    scored.push({ clientId: ch + 1, score });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.filter((s) => s.score > -100).map((s) => s.clientId);
}

function magicianExchangeTargets(gs: GameState, actorId: string): number[] {
  if (!gs.board) return [];
  const myHand = handCount(gs, actorId);
  const myGe = goldEquivalent(stashOf(gs, actorId), myHand);
  const scored: { seat: number; score: number }[] = [];

  gs.board.playerOrder.forEach((pid, seat) => {
    if (!isEnemy(gs, actorId, pid)) return;
    const their = handCount(gs, pid);
    const deltaCards = their - myHand;
    if (deltaCards <= 0) return;
    // GE gain ≈ deltaCards * 2
    const geGain = deltaCards * GE_CARD;
    scored.push({ seat, score: geGain * 10 + their - myGe * 0.01 });
  });
  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.seat);
}

type DestroyCandidate = { seat: number; card: DistrictId; score: number };

function warlordDestroyCandidates(gs: GameState, actorId: string): DestroyCandidate[] {
  const { board } = gs;
  if (!board) return [];
  const cm = board.characterManager;
  const me = board.players.get(actorId);
  if (!me) return [];
  const spendable = me.stash - cm.goldFromResourcesThisTurn;
  const limit = completeSize(gs);
  const tempo = detectTempo(gs, actorId);
  const out: DestroyCandidate[] = [];

  board.playerOrder.forEach((pid, seat) => {
    if (!isEnemy(gs, actorId, pid)) return;
    const other = board.players.get(pid);
    if (!other || other.city.length === 0) return;
    if (other.city.length >= limit) return;

    const isBishop = cm.characters[CharacterType.BISHOP] === seat + CharacterPosition.PLAYER_1;
    if (isBishop && cm.killedCharacter !== CharacterType.BISHOP) return;

    other.city.forEach((card) => {
      if (card === 'keep') return;
      const cost = other.computeDestroyCost(card);
      if (cost > spendable) return;
      const value = costOf(card) + (CARD_EXTRA[card] ?? 0);
      let score = value * 2 + other.city.length * 3 - cost;
      // critical: demolish when they are at limit-1 (block complete)
      if (other.city.length >= limit - 1) score += 25;
      if (other.city.length >= limit - 2) score += 10;
      if (tempo === 'deny') score += 8;
      // unique high value
      if (isUnique(card)) score += 3;
      out.push({ seat, card, score });
    });
  });

  out.sort((a, b) => b.score - a.score);
  return out;
}

// ---------------------------------------------------------------------------
// Resource action: take gold vs draw (GE)
// ---------------------------------------------------------------------------

function preferDrawOverGold(gs: GameState, actorId: string): boolean {
  const hc = handCount(gs, actorId);
  const stash = stashOf(gs, actorId);
  const city = cityOf(gs, actorId);
  const hand = handOf(gs, actorId);

  // 有可建造的牌（手牌不重复且付得起）时，优先拿金币盖房
  const buildable = hand.filter((c) => costOf(c) <= stash && !city.includes(c));
  if (buildable.length > 0) return false;

  // 手里有牌但暂时建不起时，仍优先拿金币（降低抽牌优先级）
  if (hc > 0 && stash >= 2) return false;

  // 手牌极少时才抽牌补充
  if (hc < 2) return true;

  // 冲刺模式且没牌才抽
  if (detectTempo(gs, actorId) === 'sprint' && hc === 0) return true;

  return false;
}

// ---------------------------------------------------------------------------
// Main entry
// ---------------------------------------------------------------------------

export function pickAndApplyAutoplayMove(gameState: GameState): Move | null {
  if (!gameState.board) return null;
  const { board } = gameState;
  const cm = board.characterManager;
  const actorId = board.getCurrentPlayerId();
  if (!actorId) return null;
  const player = board.players.get(actorId);
  if (!player) return null;

  // ----- character selection -----
  if (board.gamePhase === GamePhase.CHOOSE_CHARACTERS) {
    const t = cm.choosingState.getState().type;
    if (t === CCST.PUT_ASIDE_FACE_UP || t === CCST.PUT_ASIDE_FACE_DOWN) {
      // aside: dump lowest-value for us among remaining (try all indices)
      const remaining = cm.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
      const scored = remaining.map((ch, idx) => ({
        idx,
        // aside face-up: prefer dumping roles we score low / enemies score high — simple: random low self score
        score: scoreCharacterPick(gameState, actorId, ch, remaining),
      }));
      scored.sort((a, b) => a.score - b.score); // discard least useful to us
      const moves = scored.map((s) => ({ type: MoveType.CHOOSE_CHARACTER, data: s.idx } as Move));
      if (!moves.length) moves.push({ type: MoveType.CHOOSE_CHARACTER, data: 0 });
      return tryMoves(gameState, moves);
    }
    if (t === CCST.CHOOSE_CHARACTER || t === CCST.PUT_ASIDE_FACE_DOWN_UP) {
      if (t === CCST.PUT_ASIDE_FACE_DOWN_UP) {
        // put aside then choose — still use index tries; prefer discard low score first via try order
        const remaining = cm.getCharactersAtPosition(CharacterPosition.NOT_CHOSEN);
        const order = remaining
          .map((ch, idx) => ({ idx, score: scoreCharacterPick(gameState, actorId, ch, remaining) }))
          .sort((a, b) => a.score - b.score);
        const moves = order.map((o) => ({ type: MoveType.CHOOSE_CHARACTER, data: o.idx } as Move));
        return tryMoves(gameState, moves.length ? moves : [{ type: MoveType.CHOOSE_CHARACTER, data: 0 }]);
      }
      const best = pickBestCharacterIndex(gameState, actorId);
      const moves: Move[] = [{ type: MoveType.CHOOSE_CHARACTER, data: best }];
      // fallbacks
      for (let i = 0; i < 8; i += 1) {
        if (i !== best) moves.push({ type: MoveType.CHOOSE_CHARACTER, data: i });
      }
      return tryMoves(gameState, moves);
    }
    return null;
  }

  if (board.gamePhase !== GamePhase.DO_ACTIONS) return null;

  const turn = cm.getClientTurnState();
  const hand = handOf(gameState, actorId);
  const tempo = detectTempo(gameState, actorId);
  const character = cm.getCurrentCharacter();
  const canSpecial = cm.canDoSpecialAction[character] === true;
  const affordable = hand
    .filter((c) => costOf(c) <= player.stash && !player.city.includes(c));
  const buildOrder = sortBuildCandidates(gameState, actorId, affordable, tempo);

  switch (turn) {
    case ClientTurnState.TAKE_RESOURCES: {
      const moves: Move[] = [];
      if (cm.canTakeEarnings[character]) {
        moves.push({ type: MoveType.TAKE_GOLD_EARNINGS });
      }
      // warlord deny: bank gold if destroy available soon but short
      if (character === CharacterType.WARLORD && tempo !== 'develop') {
        const destroys = warlordDestroyCandidates(gameState, actorId);
        if (!destroys.length && player.stash < 5) {
          moves.push({ type: MoveType.TAKE_GOLD }, { type: MoveType.DRAW_CARDS });
        }
      }
      if (cm.districtsToBuild[character] > 0 && buildOrder.length) {
        moves.push({ type: MoveType.BUILD_DISTRICT });
      }
      if (preferDrawOverGold(gameState, actorId)) {
        moves.push({ type: MoveType.DRAW_CARDS }, { type: MoveType.TAKE_GOLD });
      } else {
        moves.push({ type: MoveType.TAKE_GOLD }, { type: MoveType.DRAW_CARDS });
      }
      return tryMoves(gameState, moves);
    }

    case ClientTurnState.CHOOSE_CARD: {
      // pick card maximizing buildScore if we can afford later, else cheapest color fill
      const tmp = [...player.tmpHand];
      const scored = tmp.map((card) => ({
        card,
        score: buildScore(gameState, actorId, card, tempo) - costOf(card) * 0.1,
      }));
      scored.sort((a, b) => b.score - a.score);
      const moves = scored.map((s) => ({ type: MoveType.DRAW_CARDS, data: s.card } as Move));
      if (!moves.length) moves.push({ type: MoveType.DRAW_CARDS, data: null });
      return tryMoves(gameState, moves);
    }

    case ClientTurnState.CHOOSE_ACTION: {
      const moves: Move[] = [];
      // only open special modes when we already know a concrete legal target exists
      if (canSpecial && character === CharacterType.ASSASSIN) {
        const t = assassinTargets(gameState, actorId);
        if (t.length) moves.push({ type: MoveType.ASSASSIN_KILL });
      }
      if (canSpecial && character === CharacterType.THIEF) {
        const t = thiefTargets(gameState, actorId);
        if (t.length) moves.push({ type: MoveType.THIEF_ROB });
      }
      if (canSpecial && character === CharacterType.MAGICIAN) {
        const seats = magicianExchangeTargets(gameState, actorId);
        if (seats.length) moves.push({ type: MoveType.MAGICIAN_EXCHANGE_HAND });
        else if (hand.length <= 1) moves.push({ type: MoveType.MAGICIAN_DISCARD_CARDS });
      }
      if (canSpecial && character === CharacterType.WARLORD) {
        const destroys = warlordDestroyCandidates(gameState, actorId);
        if (destroys.length) {
          if (tempo === 'deny' || tempo === 'sprint' || destroys[0].score >= 12) {
            moves.push({ type: MoveType.WARLORD_DESTROY_DISTRICT });
          }
        }
      }

      if (cm.districtsToBuild[character] > 0 && buildOrder.length) {
        moves.push({ type: MoveType.BUILD_DISTRICT });
      }
      // warlord: destroy after build if not already queued and targets remain
      if (canSpecial && character === CharacterType.WARLORD) {
        const destroys = warlordDestroyCandidates(gameState, actorId);
        if (destroys.length
            && !moves.some((m) => m.type === MoveType.WARLORD_DESTROY_DISTRICT)) {
          moves.push({ type: MoveType.WARLORD_DESTROY_DISTRICT });
        }
      }

      moves.push({ type: MoveType.FINISH_TURN });
      moves.push({ type: MoveType.DECLINE });
      return tryMoves(gameState, moves);
    }

    case ClientTurnState.BUILD_DISTRICT: {
      const moves = buildOrder.map((c) => ({ type: MoveType.BUILD_DISTRICT, data: c } as Move));
      moves.push({ type: MoveType.DECLINE });
      return tryMoves(gameState, moves);
    }

    case ClientTurnState.ASSASSIN_KILL: {
      const targets = assassinTargets(gameState, actorId);
      const moves = targets.map((id) => ({ type: MoveType.ASSASSIN_KILL, data: id } as Move));
      for (let cid = 2; cid <= 8; cid += 1) {
        if (!targets.includes(cid)) moves.push({ type: MoveType.ASSASSIN_KILL, data: cid });
      }
      moves.push({ type: MoveType.DECLINE });
      return tryMoves(gameState, moves);
    }

    case ClientTurnState.THIEF_ROB: {
      // never include killed character (server rejects; avoid useless attempts)
      const killedClientId = cm.killedCharacter >= 0 ? cm.killedCharacter + 1 : -1;
      const targets = thiefTargets(gameState, actorId)
        .filter((id) => id !== killedClientId);
      const moves = targets.map((id) => ({ type: MoveType.THIEF_ROB, data: id } as Move));
      for (let cid = 3; cid <= 8; cid += 1) {
        if (cid === killedClientId) continue;
        if (!targets.includes(cid)) moves.push({ type: MoveType.THIEF_ROB, data: cid });
      }
      moves.push({ type: MoveType.DECLINE });
      return tryMoves(gameState, moves);
    }

    case ClientTurnState.MAGICIAN_EXCHANGE_HAND: {
      const seats = magicianExchangeTargets(gameState, actorId);
      const moves = seats.map((seat) => ({
        type: MoveType.MAGICIAN_EXCHANGE_HAND,
        data: seat,
      } as Move));
      board.playerOrder.forEach((pid, idx) => {
        if (pid !== actorId && isEnemy(gameState, actorId, pid) && !seats.includes(idx)) {
          moves.push({ type: MoveType.MAGICIAN_EXCHANGE_HAND, data: idx });
        }
      });
      moves.push({ type: MoveType.DECLINE });
      return tryMoves(gameState, moves);
    }

    case ClientTurnState.MAGICIAN_DISCARD_CARDS: {
      if (hand.length) {
        const m = tryMoves(gameState, [
          { type: MoveType.MAGICIAN_DISCARD_CARDS, data: [...hand] },
        ]);
        if (m) return m;
      }
      return tryMoves(gameState, [{ type: MoveType.DECLINE }]);
    }

    case ClientTurnState.WARLORD_DESTROY_DISTRICT: {
      const cands = warlordDestroyCandidates(gameState, actorId);
      const moves: Move[] = cands.map((c) => ({
        type: MoveType.WARLORD_DESTROY_DISTRICT,
        data: { player: c.seat, card: c.card },
      }));
      // always end with decline (consumes special via GameState.decline)
      moves.push({ type: MoveType.DECLINE });
      return tryMoves(gameState, moves);
    }

    case ClientTurnState.GRAVEYARD_RECOVER_DISTRICT:
    case ClientTurnState.LABORATORY_DISCARD_CARD:
      return tryMoves(gameState, [{ type: MoveType.DECLINE }]);

    default:
      return tryMoves(gameState, [
        { type: MoveType.FINISH_TURN },
        { type: MoveType.DECLINE },
      ]);
  }
}

export default { pickAndApplyAutoplayMove };
