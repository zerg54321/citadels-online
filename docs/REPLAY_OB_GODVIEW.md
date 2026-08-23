# 回放系统 & 管理员上帝视角 OB（实现总结）

> 日期：2026-08-23
>
> 本文件记录回放系统 + 管理员实时 OB（上帝视角）的完整实现。核心：在服务端提供「全手牌 + 全角色」上帝视角导出与逐步快照采集，落库后可回放；实时房间则由携带管理员令牌的专用 socket 收到上帝视角状态推送。前端为 OB/回放重构一套专用画面（复用玩家区域展示所有手牌、缩小中央角色区）。

---

## 1. 目标与方案取舍

- **数据来源**：采用「每步快照」方案 —— 用现成的 `GameState.clone()` 一致的思想，在每次状态推进时对**全量上帝视角状态**做一次快照，逐帧回放，可精确回退任意一步。
- **手牌展示**：OB/回放时**没有预留手牌位置**。最终方案 = 为 OB/回放**重构一套专用画面**（`GodViewBoard`）：紧凑的「左3 座位 / 中央窄区 / 右3 座位」棋盘，**每个座位块内联携带该玩家的手牌**（banner + 城市 + 角色 + 手牌扇），充分利用垂直与横向空间——摒弃了早期"6 人横排 + 底部手牌条"浪费空间的方案。
- **权限**：**管理员实时也可 OB 全手牌**（服务端按 socket 级别鉴权，只对管理员 socket 推上帝视角）。

## 2. 服务端改动

### 2.1 上帝视角导出（全手牌 + 全角色）

`revealAll` 标志贯穿导出链路，为真时无视观看者身份，把所有玩家的手牌与角色正面朝上。

- `server/src/game/CharacterManager.ts`
  - `exportPlayerCharacters(pos, dest, revealAll=false)`：`revealAll` 时 `canSee` 恒真 → 该玩家角色始终显示正面。
  - `exportCharactersList(dest, revealAll=false)`：god-view 时 `CHOOSE_CHARACTERS` 的候选池也揭示。
- `server/src/game/BoardState.ts`
  - `exportForPlayer(destPlayerId, revealAll=false)`：`canSeeHand = revealAll || playerId === destPlayerId`；角色与候选列表透传 `revealAll`。
- `server/src/game/GameState.ts`
  - 新增 `getGodViewState(): Record<string, unknown>`：产出 `ClientGameState` 形状、全手牌/全角色揭示的 JSON 快照；`self` 为占位座位，前端按观战处理。（作用：管理员实时推流 + 回放帧。）

### 2.2 逐步快照采集

- `GameState` 新增 `replaySnapshots: Record<string, unknown>[]`（有界 `REPLAY_MAX_SNAPSHOTS = 4000`）。
- 新增 `captureReplaySnapshot()`：仅在 `IN_GAME/FINISHED` 且有 board 时，追加 `getGodViewState()` 帧；与上一帧 `JSON.stringify` 相同则跳过（去重重连/无操作 join）。
- `server/src/gameManager/Room.ts` `update()`：**先** `captureReplaySnapshot()` **再** `tryPersistMatch()` —— 顺序关键：移到 FINISHED 的那一次 update 会先捕获终局帧再落库，否则 `matchPersisted` 守卫会导致终局帧永远不持久化，回放会早一帧结束、缺"对局结束"状态。

### 2.3 持久化 + 拉取

- `server/src/db/database.ts`：`matches` 表新增 `replay_json TEXT`（沿用既有守卫式 `ALTER TABLE`，`duplicate column` 静默）。
- `server/src/db/matches.ts`
  - `saveFinishedMatch` 把 `gameState.replaySnapshots` 序列化写入 `replay_json`（无帧则为 `null`，老比赛不可回放）。
  - 新增 `adminGetMatchReplay(id, limit, offset)`：**分页**返回帧 + `total`，避免单次响应数十 MB。
- `server/src/admin/routes.ts`：新增 `GET /api/admin/matches/:id/replay?limit&offset`（`requireAdmin` + IP 白名单，默认 200、上限 2000）。

### 2.4 管理员实时 OB（socket 上帝视角）

- `server/src/socket/ExtendedSocket.ts`：新增 `isAdmin?: boolean`。
- `server/src/socket/server.ts` `attachAuth`：
  - 握手 token 若等于 `ADMIN_TOKEN` 且 `adminEnabled()` → `socket.isAdmin = true`（常量时间比较 `safeEqual`，fail-closed）。
  - 同时仍尝试 `authenticateToken`（管理员 token 非 JWT 不会冒充玩家）。
- `server/src/gameManager/Room.ts` `sendRoomStateToAllClients`：对 `isAdmin` socket 发 `getGodViewState()`，其余照旧按玩家作用域推 `getStateFromPlayer()`。

