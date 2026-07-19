# 代码整改计划

> 适用场景：内部朋友小圈子线上游戏，不对外商用，不涉及高并发或安全防护。
> 目标：提升代码可维护性，减少潜在 Bug，降低后续开发门槛。

---

## 概览

| 阶段 | 名称 | 预计工时 | 条目数 |
|------|------|---------|--------|
| 一 | 紧急修复 | 2–3h | 3 |
| 二 | 代码质量 | 6–8h | 7 |
| 三 | 架构改进 | 10–14h | 8 |
| 四 | 测试与工程化 | 4–6h | 3 |

---

## 阶段一：紧急修复（Bug 修复）

### 1.1 `CharacterType` 枚举重复定义 —— 统一 ✅ 已完成

**问题**：`common/src/index.ts:58` 定义了 `CharacterType`（0-based, NONE=0），而 `server/src/game/CharacterManager.ts:4` 又定义了另一个 `CharacterType`（-1-based, NONE=-1）。两套枚举混用极易导致 off-by-one 错误。

**涉及文件**：
- `common/src/index.ts`
- `server/src/game/CharacterManager.ts`
- `server/src/game/GameState.ts`
- `server/src/game/AutoplayPolicy.ts`
- `server/src/game/PlayerBoardState.ts`
- `server/src/engine/trainingEngine.ts`
- `client/src/store/index.ts`

**处理方案**：
1. 从 `common/src/index.ts` 中**删除** `CharacterType` 枚举（它与 `CharacterManager.ts` 的版本不一致，且客户端不需要它作为独立枚举）
2. 将 `server/src/game/CharacterManager.ts` 中的 `CharacterType` 枚举通过 `common` 重新导出（或在 common 中定义为唯一来源，server 和 client 都引用它）
3. 全局搜索替换，确保所有文件引用同一个 `CharacterType` 枚举
4. 将 `CharacterType.NONE = -1` 改为 `undefined` 或常量 `NO_CHARACTER`，避免与 0-based 索引混淆

**注意**：`common/src/index.ts` 中的 `CharacterType` 是 1-based 的（NONE=0, ASSASSIN=1...），被客户端 `store/index.ts` 的 `getDestroyPrice` 和 `BoardScreen.vue` 的角色展示使用。需确认客户端使用的场景后统一迁移。

---

### 1.2 Socket 事件处理器添加异常保护 ✅ 已完成

**问题**：`server/src/socket/server.ts` 中大部分事件处理器没有 try/catch。若 `GameState.step()` 抛出异常，将导致未捕获错误，可能使 socket 连接异常断开。

**涉及文件**：`server/src/socket/server.ts`

**处理方案**：
1. 为每个 `socket.on(...)` 回调添加 try/catch 包裹
2. 在 catch 中调用 `callback({ status: 'error', message: 'internal server error' })`
3. 使用 `console.error` 打印完整错误栈，便于调试

**示例**：
```ts
socket.on('make move', (move: Move, callback) => {
  try {
    const room = gameStore.findRoom(socket.roomId);
    // ... existing logic ...
  } catch (err) {
    console.error('[make move] unexpected error', err);
    callback({ status: 'error', message: 'internal server error' });
  }
});
```

---

### 1.3 `ChoosingState` 7P 的 `GET_ASIDE_FACE_DOWN` 步骤处理不一致 ✅ 已完成

**问题**：`ChoosingState.ts` 的 7P 流程包含 `GET_ASIDE_FACE_DOWN` 步骤，但 `CharacterManager.autoSpectatorAside()` 中该步骤的处理逻辑与 `ChoosingState.step()` 抛出 `new Error('cannot step further')` 存在不一致。当到达 `DONE` 状态后继续调用 `step()` 会抛异常。

**涉及文件**：
- `server/src/game/ChoosingState.ts`
- `server/src/game/CharacterManager.ts`

**处理方案**：
1. `ChoosingState.step()` 中，当 `stateNumber` 已到达最后一个状态（`DONE`）时，不应抛异常，而是静默返回（no-op），与其他状态机行为一致
2. 确认 `autoSpectatorAside()` 中 `GET_ASIDE_FACE_DOWN` 的处理是否完整（当前将一张暗置牌移回待选区，这一步正确）

---

## 阶段二：代码质量（拆分大文件 + 消除坏味道）

### 2.1 `GameState.ts` 拆分（1571 行）

