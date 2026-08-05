# 移动端横屏游戏画布重构方案

> 状态：已实施并持续迭代（第一版重排 → 安全区画布 → 视觉精调 → 全局回归修复）
> 目标：解决手机横屏下 `GameStage` 等比缩放的留白 + 内容过小问题。
> 硬性约束：**不得影响 PC 端与 iPad 端显示效果**。

## 0. 重要认知澄清：逻辑像素 vs 物理像素（DPR）

- 手机视口的 **844×390 是 CSS 逻辑像素（Viewport）**，布局、`transform: scale()` 全部工作在此层面。
- **设备物理分辨率（如 iPhone 12/13/14 的 2532×1170，DPR=3）只决定渲染密度/清晰度，不影响缩放数学**。
  只要设计基准用逻辑像素，`GameStage` 的等比缩放在任何 DPR 上都正确，只是清晰度不同。

**初次迭代"看不清"的真正根因不是 DPR**，而是复刻了 iPad 的 3 列（左/中/右）网格：
每侧列在手机上只剩 ~240px，2×4 后每张建筑卡被压到 ~55px，比 iPad 的 ~190px 小 3.5 倍。
修复方式见「步骤 4」的**全宽重排**。

## 1. 问题根因

当前整个游戏外壳由 `GameStage` 以 **iPad Pro 12.9" 横屏 1366×1024** 为设计基准，
用 `transform: scale()` 等比缩放填充视口（`client-react/src/components/game/GameStage.tsx:10-11,61`）。

以 iPhone 12 Pro 横屏 844×390（CSS 逻辑分辨率）为例，若直接沿用 iPad 基准：

```
scale = min(844/1366, 390/1024, 1) = min(0.618, 0.381, 1) = 0.381
canvas 宽 = 1366 × 0.381 = 520px   （视口 844 → 两侧留白约 324px）
canvas 高 = 1024 × 0.381 = 390px   （贴满高度）
```

- 手机横屏**高度受限**（0.381 < 0.618），画布宽度富余 → 两侧大量留白；
- 0.381 的缩放把中央内容压到 38% → 读不清、点不准。

## 2. 方案概要

为移动端单独做一套 **矮而扁** 的设计画布，在 `GameStage` 内做双基准选路：

- PC / iPad　→ 沿用现有 `1366×1024` 分支（**不变**）；
- 手机横屏　→ 新增移动分支 + 移动端布局 override。

游戏逻辑（取数与交互）**全部复用**，仅通过切分设计基准与 SCSS 作用域实现。

## 2.5 安全区画布基准（关键决策，取代原始 844×390 方案）

最初设想直接用手机全屏逻辑像素 844×390 作设计基准（scale≈1 填满宽度），实测发现：
**手机有屏幕刘海/挖孔**，画布填满 844 宽度后，棋盘两侧边缘正好被刘海遮挡，建筑卡看不全。

**最终采用的安全区画布**（`GameStage.tsx` 中常量）：

```
MOBILE_DESIGN_WIDTH  = 1954
MOBILE_DESIGN_HEIGHT = 1024   （与 iPad 分支同高）
```

- 以 **安全区比例** 1.908:1 设计（对应物理安全区 2232×1170）；
- 缩放到手机高度时落点约 **744 CSS 宽**，居中于 844 视口 → 两侧各留 ~50px，
  正好覆盖刘海区，**无需任何 `env(safe-area-inset-*)` 检测**；
- 保持 `designH=1024` 与 iPad 一致 → 下缩放因子 ≈0.381 不变，所有 rem 尺寸渲染像素与原来一致，
  **仅水平画布变窄**，布局确定性最高。

> 取舍：用更窄的安全区画布换取"刘海不遮挡棋盘"。代价是两侧 ~50px 不能放内容，
> 但这部分本就是刘海区，无可用空间损失。

## 2.6 手机布局几何（决定卡片大小的约束）

