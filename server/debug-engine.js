const { TrainingEngine } = require('./dist/engine/trainingEngine');
const { districts } = require('../common/dist/index.js');
const CARD_COST = Object.fromEntries(
  Object.entries(districts).map(([id, d]) => [id, d.cost ?? 99]),
);

function order(legal, obs) {
  const player = obs.players.find((p) => p.id === obs.currentPlayerId);
  const ordered = [];
  const used = new Set();
  const take = (pred) => legal.filter(pred).forEach((a) => {
    if (!used.has(a)) { used.add(a); ordered.push(a); }
  });
  take((a) => a.type === 'choose_character');
  take((a) => a.type === 'take_gold_earnings');
  take((a) => a.type === 'build_district' && a.data === undefined);
  legal.filter((a) => a.type === 'build_district' && a.data != null)
    .sort((a, b) => (CARD_COST[a.data] ?? 99) - (CARD_COST[b.data] ?? 99))
    .forEach((a) => { if (!used.has(a)) { used.add(a); ordered.push(a); } });
  legal.filter((a) => a.type === 'draw_cards' && a.data != null)
    .sort((a, b) => (CARD_COST[a.data] ?? 99) - (CARD_COST[b.data] ?? 99))
    .forEach((a) => { if (!used.has(a)) { used.add(a); ordered.push(a); } });
  if (player && player.handCount === 0) {
    take((a) => a.type === 'draw_cards' && a.data === undefined);
    take((a) => a.type === 'take_gold');
  } else {
    take((a) => a.type === 'take_gold');
    take((a) => a.type === 'draw_cards' && a.data === undefined);
  }
  take((a) => a.type === 'finish_turn');
  take((a) => a.type === 'decline');
  legal.forEach((a) => { if (!used.has(a)) ordered.push(a); });
  return ordered;
}

const e = new TrainingEngine(['A', 'B', 'C', 'D', 'E', 'F']);
let builds = 0;
for (let i = 0; i < 2000; i += 1) {
  if (e.isFinished()) {
    console.log('FINISHED at', i);
    break;
  }
  const o = e.getObservation();
  const ordered = order(o.legalActions, o);
  if (!ordered.length) {
    console.log('NO LEGAL at', i, o.phase, o.turnState, o.currentCharacter);
    break;
  }
  let ok = false;
  let used;
  for (const c of ordered) {
    const r = e.applyAction(c);
    if (r.ok) {
      ok = true;
      used = c;
      if (c.type === 'build_district' && c.data) builds += 1;
      break;
    }
  }
  if (!ok) {
    console.log('ALL FAIL at', i, ordered.map((x) => x.type + ':' + (x.data ?? '')).join('|'));
    break;
  }
  if (i % 100 === 0) {
    const cities = e.getObservation().players.map((p) => p.citySize + 'c/' + p.stash + 'g/' + p.handCount + 'h').join(' ');
    console.log(i, used.type, used.data ?? '', cities, 'builds', builds);
  }
}
const final = e.getObservation().players.map((p) => p.citySize);
console.log('final cities', final, 'builds', builds, e.getMatchResult());