**问题**：`server/src/game/GameState.ts` 承担了过多职责：FSM 状态转换、选角、资源获取、建造、刺杀、偷窃、换牌、拆毁、计分、动作日志、回合管理。是典型的 God Class。

**涉及文件**：`server/src/game/GameState.ts`

**处理方案**：按职责拆分为以下文件（均在 `server/src/game/` 下）：

| 新文件 | 职责 | 从 GameState 移出的方法 |
|--------|------|----------------------|
| `ActionExecutor.ts` | 所有 move 执行逻辑 | `gatherResources`, `executeAction`, `buildDistrict`, `killCharacter`, `robCharacter`, `moveRobbedGold`, `exchangeHand`, `discardCards`, `takeOneGold`, `drawTwoCards`, `destroyDistrict`, `recoverFromGraveyard`, `canRecoverFromGraveyard`, `doSpecialAction`, `decline`, `chooseDistrictCard`, `autoCollectEarningsIfPending` |
| `ScoreCalculator.ts` | 计分逻辑 | `refreshLiveScores`, `computeScores` |
| `ActionLogger.ts` | 动作日志 | `pushAction`, `playerName`, `roleNameZh`, `districtLabelZh`, `logCharacterCall`, `buildRoundSummary`, `DISTRICT_NAMES_ZH` |
| `GameFlowController.ts` | 阶段流转 + 角色回合调度 | `step` 中 AUTO 分支、`finishTurnPhase`、`onCharacterTurnStart`、`giveCrownToKing`、`applyCharacterTurnStartPassives`、`ownerOfRole` |

**保留在 `GameState.ts`**：
- 玩家管理（`addPlayer`, `removePlayer`, `addAiPlayer` 等）
- 状态查询（`getStateFromPlayer`, `needsActionTimer`, `refreshTurnDeadline` 等）
- Observer 模式（`attach`, `detach`, `notify`）
- 游戏设置（`setupGame`, `validateGameSetup`）

**拆分原则**：
- 新类通过构造函数接收 `GameState` 引用（或接收 `BoardState` + `players` 等必要数据）
- `step()` 方法将具体操作委托给 `GameFlowController` 和 `ActionExecutor`
- 逐步迁移，每次迁移一个模块并验证功能正常

---

### 2.2 `BoardScreen.vue` 拆分（877 行）

**问题**：游戏主界面组件过大，包含结算弹窗、操作面板、角色顺位、动作日志等所有 UI。

**涉及文件**：`client/src/components/game/BoardScreen.vue`

**处理方案**：拆分为以下子组件（均在 `client/src/components/game/` 下）：

| 新组件 | 职责 | 从 BoardScreen 移出 |
|--------|------|-------------------|
| `EndGameModal.vue` | 结算弹窗（含计分表格） | 第 222–290 行模板 + `endTitle`, `endSubtitle`, `endHeaderClass`, `endScoreRows`, `matchSummary`, `isWin`, `isLose` computed + `dismissEndModal`, `backToLobby` 方法 |
| `ActionPanel.vue` | 底部操作面板（按钮 + 计时器 + 自动托管） | 第 159–194 行模板 + `isPrimaryAction`, `sendMove`, `toggleAutoplay`, `countdownText`, `countdownUrgent` computed |
| `TurnOrderBar.vue` | 顶部角色顺位条 | 第 18–34 行模板 + `turnOrderChips` computed |
| `ActionLog.vue` | 右侧动作日志 | 第 198–218 行模板 + `displayActionFeed` watch |
| `CenterPanel.vue` | 中央角色选择区 | 第 60–105 行模板 + `centerTitle`, `centerCharacters`, `asideChips`, `showCenterCharacterGrid`, `showGraveyard` computed + `onCenterCharacterClick` 方法 |

**Props/Events 设计**：
- `EndGameModal`：props `{ show, gameState, selfId, isSpectator }`，events `{ close, leave }`
- `ActionPanel`：props `{ actions, countdown, countdownUrgent, isAutoplay, busy }`，events `{ action, toggle-autoplay }`
- `TurnOrderBar`：props `{ chips }`
- `ActionLog`：props `{ feed }`
- `CenterPanel`：props `{ characters, aside, graveyard, mode }`，events `{ select-character }`

---

### 2.3 Vuex Store 拆分（500 行） ✅ 已完成