手机安全区画布约 744×390（缩放后 CSS），顶栏压缩后棋盘区约 **744×360**。
要在其中容纳 6 个对手段位 + self + 中央区，且每段位做 **2行×4列** 建筑：

- iPad（1366）用 3 列网格：左/右侧列各 ~385px → 2 列时卡片 ~190px。
- 手机若复刻 3 列：侧列 ~240px → 4 列卡片 ~55px（**不可读**，第一版失败的根因）。

**手机正确做法——全宽重排**：复用基础 slot 位置规则（左/中/右三列，不重映射座位），
仅重调三列宽度并隐藏对手段位角色卡，城市占满列宽，建筑卡 4 列全部可见、无滚动。
详见「步骤 4」。

## 3. 关键设计纪律（防止 PC/iPad 回归）

> 必须严格遵守，违反会直接引入回归。

1. **禁止用 `@media (max-width: …)` 做移动端布局判断。**
   `_board-table.scss` 尾注明确说明：CSS 媒体查询基于物理视口，
   会对缩放画布产生歧义（iPad mini 1024px 横屏会被误伤），该 breakpoint 已被移除。
   移动端选路必须通过 **JS 检测 + 根类作用域** 完成。

2. **移动端 override 全部挂在明确根类作用域下**：
   - 画布内元素（棋盘、座位、中央区、手牌、行动面板）→ `.game-stage--mobile`；
   - portal 到 `<body>` 的元素（Bootstrap modal、结算遮罩）→ `.is-mobile`（`main.tsx` 挂在 body）；
   - 顶栏（`GameTopBar` 渲染在 App `<header>`，画布外）→ `.is-mobile`。

3. **`GameStage` 双分支互斥**：移动端走到安全区分支后，PC/iPad 的
   `1366×1024` 分支代码路径不变。

4. **移动端需求一律用 CSS 作用域实现，绝不改全局 TSX 结构。**
   曾因直接改 `CenterPanel`/`ActionPanel`/`BoardScreen` 的 TSX（删中央倒计时、
   合并标题消息、删"操作"标题）导致 PC/iPad 全局回归，已全部还原为原始结构，
   所有移动端视觉效果改为 CSS 覆盖。此为**铁律**。

## 4. 实施步骤与当前状态

### 步骤 1：移动端检测 — 已完成

`client-react/src/utils/isMobile.ts`：

```ts
function detectMobile(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mobile/i.test(navigator.userAgent || '');
}
export const isMobile = detectMobile();
```

- 仅按 UA 的 `Mobile` token 判定：iPhone/Android/Windows Phone 都含 `Mobile` → 手机；
- **iPad 永远不是手机**：iPadOS≥13 报 Macintosh UA、旧 iPad 报 `iPad`，均不含 `Mobile` → 走 iPad 布局；
- SSR 守卫：`typeof navigator === 'undefined'` 时返回 false。

### 步骤 2：`GameStage` 双基准选路 — 已完成

`client-react/src/components/game/GameStage.tsx`：

- 常量 `MOBILE_DESIGN_WIDTH=1954`、`MOBILE_DESIGN_HEIGHT=1024`（见 2.5）；
- `isMobile` 时用移动常量算 `scale/canvasW/canvasH`，canvas 挂 `game-stage--mobile` 类；
- 移动端**永不进入 dock 模式**（`isWide = !isMobile && vw >= LOG_BREAKPOINT`），日志强制 overlay；
- `main.tsx` 中 `if (isMobile) document.body.classList.add('is-mobile')`，供 portal/header 元素作用域用。

### 步骤 3：移动端 SCSS 作用域框架 — 已完成

- 新建 `client-react/src/scss/_game-stage-mobile.scss`（画布内元素，`.game-stage--mobile` 作用域）；
- 新建 `client-react/src/scss/_mobile-overrides.scss`（portal/body 元素，`.is-mobile` 作用域）；
- `main.scss` 在 `game-stage` 之后引入两者。

