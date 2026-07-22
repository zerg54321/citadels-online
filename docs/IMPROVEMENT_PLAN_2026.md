# 优化计划（2026 版）

> 取代 `archive/CODE_IMPROVEMENT_PLAN.md`。原计划 21 项已完成 18 项，剩余项与新增项在此重新排期。
>
> 制定日期：2026-07-21

---

## 1. 项目背景与目标

### 1.1 项目来源

本仓库 fork 自 `antbrl/citadels-online`（2021-2022 年手写代码，Vue 3 Options API + Bootstrap 4）。原作者实现 2-7 人单人模式。本维护者在其基础上：

- 改造为 **6 人 3v3 团队竞技模式**（含 +4/+2 建成加分、队伍结算）
- 新增 **用户战绩系统**（SQLite + JWT）
- 新增 **AI 托管**（AutoplayPolicy）
- 重构 UI

三层架构（common/server/client）与基础游戏逻辑继承自原项目，3v3 规则与战绩/AI 为后加。

### 1.2 真实场景约束

| 维度 | 现状 |
|---|---|
| 部署 | 已上 VPS，基本可玩 |
| 用户规模 | ≤20 人，熟悉的朋友间游戏 |
| 并发 | 同时参与游戏人数极低，无高并发/安全防护需求 |
| 维护方式 | 单人维护，非商业化 |

### 1.3 阶段目标（按优先级）

1. **稳定可玩** —— 不出 bug，完善游戏逻辑
2. **逐步美化 UI** —— 从自娱自乐界面优化到成熟游戏界面，改善用户体验
3. **为未来移动端预留** —— 将来想做 PC 网页 + iPad + iOS 三端互通，现在重构时预先考虑，避免日后走弯路

### 1.4 技术栈现状

| 层 | 栈 | 备注 |
|---|---|---|
| server | Express + Socket.IO + better-sqlite3 + JWT | 服务端权威，框架无关 |
| common | 纯 TypeScript 类型 + 枚举 + `districts.json` | 230 行，零 UI 耦合 |
| client | Vue 3.0.5（全 Options API）+ Vite 2 + Vuex 4 + Bootstrap 4.6 + jQuery（传递依赖） | 维护者不熟 Vue，平时用 Vite+React+shadcn / Next.js |

**关键判断**：服务端和 common 已对任何前端技术栈就绪；client 是维护痛点，将来大概率用 React 重构。因此当前所有重构都应**为 React 重构铺路**：把业务/显示逻辑从 `.vue` 与 Vuex 里抽到 common，使其框架无关。

---

## 2. 核心原则

### 2.1 一条纪律

> **重构时遇到业务/显示纯逻辑，只允许存在于 `common/` 或 `client/` 内的纯 TS 模块，不允许写死在 `.vue` 组件和 Vuex mutation 里。**

理由：

- 将来用 Vite+React+shadcn 重写前端时，`common/` 里的纯函数可原样 `import` 复用
- 逻辑进 common = 重构时不用重新理解业务
- bug 修在 server/common 层 = 重构后不会复活
- 即便将来不重构，代码也更清晰，不亏

### 2.2 砍掉的过度优化项（明确不做）

以下项在原调研中曾列出，但与"≤20 人朋友项目、稳定可玩优先"目标冲突或不抵收益，**明确不做**：

| 项 | 理由 |
|---|---|
| 拆 AutoplayPolicy（861 行 God Module） | AI 能跑即可，纯重构有引入 bug 风险 |
| AutoplayPolicy 魔法数字提取 | 同上 |
| TurnState 改表驱动 | 改动面大，改错即崩；不新增角色，收益为零 |
| `db/matches.ts` DTO 解耦 | 持久化就一处调用，耦合可接受 |
| `LegalMoves` 抽取（TrainingEngine 与 ActionExecutor 去重） | 离线引擎未在用 |
| CI / husky / lint-staged / prettier | 单人维护朋友项目，收益低 |
| tsconfig 共享基线 / 回放 seeded RNG / GameState 继续拆大厅 / 跨平台脚本 / Composition API 全量迁移 | 架构洁癖，与目标无关或冲突 |
| protobuf 协议 / 移动端骨架 / 微服务拆分 | 过早优化 |

### 2.3 推进纪律

- **每改一处，先在 VPS 上验证一局完整 3v3 能跑完，再改下一处**。朋友间游戏，"今晚能开"比"代码漂亮"重要。
- 不追求测试覆盖率，只覆盖"最怕回归的几条路径"。
- 低风险优先，高风险大改暂缓。

---

## 3. 分阶段计划

### 阶段一：防 bug（第一梯队，1-2 天，必做）✅ 已全部完成（2026-07-21）

> 目标：消除真实潜伏 bug，修复 CI/typecheck 基础设施。完成后改动对玩家无感，但能挡住低级错误。

| # | 项 | 位置 | 状态 | 为什么重要 |
|---|---|---|---|---|
| 1.1 | **`make move` 的 `move.data` 输入校验** | `server/src/game/moveValidator.ts`（新增）+ `server.ts:579-626` | ✅ 完成 | 客户端发坏数据会让游戏卡死或崩；按 `MoveType` 分派 validator，失败返回具体字段错误。含双用途 MoveType 语义修正（mode-switch 无 data / 真实动作带 data）。11 个测试组 |
| 1.2 | **TurnTimer 直写 `isAutoplay` 不触发 `refreshTurnDeadline`** | `server/src/game/GameState.ts`（新增 2 方法）+ `TurnTimer.ts` | ✅ 完成 | 新增 `GameState.forceAutoplayForTimeout(id)` / `clearTurnDeadline()`，消除 TurnTimer 5 处直写 GameState 字段 |
| 1.3 | **修复根 typecheck 命令** | `package.json:8` | ✅ 完成 | 根 `typecheck` = common build + server typecheck（绿色门禁）。client 已装 `vue-tsc@3.3.7` 并加 `typecheck` 脚本，但不纳入根门禁（44 个预存 client 类型错误留待 React 重写） |
| 1.4 | **`server test` 加 common 前置构建** | `server/package.json:14` | ✅ 完成 | 改为 `npm run build --prefix ../common && vitest run`，与 server `build` 同模式。此前 common 未 build 时报令人困惑的 "Failed to resolve entry for package" |
| 1.5 | **移除 `socket.onAny` 生产日志** | `client/src/socket/index.ts:10-12` | ✅ 完成 | 包 `if (import.meta.env.DEV)`，Vite 生产构建 tree-shake 掉（实测 prod bundle 不含 onAny） |