**问题**：`client/src/store/index.ts` 包含 auth、game、chat、socket 所有逻辑。

**涉及文件**：`client/src/store/index.ts`

**处理方案**：拆分为 Vuex modules（在 `client/src/store/` 下）：

```
client/src/store/
├── index.ts          # createStore + 组合 modules
├── modules/
│   ├── auth.ts       # authToken, authUser, login/register/logout/updateDisplayName
│   ├── game.ts       # gameState, gameSetupData, selectedCards, currentRoomId, createRoom/joinRoom/leaveRoom/startGame/sendMove/setAutoplay
│   ├── chat.ts       # chatMessages, sendChat
│   └── socket.ts     # 保留 socket 实例 + connect/disconnect/reconnectSocket
```

**auth 模块**：
- state: `authToken`, `authUser`, `authReady`
- getters: `isLoggedIn`, `authUser`, `authToken`, `authReady`
- mutations: `setAuth`, `setAuthReady`
- actions: `initAuth`, `register`, `login`, `logout`, `updateDisplayName`

**game 模块**：
- state: `gameState`, `gameSetupData`, `selectedCards`, `currentRoomId`
- getters: 所有游戏相关 getter
- mutations: `setGameState`, `resetGameState`, `setCurrentRoomId`, `addPlayer`, `removePlayer`, `setPlayerOnline`, `prepareGameSetupConfirmation`, `setSelectedCards`
- actions: `createRoom`, `getRoomInfo`, `joinRoom`, `rejoinCurrentRoom`, `leaveRoom`, `leaveRoomSilent`, `startGame`, `sendMove`, `setAutoplay`, `setLobbyRole`, `reorderLobbySeat`, `addAiPlayer`, `removeAiPlayer`

**chat 模块**：
- state: `chatMessages`
- mutations: `addChatMessage`, `clearChatMessages`
- actions: `sendChat`

---

### 2.4 魔法数字替换为命名常量 ✅ 已完成

**问题**：代码中散布硬编码数字，降低可读性。

**涉及文件**：`server/src/game/GameState.ts`, `server/src/game/CharacterManager.ts`, `server/src/game/AutoplayPolicy.ts`

**处理方案**：

**GameState.ts**：
```ts
// 当前
DISTRICTS_TO_BUILD = [1, 1, 1, 1, 1, 1, 3, 1]  // 对应 ASSASSIN~WARLORD

// 改为
const DEFAULT_BUILD_COUNT_PER_CHARACTER: Record<CharacterType, number> = {
  [CharacterType.ASSASSIN]: 1,
  [CharacterType.THIEF]: 1,
  [CharacterType.MAGICIAN]: 1,
  [CharacterType.KING]: 1,
  [CharacterType.BISHOP]: 1,
  [CharacterType.MERCHANT]: 1,
  [CharacterType.ARCHITECT]: 3,   // 建筑师可建 3 个
  [CharacterType.WARLORD]: 1,
};
```

**CharacterManager.ts**：
```ts
// 角色税收能力表
const CAN_TAKE_EARNINGS: Record<CharacterType, boolean> = {
  [CharacterType.ASSASSIN]: false,
  [CharacterType.THIEF]: false,
  [CharacterType.MAGICIAN]: false,
  [CharacterType.KING]: true,
  [CharacterType.BISHOP]: true,
  [CharacterType.MERCHANT]: true,
  [CharacterType.ARCHITECT]: false,
  [CharacterType.WARLORD]: true,
};
```

**GameState.ts** 中的 `while (guard < 10)`：
```ts
const MAX_CHARACTER_SKIP_ATTEMPTS = 10;
```

**AutoplayPolicy.ts** 中的评分常量：
```ts
// 当前：score += 4; score += 6; 等
// 改为：提取为命名常量
const SCORE = {
  ASSASSIN_BASE: 4,
  ASSASSIN_DENY_SPRINT: 6,
  ENEMY_NEAR_WIN: 5,
  // ...
};
```

---

### 2.5 统一日志输出方式 ✅ 已完成

**问题**：`Room.ts:91` 使用 `console.log`，`GameState.ts` 使用 `debug` 模块，混用导致日志风格不统一。

**涉及文件**：`server/src/gameManager/Room.ts`, `server/src/game/GameState.ts`, `server/src/socket/server.ts`