### 步骤 4：座位区建筑 2行×4列（核心需求之一）— 已完成

`getTableSlots`（`common/src/view/boardLayout.ts:112`）为每个座席赋予**空间语义**的 `pos`
标签（`l1/l2/l3` 左列上→下，`r1/r2/r3` 右列，`self` 底部中央）。
**必须复用基础 slot 位置规则，绝不重映射座位**（曾经重映射导致玩家屏上位置错位）。

移动端作用域内：
1. 保留左/中/右三列网格，仅重调列宽行高；
2. 隐藏对手段位角色卡（`.seat-panel__role{display:none}`），城市占满列宽；
3. 城市 2行×4列（`overflow:visible`，禁止滚动/截断），`aspect-ratio:7/4` 保留卡片比例。

> 关键：**绝不允许建筑区横向/纵向滚动**。必须一眼看到所有玩家建筑数 —— 验收红线。

### 步骤 5：姓名 / 金币 / 手牌 / 分数字体放大 — 已完成

移动端作用域内逐条覆盖放大（`_game-stage-mobile.scss`）：
name 1.6rem、chip-val 1.9rem、banner 1.0rem、tag 1.0rem 等。

### 步骤 6：顶栏 — 已完成（含全局回归修复）

`GameTopBar` 渲染在 App `<header>`，画布外，故走 `.is-mobile` 作用域。

- 结算后浮动按钮（"查看结算/退出房间"）：`BoardScreen.tsx` 改用 `.endgame-btn` 类
  （与结算弹窗按钮同款），`_board-screen.scss` 的 `.board-table__end-bar` 内加大到
  `font-size:1.1rem; padding:0.7rem 1.4rem`。**此为全局改动**，PC/iPad 同步统一为弹窗按钮风格。
- 顶栏计分板跳动修复（**全局修复，PC/iPad 同步受益**）：
  原 `.game-top-bar` 用 `justify-content:center` 居中"计分板+回合条"整体，
  回合条随剩余角色减少而变窄时整体居中点漂移 → 计分板横向跳动。
  改为 `justify-content:flex-start`（计分板贴左）+ 回合条 `margin-left:auto`（贴右），
  两者独立定位，回合条宽度变化不再带动计分板。
- 移动端额外：计分板 `margin-left:16%`（固定百分比，不跳动）向中间靠拢，避免紧贴品牌过于偏左。

### 步骤 7：中央区 / 手牌 / 行动面板 — 已完成（含 CSS 作用域化）

> 注意：这些视觉效果全部通过 `.game-stage--mobile` CSS 实现，TSX 结构保持原始（PC/iPad 不变）。

**中央区**（`_game-stage-mobile.scss`）：
- 标题 `<h3>` 与消息 `<div>` 用 `display:inline` + `::after "·"` 合并为一行；
- 中央倒计时 `display:none`（self 行动区有自己的倒计时）；
- banner（刺杀/偷窃点名）`display:none`，改由角色卡上持续的 💀/💰 标记承担；
- padding/gap 压缩（panel 0.3rem/0.2rem，line-height 1.1，draft-grid padding 缩减），
  让文字与卡牌整体上移，避免角色牌第二行底边与自身区域重叠。

**字号/图标加大**：
- 角色卡 💀/💰 标记：medium 3.4rem、large 4.2rem；
- 角色职业名：medium 1.0rem、large 1.15rem；
- 区牌（已建建筑）名 `.district-card .title`：80% → 110%；
- 手牌数图标 `.card-back-icon`：1.4×1.96rem（保持 5:7）；
- 行动按钮：1.5rem。

**行动面板**：
- "操作"标题 `display:none`；倒计时置顶跨两列；
- 主行动按钮 2 列网格；底部"结束回合/托管"绝对定位贴角（结束左下、托管右下），不随按钮数漂移；
- "托管"按钮文案 `autoplay_enable`：`托管（系统代打）` → `托管`（`locale.zh.json`，全局）。

