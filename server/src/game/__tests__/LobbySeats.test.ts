import { describe, it, expect } from 'vitest';
import {
  TeamId, PlayerRole, GameProgress, MAX_LOBBY_SEATS,
} from 'citadels-common';
import GameState from '../GameState';
import GameSetupData from '../GameSetupData';

/**
 * 大厅座位重构（lobbySeats 含空位 + 拖拽调位）单元测试。
 *
 * 覆盖：空位入座、moveLobbySeat 移动/交换/no-op、队伍按 slot 奇偶派生、
 * 满员开局投影 stablePlayers 顺序正确、setupGame 队伍与大厅一致。
 */

function freshLobby(): GameState {
  return new GameState({ fastMode: true, syncMode: true });
}

describe('lobby seats — 基础入座', () => {
  it('addPlayer 按顺序填入前6个空槽', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    expect(gs.lobbySeats.slice(0, 3)).toEqual(['p1', 'p2', 'p3']);
    expect(gs.lobbySeats.slice(3)).toEqual([null, null, null]);
  });

  it('lobbySeats 固定长度为 MAX_LOBBY_SEATS', () => {
    const gs = freshLobby();
    gs.addPlayer('p1', 'P1', true, true);
    expect(gs.lobbySeats.length).toBe(MAX_LOBBY_SEATS);
  });

  it('队伍按 slot 奇偶派生（偶=A，奇=B）', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3', 'p4'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    expect(gs.players.get('p1')!.team).toBe(TeamId.A); // slot 0
    expect(gs.players.get('p2')!.team).toBe(TeamId.B); // slot 1
    expect(gs.players.get('p3')!.team).toBe(TeamId.A); // slot 2
    expect(gs.players.get('p4')!.team).toBe(TeamId.B); // slot 3
  });

  it('lobbyPlayerOrder 是 lobbySeats 的紧凑投影（跳过 null）', () => {
    const gs = freshLobby();
    gs.addPlayer('p1', 'P1', true, true);
    gs.addPlayer('p2', 'P2', false, true);
    // 人为制造中间空位：把 p2 移到 slot 5
    gs.moveLobbySeat('p2', 5);
    expect(gs.lobbySeats).toEqual(['p1', null, null, null, null, 'p2']);
    expect(gs.lobbyPlayerOrder).toEqual(['p1', 'p2']);
  });
});

describe('lobby seats — moveLobbySeat', () => {
  it('拖到空位 → 移动', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    expect(gs.moveLobbySeat('p2', 4)).toBe(true);
    expect(gs.lobbySeats).toEqual(['p1', null, 'p3', null, 'p2', null]);
  });

  it('拖到已占位 → 交换（需房主权限）', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3', 'p4'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    expect(gs.moveLobbySeat('p1', 3, 'p1', true)).toBe(true);
    // p1 ↔ p4 交换
    expect(gs.lobbySeats).toEqual(['p4', 'p2', 'p3', 'p1', null, null]);
  });

  it('非房主拖到已占位 → 状态层拒绝（防御纵深）', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3', 'p4'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    // p2（非房主）尝试与 p4 交换 → 拒绝
    expect(gs.moveLobbySeat('p2', 3, 'p2', false)).toBe(false);
    expect(gs.lobbySeats).toEqual(['p1', 'p2', 'p3', 'p4', null, null]);
  });

  it('非房主拖动他人 → 状态层拒绝', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    // p2（非房主）尝试移动 p1 到空位 → 拒绝
    expect(gs.moveLobbySeat('p1', 4, 'p2', false)).toBe(false);
    expect(gs.lobbySeats).toEqual(['p1', 'p2', 'p3', null, null, null]);
  });

  it('拖到自己原位 → no-op，返回 true', () => {
    const gs = freshLobby();
    ['p1', 'p2'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    const before = [...gs.lobbySeats];
    expect(gs.moveLobbySeat('p1', 0)).toBe(true);
    expect(gs.lobbySeats).toEqual(before);
  });

  it('越界 targetSlot → 返回 false', () => {
    const gs = freshLobby();
    gs.addPlayer('p1', 'P1', true, true);
    expect(gs.moveLobbySeat('p1', -1)).toBe(false);
    expect(gs.moveLobbySeat('p1', MAX_LOBBY_SEATS)).toBe(false);
    expect(gs.moveLobbySeat('p1', 99)).toBe(false);
  });

  it('非整数 targetSlot → 返回 false', () => {
    const gs = freshLobby();
    gs.addPlayer('p1', 'P1', true, true);
    expect(gs.moveLobbySeat('p1', 2.5)).toBe(false);
  });

  it('未入座 playerId → 返回 false', () => {
    const gs = freshLobby();
    gs.addPlayer('p1', 'P1', true, true);
    expect(gs.moveLobbySeat('pGhost', 3)).toBe(false);
  });

  it('游戏开始后调用 → 返回 false', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    gs.setupGame(new GameSetupData(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], 8));
    // setupGame 只创建 BoardState，progress 由 step() 推进到 IN_GAME（与
    // ScoreCalculator.test 等现有测试一致，需手动设置）
    gs.progress = GameProgress.IN_GAME;
    expect(gs.moveLobbySeat('p1', 3)).toBe(false);
  });

  it('移动后队伍按新 slot 奇偶重新派生', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    // p2 从 slot1(B) 移到 slot2(A)——slot2 已被 p3 占用，需房主交换
    gs.moveLobbySeat('p2', 2, 'p1', true);
    expect(gs.players.get('p2')!.team).toBe(TeamId.A);
  });
});