**处理方案**：
1. 全局替换 `console.log` 为 `debug` 模块调用
2. 保留 `console.error` 用于真正的错误输出（`debug` 在生产环境默认关闭）
3. 在 `Room.ts` 中添加 `const debug = Debug('citadels-server');`

---

### 2.6 `nowIso()` 函数去重 ✅ 已完成

**问题**：`server/src/db/matches.ts:45` 和 `server/src/db/users.ts:23` 各自定义了相同的 `nowIso()`。

**涉及文件**：
- `server/src/db/matches.ts`
- `server/src/db/users.ts`

**处理方案**：
1. 在 `server/src/utils/` 下新建 `dateUtils.ts`
2. 导出 `export function nowIso(): string { return new Date().toISOString(); }`
3. `matches.ts` 和 `users.ts` 改为 `import { nowIso } from '../utils/dateUtils';`

---

### 2.7 减少 `!` 非空断言，增强类型安全 ✅ 已完成

**问题**：`GameState.ts` 中 `this.board!`、`this.board!.playerOrder` 等非空断言大量出现，绕过 TypeScript 类型检查。

**涉及文件**：`server/src/game/GameState.ts`（约 50+ 处）

**处理方案**：
1. 在每个需要 `this.board` 的方法开头添加类型守卫，尽早返回：
```ts
private someMethod() {
  if (!this.board) return false;
  // 此后 this.board 类型自动收窄，无需 !
  const cm = this.board.characterManager;
  // ...
}
```
2. 对于 `this.players.get(playerId)` 的返回值，使用显式检查和提前返回，而非 `!` 断言
3. 此改动可逐步进行，每次修改一个方法

---

## 阶段三：架构改进

### 3.1 `DistrictId` 类型安全强化

**问题**：`common/src/index.ts:7` 中 `DistrictId = keyof typeof districts`，但因 `districts` 来自 JSON 导入，TypeScript 推断为 `{ [key: string]: ... }`，导致 `DistrictId` 退化为 `string`。

**涉及文件**：`common/src/index.ts`, `common/src/districts.json`

**处理方案**：
1. 在 `common/` 下新建 `src/districts.ts`，手动维护 `DistrictId` 联合类型：
```ts
// 从 districts.json 的 key 生成
export type DistrictId =
  | 'manor' | 'castle' | 'palace' | 'temple' | 'church'
  | 'monastery' | 'cathedral' | 'tavern' | 'market' | 'trading_post'
  | 'docks' | 'harbor' | 'town_hall' | 'watchtower' | 'prison'
  | 'barracks' | 'fortress' | 'dragon_gate' | 'university' | 'map_room'
  | 'imperial_treasury' | 'haunted_quarter' | 'school_of_magic'
  | 'keep' | 'great_wall' | 'graveyard' | 'observatory'
  | 'library' | 'laboratory' | 'smithy';
```
2. 在 `index.ts` 中 `export type { DistrictId } from './districts';`
3. 所有使用 `DistrictId` 的地方将获得完整的类型检查和自动补全

---

### 3.2 `ClientGameState.players` 从 `Map` 改为 `Record`

**问题**：`ClientGameState.players` 定义为 `Map`，无法通过 JSON 序列化，导致 `getStateFromPlayer` 中手动转换为数组。

**涉及文件**：`common/src/index.ts`, `server/src/game/GameState.ts`, `client/src/store/index.ts`

**处理方案**：
1. 将 `ClientGameState` 中的 `players` 类型从 `Map<PlayerId, {...}>` 改为 `Record<PlayerId, {...}>`
2. `getStateFromPlayer` 中构造 `Object.fromEntries(this.players)` 或手动构建 Record
3. 客户端 `store/index.ts` 中 `state.gameState.players.get(playerId)` 改为 `state.gameState.players[playerId]`
4. 所有客户端 `players.set()`, `players.delete()` 改为直接属性赋值

**注意**：此改动涉及客户端较多文件（`BoardScreen.vue`, `GameScreen.vue`, `LobbyScreen.vue`, `RoomScreen.vue` 等），需全局搜索 `players.get(` 和 `players.set(` 进行替换。

---

### 3.3 环境变量 `CITADELS_FAST`/`CITADELS_SYNC` 改为配置参数

**问题**：`GameState.ts` 使用全局 `process.env.CITADELS_FAST` 和 `CITADELS_SYNC` 控制阶段延迟，影响所有并发游戏。