**验收**：每项改完本地跑 `npm run typecheck`（绿色）+ VPS 验证一局完整 3v3（已逐项验证通过）。

---

### 阶段二：逻辑抽取到 common + 纯函数单测（2-3 天）✅ 已全部完成（2026-07-21）

> 目标：把维护者将来 React 重构时最想复用的纯逻辑从 Vue/Vuex 里抽到 common，顺手补单测作为"逻辑正确性保护网"与"新前端行为契约"。

#### 抽取原则

- common 新增 `view/` 子目录，仅放**框架无关的纯函数**
- 不引入 Vue/React 概念（不叫 composable、不叫 hook，就叫 function）
- 文案走 i18n 键，不硬编码中文（即便现在只有中文）
- 保留 client 侧薄封装（Vue computed 或未来 React hook），仅做"调用 common + 暴露给模板"

#### 抽取清单与进度

| # | 逻辑 | 当前位置 | 目标位置 | 状态 | 测试数 |
|---|---|---|---|---|---|
| 2.1 | `getStatusBarData(gameState)` | `client/src/data/statusBarData.ts:243` | `common/view/statusBar.ts` | ✅ 完成 2026-07-21 | 56 |
| 2.2 | `liveTeamScores` 计算（含 B 队视角翻转） | `BoardScreen.vue`、`EndGameModal.vue`（重复两处） | `common/view/teamScores.ts` | ✅ 完成 2026-07-21 | 7 |
| 2.3 | `getDistrictDestroyPrice`（含 `CharacterType.BISHOP + 1` 1-based 偏移） | `client/src/store/modules/game.ts` | `common/view/pricing.ts` | ✅ 完成 2026-07-21 | 12 |
| 2.4 | `parseGameState` 字段兜底 | `client/src/api/index.ts:7-21` + `client/src/socket/index.ts:51-68`（重复两处） | `common/view/parseGameState.ts`（`parseClientGameState`） | ✅ 完成 2026-07-21 | 13 |
| 2.5 | `relationOf` / `seatOrder` / `tableSlots` 等纯函数 computed | `client/src/components/game/BoardScreen.vue` | `common/view/boardLayout.ts` | ✅ 完成 2026-07-21 | 22 |

> 图例：✅ 完成 / 🔄 进行中 / ⬜ 待做

#### 纯函数单测目标

为 2.1–2.5 抽出的函数补 vitest 单测（common 独立 vitest 配置，纯内存无 DB）：

| 测试文件 | 覆盖内容 | 状态 |
|---|---|---|
| `teamScores.test.ts` | A/B 队视角翻转、权威值 vs 兜底求和、显式零、NONE 队跳过、孤儿 pid | ✅ |
| `pricing.test.ts` | keep 不可拆、主教保护/被杀、great_wall 折扣、完成城市保护、cost 下限钳位 | ✅ |
| `parseGameState.test.ts` | 必填字段透传、可选字段默认值、null/string/number 拒绝、board 兜底 | ✅ |
| `statusBar.test.ts` | 各 turnState 文案 | ✅ |
| `boardLayout.test.ts` | 旁观者检测、队伍关系、座位旋转、6 人桌布局、crown/pickOrder | ✅ |

**收益**：将来 React 重构后，跑一遍这套测试即可确认逻辑没回归。

#### 已完成项详情

##### 2.2 `liveTeamScores` → `computeTeamScores`（2026-07-21）

**新增**
- `common/src/view/teamScores.ts` —— `computeTeamScores(gs): {A, B}` 纯函数
- `common/src/view/__tests__/teamScores.test.ts` —— 7 个单测
- `common/vitest.config.ts` —— 限制 vitest 只扫 `src/**/*.test.ts`，避免误扫 dist
- `common/tsconfig.build.json` —— build 专用，exclude 测试文件（dist 不含 test）
- `common/package.json` —— 加 `"test": "vitest run"` + `vitest@^4.1.10` devDep + build 指向 `tsconfig.build.json`
- `common/.eslintrc.json` —— 关 `import/prefer-default-export`（与 named re-export 架构冲突）+ ignore `vitest.config.ts`/`dist/`

**修改**
- `common/src/index.ts` —— re-export `computeTeamScores`
- `common/tsconfig.json` —— 恢复 include 全部 src（给 IDE/eslint），build 用单独 config
- `client/src/components/game/BoardScreen.vue` —— `liveTeamScores` computed 改调纯函数（24→7 行），保留视角翻转+标签
- `client/src/components/game/EndGameModal.vue` —— 同上（21→8 行）

**验收**：common 7 测试 + server 17 测试全绿；根 typecheck 门禁绿；client `vite build` 成功。

##### 2.3 `getDistrictDestroyPrice`（2026-07-21）

**新增**
- `common/src/view/pricing.ts` —— `getDistrictDestroyPrice(gs, playerId, districtId): number` 纯函数
  - 返回 `-1` 表示不可拆：keep / gs 缺失 / 玩家不存在 / 城市已完成 / 玩家是主教且主教未死
  - 否则 `max(cost - discount, 0)`：discount=1 正常 / discount=0 当玩家有 great_wall 且目标非 great_wall
  - 1-based 偏移 `CharacterType.BISHOP + 1` 集中于此一处（client 视角）
- `common/src/view/__tests__/pricing.test.ts` —— 12 个单测：keep / gs 缺 / 玩家缺 / 完成城市 / 主教活保护 / 主教被杀可拆 / 普通 cost-1 / great_wall 自身 cost-1 / great_wall 保护其他全价 / cost 钳位 0 / callable 缺主教条目（默认未死）/ 非主教玩家不受主教活保护

**修改**
- `common/src/index.ts` —— re-export `getDistrictDestroyPrice`（带 `import/no-cycle` 抑制注释）
- `client/src/store/modules/game.ts` —— getter 改调纯函数（24→5 行），移除未用的 `CharacterType` import 和 `getters: any` 参数

**验收**：common 19 测试 + server 17 测试全绿；server typecheck 绿；client `vite build` 成功；common lint 剩 1 个预存 `import/extensions`（非本次引入）；client game.ts lint 无新增问题（预存 CRLF/no-unused-vars/no-shadow 不变）。