## 3. 前端改动

### 3.1 共享上帝视角棋盘 `GodViewBoard.tsx`

`client-react/src/components/game/GodViewBoard.tsx` —— OB/回放共用的棋盘渲染，接收 `gs: ClientGameState`（服务端已揭示全手牌/角色），渲染紧凑的 3 栏棋盘：

- 结构：左侧竖排 3 个座位（l3/l2/l1）· 中央窄只读区 · 右侧竖排 3 个座位（r1/r2/r3）。
- 每个座位块（`ob-seat`）内联完整信息：**banner**（pick 号/头像/名/金币/手牌数/分数/队伍）+ **城市**（迷你城区卡）+ **正文**（角色卡 + 该玩家**手牌扇** `ob-hands__back`/`DistrictCard small`），座位 `flex:1` 均分列高，正文 `flex:1` 居中。
- 中央只读缩小区 `ob-center`：当前阶段 + 当前角色大卡 + 回合号（不交互，固定窄宽）。
- 终局横幅 `ob-screen__result`（胜方队伍，若有 `teamScores`）。

### 3.2 回放画面 `ObReplayScreen.tsx`

路由 `/admin/replay/:matchId`。

- 从 `localStorage 'adminToken'` 取管理员令牌，`adminApi.replay` **分页**拉取全部帧（先取首页得 `total`，再并行取剩余页，顺序拼接）。
- 本地状态 `frames / idx / playing / speed`；`framesRef + idxRef` 供 interval 闭包读取当前值。
- **播放控制条** `ob-player`：
  - ⏮ 回退一轮 / ◀ 回退一步 / ▶⏸ 播放暂停 / ▶ 快进一步 / ⏭ 快进一轮
  - 进度滑块 `range`（索引 0..frames-1）
  - 速度 0.4× / 1× / 2.2×
  - 位置 `idx+1 / total`
- 回合跳转 `findPrevRound/findNextRound` 依据相邻帧 `roundNumber` 变化定位。

### 3.3 实时管理员 OB `AdminObScreen.tsx`

路由 `/admin/ob/:roomId`。

- **新建专用 socket**（`io('/', { path: '/s/', auth: { token: adminToken } })`，独立于应用单例 socket，避免污染玩家会话）。
- 连接后 `join room` 以观战身份加入；服务端因 `isAdmin` 在 join 与每次 `update game state` 时推送上帝视角。
- 监听 `update game state` → `parseClientGameState` → 渲染 `GodViewBoard`（实时、无播放条）。

### 3.4 入口与样式

- `client-react/src/main.tsx`：新增 `/admin/replay/:matchId`、`/admin/ob/:roomId` 路由。
- `client-react/src/components/AdminScreen.tsx`：对战详情面板加「回放」按钮；对战 Tab 顶部加「实时观战(OB)」输入框+按钮。
- `client-react/src/api/admin.ts`：`replay(token, id, limit, offset)` 返回 `{ frames, total }`。
- `client-react/src/scss/_ob-replay-screen.scss`：OB/回放画面的中世纪主题样式（`ob-screen` / `ob-seat` / `ob-center` / `ob-hands` / `ob-player`），`main.scss` 引入。
- i18n：`ui.admin.replay / live_ob / ob_hint / back / token_required`、`ui.replay.*`、`ui.game.phase_*`、`ui.score.winner_team`（中/英）。

## 4. 安全与验证

- 管理员鉴权：静态 `ADMIN_TOKEN` 常量时间比较 + `adminEnabled()`（IP 白名单 + token≥32）fail-closed；回放接口在 `requireAdmin` 之后。
- 上帝视角只对 `isAdmin` socket 下发，普通玩家/观战仍按原有保密规则。
- 验证：`server tsc --noEmit` ✅；`client tsc --noEmit` ✅；`vitest`（game/gameManager/admin）= **127 用例全过**；lint 仅剩仓库既有的 CRLF `linebreak-style` 噪音（非本次引入）。

## 5. 部署 / 运维注意

- `matches` 表自动加 `replay_json` 列（守卫式 ALTER，幂等）。
- 老比赛没有快照 → 回放接口返回 404（表现符合预期）。
- 回放数据：单场比赛最多 4000 帧、以 JSON 存于一列；接口已分页，前端分批加载。

## 6. 后续可做（未实现）

- 玩家/普通用户能否看自己历史对局的回放（当前仅管理员）。如需开放，可把回放权限下沉到「本用户参与的比赛」并做数据裁剪（隐藏无关对手手牌等）。
- 实时 OB 的房间发现（管理员需手动输入 roomId；可加「在线房间列表 + 进入观战」）。
- 回放帧再做轻量化（仅存变更 diff）以压缩体积。