**涉及文件**：`server/src/game/GameState.ts`, `server/src/engine/trainingEngine.ts`

**处理方案**：
1. 在 `GameState` 构造函数中添加配置参数：
```ts
constructor(options?: { completeCitySize?: number; fastMode?: boolean; syncMode?: boolean })
```
2. 将 `FAST`/`SYNC` 模块级变量改为实例属性
3. `TrainingEngine` 创建 `GameState` 时传入 `{ fastMode: true, syncMode: true }`
4. 删除全局 `setForceSyncPhases()` 函数，改为 `GameState` 实例方法

---

### 3.4 `TurnTimer` 400ms 轮询改为事件驱动

**问题**：`TurnTimer` 使用 `setInterval(() => this.tick(), 400)` 持续轮询，空闲时也在消耗 CPU。

**涉及文件**：`server/src/gameManager/TurnTimer.ts`

**处理方案**：
1. 移除 `heartbeat` 定时器
2. 在 `GameState.step()` 成功执行后主动调用 `this.getTurnTimer(room).onStateChanged()`
3. 在 `onTimeout()` 触发自动托管后主动调用 `this.onStateChanged()`
4. 保留 `resetDeadlineAfterHumanMove()` 作为外部触发入口
5. 这样 `TurnTimer` 变为完全事件驱动，不再需要轮询

---

### 3.5 服务端动作日志国际化

**问题**：`GameState.ts` 中 `roleNameZh()`、`districtLabelZh()`、`DISTRICT_NAMES_ZH` 以及所有 `pushAction()` 调用全部硬编码中文。

**涉及文件**：`server/src/game/GameState.ts`

**处理方案**：
1. 在 `common/src/` 下新建 `i18n.ts`，定义动作日志模板（中英双语）：
```ts
export const ACTION_LOG_TEMPLATES = {
  zh: {
    build: '{player} 建造了 {district}',
    kill: '{player} 的{role}被刺杀，本轮不能行动',
    rob: '偷窃标记：{role}（行动时夺金）',
    earn: '{player} 自动收租 +{amount} 金',
    destroy: '{player} 拆毁了 {victim} 的 {district}',
    // ...
  },
  en: {
    build: '{player} built {district}',
    kill: "{player}'s {role} was assassinated",
    // ...
  },
};
```
2. 从客户端 `locale` 或用户偏好中获取语言设置
3. `pushAction` 改为接收模板 key 和参数，运行时根据语言渲染

**备选方案**（更简单）：如果当前只需要中文，至少将模板字符串提取到独立文件，不混在 GameState 逻辑中。

---

### 3.6 移除 Vue 3 中的 jQuery 依赖

**问题**：`BoardScreen.vue:750` 使用 `$('#setupConfirmationModal').modal()`，与 Vue 3 响应式体系冲突。

**涉及文件**：`client/src/components/game/BoardScreen.vue`

**处理方案**：
1. 用 Vue 的 `ref` + `v-if` 控制模态框显示/隐藏，替代 jQuery 的 `.modal()` 调用
2. 如果 `setupConfirmationModal` 是 Bootstrap 的模态框，考虑引入 `bootstrap` JS 的 Data API 方式（`new bootstrap.Modal(el)`），或直接使用纯 CSS 实现
3. 完成后从 `package.json` 移除 `jquery` 和 `popper.js` 依赖（如果不再被其他组件使用）

---

### 3.7 移除 `vetur.config.js`，迁移到 Volar

**问题**：`vetur.config.js` 是 Vetur（Vue 2）的配置，项目使用 Vue 3 + Vite。

**涉及文件**：`vetur.config.js`（根目录）

**处理方案**：
1. 删除 `vetur.config.js`
2. 在 `.vscode/settings.json` 中确保使用 Volar（`"volar.takeOverMode.enabled": true` 或禁用 Vetur）
3. 如果团队成员使用 VS Code，推荐安装 `Vue - Official`（原 Volar）扩展

---

### 3.8 `InMemoryGameStore` 添加 `playerId → roomId` 反向索引

**问题**：`findRoomByPlayerId` 每次 O(n) 遍历所有房间。

**涉及文件**：`server/src/gameManager/InMemoryGameStore.ts`