##### 2.4 `parseGameState` → `parseClientGameState`（2026-07-21）

**发现的问题**：原 `parseGameState`（`api/index.ts`，join 路径）与 `update game state` 内联解析（`socket/index.ts`，实时更新路径）是**两份重复逻辑且已漂移**——join 路径丢弃了 `turnDeadlineAt`、`lastRoundSummary`、`lobbyPlayerOrder`、`actionFeed` 4 个字段，导致加入房间后到首次状态更新之间这些字段为 undefined。

**新增**
- `common/src/view/parseGameState.ts` —— `parseClientGameState(data: unknown): ClientGameState` 纯函数
  - `data` 非对象时抛清晰错误（`"expected a non-null object"`），替代下游 `"cannot read property of undefined"`
  - 必填字段（`progress`/`gameMode`/`players`/`self`/`board`/`settings`）原样透传，信任服务端复杂嵌套结构（不做深度校验，避免过度工程）
  - 可选字段统一默认：`turnDeadlineAt`→`null`、`lastRoundSummary`→`null`、`lobbyPlayerOrder`→`[]`、`actionFeed`→`[]`；`teamScores`/`matchResult` 透传（undefined 是有意义的"未设定"状态）
  - `board.players` 缺失时默认 `{}`，防止旧调用点 `gs.board.players[pid]` 直接索引崩溃
- `common/src/view/__tests__/parseGameState.test.ts` —— 13 个单测：必填透传 / 可选默认 / 可选透传 / board.players 兜底 / board 子字段保留 / 显式 null / 空数组 / null·string·number·undefined 拒绝 / board 缺失兜底

**修改**
- `common/src/index.ts` —— re-export `parseClientGameState`（`import type` 避免运行时循环）
- `client/src/api/index.ts` —— 删除本地 `parseGameState`（15 行），2 处调用改用 `parseClientGameState`（修复 join 路径丢字段问题）
- `client/src/socket/index.ts` —— `update game state` 内联 18 行对象构造改为 1 行 `parseClientGameState(data)` 调用

**验收**：common 31 测试 + server 17 测试全绿；根 typecheck 门禁绿；client `vite build` 成功；common lint 无新增（仅预存 `import/extensions`）；client 两文件 lint 无新增（仅预存 CRLF + `no-console` 警告）。

##### 2.5 `relationOf` / `seatOrder` / `tableSlots` → `boardLayout.ts`（2026-07-21）

**新增**
- `common/src/view/boardLayout.ts` —— 5 个纯函数 + 2 个类型导出
  - `isSpectator(gs)` — 旁观者检测（role=SPECTATOR 或不在 playerOrder）
  - `getMyTeam(gs, spectator)` — 自己的队伍（旁观者返回 null）
  - `getRelation(gs, pid, spectator)` — `'self'|'ally'|'enemy'` 关系判定（含旁观者按座位奇偶分组的兜底）
  - `getSeatOrder(gs, spectator)` — playerOrder 旋转使自己排首位
  - `getTableSlots(gs, spectator)` — 完整 6 人桌座位布局（5 个对手槽 + 位置/pickOrder/relation/board/crown）
  - 类型：`Relation`、`TableSlot`
- `common/src/view/__tests__/boardLayout.test.ts` —— 22 个单测：旁观者 3 态 / 队伍 3 态 / 关系 5 分支 / 座位旋转 4 态 / 6 人桌布局 7 项（槽位数/位置/crown/pickOrder/relation/旁观者布局/空 board 兜底）

**修改**
- `common/src/index.ts` —— re-export 5 函数 + 2 类型（`import/no-cycle` 抑制）
- `client/src/components/game/BoardScreen.vue` —— 5 个 computed（`isSpectator`/`myTeam`/`relationOf`/`seatOrder`/`tableSlots`）改为调用纯函数（65 行 → 19 行），移除未用的 `PlayerRole`/`MatchResult` import

**验收**：common 54 测试 + server 17 测试全绿；根 typecheck 门禁绿；client `vite build` 成功；BoardScreen lint 无新增（仅预存 object-curly-newline/no-underscore-dangle/no-console）。

##### 2.1 `getStatusBarData` → `statusBar.ts`（2026-07-21）

**新增**
- `common/src/view/statusBar.ts` —— `getStatusBarData(state, options?)` 纯函数 + 4 个类型导出（`StatusBarData`/`StatusBarAction`/`StatusBarMessageType`/`GetStatusBarDataOptions`）
  - 返回 i18n 消息键（如 `ui.game.messages.actions.assassin_kill`），不硬编码中文
  - 覆盖 `CHOOSE_CHARACTERS` 7 态 + `DO_ACTIONS` 15 态 + `INITIAL`/`FINISHED`/兜底 `INVALID_STATE`
  - `getActions` 生成各 turnState 的可用动作列表（take_gold/draw_cards/earnings/laboratory/smithy/各角色技能/build/confirm/cancel/decline）
  - `options.selectedCards` 注入魔术师弃牌确认动作的 `move.data`（剥离原 `store.getters.selectedCards` 直读）
  - **循环依赖处理**：枚举映射改用函数内 `switch`（非 top-level `Record<Enum,...>`），避免模块加载时枚举未就绪
- `common/src/view/__tests__/statusBar.test.ts` —— 56 个单测：progress 兜底 2 / INITIAL 1 / CHOOSE_CHARACTERS 7 态+args+HIGHLIGHTED 9 / 旁观者分支 3 / DO_ACTIONS 15 态+HIGHLIGHTED 16 / TAKE_RESOURCES actions 9 / 角色技能 5 / confirm/cancel 分支 6 / 缺 PlayerBoard 1 / 纯函数无 store 耦合 2

**修改**
- `common/src/index.ts` —— re-export `getStatusBarData` + 4 类型（`import/no-cycle` 抑制）
- `client/src/data/statusBarData.ts` —— 243 行 → 22 行薄封装：调 common 纯函数并注入 `store.getters.selectedCards`，保持原 `getStatusBarData(state)` 签名，两个 `.vue` 调用点零改动
- `client/src/types/gameTypes.ts` —— **删除**（死文件，原 `StatusBarData`/`Action`/`StatusBarMessageType` 已迁入 common，无任何引用）

**验收**：common 110 测试（原 54 + 新 56）+ server 83 测试全绿；根 typecheck 门禁绿；client `vite build` 成功 0 error；改动文件 lint 0 error。