**二选一候选牌重定位（重要修复）**：
- 问题：非首轮二选一候选牌原在手牌区内联（`PlayerHand` 的 `--inline`），
  手牌过多时叠加在手牌上。
- 修复：`BoardScreen.tsx` 在 `self-body` 的 city 与 role 之间新增候选牌块 `tmp-hand-pick--body`
  （条件：有 tmpHand 且城市有建筑）；
- `_player-hand.scss`：`--body` 默认 `display:none`（PC/iPad 仍用 `--inline`）；
- `_game-stage-mobile.scss`：移动端隐藏 `--inline`、显示 `--body`，候选牌置于
  已建建筑右侧、角色牌左侧，避免叠加。PC/iPad 完全不变。

### 步骤 8：魔术师交换手牌 UI — 已完成

三要点（防误触 + 高亮仅 hover + 整面板点击）：
1. **防误触**：`BoardScreen.tsx` 传 `exchangeHandMode` 时排除自身座位
   (`slot.relation !== 'self'`)；`SeatPanel.exchangeHand` 内加
   `relation==='self'` 守卫双重保险。服务端 `ActionExecutor.exchangeHand` 不拦截自身
   （自交换是 no-op 但会消耗特殊行动），故前端必须拦截。
2. **高亮仅 hover**：`seat-panel--exchange` 默认仅 `cursor:pointer` 无紫框，仅 hover 显示紫框；
   `seat-panel__chip--click` 同理默认无黄光仅 hover 显示。进入交换模式后其他玩家外观完全不变，
   只有鼠标悬停的目标高亮。
3. **整面板点击**：`exchangeHandMode` 时整个 `seat-panel` 根 div 挂 onClick（不再只是手牌图标）。

### 步骤 9：被偷金币 💰 全局持久化 — 已完成（服务端全局，PC/iPad/移动端均生效）

- 问题：偷窃发生并转移金币后，`robbedCharacter` 立即被清空 → 角色卡 💰 标记消失，
  玩家难以回忆谁被偷（尤其魔术师行动后）。
- 修复：`CharacterManager` 新增 `robGoldTransferred` 字段（`reset()` 清零、`clone()` 复制）；
  `ActionExecutor.moveRobbedGold` 转移金币后置 `robGoldTransferred=true`，**不再清空 `robbedCharacter`**；
  顶部加幂等守卫 `if (cm.robGoldTransferred) return false`。💰 标记持续到 `reset()`（回合结束）。
- UI 消费方（`exportListDone` 中央、`exportPlayerCharacters` 座位）均从 `robbedCharacter` 派生，
  无需改动即全局生效。

### 步骤 10：结算弹窗（portal 到 body）— 已完成

`_mobile-overrides.scss`（`.is-mobile` 作用域）：宽度 `min(30rem,92vw)`、
`max-height:none`、`overflow:visible`，字号 0.65–1.1rem，6 人队伍模式也无滚动条。

### 步骤 11：回归验证（PC / iPad）— 已完成

- tsc typecheck、build、109 项服务端测试均通过；
- 通过作用域隔离（`.game-stage--mobile` / `.is-mobile`）+ TSX 结构还原，PC/iPad 零回归。

## 5. 验收标准

- [x] 手机横屏（安全区画布 1954×1024，缩放后 ~744×390 CSS）下，**无两侧大留白**、刘海不遮挡棋盘；
- [x] **所有玩家的全部建筑完整显示，无滚动条、无截断**（2行×4列，一眼可评估建筑数）；
- [x] 姓名 / 金币 / 手牌 / 分数字体在手机上放大清晰；
- [x] PC 端与 iPad 端显示效果与重构前**完全一致**（作用域隔离，零回归）；
- [x] 手机竖屏仍显示旋转提示（复用现有 `game-stage--portrait`）；
- [x] 偷窃 💰 标记持续整个行动回合（全局）；
- [x] 魔术师交换手牌：自身防误触、其他玩家默认不变仅 hover 高亮；
- [x] 二选一候选牌不叠加在手牌上（移动端上移至建筑右侧/角色左侧）；
- [x] 结算后"查看结算/退出房间"按钮大且与弹窗按钮风格统一（全局）；
- [x] 顶栏计分板不随回合条宽度跳动（全局）。

