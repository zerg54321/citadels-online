# 项目业务逻辑梳理 (Citadels Online)

## 1. 项目概览

这是一款 **Citadels（富饶之城）在线版** 实时多人策略桌游，采用经典三层 monorepo：

- **common/** — 共享类型、枚举、 district 卡牌数据（`citadels-common`）
- **server/** — Node + Socket.IO 游戏服务器，权威游戏引擎 + SQLite 持久化 + 账号系统
- **client/** — Vue 3 + Vite + Vuex 前端，纯展示层（无游戏逻辑，只发 move / 渲染 state）

核心特点：**6 人强制 3v3 团队模式**（本产品只支持 6 人，不支持 2–5 人休闲）。每局为 Team A（0/2/4 座）vs Team B（1/3/5 座）。无 AI 时为 `COMPETITIVE_TEAM6` 排位赛；含 AI 时为 `CASUAL` 练习赛（不计排位）。

---

## 2. 数据模型（common/src/index.ts）

| 概念 | 说明 |
|------|------|
| `PlayerId` / `RoomId` | 字符串 |
| `GameProgress` | `IN_LOBBY(1)` → `IN_GAME(2)` → `FINISHED(3)` |
| `GameMode` | `CASUAL(1)` / `COMPETITIVE_TEAM6(2)` |
| `TeamId` | `NONE(0)` / `A(1)` / `B(2)` |
| `PlayerRole` | `SPECTATOR(1)` / `PLAYER(2)` |
| `MatchResult` | `TEAM_A_WIN` / `TEAM_B_WIN` / `DRAW` / `CASUAL_END` |
| `CharacterType` | 刺客/盗贼/魔术师/国王/主教/商人/建筑师/军阀 (0–7，0=NONE) |
| `ClientTurnState` | 客户端看到的回合子状态（取金、选卡、建造、刺杀、偷窃、交换手牌…）|
| `DistrictId` | `districts.json` 的键（卡牌 id）|

`ClientGameState`（服务器下发给每个玩家的快照）：
- `players: Map<PlayerId, {id,username,manager,online,role,userId,team,isAi,isAutoplay,hadEffectiveAiControl}>`
- `board`：含各玩家 `PlayerBoard`（stash 金币 / hand 手牌 / city 城市 / score 分数 / characters）、`playerOrder`（含王冠者在 [0]）、`gamePhase`、`currentPlayer`、`characters`（角色选择状态）、`graveyard`
- `teamScores`、`matchResult`、`turnDeadlineAt`（倒计时）、`lobbyPlayerOrder`（大厅座位预览）、`actionFeed`（滚动战报）

---

## 3. 游戏生命周期（服务端权威状态机）

### 3.1 大厅阶段 (IN_LOBBY)
入口：`server/src/socket/server.ts` 的 socket 事件。

- **创建房间**：需登录；生成 roomId，创建 `Room`（实现 Observer 模式，监听 `GameState` 变更后 `update()` 广播）。
- **加入房间**：按 playerId / userId 重连；否则登录用户作为 PLAYER 加入（第一个加入者成为 `manager`），匿名用户只能当 SPECTATOR。
- **大厅座位管理**（仅 manager）：
  - `set lobby role` — 玩家↔观战切换；经理离座时转移 manager。
  - `add ai player` / `remove ai player` — 加 AI 占座（上限 6）。
  - `reorder lobby seat` — 调整座位顺序 → 决定 A/B 队分配。
- **队伍分配规则**：`refreshLobbyTeams()` 中 **偶数索引 → Team A，奇数 → Team B**（`lobbyPlayerOrder` 顺序）。
- **开始游戏**：仅 manager，调用 `setupGame()`：
  - 校验必须是 **6 名 PLAYER**（`validateGameSetup`）。
  - 设置 `completeCitySize = 8`、`gameMode = hasAi ? CASUAL : COMPETITIVE_TEAM6`。
  - 重新按座位索引分配 A/B 队，初始化 `BoardState`（每人发 2 金币 + 1 区卡），进入游戏。

### 3.2 选角色阶段 (IN_GAME → CHOOSE_CHARACTERS)
状态机核心：`GameState.step()` + `CharacterManager` + `ChoosingState`。

- `ChoosingState` 按人数预置一整套选角色序列（见 `ChoosingState.ts`），例如 6 人：先面朝下 `PUT_ASIDE_FACE_DOWN` 一张，再 P1..P6 各 `CHOOSE_CHARACTER`，最后旁观者 `PUT_ASIDE_FACE_DOWN` 收尾 → `DONE`。
- 每个 `chooseCharacter(idx)` 把对应角色放入 `CharacterManager.characters[role] = PlayerPosition`。
- **旁观者座位**：轮到 SPECTATOR 时由 `autoSpectatorAside()` 系统自动收尾（面朝下/面朝上丢牌），无需玩家操作。
- 选完进入 `DO_ACTIONS`，按 crown 持有者开始，跳到第一个可行动角色。

### 3.3 行动阶段 (DO_ACTIONS)
`CharacterManager` 持有内部 `TurnState` 枚举（每角色 选卡/行动/刺杀/偷窃/交换/弃牌/建造 子态），并映射为客户端 `ClientTurnState`。

单角色回合流程（见 `GameState.ts`）：
1. **回合开始** `onCharacterTurnStart()`：
   - 记录行动者（战报 `logCharacterCall`）。
   - 若当前角色是被偷者 → `moveRobbedGold()` 转移金币。
   - 若当前角色是国王且未被刺 → `giveCrownToKing()`（把国王座位轮转到 playerOrder[0]）。
   - 施加被动：商人 +1 金、建筑师抽 2 张（`applyCharacterTurnStartPassives`）。
2. **取资源** `TAKE_RESOURCES`：
   - `TAKE_GOLD`（+2）或 `DRAW_CARDS`（天文台 3 张 / 图书馆直接入手 / 否则放入 tmpHand 选 1）。
   - 收租被动（`canTakeEarnings[ch]`）在手动取金前可 `TAKE_GOLD_EARNINGS` 收取（税色城区数量），之后锁定；若直接取资源则自动代收。
3. **选择行动** `CHOOSE_ACTION`：建造 / 刺杀 / 偷窃 / 魔术师交换 / 魔术师弃牌 / 拆毁 / 结束回合。
4. **建造** `BUILD_DISTRICT`：从手牌扣金币建区（同名校验、金币校验）；记录首完成/同回合完成奖励。
5. 角色回合结束 → `jumpToNextCharacter()`，若角色不可行动（被刺/未选）则跳过并战报公示。

**特殊角色行动**（`GameState` 对应私有方法）：
- 刺客 `killCharacter`：标记被刺角色，行动时跳过。
- 盗贼 `robCharacter`：标记被偷角色，其行动开始时 `moveRobbedGold` 把金币转给盗贼（被刺角色不可被偷）。
- 魔术师 `exchangeHand`：与指定玩家交换整手牌；`discardCards`：弃 n 张换抽 n 张。
- 建筑师抽 2 / 商人 +1 已在回合开始自动施加。
- 军阀 `destroyDistrict`：花费 `cost − (有城墙且非城墙则 0)` 金币拆敌城区（keep 不可拆、主教受保护、满城 8 受保护、不能用本回合取金支付）；拆后入墓地 `graveyard`，有墓地且持有者满足条件下可 `GRAVEYARD_RECOVER_DISTRICT` 花 1 金回收。
- 铁匠/实验室：`SMITHY_DRAW_CARDS`（2 金抽 3）、`LABORATORY_DISCARD_CARD`（弃 1 换 2 金）。

### 3.4 回合阶段结束与结算
- 所有角色行动完毕 → `finishTurnPhase()`：
  - 生成 `lastRoundSummary`（刺/偷/各城状态）供 UI。
  - `giveCrownToKing()` 把王冠给本局国王。
  - 清墓地。
  - 若有人城市 `>= completeCitySize(8)` → `computeScores()` 进入 `FINISHED`；否则回到 `CHOOSE_CHARACTERS` 下一轮。
- **计分**（`PlayerBoardState.computeScore`）：
  - 基础分 = Σ(卡 cost + extraPoints)。
  - 完成城奖励：首完成 +4，其余 +2。
  - 5 色集齐（ haunted_quarter 在最终轮前建成算百搭色）+3。
  - 团队总分 = 队内各玩家总分之和。
  - `FINISHED` 且成队 → A>B 胜、B>A 胜、相等平局；非队 → `CASUAL_END`。

### 3.5 观战者 / 重连
- 任意时刻可 `asSpectator` 加入；旁观者能看到所有手牌、完整角色列表。
- 断线：`player.online=false` 广播；空房间回收（dispose TurnTimer + removeRoom）。
- 重连：按 playerId / userId 找回座位并 `online=true`，socket 重连时客户端自动 `rejoinCurrentRoom`。

---

## 4. AI / 自动托管 / 计时（TurnTimer + AutoplayPolicy）

`server/src/gameManager/TurnTimer.ts` 是“节拍器”（400ms 心跳 + 工作定时器），驱动无人类输入时的推进：

- **系统 AUTO**：选角阶段旁观者自动收尾、INITIAL/DONE 等过渡、不可行动角色跳过 → `gs.step({type: AUTO})`。
- **AI 座位 / 自动托管**（`isAi` 或 `isAutoplay`）：调用 `pickAndApplyAutoplayMove(gs)`（见 `AutoplayPolicy.ts`）。
- **人类超时**：到 `turnDeadlineAt` 仍未操作 → `actor.isAutoplay=true` 接管（之后该玩家由 AI 代打，且 `hadEffectiveAiControl=true` 影响排位资格）。
- **AI 节奏**：有观战人类时放慢（约 1.2s/步，结束/跳过 2.2–4s），纯 AI 时 80ms 加速。

`AutoplayPolicy` 是 **L2 启发式 AI**（金币等价 GE 估值）：
- 角色选择：按城/手牌税色、节奏（develop/sprint/deny）、敌我城市规模打分（`scoreCharacterPick`）。
- 建造：按节奏优先最便宜达 8 路 / 五色补全 / 高费独特牌（`buildScore`）。
- 刺客/盗贼/拆毁：预测敌手可能角色（`predictLikelyRoles`），优先打威胁最大且为敌人的目标，绝不打友军。
- 团队感知：`isAlly`/`isEnemy` 基于 TeamId；友军接近胜利时优先保护。

---

## 5. 账号、持久化与统计

### 5.1 认证（auth/）
- `bcryptjs` 哈希密码，`jsonwebtoken` 签发 30 天 token（`JWT_SECRET` 环境变量，缺省开发密钥）。
- 路由：`/api/auth/register|login|me(GET)|me(PATCH)`。
- 用户名 3–32 `[a-zA-Z0-9_]`、密码 6–72、昵称 1–32。
- Socket 连接时 `attachAuth` 从 handshake 解析 token 绑定 `socket.userId/displayName`。

### 5.2 数据库（db/，better-sqlite3）
- `users`、`matches`、`match_players` 三张表（WAL 模式，外键 ON）。
- **比赛落地**：`Room.update()` → 仅在 `FINISHED` 且未持久化时 `saveFinishedMatch()`，写入一局 + 每座位一行（team、personal_score、is_ai、had_effective_ai_control、ranked_win_eligible、team_won）。
- **排位资格规则**：`ranked = COMPETITIVE_TEAM6 && 无AI`；某玩家 `ranked_win_eligible = ranked && 队胜 && 无有效AI控制 && 非AI`。
- 统计 API：`/api/stats` 提供 `myMatches`（个人战绩）与 `ranking`（排位榜：胜/负/平）。
- 房间列表 API：`/api/rooms`。

---

## 6. 客户端数据流（client/）

纯展示 + 转发，无游戏规则：

1. `socket/index.ts`：连接 `path:'/s/'`，监听 `update game state` → 转成 `ClientGameState`（把 `players`/`board.players` 数组还原为 `Map`）并提交 `setGameState`。
2. `store/index.ts`（Vuex）：
   - getters：当前玩家、进度、可拆毁价、可破坏判定、队友关系等。
   - actions：auth（`initAuth/register/login/logout/updateDisplayName`）、`connect/rejoinCurrentRoom`、`createRoom/joinRoom`、`startGame`、`sendMove`、大厅 `setLobbyRole/reorderLobbySeat/addAiPlayer/removeAiPlayer`、`setAutoplay`。
   - 所有发往服务器的操作经 `socket.emit('make move'|'start game'|...)`。
3. 组件树（`components/game/`）：
   - `BoardScreen` 主牌桌：按 `isSpectator` / 座位渲染 `SeatPanel`（每玩家城市+手牌+角色），中央 `CharacterCard` 选角网格，`PlayersList` 大厅队伍预览。
   - `LobbyScreen` 开局确认弹窗（仅 6 人可对战，校验）。
   - `HomeScreen` 房间列表 + 创建，`StatsScreen` 战绩/排行，`AuthPanel` 登录注册。

**关键不变量**：服务器是唯一真相源；客户端 `sendMove` 仅当 `player.id === board.getCurrentPlayerId()` 且未处于 autoplay 时有效，非法 move 服务器返回 error。

---

## 7. 关键业务规则速查

| 规则 | 位置 |
|------|------|
| 仅 6 人 3v3，偶 A 奇 B | `GameState.refreshLobbyTeams` / `setupGame` |
| 完成城大小 = 8 | `GameState.setupGame` |
| 收租被动在取普通资源前可手动收，之后自动收 | `autoCollectEarningsIfPending` |
| 刺客打掉的角色本回合跳过 | `isCharacterPlayable` |
| 被刺角色不可被偷 | `robCharacter` |
| 主教活着时其城区不可被拆 | `destroyDistrict` |
| 已满 8 城的城区受保护不可拆 | `destroyDistrict` |
| 拆毁不能用本回合取金支付 | `goldFromResourcesThisTurn` |
| 排位胜需无有效AI控制 | `saveFinishedMatch` |

---

## 8. 阅读结论与建议

- **架构清晰**：规则全在 `server/src/game/GameState.ts` 一个 1500 行 FSM，配合 `CharacterManager`/`BoardState`/`ChoosingState`；AI 在 `AutoplayPolicy.ts`；客户端零规则。
- **主要复杂度风险点**：
  1. `GameState.step()` 用 `MoveType.AUTO` + `setTimeout(schedulePhase)` 驱动阶段推进，异步时序依赖 `TurnTimer` 心跳重排 —— 调试建议打开 `CITADELS_FAST=1` / `CITADELS_SYNC=1` 加速并内联推进。
  2. 选角色序列 `ChoosingState` 每人数一组硬编码数组，新增人数/规则需同步改两处（数组 + `CharacterManager`）。
  3. 隐藏信息（手牌、角色归属）靠 `exportForPlayer` 的 `canSee`/`turnReached` 推导，任何改动都要回归测试信息泄露。
- **待确认/可能问题**（未要求实现，仅提示）：
  - 7 人模式代码存在但产品定位为 6 人 3v3，`validateGameSetup` 会拒绝非 6 人 —— 7 人路径实际不可达。
  - `CITADELS_SYNC` 全局开关影响所有房间相位推进方式，生产环境需确认。
