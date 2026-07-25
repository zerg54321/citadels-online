# 测试说明（vitest）

> 本文档说明项目中所有测试文件的作用、所在包、运行逻辑，以及日常与评估两种场景下的 vitest 使用方法。

---

## 1. 总览

项目分两个测试根，各自独立配置 vitest，互不依赖：

| 包 | 配置文件 | 收录规则 | 测试数量 | 性质 |
|----|----------|----------|:--------:|------|
| `common/` | `common/vitest.config.ts` | `src/**/*.test.ts` | 6 个 | 纯函数单元测试，毫秒级 |
| `server/` | `server/vitest.config.ts` | `src/**/*.test.ts` | 7 个 | 单元测试 + AI 自对弈评估脚本（部分长跑） |

`client-react/` 目前**无测试**（前端逻辑已抽取到 `common/src/view/`，由 common 测试覆盖）。

两套配置都仅声明 `include`，未设 `environment`（默认 node），未接 DOM/JSOM。所有被测代码均为纯 TS 逻辑，不依赖浏览器环境。

---

## 2. 关键隔离机制（务必了解）

**`server/src/db/database.ts:10`** 检测 `VITEST_WORKER_ID`（vitest 启动 worker 时自动注入，生产环境永远不会设置）：

- 测试运行 → SQLite 路径切换为 `:memory:`，所有用户/对局数据写内存，进程结束即消失，**零磁盘污染、零残留**。
- 生产运行 → 走 `data/citadels.sqlite`（或 `DATABASE_PATH`），完全不受影响。

```ts
const isTest = process.env.VITEST_WORKER_ID !== undefined;
function resolveDbPath(): string {
  if (isTest) return ':memory:';
  ...
}
```

> ⚠️ 因此**严禁**在生产代码里用 `NODE_ENV=test` 判断测试环境——只有 `VITEST_WORKER_ID` 能可靠区分。`NODE_ENV=test` 在生产误设时会静默切到内存库并清空所有数据。

---

## 3. common 测试（纯函数单元测试）

位置：`common/src/view/__tests__/`。被测对象是从 Vue 客户端抽取到 common 的"视图层纯函数"——给定 `ClientGameState`，返回 UI 需要的派生数据，无副作用。

| 文件 | 被测函数 | 覆盖点 |
|------|----------|--------|
| `statusBar.test.ts` | `getStatusBarData` | 每个回合/选角状态 → i18n 键映射、观战与"他人回合"分支、FINISHED/INVALID 兜底、动作列表生成（含魔术师弃牌确认注入 `selectedCards`）。56 测试 |
| `teamScores.test.ts` | `computeTeamScores` | 队伍分数聚合、A/B 队归属、观战视角 |
| `boardLayout.test.ts` | `getTableSlots` / `getMyTeam` / `getRelation` / `getSeatOrder` / `isSpectator` | 6 人 3v3 座位布局、己方/友方/敌方关系判定、观战者按队伍区分（A→ally 蓝 / B→enemy 红，team 缺失时按座位序号奇偶回退） |
| `pricing.test.ts` | `getDistrictDestroyPrice` | 军阀摧毁费用计算（cost-1 折扣、`great_wall` 移除折扣、`haunted_quarter` 等） |
| `parseGameState.test.ts` | `parseGameState` | 服务器原始 JSON → `ClientGameState` 的字段映射、缺省回填、`actionFeed` 透传 |
| `actionFeed.test.ts` | `formatActionFeedLine` | 12 种 `ActionFeedLine.kind`（kill/rob/build/call 等）→ i18n 键映射、角色/区域名解析、空值兜底。16 测试 |

**特点**：每个测试用 `makeBaseState(overrides)` 工厂构造最小 `ClientGameState`，只覆盖被测分支需要的字段，断言 i18n **键**而非中文文案（符合 `i18n.key_convention` 约束）。

---

## 4. server 测试

### 4.1 `game/__tests__/` — 游戏规则单元测试（强断言，秒级）

| 文件 | 被测对象 | 覆盖点 |
|------|----------|--------|
| `ScoreCalculator.test.ts` | `refreshLiveScores` | 基础分=建区成本和、完工奖励（首发+4/后续+2，且须城市≥`completeCitySize`）、五色+3、队伍聚合（偶座=A/奇座=B）、`finalize` 胜负判定（A胜/B胜/平）、幂等（重跑不累加）、空 board 不崩、`dragon_gate` extra_points 修复回归 |
| `PlayerBoardState.test.ts` | `PlayerBoardState` | 建造扣费+手牌→城市、重复/缺金/未知牌失败、`destroyDistrict`、`computeDestroyCost`（cost-1，`great_wall` 保护他人但不保护自己）、角色收入（国王/主教/商人/军阀，`school_of_magic` 万能色仅对收入角色生效）、`computeScore`、`exportForPlayer` 手牌隐藏（`canSeeHand=false` 时 hand 长度保留但值置 null） |
| `moveValidator.test.ts` | `validateMove` | 各 `MoveType` 的 `data` 形状校验：纯无数据型拒绝多余 data、dual-use 型（`DRAW_CARDS`/`ASSASSIN_KILL`/`BUILD_DISTRICT` 等）允许 absent 或特定类型、`WARLORD_DESTROY_DISTRICT` 的 `{player,card}` 结构、`AUTO` 被拒（服务器内部专用） |
| `ChoosingState.test.ts` | `CharacterChoosingState` | 6 人 FSM 状态序列（`INITIAL→PUT_ASIDE_FACE_DOWN→6×CHOOSE_CHARACTER→PUT_ASIDE_FACE_DOWN→DONE` 共 10 态）、`step`/`reset`/DONE 边界不越界、非法人数抛错、6P 只用 `PUT_ASIDE_FACE_DOWN`（无 FACE_UP 变体） |

