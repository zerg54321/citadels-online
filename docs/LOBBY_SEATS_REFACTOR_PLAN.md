# 大厅玩家座位重构方案

> 大厅座位从"紧凑数组无空位"重构为"6 槽含空位 + 拖拽/选座"，让房主自由调整队伍分配与座次，普通玩家可自由选座入位。
>
> 制定日期：2026-08-03
> 关联约束：`ui.landscape_orientation`、`game.autoplay.all_stages`

---

## 1. 背景与目标

### 1.1 现状

- 大厅座位数据结构为 `GameState.lobbyPlayerOrder: PlayerId[]`（`server/src/game/GameState.ts:63`），是**紧凑数组**，无"空位"概念：3 个玩家即长度 3，不存在 1-6 编号的空槽。
- 大厅与游戏内已**解耦**：游戏内座位为 `BoardState.playerOrder`（`server/src/game/BoardState.ts:13`），随国王轮换独立旋转。唯一桥接点是 `setupGame()`（`GameState.ts:381-453`），开局时从 `lobbyPlayerOrder` 过滤出 PLAYER → `stablePlayers` → 随机旋转首发 → `new BoardState(pickOrder)`。
- 队伍由座位奇偶决定：偶数位=A 队，奇数位=B 队（`refreshLobbyTeams()` `GameState.ts:298`）。
- 现有调位能力仅限房主对座位做相邻 ±1 交换（`moveLobbySeat` `GameState.ts:284`，前端 `PlayersList.tsx:141-143` 的 ↑↓ 按钮）。
- 前端 `PlayersList.tsx:37-49` 已按 6 固定槽渲染（A 队 1/3/5、B 队 2/4/6，空位显示占位符），但底层数据是紧凑数组——前端心智模型已就位，数据层未跟上。

### 1.2 目标

1. 房主可拖动任意玩家到任意座位：拖到空位则移动，拖到已占位则两人交换。便于同队/跨队调位。
2. 普通玩家进房后自动分配首空位，可点击任意空位跳过去；坐定后仍可随时拖自己到其他空位。
3. 满 6 人无空位后，普通玩家无操作（无可拖目标，且不可交换他人），房主仍可交换调位。
4. 6 人坐定后房主点开始游戏，**以当前 6 个位置开局，与现在游戏方式完全一致**。

### 1.3 非目标

- 不改游戏内任何流程（`BoardState` / `CharacterManager` / `ActionExecutor` / `TurnTimer` / `ScoreCalculator` / 游戏期 `boardLayout` 分支）。
- 不改队伍归属规则（仍由座位奇偶决定）。
- 不引入"玩家独立选队"——队伍只由座位奇偶派生。
- 不改观战者模型（观战者无座位，不参与拖拽）。

---

## 2. 权限矩阵

| 操作 | 房主 | 普通玩家 |
|------|------|----------|
| 拖自己到空位 | ✅ | ✅ |
| 拖自己到已占位（交换） | ✅ | ❌ |
| 拖他人到空位 | ✅ | ❌ |
| 拖他人到已占位（交换） | ✅ | ❌ |
| 点击空位入座 | ✅ | ✅ |

满 6 人无空位时：普通玩家无可拖目标（无空位 + 不能交换）→ 自然满足"满员后非房主不可调"；房主仍可交换 → 满足"房主可自由调整"。

---

## 3. 数据结构方案

### 3.1 双字段分工（最小侵入）

**保留 `lobbyPlayerOrder` 字段不变，新增 `lobbySeats` 字段**，二者职责分离：

| 字段 | 用途 | 改造 |
|------|------|------|
| `lobbySeats: (PlayerId \| null)[]` | 大厅编辑期（含空位），长度固定 6 | **新增** |
| `lobbyPlayerOrder: PlayerId[]` | 游戏期观战固定座位（紧凑，无空位） | **零改动** |

`setupGame()` 入口：
```ts
const stablePlayers = this.lobbySeats.filter(
  (id): id is PlayerId => id !== null,
);
this.lobbyPlayerOrder = [...stablePlayers];   // 此行及之后全部不变
// ... 后续队伍分配、随机首发、new BoardState(pickOrder) 逐行不变
```

### 3.2 优势

- 游戏期观战分支 `boardLayout.ts:139` 读的仍是 `lobbyPlayerOrder` 紧凑数组 → 零改动。
- `parseGameState.ts:48`、`parseGameState.test.ts`、`boardLayout.test.ts:305`、`ScoreCalculator.test.ts:66` → 零改动。
- 游戏内所有逻辑 → 零改动。
- 实际改动范围从"53 处引用"收窄到 **大厅编辑期约 10 处 + `setupGame` 开头 1 行**。

### 3.3 队伍派生

`refreshLobbyTeams()` 遍历 6 个 slot，非空者按 `slot % 2 === 0 ? A : B` 分队（与原奇偶规则一致）。

---

## 4. 实施清单

### 4.1 服务端（中等）

1. **`common/src/index.ts`**
   - `ClientGameState` 新增 `lobbySeats?: (PlayerId | null)[]`，导出常量 `MAX_LOBBY_SEATS = 6`。
   - 保留 `lobbyPlayerOrder?: PlayerId[]`。