##### Bug 修复：军阀拆队友建筑取消后失去拆建筑能力（2026-07-21）

**根因**：`SeatPanel.vue` 和 `PlayerCity.vue` 的 `chooseCardDestroy` 使用 `window.confirm` 同步阻塞 JS 主线程。阻塞期间排队的 socket 事件在 confirm 关闭后批量处理，与 game state 产生竞态，导致 `turnState` 可能已不再是 `WARLORD_DESTROY_DISTRICT`，拆建筑模式消失。

**修复**：用异步 `AppModal`（`common/Modal.vue`）替代 `window.confirm`，不阻塞主线程：
- `SeatPanel.vue` / `PlayerCity.vue`：加 `pendingDestroy` data 状态；点击队友建筑 → 设 pendingDestroy → 显示 Modal（不阻塞）；确认 → `sendDestroyMove`；取消 → 清除 pending（turnState 不变，可继续拆对手建筑）
- 新增 i18n 键 `ui.game.destroy_confirm_title`（zh: "拆除确认" / en: "Destroy Confirmation"）

**验收**：client `vite build` 成功；两文件 lint 0 错误（仅预存 no-console 警告）。

**阶段二总体验收**：`npm test --prefix common`（110 测试：原 54 + 2.1 新增 56）+ `npm test --prefix server`（83 测试）全绿；根 typecheck 门禁绿；client `vite build` 成功；VPS 验证一局 UI 显示无回归（队伍比分、军阀拆毁费用、加入房间后动作日志/倒计时显示正常、拆队友取消后仍可拆对手、状态栏文案/动作按钮正常）。阶段二 5/5 项全部完成。

---

### 阶段三：核心规则测试（2-3 天，强烈建议）✅ 完成

> 目标：不追求覆盖率，只覆盖"最容易出 bug、且维护者改过"的几条路径。
>
> **范围限定**：只覆盖 3v3 竞技模式（`COMPETITIVE_TEAM6`，6 人强制分队），不考虑 2-7 人个人模式（`CASUAL`）。
>
> **对游戏本身的影响**：无。阶段三只新增测试文件 + 一处 DB 测试隔离改动（`NODE_ENV==='test'` 守卫，生产环境走原路径不受影响）。不改任何游戏逻辑代码。

| # | 测试文件 | 覆盖内容 | 为什么重要 |
|---|---|---|---|
| 3.1 | `server/src/game/__tests__/ScoreCalculator.test.ts` | 3v3 终局计分 + **建成加分（先到 8 加 +4，后到加 +2）** + 队伍结算 + 平局 | **维护者加的 3v3 自有逻辑**，最容易藏 bug |
| 3.2 | `server/src/game/__tests__/ChoosingState.test.ts` | 6 人（3v3）选角 FSM 分支、DONE 边界 no-op | 选角错乱会直接卡死游戏 |
| 3.3 | `server/src/game/__tests__/PlayerBoardState.test.ts` | 建造、拆毁、税收计算、5 色齐全加分（3v3 场景） | 计分基础，错则全盘错 |

#### 3.1 DB 测试隔离

`server/src/db/database.ts:6-8` 加 `NODE_ENV==='test'` 时用 `:memory:`，使将来 DB 测试不污染真实数据（**仅测试环境生效，生产无影响**）：

```ts
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : (process.env.DATABASE_PATH || '...');
```

**验收**：`npm test --prefix server` 含新测试全绿；故意改错一行计分逻辑，测试能抓到。

**完成情况（2026-07-21）**：

- ✅ 3.1 DB 测试隔离：`server/src/db/database.ts` 加测试守卫，仅在 vitest 下用 `:memory:` SQLite（信号用 `VITEST_WORKER_ID`——vitest 自动设置、运维不会设，避免 `NODE_ENV=test` 误入生产导致静默数据丢失）；生产路径不变（提取 `resolveDbPath()` 避免嵌套三元，通过 lint）；激活时 `console.warn` 留明显痕迹。
- ✅ 3.1 `ScoreCalculator.test.ts`（15 测试）：3v3 队伍分配、base 计分、team 聚合、建成 +4/+2、5 色 +3、bonus 叠加、`finalize` 的 TEAM_A_WIN/TEAM_B_WIN/DRAW、无 board 早退、重复调用不重复计分。**发现并固化 1 个已知 bug**：`districts.json` 用 `extra_points`（snake_case）但 `DistrictCard.ts` 读 `extraPoints`（camelCase），`dragon_gate`/`university` 的 +2 从不生效（测试 "dragon_gate contributes cost only" 钉死当前行为，注释标注修复后改 8）。
- ✅ 3.2 `ChoosingState.test.ts`（9 测试）：6P FSM 10 态精确序列、6 个 CHOOSE_CHARACTER 各对 PLAYER_1..6、DONE 边界 step 不越界、reset、6P 仅用 PUT_ASIDE_FACE_DOWN（无 FACE_UP/FACE_DOWN_UP/GET_ASIDE）、非法人数抛错、getState 幂等。
- ✅ 3.3 `PlayerBoardState.test.ts`（42 测试）：建造（扣费/移牌/去重/余额不足/未知卡/边界 cost==stash/连续建造）、手牌增删查、拆毁 + `computeDestroyCost`（great_wall 取消折扣且不保护自身）、`computeEarningsForCharacter`（KING/BISHOP/MERCHANT/WARLORD 按 type 计数 + school_of_magic 通配，**固化 school 对非赚钱角色也 +1 的当前行为**）、`computeScore`（base/+4/+2/+3 叠加 + haunted_quarter 通配色受 final-round 标志控制 + 幂等）、`exportForPlayer` 手牌可见性。

**验证**：`npx vitest run` 5 文件 83 测试全绿（原 17 + 新增 66）；根 `npm run typecheck` 通过；改动文件 lint 0 error/0 warning。**未改动任何游戏逻辑代码**，仅 `database.ts` 加测试隔离守卫 + 3 个新测试文件。

---

### 阶段四：UI 现状审计与美化 ✅ 已完成（2026-07-22，React 重构 + UI 现代化）