### 4.2 `engine/` — AI 训练/评估（弱断言，长跑）

> ⚠️ 这一组**本质是"借用 vitest 隔离环境跑自对弈"**：主输出是 `console.log` 统计报告，断言通常只 `expect(finished).toBeGreaterThan(0)`。全量跑会因 100 局对战耗时数分钟到十几分钟。

| 文件 | 作用 | 耗时 | 断言强度 |
|------|------|:----:|:--------:|
| `__tests__/engineConsistency.test.ts` | `TrainingEngine` 与底层 `GameState` 一致性：初始化对齐、`getObservation` 反映底层、`applyAction` 推进状态、30 步 AUTO 不崩、队伍/座次稳定 | 秒级 | 强（真单元测试） |
| `mctsEval.test.ts` | MCTS(A队) vs V2(B队) **50 局**对战，rollout=10/决策，`mctsPickCharacter` 选角 + MCTS 刺杀/偷窃 | ~100s | 弱（出报告） |
| `aiEval.test.ts` | AI 决策详评三用例：①`GameState.clone()` 深拷贝正确性 ②10 局详评（选角偏好/刺杀分布/资源比率/特殊建筑） ③**双策略 100 局** A队V3(MCTS) vs B队V2(排除法)，含选角质量 Top-1/Top-3、审查统计 ④首发硬编码对比 10 局（V3Unforced 无硬编码 vs V3 硬编码，统计 P1/P4 首轮选刺客率） | ~22s + 长跑 | 弱（出报告） |

**评估脚本的取舍**：`mctsEval`/`aiEval` 用 vitest 而非独立脚本，是为了复用 vitest 的 worker 隔离（内存 DB、模块热载）和统一断言框架。代价是 `npm test` 全量跑会很慢——日常开发应按需单文件跑（见第 5 节）。

---

## 5. vitest 使用方法

### 5.1 日常开发（快速反馈）

```bash
# common 纯函数测试（最快，~1s）
npm.cmd test --prefix common
# 或直接
cd common && npx vitest run

# server 规则单元测试（快，~1s，跳过 AI 长跑）
cd server && npx vitest run src/game/__tests__

# server 单个文件
cd server && npx vitest run src/game/__tests__/moveValidator.test.ts

# watch 模式（改代码自动重跑，开发首选）
cd server && npx vitest src/game/__tests__
```

### 5.2 CI / 全量验证（慢）

```bash
# server 全量：先 build common 再跑全部 test（含 AI 长跑，数分钟~十几分钟）
npm.cmd test --prefix server
# 等价于：npm run build --prefix ../common && vitest run
```

`server/package.json` 的 `test` 脚本会先重建 common（确保类型同步），再 `vitest run` 收录全部 `src/**/*.test.ts`，**包括 100 局双策略对战**。

### 5.3 AI 评估（看报告）

评估脚本的 `console.log` 报告默认不显示，需加 `--reporter verbose`：

```bash
# 双策略 100 局对战报告
cd server && npx vitest run src/engine/aiEval.test.ts --reporter verbose

# MCTS vs V2 50 局报告
cd server && npx vitest run src/engine/mctsEval.test.ts --reporter verbose

# 只跑 aiEval 里的某个用例（按测试名过滤）
cd server && npx vitest run src/engine/aiEval.test.ts -t "双策略对战"
```

### 5.4 长跑超时

评估用例用 `{ timeout: 600000 }` 选项声明单测最长 10 分钟（见 `aiEval.test.ts:484`）：

```ts
it(`双策略对战 ${BATTLE_GAMES} 局 ...`, { timeout: 600000 }, () => { ... });
```

若调大 `BATTLE_GAMES` 或 rollout 次数导致超时，需同步调大 `timeout`。

---

## 6. 写新测试的约定

1. **位置**：放 `*.test.ts` 到被测模块的 `__tests__/` 子目录或同目录，vitest 按 `include` 自动收录，无需注册。
2. **导入**：`import { describe, it, expect } from 'vitest';`
3. **DB 测试**：server 端测试自动用内存 SQLite，无需手动 mock；但若测的是 DB 层本身（如 `users.ts`），注意每个 `it` 间状态会累积（内存库跨用例不重置），需要时用 `beforeEach` 清表或用唯一用户名隔离。
4. **断言 i18n 键而非文案**：common 视图测试验证返回的 `ui.game.messages.*` 键，不验证中文字面量（约束 `i18n.key_convention`）。
5. **评估脚本**：新增 AI 评估用例时，遵循现有模式——`createGame()` 工厂、`while (steps < MAX && progress !== FINISHED)` 主循环、`console.log` 出报告、末尾 `expect(finished).toBeGreaterThan(0)` 兜底、设 `timeout`。

---

## 7. 已删除 / 历史文件

| 文件 | 状态 | 说明 |
|------|:----:|------|
| `server/src/engine/diag.test.ts` | ❌ 已删 2026-07-25 | 一次性诊断脚本（跑 1 局 `pickV3` 只断言"能跑完"），用于排查 `forceAssassin` 硬编码不生效。bug 已修，诊断使命完成。原 AI_ROADMAP 计划将其升级为回归守卫，已取消——该需求改由 `aiEval.test.ts` 的「首发硬编码测试」用例覆盖。 |
| `server/src/engine/{smoke,smoke2}.test.ts` | 已删（更早） | 早期冒烟测试，已被 `engineConsistency.test.ts` 取代 |
| `server/src/game/__tests__/_envcheck.test.ts` | 已删（更早） | 环境检测探针，验证 `VITEST_WORKER_ID` 隔离机制后移除 |

> vitest 的结果缓存（`node_modules/.vite/vitest/.../results.json`）可能仍残留这些文件的旧记录，属正常现象，不影响运行。