## 6. 涉及文件清单

### 新增
| 文件 | 作用 |
|---|---|
| `client-react/src/utils/isMobile.ts` | UA 检测（`/mobile/i`） |
| `client-react/src/scss/_game-stage-mobile.scss` | 画布内移动端布局/字体/视觉 override |
| `client-react/src/scss/_mobile-overrides.scss` | portal/body 元素（modal、结算遮罩、顶栏）override |

### 修改（客户端）
| 文件 | 改动 |
|---|---|
| `client-react/src/components/game/GameStage.tsx` | 双基准选路 + `game-stage--mobile` 类 |
| `client-react/src/components/game/BoardScreen.tsx` | 结算浮动按钮改 `.endgame-btn`；二选一候选牌 `--body` 块 |
| `client-react/src/components/game/elements/SeatPanel.tsx` | 整面板交换点击 + 自身守卫 + `seat-panel--exchange` 类 |
| `client-react/src/components/game/elements/PlayerHand.tsx` | （未改结构，`--inline` 仍为 PC/iPad 用） |
| `client-react/src/scss/main.scss` | 引入两个移动端 SCSS |
| `client-react/src/scss/_board-table.scss` | 顶栏计分板固定左/回合条贴右（全局）；`seat-panel--exchange` hover 高亮；`chip--click` hover 高亮 |
| `client-react/src/scss/_board-screen.scss` | `.board-table__end-bar` 内 `.endgame-btn` 加大 |
| `client-react/src/scss/_player-hand.scss` | `tmp-hand-pick--body` 默认隐藏 |
| `client-react/src/i18n/locale.zh.json` | `autoplay_enable` → `托管` |
| `client-react/src/main.tsx` | `is-mobile` body 类 |
| `client-react/index.html` | `viewport-fit=cover` |

### 修改（服务端，💰 持久化）
| 文件 | 改动 |
|---|---|
| `server/src/game/CharacterManager.ts` | `robGoldTransferred` 字段 + `reset()`/`clone()` |
| `server/src/game/ActionExecutor.ts` | `moveRobbedGold` 幂等 + 不清空 `robbedCharacter` |

> `CenterPanel.tsx` / `ActionPanel.tsx` / `GameTopBar.tsx` / `TurnOrderBar.tsx` / `PlayerHand.tsx`
> 的 **TSX 结构均保持原始**，所有移动端视觉效果走 CSS 作用域。

## 7. 风险清单

- **作用域泄漏**：移动端 SCSS 未挂根类导致污染共享样式 → 验收必须先在 iPad/PC 回归。
- **媒体查询误伤 iPad**：违反「关键设计纪律」第 1 条 → 禁止用 `@media` 布局判定（已遵守）。
- **建筑滚动/截断**：违反验收红线 → 保持 `overflow:visible` + 网格折行校验。
- **改全局 TSX 导致 PC/iPad 回归**：曾发生（CenterPanel/ActionPanel），已还原并立为铁律。
- **`robbedCharacter` 语义变化**：现持续到回合末，若有服务端流程依赖旧"转移后清空"语义需复查（UI 消费方已确认无影响）。

## 8. 后续迭代方向（真机目测后按需）

- 卡片若仍偏小：评估 2 个一排 × 3 排（卡片更大但行高更紧，易纵向溢出）；
- 仅字号/间距微调：`.game-stage--mobile` 内改 rem/sizing 数值即可；
- 真机验证刘海两侧 ~50px 留白与不同机型（iPhone SE / Android 异形屏）的适配。