> 目标：从自娱自乐界面逐步优化到成熟游戏界面。**不破坏可玩性**为铁律。
>
> **复盘说明（2026-07-21，基于阶段一/二/三已完成）**：阶段二已把 5 个 view 层纯函数（teamScores/pricing/parseGameState/statusBar/boardLayout）抽入 `common/` 并配 110 个单测——这正是当初"为 React 重构铺路"的目标。由此阶段四的 A/C 抉择成本结构已变，见 4.2。
>
> **结果**：4.2 选定 **C 方案（Vite + React 18 + Zustand + React Router + i18next）**，React 客户端全量迁移完成（见 4.4），随后分批完成 UI 现代化（见 4.5）。Vue 客户端 `client/` 保留为遗留参考，`client-react/` 为现役前端。

#### 4.0 前置决策（两项行为怪癖，至今未修，独立于 UI 工作可随时处理）

阶段三测试钉死了 2 项"当前行为怪癖"，二者都影响**结算页 / 得分显示**（阶段四关键页面之一）。美化一个显示错误数字的 UI 是返工，故须先决定"修还是当成房规接受"：

| 怪癖 | 现状 | 影响 | 建议 |
|---|---|---|---|
| `dragon_gate`/`university` 的 +2 从不生效 | `districts.json` 用 `extra_points`（snake）但 `DistrictCard.ts` 读 `extraPoints`（camel），键名不匹配 | 含这两张紫区的城市 `base` 分少算 2/张，结算页与战绩持久化都偏低 | **建议修**（一行：`DistrictCard.ts` 读 `data.extra_points`），修后更新 `ScoreCalculator.test.ts` 的 dragon_gate 期望 6→8 |
| `school_of_magic` 对非赚钱角色也 +1 收入 | `computeEarningsForCharacter` 无条件加 `extraEarnings`，不检查 character 是否为赚钱型 | 刺客/盗贼/魔术师/建筑师轮次若城有魔法学校，UI 会显示可"收取收入"且多 1 金 | 看房规：若按标准规则只有王/主教/商人/军阀收，则**建议修**；若已是本变体房规则则**接受**并补文档 |

> 这两项与阶段四的 UI 工作解耦，可独立先行（修 bug 不算 UI 美化，不违反"不动 Vue"纪律）。

#### 4.1 现状审计（已完成，作为定调依据）

通读 27 个 `.vue` 组件的 template/style，输出视觉与交互问题清单：

- 布局一致性、配色、间距、字号层级
- 响应式（iPad 尺寸适配）
- 加载态、空态、错误反馈
- 关键页面：首页、大厅、对局桌、结算页
- 残留技术债：`App.vue:13,52` 的 Bootstrap 4 `data-toggle`/`data-dismiss`（jQuery 未彻底移除）
- 注：`CenterPanel.vue` / `BoardScreen.vue` 的状态栏逻辑已在阶段二 2.1 抽入 common，逻辑层已干净，审计聚焦其 template/style

#### 4.2 定基调 ✅ 已决策：选 C（React 重构）

| 方向 | 优点 | 缺点 |
|---|---|---|
| **A. 保持 Bootstrap 4 渐进优化** | 风险最低，不破坏可玩 | 视觉天花板低，BS4 已 EOL；与"将来 React 重写"背道而驰，投入可能被丢弃 |
| **B. BS4 之上引入设计系统（如 Naive UI、Element Plus）混合** | 视觉提升明显 | 混用两套样式系统，维护复杂；仍属 Vue 投入，重写时丢弃 |
| **C. 重构为 Vite+React+shadcn** | 维护者最熟，UI 天花板高，与未来移动端（RN）对齐；**阶段二已把业务逻辑抽入 common 并配 110 单测作为行为契约，React 侧直接 import 同一套已测函数，逻辑回归风险大幅降低** | 工作量仍约 1-2 人周（Vuex→状态管理、template→JSX、Bootstrap→shadcn），期间需双跑验证 |

> **复盘后的推荐**：阶段二完成前，C 的主要风险是"重写时把业务逻辑改错且无测试兜底"；现在该风险已被 110 个 common 单测消除，C 剩下的主要是机械式转换工作量。若维护者时间充裕**或**已确定要做移动端，直接走 C；若近期只想让现有界面更好看且不确定移动端时间表，走 A，但接受其投入可能在 React 重写时被丢弃。**注意：A 与"不投资 Vue 技术债"的既定纪律有张力——A 的每次 Vue 美化都是该纪律的例外，需自觉控制范围。**
>
> **实际决策（2026-07）**：选 **C**。技术栈落地为 Vite + **React 18** + **Zustand 5**（替代 Vuex）+ **React Router 6**（`createBrowserRouter`）+ **i18next**（替代 vue-i18n）；保留 Bootstrap 4 网格工具类但视觉组件全部自绘 SCSS。理由：阶段二铺路完成 + 维护者主栈 + 为移动端预留。详见 4.4。

#### 4.3 分批改造（基调确定后）✅ 已完成

- 每次只动 1-2 个高频页面（首页 → 大厅 → 对局桌 → 结算页）
- 改完 VPS 验证可玩再继续
- 新增的任何业务/显示纯逻辑仍须遵循阶段二纪律（入 `common/view/` + 补单测），不在组件 / store 里写死

实际按"先重构后美化"两步走：4.4 完成全量 React 迁移（行为对齐），4.5 在 React 侧分批做视觉现代化。

---

#### 4.4 React 客户端全量迁移（已完成，2026-07，commit 5598287 已推送 origin/main）

> 目标：把 Vue 3（Options API + Vuex + vue-i18n）整套对齐到 React 18，**行为零回归**，复用阶段二抽出的 common 纯函数。

**技术栈映射**

| Vue 侧 | React 侧 | 备注 |
|---|---|---|
| Vue 3.0.5 Options API | React 18 函数组件 + Hooks | |
| Vuex 4 modules（auth/game/chat） | Zustand 5 slices（`@/store` re-export 全部 selector） | selector 须返回稳定引用，派生计算用 `useMemo` |
| vue-router 4 | react-router-dom 6 `createBrowserRouter` + `RouterProvider` | `RoomScreen` 的 `useBlocker` 离开确认需数据路由器 |
| vue-i18n 9 | i18next + react-i18next | 文案走 i18n 键，不硬编码 |
| Bootstrap 4 组件 | 保留 BS4 网格工具类，视觉组件自绘 SCSS | |
| `socket.io-client` | 同（4.x，与服务端主版本对齐） | |