describe('lobby seats — removePlayer / setLobbyRole 清槽', () => {
  it('removePlayer 后对应 slot 置 null', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    gs.removePlayer('p2');
    expect(gs.lobbySeats).toEqual(['p1', null, 'p3', null, null, null]);
  });

  it('setLobbyRole 转 spectator 后对应 slot 置 null', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    gs.setLobbyRole('p2', PlayerRole.SPECTATOR);
    expect(gs.lobbySeats).toEqual(['p1', null, 'p3', null, null, null]);
    expect(gs.players.get('p2')!.team).toBe(TeamId.NONE);
  });

  it('setLobbyRole 转回 player → 重新入首个空槽', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    gs.setLobbyRole('p2', PlayerRole.SPECTATOR);
    // slot1 空；转回后应填 slot1
    gs.setLobbyRole('p2', PlayerRole.PLAYER);
    expect(gs.lobbySeats).toEqual(['p1', 'p2', 'p3', null, null, null]);
  });
});

describe('lobby seats — 满员开局投影', () => {
  it('6人坐定后 setupGame: stablePlayers 顺序与 lobbySeats 非 null 顺序一致', () => {
    const gs = freshLobby();
    ['p1', 'p2', 'p3', 'p4', 'p5', 'p6'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    gs.setupGame(new GameSetupData(['p1', 'p2', 'p3', 'p4', 'p5', 'p6'], 8));
    expect(gs.lobbyPlayerOrder).toEqual(['p1', 'p2', 'p3', 'p4', 'p5', 'p6']);
    expect(gs.board!.playerOrder.length).toBe(6);
    // playerOrder 是 lobbyPlayerOrder 的旋转（随机首发），集合应一致
    expect(new Set(gs.board!.playerOrder)).toEqual(new Set(gs.lobbyPlayerOrder));
  });

  it('玩家选座导致空位不连续：开局队伍仍按 slot 奇偶与大厅一致', () => {
    const gs = freshLobby();
    // 只填 slot 0,2,5（A,A,B），制造不连续
    gs.addPlayer('a1', 'A1', true, true); // slot0
    gs.addPlayer('a2', 'A2', false, true); // slot1 → 移走
    gs.addPlayer('b1', 'B1', false, true); // slot2
    gs.moveLobbySeat('a2', 5); // a2 → slot5(B)
    // 当前：slot0=a1(A) slot1=null slot2=b1(A) slot5=a2(B)
    expect(gs.lobbySeats).toEqual(['a1', null, 'b1', null, null, 'a2']);
    gs.setupGame(new GameSetupData(['a1', 'b1', 'a2'], 8));
    // 队伍应与 slot 奇偶一致，而非投影索引奇偶
    expect(gs.players.get('a1')!.team).toBe(TeamId.A); // slot0
    expect(gs.players.get('b1')!.team).toBe(TeamId.A); // slot2
    expect(gs.players.get('a2')!.team).toBe(TeamId.B); // slot5
    // 投影顺序保持 slot 顺序
    expect(gs.lobbyPlayerOrder).toEqual(['a1', 'b1', 'a2']);
  });
});

describe('lobby seats — clone 保持状态', () => {
  it('clone 后 lobbySeats 与 lobbyPlayerOrder 独立副本', () => {
    const gs = freshLobby();
    ['p1', 'p2'].forEach((id, i) => gs.addPlayer(id, `P${i + 1}`, i === 0, true));
    gs.moveLobbySeat('p2', 4);
    const c = gs.clone();
    expect(c.lobbySeats).toEqual(gs.lobbySeats);
    expect(c.lobbySeats).not.toBe(gs.lobbySeats);
    expect(c.lobbyPlayerOrder).toEqual(gs.lobbyPlayerOrder);
    expect(c.lobbyPlayerOrder).not.toBe(gs.lobbyPlayerOrder);
  });
});