**处理方案**：
1. 添加 `private playerRoomMap = new Map<PlayerId, RoomId>();`
2. 在 `saveRoom` 时更新索引
3. 在 `removeRoom` 和 `removePlayerFromRoom` 时清理索引
4. `findRoomByPlayerId` 改为 O(1)：
```ts
findRoomByPlayerId(playerId: PlayerId) {
  const roomId = this.playerRoomMap.get(playerId);
  return roomId ? this.rooms.get(roomId) : undefined;
}
```

---

## 阶段四：测试与工程化

### 4.1 添加单元测试框架

**问题**：项目无单元测试框架，核心逻辑（计分、选角、建筑效果）无自动化验证。

**处理方案**：
1. 在 `server/` 下安装 `vitest`（与 Vite 生态一致）：
```bash
npm install --save-dev vitest --prefix server
```
2. 在 `server/package.json` 添加 `"test": "vitest run"`
3. 优先编写以下测试：

| 测试文件 | 测试内容 |
|---------|---------|
| `server/src/game/__tests__/PlayerBoardState.test.ts` | 建造、拆毁、计分、税收计算 |
| `server/src/game/__tests__/GameState.test.ts` | 游戏流程、角色选择、刺杀/偷窃逻辑 |
| `server/src/game/__tests__/ChoosingState.test.ts` | 各人数选角流程 |
| `server/src/game/__tests__/DistrictsDeck.test.ts` | 抽牌/弃牌/洗牌 |
| `server/src/db/__tests__/users.test.ts` | 用户注册/登录/验证 |

4. 使用 `better-sqlite3` 的内存模式 (`:memory:`) 作为测试数据库

---

### 4.2 添加 lint 和 typecheck 脚本

**问题**：当前没有统一的 lint 和 typecheck 命令。

**处理方案**：
1. 在根目录 `package.json` 添加：
```json
{
  "scripts": {
    "lint": "npm run lint --prefix common && npm run lint --prefix server && npm run lint --prefix client",
    "typecheck": "npm run build --prefix common && npx tsc --noEmit --prefix server && npx vue-tsc --noEmit --prefix client"
  }
}
```
2. 在 `server/package.json` 添加 `"lint": "npx eslint --ext .ts --ignore-path .gitignore . --fix"`
3. 在 `client/package.json` 已有 `lint` 命令，确认可用

---

### 4.3 添加 Git pre-commit hook（可选）

**问题**：无自动化检查，可能提交有类型错误或 lint 问题的代码。

**处理方案**：
1. 安装 `husky` + `lint-staged`：
```bash
npm install --save-dev husky lint-staged
npx husky init
```
2. 在 `.husky/pre-commit` 中配置：
```bash
npx lint-staged
```
3. 在 `package.json` 中配置：
```json
{
  "lint-staged": {
    "*.ts": ["eslint --fix"],
    "*.vue": ["eslint --fix"]
  }
}
```

---

## 实施建议

- **阶段一必须先做**：这三个 Bug 直接影响游戏正确性，建议集中一次性完成
- **阶段二可分批进行**：每完成一个文件的拆分就验证一次功能，避免大爆炸式重构
- **阶段三可穿插进行**：每个改进项独立，可在日常开发中逐步完成
- **阶段四最后进行**：在代码结构稳定后再添加测试，避免测试随重构频繁修改

---

*文档生成时间：2026-07-20*

---

## 进度记录

| 条目 | 状态 | 完成日期 |
|------|------|---------|
| 1.1 CharacterType 枚举统一 | ✅ 已完成 | 2026-07-20 |
| 1.2 Socket 事件处理器异常保护 | ✅ 已完成 | 2026-07-20 |
| 1.3 ChoosingState.step() DONE 边界修复 | ✅ 已完成 | 2026-07-20 |
| 2.1 GameState.ts 拆分 | ✅ 已完成 | 2026-07-20 |
| 2.2 BoardScreen.vue 拆分 | ✅ 已完成 | 2026-07-20 |
| 2.3 Vuex Store 拆分 | ✅ 已完成 | 2026-07-20 |
| 2.4 魔法数字替换为命名常量 | ✅ 已完成 | 2026-07-20 |
| 2.5 统一日志输出方式 | ✅ 已完成 | 2026-07-20 |
| 2.6 nowIso() 函数去重 | ✅ 已完成 | 2026-07-20 |
| 2.7 减少 ! 非空断言 | ✅ 已完成 | 2026-07-20 |