**范围**：`client/src` 下全部 26 个 `.vue` 组件迁移至 `client-react/src/`，分 6 批推进；末批补全 store/api（`authSlice` 新增 login/register/logout/updateDisplayName + initAuth；`gameSlice`/`chatSlice` 对齐）。

**关键纪律（迁移踩坑沉淀，已存入项目 memory）**
- `client_react.early_return_isolation`：React early return 后各分支互相隔离，modal portal 等共享 UI 必须提取为变量在所有 return 分支都渲染，否则跨分支 setState 后弹窗不显示。
- `client_react.zustand_selector_stable_reference`：Zustand selector 禁止 `{...x}` 展开等每次创建新对象，否则 `useSyncExternalStore` 误判快照变化导致无限重渲染。
- `client_react.router_type`：必须 `createBrowserRouter`，因 `useBlocker` 需数据路由器；`App.tsx` 作布局路由用 `<Outlet />`。

**遗留**：Vue 客户端 `client/` 保留为遗留参考，不再投入；部署/开发均以 `client-react/` 为准。

---

#### 4.5 UI 现代化批次（已完成，2026-07-22）

> 在 React 侧分批做视觉现代化，确立**深色中世纪金**设计基调，统一关键页面与组件外观。仅 UI/SCSS/TSX 表现层改动，**未触碰任何游戏逻辑**。

**设计基调（CSS 变量，定义于 `main.scss`）**
- `--bg-void: #0d0b08`（主背景）、`--gold: #d4af37`、`--gold-bright: #f0d77b`、`--parchment: #e8dcc0`（正文）
- `--font-display: Cinzel`（标题）、`--font-body: EB Garamond`（正文）
- BEM 命名；保留 Bootstrap 4 网格工具类，视觉组件自绘

**分批清单**

| 批次 | 页面/组件 | 改动要点 |
|---|---|---|
| 首页 | `HomeScreen.tsx` + `_home-screen.scss` | 卡片网格房间列表（状态点 / 座位填充可视化）、英雄区重设计、特性卡 hover 抬升 |
| 玩家列表 | `PlayersList.tsx` + `_players-list.scss` | 放大玩家名、头像圆环、座位卡、A/B 队分列；根类 `.players-list.card` → `.players-list` |
| 大厅 | `LobbyScreen.tsx` + `_lobby-screen.scss` | 协调式现代设计、模式标签、设置列 / 玩家区 / 聊天区 |
| 战绩 | `StatsScreen.tsx` + `_stats-screen.scss`（新） | 弃 Bootstrap nav-tabs + bg-white 表格，改 CSS-grid 卡片列表、深色主题、结果胶囊；已 import 入 `main.scss` |
| 头部 | `App.tsx` + `_app.scss` | `.header-row` / `.header-brand` / `.header-actions` 布局；`.hdr-link` / `.hdr-btn` / `.locale-select` 统一金色主题类 |
| 语言切换 | `LocaleSelector.tsx` | 原生 `<select>` 改自绘 div 下拉（避免浏览器白色 `<option>`），支持外部点击/ESC 关闭 |
| 认证 | `AuthPanel.tsx` | `.auth-panel--guest` / `.auth-panel--in` BEM 类，`.hdr-btn--gold` / `.hdr-btn--ghost` 按钮 |
| 模态框 | `AuthPanel.tsx` + `App.tsx` + `_app.scss` | About / 登录 / 注册 / Profile 统一用共享深色 `.app-modal` 类，弃 BS4 浅色 `.modal-content text-dark`（决策 `client_react.modal_dark_theme`） |
| 布局修复 | `main.scss` / `_app.scss` / `_board-table.scss` / `BoardScreen.tsx` / `PlayerHand.tsx` | `#app` 固定 `height:100vh`；`html,body` 深色底 + `min-height:100%`；`.body` `flex:1 1 auto; min-height:0; overflow:auto`（`.body--game` 仍 `overflow:hidden`）；棋盘 grid 第 3 行 `1fr→1.5fr`；`__self-role` 固定 `8rem` 防 hand 区跳动；`__self-hand` `min-height:10.5rem`；补 `__self-role-empty` 占位 |

**关键决策**
- `#app` 用固定 `height:100vh`（非 `min-height`），让 flex 子项解析到真实视口高度——防止大厅聊天撑高页面。
- `.body` 内部滚动（`overflow:auto`）容纳长页（战绩、首页）——深色底覆盖，无白边。
- `__self-role` 固定 `8rem`，避免角色卡出现/消失时手牌区跳动。
- 所有模态框共享 `.app-modal` SCSS 类，而非逐 modal 覆写 Bootstrap。

**验收**：`tsc --noEmit` 通过；`vite build` 成功（CSS ~202 kB / JS ~428 kB）；dev server HTTP 200。改动文件 lint 仅预存告警（`StatsScreen.tsx:65` `no-lonely-if`、多处 `no-console`、`PlayersList.tsx` `exhaustive-deps`），无新增 error。

---

## 4. 与旧计划（archive/CODE_IMPROVEMENT_PLAN.md）的关系

### 4.1 旧计划已完成项（18 项，无需再做）

1.1 CharacterType 统一、1.2 Socket 异常保护、1.3 ChoosingState DONE 边界、2.1 GameState 拆分（action/flow/score/log 已拆）、2.2 BoardScreen 拆 5 子组件、2.3 Vuex 拆 modules（auth/game/chat）、2.4 魔法数字（GameState/CharacterManager 部分）、2.5 日志统一、2.6 nowIso 去重、2.7 减少 `!` 断言（服务端）、3.1 DistrictId 类型、3.2 ClientGameState.players Map→Record、3.3 fastMode/syncMode 配置参数、3.4 TurnTimer 事件驱动、3.5 服务端日志国际化、3.6 jQuery 移除（BoardScreen 部分）、3.7 vetur 移除、3.8 InMemoryGameStore 反向索引、4.2 lint 脚本（部分）。

### 4.2 旧计划未完成项在新计划中的去向

| 旧计划条目 | 旧状态 | 新计划去向 |
|---|---|---|
| 4.1 单元测试框架 | ⏳ 待开始 | 实际框架已就绪（vitest 已装、1 个测试已存在），核心测试并入新计划**阶段三** |
| 4.2 lint/typecheck 脚本 | ✅ 已完成 | typecheck 实际损坏，并入新计划**阶段一 1.3** 修复 |
| 4.3 Git pre-commit hook | ⏳ 待开始 | **明确不做**（见 2.2） |

