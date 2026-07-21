# 优化计划（2026 版）

> 取代 `archive/CODE_IMPROVEMENT_PLAN.md`。原计划 21 项已完成 18 项，剩余项与新增项在此重新排期。
>
> 制定日期：2026-07-21

---

## 1. 项目背景与目标

### 1.1 项目来源

本仓库 fork 自 `antbrl/citadels-online`（2021-2022 年手写代码，Vue 3 Options API + Bootstrap 4）。原作者实现 2-7 人单人模式。本维护者在其基础上：

- 改造为 **6 人 3v3 团队竞技模式**（含 +8/+6 建成加分、队伍结算）
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
| 2.1 | `getStatusBarData(gameState)` | `client/src/data/statusBarData.ts:243` | `common/view/statusBar.ts` | ⬜ 待做 | — |
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
| `statusBar.test.ts` | 各 turnState 文案 | ⬜ 待 2.1 |
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

##### Bug 修复：军阀拆队友建筑取消后失去拆建筑能力（2026-07-21）

**根因**：`SeatPanel.vue` 和 `PlayerCity.vue` 的 `chooseCardDestroy` 使用 `window.confirm` 同步阻塞 JS 主线程。阻塞期间排队的 socket 事件在 confirm 关闭后批量处理，与 game state 产生竞态，导致 `turnState` 可能已不再是 `WARLORD_DESTROY_DISTRICT`，拆建筑模式消失。

**修复**：用异步 `AppModal`（`common/Modal.vue`）替代 `window.confirm`，不阻塞主线程：
- `SeatPanel.vue` / `PlayerCity.vue`：加 `pendingDestroy` data 状态；点击队友建筑 → 设 pendingDestroy → 显示 Modal（不阻塞）；确认 → `sendDestroyMove`；取消 → 清除 pending（turnState 不变，可继续拆对手建筑）
- 新增 i18n 键 `ui.game.destroy_confirm_title`（zh: "拆除确认" / en: "Destroy Confirmation"）

**验收**：client `vite build` 成功；两文件 lint 0 错误（仅预存 no-console 警告）。

**阶段二总体验收**：`npm test --prefix common`（54 测试）+ `npm test --prefix server`（17 测试）全绿；VPS 验证一局 UI 显示无回归（队伍比分、军阀拆毁费用、加入房间后动作日志/倒计时显示正常、拆队友取消后仍可拆对手）。

---

### 阶段三：核心规则测试（2-3 天，强烈建议）

> 目标：不追求覆盖率，只覆盖"最容易出 bug、且维护者改过"的几条路径。

| # | 测试文件 | 覆盖内容 | 为什么重要 |
|---|---|---|---|
| 3.1 | `server/src/game/__tests__/ScoreCalculator.test.ts` | 终局计分 + 3v3 +8/+6 建成加分 + 队伍结算 + 平局 | **维护者加的 3v3 自有逻辑**，最容易藏 bug |
| 3.2 | `server/src/game/__tests__/ChoosingState.test.ts` | 2-7P 各人数选角 FSM 分支、DONE 边界 no-op | 选角错乱会直接卡死游戏 |
| 3.3 | `server/src/game/__tests__/PlayerBoardState.test.ts` | 建造、拆毁、税收计算、5 色齐全加分 | 计分基础，错则全盘错 |

#### 3.1 DB 测试隔离

`server/src/db/database.ts:6-8` 加 `NODE_ENV==='test'` 时用 `:memory:`，使将来 DB 测试不污染真实数据：

```ts
const dbPath = process.env.NODE_ENV === 'test' ? ':memory:' : (process.env.DATABASE_PATH || '...');
```

**验收**：`npm test --prefix server` 含新测试全绿；故意改错一行计分逻辑，测试能抓到。

---

### 阶段四：UI 现状审计与美化（待启动，需先定基调）

> 目标：从自娱自乐界面逐步优化到成熟游戏界面。**不破坏可玩性**为铁律。

#### 4.1 现状审计（先做）

通读 24 个 `.vue` 组件的 template/style，输出视觉与交互问题清单：

- 布局一致性、配色、间距、字号层级
- 响应式（iPad 尺寸适配）
- 加载态、空态、错误反馈
- 关键页面：首页、大厅、对局桌、结算页
- 残留技术债：`App.vue:13,52` 的 Bootstrap 4 `data-toggle`/`data-dismiss`（jQuery 未彻底移除）

#### 4.2 定基调（需维护者决策）

| 方向 | 优点 | 缺点 |
|---|---|---|
| **A. 保持 Bootstrap 4 渐进优化** | 风险最低，不破坏可玩 | 视觉天花板低，BS4 已 EOL |
| **B. BS4 之上引入设计系统（如 Naive UI、Element Plus）混合** | 视觉提升明显 | 混用两套样式系统，维护复杂 |
| **C. 重构为 Vite+React+shadcn** | 维护者最熟，UI 天花板高，与未来移动端（RN）对齐 | 工作量大（1-2 人周），期间需双跑验证 |

> 推荐：若维护者时间充裕且确定要做移动端，直接走 C；否则走 A，待移动端立项再 C。

#### 4.3 分批改造（基调确定后）

- 每次只动 1-2 个高频页面（首页 → 大厅 → 对局桌 → 结算页）
- 改完 VPS 验证可玩再继续
- 期间穿插阶段二的 common 抽取纪律

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

## 5. 推进节奏

```
本周：阶段一 5 项（防 bug）—— 1-2 天
下周：阶段二 逻辑抽取 + 纯函数单测 —— 2-3 天
再下周：阶段三 核心规则测试 —— 2-3 天
之后：阶段四 UI 审计 → 定基调 → 分批美化
```

阶段一/二/三 串行（每步验证后再下一步）；阶段四待基调确定后启动，可与阶段二/三的 common 抽取穿插。

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