2. **`server/src/game/GameState.ts`**（约 10 处）
   - 新增字段 `lobbySeats: (PlayerId | null)[]`，构造器初始化 `Array(MAX_LOBBY_SEATS).fill(null)`。
   - `clone()`：`gs.lobbySeats = [...this.lobbySeats]`。
   - `addPlayer` / `addAiPlayer`：支持可选 `targetSlot?`；未指定则放首个空槽。
   - 新增 `moveLobbySeat(playerId, targetSlot)`：targetSlot 空 → 移动；已占 → 交换（同一玩家拖到自己原位为 no-op）。
   - 删除旧 `moveLobbySeat(playerId, direction)`。
   - `refreshLobbyTeams()`：遍历 6 slot，非空按奇偶分队。
   - `removePlayer` / `removeAiPlayer` / `setLobbyRole`：在 `lobbySeats` 中把对应 id 置 null / 移入。
   - `getStateFromPlayer()`：导出 `lobbySeats`。
   - `setupGame()`：开头 `stablePlayers = lobbySeats.filter(Boolean)`，其余不变。

3. **`server/src/socket/server.ts`**
   - `reorder lobby seat` 事件 → 改名 `move lobby seat`，payload `{ playerId, targetSlot }`。
   - 权限校验：非房主只能移动自己到空位；房主可移动/交换任意玩家。
   - `join room`：可选 `targetSlot?` 参数（玩家进房选座）。
   - `add ai player`：可选 `targetSlot?`。

4. **`server/src/rooms/routes.ts`**
   - room list 的 `players` 顺序按 `lobbySeats.filter(Boolean)` 输出（与 `getListItem` 一致即可，确认无需改动）。

### 4.2 common/view（小）

1. **`common/src/view/boardLayout.ts:139`**
   - 观战固定座位分支：读 `lobbyPlayerOrder` 不变 → **零改动**。
   - 大厅分支目前不使用 `getTableSlots`（大厅用 `PlayersList` 自渲染），无需适配 `lobbySeats`。

2. **`common/src/view/parseGameState.ts:48`**
   - 解析 `lobbySeats`（新增一行，与 `lobbyPlayerOrder` 并存）。

### 4.3 前端（中上，拖拽为主）

1. **新增依赖** `@dnd-kit/core`（现代、无障碍、触摸友好）。

2. **`client-react/src/store/gameSlice.ts`**
   - `reorderLobbySeat` → `moveLobbySeat({ playerId, targetSlot })`。
   - `joinRoom` params 加 `targetSlot?`。
   - `addAiPlayer` 加可选 `targetSlot?`。

3. **`client-react/src/api/`**
   - socket emit 参数同步。

4. **`client-react/src/components/game/elements/PlayersList.tsx`**（重写交互部分）
   - 移除 ↑↓ 按钮，改用 `DndContext` + `useDraggable`（座位卡）+ `useDroppable`（6 个槽）。
   - `onDragEnd` 逻辑：
     - 目标空位 → `moveLobbySeat(self/other, slot)`。
     - 目标已占位 → 仅房主可触发 `moveLobbySeat(other, slot)`（交换）。
     - 拖到自身原位 → no-op。
     - 无效目标 → 回弹（dnd-kit 默认）。
   - 空位槽支持点击入座（`moveLobbySeat(self, slot)`）。
   - 权限分支：观战者 / 普通玩家对他人座位禁用 `draggable`。
   - 拖拽视觉反馈：源占位、目标高亮。

5. **`client-react/src/components/game/RoomEntryScreen.tsx`**
   - 进房仍自动分配首空位（选座在大厅内完成），无需改入房流程。

6. **`client-react/src/scss/_players-list.scss`**
   - 拖拽态样式（拖起半透明、目标高亮边框、占位虚框）。

### 4.4 测试（小-中）

- 现有测试零改动（见 3.2 优势）。
- 新增服务端单元测试：
  - 空位移动 / 已占位交换 / 拖到自身原位 no-op。
  - 选座入座（指定 `targetSlot`）。
  - 权限拒绝（非房主拖他人、非房主交换）。
  - 满 6 人开局 → `stablePlayers` 顺序与 `lobbySeats` 非 null 顺序一致 → `BoardState.playerOrder` 首发旋转正确。

---

## 5. 风险点

1. **类型变更波及**：`lobbySeats` 为新增字段，不破坏现有 53 处 `lobbyPlayerOrder` 引用。核心改动集中在 `GameState.ts`（约 10 处）+ `parseGameState.ts`（1 处）+ socket 事件。
2. **拖拽边界**：dnd-kit `onDragEnd` 需处理"拖到自身原位"(no-op)、"拖到无效目标"(回弹)，判定逻辑需明确。
3. **并发**：两人同时拖同一空位 → 服务端 `moveLobbySeat` 需校验 `targetSlot` 当前是否为空 / 仍为预期玩家，失败则前端依赖下一次 state push 回滚。
4. **观战者**：无座位，`role === SPECTATOR` 时禁用 `draggable`。

---

## 6. 实施顺序

1. **服务端**：数据结构 `lobbySeats` + `moveLobbySeat` + socket 事件 + 权限（单元测试可独立验证）。
2. **common/view**：`parseGameState` 适配。
3. **前端 store/api**：action 与 emit 参数同步。
4. **前端 PlayersList**：拖拽重构（最耗时）。
5. **样式打磨 + 新增测试**。

---

## 7. 验收标准

- [ ] 房主可拖任意玩家到空位（移动）或已占位（交换）。
- [ ] 普通玩家进房自动入首空位，可点击任意空位换座，可拖自己到空位。
- [ ] 普通玩家不能拖他人、不能与已占位交换。
- [ ] 满 6 人无空位时普通玩家无操作，房主仍可交换。
- [ ] 6 人坐定开局后，游戏内座位顺序、队伍、首发旋转与重构前完全一致。
- [ ] 游戏内全部流程（选角/行动/资源/建造/技能/计时/托管/结算）零回归。
- [ ] 现有测试全部通过，新增座位测试通过。