### 4.3 旧计划遗留问题在新计划中的去向

| 遗留问题 | 新计划去向 |
|---|---|
| GameState 仍偏大（529 行，大厅/序列化/委托未拆） | **明确不做**（见 2.2） |
| AutoplayPolicy 魔法数字未提取 | **明确不做**（见 2.2） |
| Socket 事件处理重复样板 | 暂缓，阶段一不动；将来若加新事件再考虑抽 helper |
| ActionExecutor 重复获取当前玩家 | 暂缓，纯样板，无 bug 风险 |
| BoardScreen 与子组件重复计算 | 并入**阶段二 2.2**（抽 teamScores 时顺手消除） |
| 缺少输入验证 | 并入**阶段一 1.1**（make move 校验） |

---

### 阶段五：AI 策略增强 + 评估体系 + 开局流程优化 ✅ 已完成（2026-07-22）

> 目标：提升 AI 决策质量，建立自动化评估体系，优化开局流程提升游戏体验。

#### 5.1 AI 策略重写

重写 `server/src/game/AutoplayPolicy.ts`，核心改动：

| 模块 | 改动 |
|---|---|
| 选角评分 | 全函数加中文注释；保留首发必拿刺客的硬编码（实践验证；后期极端场景可通过软评分自然放掉） |
| 团队保护 | 队友有大量金币时刺客评分 +N（可刺盗贼保护）；队友手牌多时同样加权重 |
| `predictLikelyRoles` 收紧 | 移除魔术师/商人的宽松触发条件（之前导致刺客总是刺魔术师/盗贼总是偷商人）；收紧为只输出高确信预测 |
| 刺杀权重修正 | 魔术师基础威胁分从 1 提到 3，`predictLikelyRoles` 加入手牌多→魔术师的预测（`hc>=3`时） |
| 铁匠铺策略 | 城市有铁匠铺 + 手牌少 → 绝不二选一选牌（2金买 3 张 vs 2金买 1 张），优先拿金后使用铁匠铺 |
| 实验室策略 | 手牌多时主动用实验室卖低价值牌换金 |
| 建筑师联动 | 有实验室时建筑师评分 +4（每轮 2 金 + 2 牌 + 卖 1 无用牌 = 3 金 1 牌，空手起建筑） |
| 收租顺序 | 先建建筑→手动收租→再拿资源，让新建城区参与当轮收租 |
| 军阀摧毁评分 | 拆后余量评分（拆完还能盖→+12，否则→-5）；拆已全色对手 +15；高价值建筑（铁匠铺/实验室/魔法学校）+15 递减；阻止建成 +50/+20 |
| 墓地回收 | 墓地有牌且付得起时回收 |

#### 5.2 AI 自动评估体系

新增 `server/src/engine/aiEval.test.ts`，纯内存跑多局 3v3 AI vs AI，输出详细统计：

- 选角偏好：各角色被选次数 + 首发/中位/末位分布
- 刺杀目标分布：132 次刺杀样本，军阀/商人/建筑师 占主导，魔术师由 0→6 次（修复后）
- 资源决策：拿金 44% / 抽牌 56% 平衡
- 特殊建筑使用率：铁匠铺/实验室/墓地回收统计
- 10 局约 70ms，全完成率 100%

**用法**：
```
npm --prefix server exec vitest run -- --reporter verbose src/engine/aiEval.test.ts
```

#### 5.3 开局流程优化

| # | 改动 | 文件 | 说明 |
|---|---|---|---|
| 1 | 随机首发 | `GameState.setupGame` | Fisher-Yates 洗牌打乱 playerOrder，实现首轮首发玩家随机 |
| 2 | 初始二选一手牌 | `BoardState.ts` + `GameFlowController.ts` + `AutoplayPolicy.ts` | 每人初始抽 2 张到 tmpHand，按 playerOrder 依次选 1 张保留，弃牌放回牌库底，选完后进入选角阶段 |
| 3 | 状态栏适配 | `statusBar.ts` / `locale.*.json` | INITIAL 阶段检测选牌状态显示 `choose_card` 消息 |
| 4 | 点击提示 | `PlayerHand.tsx` | tmpHand 显示区加"点击要保留的牌"提示 |
| 5 | UI 布局修复 | `_board-table.scss` | `__self-city` max-height 5.5→10rem（两行建筑）；`__self-panel` `justify-content: space-between` + `__self-hand` `margin-top: auto` 沉底 |
| 6 | 轮次信息清空 | `GameFlowController.ts` | 选角阶段 INITIAL→PUT_ASIDE_FACE_DOWN 时清除上一轮 `lastRoundSummary`，修复军阀被刺杀后信息不更新 |
| 7 | 防御无限刷屏 | `TurnTimer.ts:134` | 初始选牌阶段 `needsSystemWork()` 返回 false，防止每 40ms `update game state` 推送 |

#### 5.4 实验室费用修正

`ActionExecutor.ts:113` `stash += 2` → `stash += 1`，与标准规则对齐（弃 1 牌换 1 金）。

#### 5.5 测试适配

因随机首发破坏了固定 p1=A 的假设，修复 `ScoreCalculator.test.ts`（动态从 `playerOrder` 推断队伍）和 `engineConsistency.test.ts`（不从外部 GameState 取 playerOrder）。86 测试全绿。

---

## 5. 推进节奏

```
本周：阶段一 5 项（防 bug）—— 1-2 天
下周：阶段二 逻辑抽取 + 纯函数单测 —— 2-3 天
再下周：阶段三 核心规则测试 —— 2-3 天
之后：阶段四 UI 审计 → 定基调 → 分批美化
```

**阶段一/二/三 串行（每步验证后再下一步）；阶段一/二/三 已全部完成（2026-07-21），阶段四已完成（2026-07-22，React 重构 + UI 现代化）。阶段五已完成（2026-07-22，AI 策略 + 评估 + gameplay 优化）。

---

## 6. 变更记录

