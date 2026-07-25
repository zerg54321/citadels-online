import { describe, it, expect } from 'vitest';
import { formatActionFeedLine, type ActionFeedLine, type ActionFeedTFunc } from '../actionFeed';

// A fake t that emulates i18next single-brace interpolation ({var}) and
// resolves character/district name keys, so we can assert the rendered string
// per kind without depending on the real locale files.
const ZH: Record<string, string> = {
  'ui.game.round_start': '-- 第 {n} 轮 --',
  'ui.game.feed.kill': '刺杀标记：{role}',
  'ui.game.feed.rob': '偷窃标记：{role}',
  'ui.game.feed.rob_move': '{player} 的{role}被偷，{amount} 金给 {thief}',
  'ui.game.feed.rob_move_empty': '{player} 的{role}被偷，无金',
  'ui.game.feed.earn': '{player} 收租 +{amount} 金',
  'ui.game.feed.build': '{player} 建造了 {district}',
  'ui.game.feed.destroy': '{player} 拆了 {victim} 的 {district}',
  'ui.game.feed.magician_exchange': '{player} 与 {target} 换手牌',
  'ui.game.feed.magician_discard': '{player} 弃 {count} 抽 {drew}',
  'ui.game.feed.call': '{player} 的{role}行动',
  'ui.game.feed.call_killed': '{player} 的{role}被刺杀',
  'ui.game.feed.call_empty': '无人选{role}',
  'characters.1.name': '刺客',
  'characters.4.name': '国王',
  'districts.manor.name': '庄园',
  'districts.palace.name': '宫殿',
};

function makeT(): ActionFeedTFunc {
  return (key: string, params?: Record<string, unknown>) => {
    let tpl = ZH[key];
    if (tpl === undefined) return key;
    if (params) {
      Object.entries(params).forEach(([k, v]) => {
        tpl = tpl!.replace(new RegExp(`\\{${k}\\}`, 'g'), String(v));
      });
    }
    return tpl!;
  };
}

describe('formatActionFeedLine', () => {
  const t = makeT();

  it('renders round separator with round number', () => {
    const line: ActionFeedLine = { kind: 'round', round: 3 };
    expect(formatActionFeedLine(line, t)).toBe('-- 第 3 轮 --');
  });

  it('renders round with empty n when round missing', () => {
    const line: ActionFeedLine = { kind: 'round' };
    expect(formatActionFeedLine(line, t)).toBe('-- 第  轮 --');
  });

  it('resolves role id to character name (kill)', () => {
    const line: ActionFeedLine = { kind: 'kill', params: { role: 1 } };
    expect(formatActionFeedLine(line, t)).toBe('刺杀标记：刺客');
  });

  it('resolves role id to character name (rob)', () => {
    const line: ActionFeedLine = { kind: 'rob', params: { role: 4 } };
    expect(formatActionFeedLine(line, t)).toBe('偷窃标记：国王');
  });

  it('renders rob_move with player/role/amount/thief', () => {
    const line: ActionFeedLine = {
      kind: 'rob_move', params: { player: 'Alice', role: 4, amount: 5, thief: 'Bob' },
    };
    expect(formatActionFeedLine(line, t)).toBe('Alice 的国王被偷，5 金给 Bob');
  });

  it('renders rob_move_empty', () => {
    const line: ActionFeedLine = { kind: 'rob_move_empty', params: { player: 'Alice', role: 4 } };
    expect(formatActionFeedLine(line, t)).toBe('Alice 的国王被偷，无金');
  });

  it('renders earn with player/amount', () => {
    const line: ActionFeedLine = { kind: 'earn', params: { player: 'Alice', amount: 2 } };
    expect(formatActionFeedLine(line, t)).toBe('Alice 收租 +2 金');
  });

  it('resolves district id to name (build)', () => {
    const line: ActionFeedLine = { kind: 'build', params: { player: 'Alice', district: 'manor' } };
    expect(formatActionFeedLine(line, t)).toBe('Alice 建造了 庄园');
  });

  it('resolves district id to name (destroy)', () => {
    const line: ActionFeedLine = {
      kind: 'destroy', params: { player: 'Alice', victim: 'Bob', district: 'palace' },
    };
    expect(formatActionFeedLine(line, t)).toBe('Alice 拆了 Bob 的 宫殿');
  });

  it('renders magician_exchange', () => {
    const line: ActionFeedLine = {
      kind: 'magician_exchange', params: { player: 'Alice', target: 'Bob' },
    };
    expect(formatActionFeedLine(line, t)).toBe('Alice 与 Bob 换手牌');
  });

  it('renders magician_discard with count/drew', () => {
    const line: ActionFeedLine = {
      kind: 'magician_discard', params: { player: 'Alice', count: 3, drew: 3 },
    };
    expect(formatActionFeedLine(line, t)).toBe('Alice 弃 3 抽 3');
  });

  it('renders call with player/role', () => {
    const line: ActionFeedLine = { kind: 'call', params: { player: 'Alice', role: 4 } };
    expect(formatActionFeedLine(line, t)).toBe('Alice 的国王行动');
  });

  it('renders call_killed with player/role', () => {
    const line: ActionFeedLine = { kind: 'call_killed', params: { player: 'Alice', role: 1 } };
    expect(formatActionFeedLine(line, t)).toBe('Alice 的刺客被刺杀');
  });

  it('renders call_empty with role only', () => {
    const line: ActionFeedLine = { kind: 'call_empty', params: { role: 4 } };
    expect(formatActionFeedLine(line, t)).toBe('无人选国王');
  });

  it('falls back to text for unknown kind', () => {
    const line: ActionFeedLine = { kind: 'mystery', text: 'raw fallback' };
    expect(formatActionFeedLine(line, t)).toBe('raw fallback');
  });

  it('falls back to empty string for unknown kind with no text', () => {
    const line: ActionFeedLine = { kind: 'mystery' };
    expect(formatActionFeedLine(line, t)).toBe('');
  });

  it('handles missing params gracefully (role undefined → empty)', () => {
    const line: ActionFeedLine = { kind: 'kill' };
    expect(formatActionFeedLine(line, t)).toBe('刺杀标记：');
  });
});
