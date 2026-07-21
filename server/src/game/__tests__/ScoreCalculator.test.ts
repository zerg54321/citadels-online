import { describe, it, expect } from 'vitest';
import {
  DistrictId,
  GameProgress,
  MatchResult,
  TeamId,
} from 'citadels-common';
import GameState from '../GameState';
import GameSetupData from '../GameSetupData';
import { refreshLiveScores } from '../ScoreCalculator';

/**
 * Phase 3.1 — ScoreCalculator tests (3v3 competitive only).
 *
 * Covers refreshLiveScores: per-player scoring, complete-city bonus (+4 first /
 * +2 later), 5-color bonus (+3), team aggregation, and final match-result
 * resolution (A win / B win / draw).
 *
 * NOTE on a known scoring bug: `districts.json` declares `extra_points: 2` for
 * `dragon_gate` and `university`, but `DistrictCard.ts` reads `data.extraPoints`
 * (camelCase) while the JSON key is `extra_points` (snake_case) — so the bonus
 * never takes effect and those districts contribute only their `cost` to `base`.
 * The test "dragon_gate contributes cost only (known extraPoints bug)" pins this
 * current behavior; if the bug is fixed, update that assertion to 8.
 */

const SIX = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'];

function create3v3State(): GameState {
  const gs = new GameState({ completeCitySize: 8, fastMode: true, syncMode: true });
  SIX.forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
  gs.setupGame(new GameSetupData(SIX, 8));
  gs.progress = GameProgress.IN_GAME;
  return gs;
}

function setCity(
  gs: GameState,
  pid: string,
  city: DistrictId[],
  firstToComplete = false,
) {
  const pb = gs.board!.players.get(pid)!;
  pb.city = [...city];
  pb.firstToCompleteCity = firstToComplete;
}

function totalOf(gs: GameState, pid: string): number {
  return gs.board!.players.get(pid)!.score.total ?? 0;
}