| 日期 | 说明 |
|---|---|
| 2026-07-21 | 初版。归档旧 `CODE_IMPROVEMENT_PLAN.md`，根据"≤20 人朋友项目、稳定可玩优先、为未来移动端预留"真实场景重新排期，砍掉大量架构洁癖项 |
| 2026-07-21 | 阶段一 1.1 完成：`make move` 输入校验（`server/src/game/moveValidator.ts` + 11 个测试组，含双用途 MoveType 语义修正） |
| 2026-07-21 | 阶段一 1.2 完成：TurnTimer 封装（新增 `GameState.clearTurnDeadline()` / `forceAutoplayForTimeout()`，消除 5 处 TurnTimer 直写 GameState 字段） |
| 2026-07-21 | 阶段一 1.3 完成：修复根 typecheck 命令。决策：根 `typecheck` = common build + server typecheck（绿色门禁，守护正在维护的代码）；client 已装 `vue-tsc@3.3.7` 并加 `typecheck` 脚本，但**不纳入根门禁**——client 有 44 个预存类型错误（非本次引入，属 Vue 代码 `any` 滥用），留待 React 重写时解决。client typecheck 可手动 `npm --prefix client run typecheck` 运行作诊断 |
| 2026-07-21 | 阶段一 1.4 完成：server `test` 脚本加 common 前置构建。改为 `npm run build --prefix ../common && vitest run`（与 server `build` 脚本同模式）。此前 common 未 build 时 `npm test` 报令人困惑的 "Failed to resolve entry for package citadels-common"，现自动重建 common 并通过。保持测试与生产同走 dist（一致性优先于跳过构建的微优化） |
| 2026-07-21 | 阶段一 1.5 完成：移除 `socket.onAny` 生产日志。`client/src/socket/index.ts` 的 `onAny(console.debug)` 包 `if (import.meta.env.DEV)`。Vite 生产构建会 tree-shake 掉（实测 prod bundle 不含 `onAny` / `console.debug('socket:')`），开发环境日志保留。此小节无游戏逻辑改动 |
| 2026-07-21 | 阶段三完成：核心规则测试。3.1 DB 测试隔离（`database.ts` 仅在 `VITEST_WORKER_ID` 存在时用 `:memory:` SQLite，避免 `NODE_ENV=test` 误入生产静默清库；激活时 `console.warn`；生产不变）+ `ScoreCalculator.test.ts`（15 测试，固化 +4/+2 建成加分与队伍结算；发现并钉死 `extra_points`/`extraPoints` 键名不匹配导致 dragon_gate/university +2 失效的已知 bug）；3.2 `ChoosingState.test.ts`（9 测试，6P FSM 10 态序列 + DONE 边界）；3.3 `PlayerBoardState.test.ts`（42 测试，建造/拆毁/税收/计分全路径，固化 school_of_magic 对非赚钱角色也 +1 的当前行为）。共 66 新测试，`npx vitest run` 5 文件 83 测试全绿，根 typecheck 通过，改动文件 lint 0 error。**未改任何游戏逻辑**。代码审查后加固 DB 守卫（改用 vitest 专属信号 + warn）。同时修正本文件背景中"+8/+6 建成加分"的错误描述为 +4/+2 |
| 2026-07-21 | 阶段二 2.1 完成（阶段二至此 5/5 全部完成）：`getStatusBarData` 抽取到 `common/view/statusBar.ts` 纯函数（56 测试），剥离 Vuex `store.getters.selectedCards` 直读改为 `options.selectedCards` 参数注入；client `statusBarData.ts` 243→22 行薄封装保持原签名，两个 `.vue` 调用点零改动；删除死文件 `client/src/types/gameTypes.ts`（类型迁入 common）。枚举映射用函数内 switch 避免 top-level 循环依赖求值。common 测试 54→110，根 typecheck + client build 通过 |
| 2026-07-21 | 阶段四复盘（未启动，仅重排计划）：基于阶段一/二/三已完成重新审视。新增 4.0 前置决策——阶段三钉死的 2 项行为怪癖（dragon_gate/university +2 因 `extra_points`/`extraPoints` 键名不匹配而失效；school_of_magic 对非赚钱角色也 +1 收入）都影响结算页/得分显示，美化前须先定"修还是当房规接受"。4.2 重估：阶段二"为 React 重构铺路"目标已达成（5 纯函数 + 110 单测 = 行为契约），C 方案的"逻辑改错无测试兜底"风险被消除，只剩机械转换工作量；并指出 A 与"不投资 Vue 技术债"纪律的张力。4.1 组件数订正 24→27，标注 CenterPanel/BoardScreen 逻辑层已干净。4.3 "穿插阶段二"改为前瞻纪律 |
| 2026-07-22 | 阶段四完成：4.2 决策选 C（Vite + React 18 + Zustand 5 + React Router 6 + i18next），4.4 React 客户端全量迁移完成（26 个 `.vue` → `client-react/src/`，commit 5598287 已推送，行为零回归，复用 common 纯函数；沉淀 early-return 隔离 / Zustand 稳定引用 / 数据路由器三条迁移纪律入 memory）。4.5 UI 现代化批次完成：确立深色中世纪金设计基调（`--bg-void`/`--gold`/Cinzel+EB Garamond），首页/玩家列表/大厅/战绩/头部/语言切换/认证/模态框分批重设计 + 布局修复（`#app` 固定视口高、`.body` 内滚、`__self-role` 固定高防跳动）；仅表现层改动未触碰游戏逻辑。`tsc --noEmit` 通过、`vite build` 成功、dev server 200。同步归档 `ROADMAP.md`/`DEV_DEPLOY.md`/`DEPENDENCY_BASELINE.md`（内容已被本计划与 README 取代/吸收）并重写根 README 以 React 客户端为准 |
| 2026-07-22 | 阶段五完成：5.1 AI 策略重写（全中文注释、首发必拿刺客、铁匠铺/实验室策略、收租顺序、军阀拆建筑评分重写、predictLikelyRoles 修复、团队保护）；5.2 AI 自动评估体系（`aiEval.test.ts`，10 局 70ms，输出选角/刺杀/资源/特殊建筑统计）；5.3 开局流程优化（随机首发 Fisher-Yates、初始二选一手牌、布局修复、轮次信息清除）；5.4 实验室费用 `stash+=2→+=1`；5.5 测试适配（洗牌导致固定 P1=A 的假设失效→动态推断队伍）。`pickAndApplyAutoplayMove` 已适配 INITIAL 阶段的初始选牌。服务器 `server.ts`/`server-react` 切换至 React 客户端。`server/src/index.ts` CORS 增加 3010。86 测试全绿、typecheck 通过、client-react build 成功 |