describe('refreshLiveScores — 3v3 scoring', () => {
  it('team assignment: even seats = A, odd seats = B', () => {
    const gs = create3v3State();
    expect(gs.players.get('p1')!.team).toBe(TeamId.A);
    expect(gs.players.get('p2')!.team).toBe(TeamId.B);
    expect(gs.players.get('p3')!.team).toBe(TeamId.A);
    expect(gs.players.get('p4')!.team).toBe(TeamId.B);
    expect(gs.players.get('p5')!.team).toBe(TeamId.A);
    expect(gs.players.get('p6')!.team).toBe(TeamId.B);
  });

  it('base score = sum of district costs (no completion, no 5-color)', () => {
    const gs = create3v3State();
    setCity(gs, 'p1', ['manor', 'temple']); // 3 + 1 = 4
    setCity(gs, 'p2', ['castle']); // 4
    setCity(gs, 'p3', ['tavern']); // 1
    setCity(gs, 'p4', []); // 0
    setCity(gs, 'p5', ['watchtower', 'church']); // 1 + 2 = 3
    setCity(gs, 'p6', ['market']); // 2

    refreshLiveScores(gs, false);

    expect(totalOf(gs, 'p1')).toBe(4);
    expect(totalOf(gs, 'p2')).toBe(4);
    expect(totalOf(gs, 'p3')).toBe(1);
    expect(totalOf(gs, 'p4')).toBe(0);
    expect(totalOf(gs, 'p5')).toBe(3);
    expect(totalOf(gs, 'p6')).toBe(2);
  });

  it('aggregates team scores: A = p1+p3+p5, B = p2+p4+p6', () => {
    const gs = create3v3State();
    setCity(gs, 'p1', ['manor', 'temple']); // 4  (A)
    setCity(gs, 'p2', ['castle']); // 4  (B)
    setCity(gs, 'p3', ['tavern']); // 1  (A)
    setCity(gs, 'p4', []); // 0  (B)
    setCity(gs, 'p5', ['watchtower']); // 1  (A)
    setCity(gs, 'p6', ['market']); // 2  (B)

    refreshLiveScores(gs, false);

    expect(gs.teamScores.A).toBe(4 + 1 + 1); // 6
    expect(gs.teamScores.B).toBe(4 + 0 + 2); // 6
  });

  it('complete-city bonus: first completer +4, later completer +2', () => {
    const gs = create3v3State();
    // 8 districts each (completeCitySize = 8), only 4 types (no 5-color bonus)
    const eight: DistrictId[] = ['manor', 'castle', 'temple', 'church',
      'tavern', 'market', 'watchtower', 'prison'];
    setCity(gs, 'p1', eight, true); // first to complete → +4
    setCity(gs, 'p2', eight, false); // later → +2
    setCity(gs, 'p3', ['tavern']); // not complete → +0
    setCity(gs, 'p4', []);
    setCity(gs, 'p5', []);
    setCity(gs, 'p6', []);

    refreshLiveScores(gs, false);

    // base for eight = 3+4+1+2+1+2+1+2 = 16 (noble/religious/trade/military, no unique)
    expect(totalOf(gs, 'p1')).toBe(16 + 4);
    expect(totalOf(gs, 'p2')).toBe(16 + 2);
    expect(gs.board!.players.get('p1')!.score.extraPointsCompleteCity).toBe(4);
    expect(gs.board!.players.get('p2')!.score.extraPointsCompleteCity).toBe(2);
    expect(gs.board!.players.get('p3')!.score.extraPointsCompleteCity).toBeUndefined();
    // confirm no 5-color bonus leaked in
    expect(gs.board!.players.get('p1')!.score.extraPointsDistrictTypes).toBeUndefined();
  });

  it('sub-complete city gets no completion bonus even if firstToCompleteCity flag set', () => {
    const gs = create3v3State();
    // 7 districts (< 8) but flag erroneously set — bonus must NOT apply
    setCity(gs, 'p1', ['manor', 'temple', 'tavern', 'watchtower',
      'church', 'market', 'prison'], true);
    setCity(gs, 'p2', []);
    setCity(gs, 'p3', []);
    setCity(gs, 'p4', []);
    setCity(gs, 'p5', []);
    setCity(gs, 'p6', []);

    refreshLiveScores(gs, false);

    expect(gs.board!.players.get('p1')!.score.extraPointsCompleteCity).toBeUndefined();
    // base = 3+1+1+1+2+2+2 = 12
    expect(totalOf(gs, 'p1')).toBe(12);
  });

  it('5-color bonus +3 when city has all 5 district types', () => {
    const gs = create3v3State();
    // noble(1) + religious(2) + trade(3) + military(4) + unique(5)
    setCity(gs, 'p1', ['manor', 'temple', 'tavern', 'watchtower', 'keep']);
    setCity(gs, 'p2', []);
    setCity(gs, 'p3', []);
    setCity(gs, 'p4', []);
    setCity(gs, 'p5', []);
    setCity(gs, 'p6', []);

    refreshLiveScores(gs, false);

    // base = 3+1+1+1+3 = 9, +3 for 5 colors = 12
    expect(totalOf(gs, 'p1')).toBe(12);
    expect(gs.board!.players.get('p1')!.score.extraPointsDistrictTypes).toBe(3);
  });

  it('no 5-color bonus with only 4 district types', () => {
    const gs = create3v3State();
    // noble + religious + trade + military (4 types)
    setCity(gs, 'p1', ['manor', 'temple', 'tavern', 'watchtower']);
    setCity(gs, 'p2', []);
    setCity(gs, 'p3', []);
    setCity(gs, 'p4', []);
    setCity(gs, 'p5', []);
    setCity(gs, 'p6', []);

    refreshLiveScores(gs, false);

    expect(gs.board!.players.get('p1')!.score.extraPointsDistrictTypes).toBeUndefined();
    // base = 3+1+1+1 = 6
    expect(totalOf(gs, 'p1')).toBe(6);
  });

  it('combined: completion bonus + 5-color bonus stack', () => {
    const gs = create3v3State();
    // 8 districts covering 5 types, first to complete
    setCity(gs, 'p1',
      ['manor', 'castle', 'temple', 'tavern', 'market', 'watchtower', 'prison', 'keep'],
      true);
    setCity(gs, 'p2', []);
    setCity(gs, 'p3', []);
    setCity(gs, 'p4', []);
    setCity(gs, 'p5', []);
    setCity(gs, 'p6', []);

    refreshLiveScores(gs, false);

    // base = 3+4+1+1+2+1+2+3 = 17, +4 completion, +3 five-color = 24
    expect(totalOf(gs, 'p1')).toBe(24);
  });

  it('dragon_gate contributes cost only (known extraPoints bug)', () => {
    const gs = create3v3State();
    // dragon_gate: cost 6, extra_points:2 in JSON but NOT applied (key mismatch)
    setCity(gs, 'p1', ['dragon_gate']);
    setCity(gs, 'p2', []);
    setCity(gs, 'p3', []);
    setCity(gs, 'p4', []);
    setCity(gs, 'p5', []);
    setCity(gs, 'p6', []);

    refreshLiveScores(gs, false);

    // base = 6 (cost), no +2 extra → 6. If bug fixed, this should be 8.
    expect(totalOf(gs, 'p1')).toBe(6);
  });

  it('finalize=true sets TEAM_A_WIN when A > B', () => {
    const gs = create3v3State();
    setCity(gs, 'p1', ['palace']); // 5 (A)
    setCity(gs, 'p2', ['temple']); // 1 (B)
    setCity(gs, 'p3', ['castle']); // 4 (A)
    setCity(gs, 'p4', []);
    setCity(gs, 'p5', []);
    setCity(gs, 'p6', []);

    refreshLiveScores(gs, true);

    expect(gs.teamScores.A).toBe(9);
    expect(gs.teamScores.B).toBe(1);
    expect(gs.matchResult).toBe(MatchResult.TEAM_A_WIN);
  });

  it('finalize=true sets TEAM_B_WIN when B > A', () => {
    const gs = create3v3State();
    setCity(gs, 'p1', ['temple']); // 1 (A)
    setCity(gs, 'p2', ['palace']); // 5 (B)
    setCity(gs, 'p3', []);
    setCity(gs, 'p4', ['castle']); // 4 (B)
    setCity(gs, 'p5', []);
    setCity(gs, 'p6', []);

    refreshLiveScores(gs, true);

    expect(gs.teamScores.A).toBe(1);
    expect(gs.teamScores.B).toBe(9);
    expect(gs.matchResult).toBe(MatchResult.TEAM_B_WIN);
  });

  it('finalize=true sets DRAW when A == B', () => {
    const gs = create3v3State();
    setCity(gs, 'p1', ['castle']); // 4 (A)
    setCity(gs, 'p2', ['castle']); // 4 (B)
    setCity(gs, 'p3', []);
    setCity(gs, 'p4', []);
    setCity(gs, 'p5', []);
    setCity(gs, 'p6', []);

    refreshLiveScores(gs, true);

    expect(gs.teamScores.A).toBe(4);
    expect(gs.teamScores.B).toBe(4);
    expect(gs.matchResult).toBe(MatchResult.DRAW);
  });

  it('finalize=false does not change matchResult', () => {
    const gs = create3v3State();
    gs.matchResult = MatchResult.NONE;
    setCity(gs, 'p1', ['palace']);
    setCity(gs, 'p2', []);
    setCity(gs, 'p3', []);
    setCity(gs, 'p4', []);
    setCity(gs, 'p5', []);
    setCity(gs, 'p6', []);

    refreshLiveScores(gs, false);

    expect(gs.teamScores.A).toBe(5);
    expect(gs.teamScores.B).toBe(0);
    expect(gs.matchResult).toBe(MatchResult.NONE);
  });

  it('re-running refreshLiveScores resets scores (no double-counting)', () => {
    const gs = create3v3State();
    setCity(gs, 'p1', ['manor', 'temple']); // 4
    setCity(gs, 'p2', []);
    setCity(gs, 'p3', []);
    setCity(gs, 'p4', []);
    setCity(gs, 'p5', []);
    setCity(gs, 'p6', []);

    refreshLiveScores(gs, false);
    refreshLiveScores(gs, false);
    refreshLiveScores(gs, false);

    expect(totalOf(gs, 'p1')).toBe(4);
    expect(gs.teamScores.A).toBe(4);
  });

  it('returns early (no crash) when board is undefined', () => {
    const gs = create3v3State();
    gs.board = undefined;
    expect(() => refreshLiveScores(gs, false)).not.toThrow();
  });
});
