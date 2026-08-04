# 响应式等比缩放方案

> 取自 2026-07-26 针对 iPad 全系列适配的专项方案。在已完成的 iPad Pro 1366×1024 布局调优（commit `0d639ae`）基础上，解决 iPad Air / mini 等不同宽高比设备下的布局崩塌问题。
>
> 制定日期：2026-07-26

---

## 1. 背景与目标

### 1.1 现状

- iPad Pro 12.9"（1024×1366，横屏 1366×1024）下布局经 `0d639ae` 调优后完美一屏全显。
- 切换到 iPad Air / Pro 11"（834×1194，横屏 1194×834）或 iPad mini（744×1133，横屏 1133×744）后，因宽高比不同，布局再次出现挤压、滚动条。

### 1.2 根因

iPad 系列的逻辑分辨率与宽高比并非成比例放大：

| 设备 | 逻辑分辨率（竖屏） | 横屏视口 | 宽高比 |
|------|-------------------|----------|--------|
| iPad Pro 12.9" | 1024 × 1366 | 1366 × 1024 | 1.333 |
| iPad Air 10.9" / Pro 11" | 834 × 1194 | 1194 × 834 | 1.432 |
| iPad mini 8.3" | 744 × 1133 | 1133 × 744 | 1.522 |

传统的 `px` 绝对单位或 `vh/vw` 无法应对宽高比差异，必然导致空间不够或挤压叠层。

### 1.3 目标

整个棋盘界面在 iPad Pro / Air / mini 及各种 PC 浏览器上**永远精准一屏全显、等比例伸缩**，核心游戏区绝不出滚动条、不乱套。

---

## 2. 方案决策

### 2.1 已确认决策

1. **横屏锁定**：竖屏显示"请旋转设备"遮罩，游戏仅在横屏运行。
2. **等比缩放**：基准分辨率 `1366 × 1024`（iPad Pro 12.9 横屏），`contain` 模式取 `Math.min(scaleX, scaleY)`，`scale` 封顶 `1`（PC 大屏不放大，居中留暗边）。
3. **整体缩放**：顶栏 + 棋盘一体缩放。先**放大顶栏右侧按钮/字体**补偿缩放损失（顶栏空间充裕）。
4. **日志改造**：iPad 下悬浮抽屉（盖画布右侧、不压缩）；PC 下常驻画布右侧、画布让位、不遮挡。

### 2.2 冲突解决（PC 缩放 vs PC 日志常驻）

决策 2「PC 等比缩放居中 + 两侧留白」与决策 4「PC 日志常驻、画布右侧延伸让位」存在逻辑冲突：若 PC 也走 scale 封顶 1，画布固定 1366 居中，右侧暗边无法美观地常驻日志。

**采纳方案：日志脱离 scale 容器，作为独立面板放在缩放画布右侧（外部），不参与缩放。**

- **PC 宽屏**（视口宽 ≥ `LOG_BREAKPOINT ≈ 1500`）：左侧缩放画布（逻辑 ≤1366），右侧贴原生尺寸日志面板填满剩余宽度 → 常驻、不盖画布、不挤压。
- **iPad**（视口宽 < `LOG_BREAKPOINT`）：右侧无空间放外置日志 → 日志改为画布**内**的悬浮抽屉（overlay，盖右侧、不压缩画布）。
- 判据用视口宽度阈值一刀切。

---

## 3. 总体架构

```
┌─────────────────────────────────────────────────────────┐
│ #app (100vh, overflow hidden, 背景美化层)                │
│                                                         │
│  横屏检测 ──否──> [竖屏旋转遮罩]                          │
│       │                                                 │
│      是                                                 │
│       ▼                                                 │
│  ┌──────────────────────┐   ┌──────────────┐            │
│  │ GameStage (scale)    │   │ ActionLog    │  ← PC 外置 │
│  │ 1366×1024 逻辑画布    │   │ (独立面板)   │   iPad 隐藏 │
│  │  ┌────────────────┐  │   └──────────────┘            │
│  │  │ <header>       │  │                               │
│  │  │ <body>棋盘</body>│  │                              │
│  │  └────────────────┘  │                               │
│  └──────────────────────┘                               │
│         (PC: flex row)   (iPad: 仅 GameStage, 日志在画布内浮层)
└─────────────────────────────────────────────────────────┘
```

### 3.1 组件职责

- **`GameStage`**：新组件。固定逻辑尺寸 `1366×1024`，监听视口计算 `scale`，`transform: scale()` 居中。仅 `inGame` 时启用。
- **`ActionLog`**：改造为两种模式（按视口宽度）：
  - PC 模式：`position: relative` 独立面板，放在 `GameStage` 右侧。
  - iPad 模式：`position: absolute` 浮层抽屉，在 `GameStage` 内盖右侧。
- **`OrientationGate`**：新组件（或 GameStage 内置）。竖屏时遮罩提示旋转。

---

## 4. 技术坑与对策

| 坑 | 现状（file:line） | 对策 |
|---|---|---|
| **transform 改变 fixed 包含块** | `_board-table.scss:287` `__log-tab`(`position: fixed; right:0; top:50%`)、`_board-table.scss:322` `__log-popout`(`position: fixed; inset:0`) | 改 `position: absolute`（相对 `.board-table`，已是 `position: relative`）。日志整体外置后此问题消解，但保险起见仍改 absolute |
| **iOS Safari 地址栏** | `window.innerHeight` 滚动时变化 | 用 `visualViewport.height` + 监听 `resize` / `orientationchange` / `visualViewport.resize` |
| **Modal/portal** | 弹窗 portal 到 `body`，在 scale 容器外 | 不受影响，弹窗保持原生清晰——正是想要的，无需处理 |
| **pointer 坐标** | scale 后点击坐标 | 浏览器自动换算，React 合成事件 OK，无需处理 |
| **字体亚像素** | 非整数 scale 文字略糊 | 缩小方向（Air/mini）影响小可接受；Pro scale=1 完美；可加 `transform: translateZ(0)` 启用 GPU 合成 |
| **滚动条** | scale 容器逻辑尺寸固定 | 外层 `overflow: hidden`，letterbox 由 flex 居中处理 |
| **顶栏按钮缩放后过小** | `App.tsx:44-65` header-actions 当前较小 | 放大顶栏右侧按钮/字体（约 1.25–1.4×），补偿 scale 损失 |

---

## 5. 实施步骤

### Step 1：背景美化层与外层容器

- `index.html` / `#app`：确保 `100vh` + `overflow: hidden` + `--bg-void` 背景。
- 新增美化背景（径向渐变 / 微纹理），letterbox 时自然融合，不留突兀纯黑边。

### Step 2：竖屏旋转遮罩

- 新建 `OrientationGate`（或 GameStage 内置）。
- 检测 `window.innerHeight > window.innerWidth` → 显示遮罩："请旋转至横屏"。
- 横屏时正常渲染游戏。

### Step 3：GameStage 缩放容器

- 新建 `src/components/game/GameStage.tsx`。
- 常量 `DESIGN_WIDTH = 1366`、`DESIGN_HEIGHT = 1024`、`LOG_BREAKPOINT = 1500`。
- `useEffect` 计算 `scale = Math.min(vw/DW, vh/DH, 1)`，监听 `visualViewport.resize` / `orientationchange`。
- 渲染 `<div style={{ width: DW, height: DH, transform: scale, transformOrigin:'center center' }}>`。
- `inGame` 时在 `App.tsx` 包裹 `<header>` + `<div class="body">`。

### Step 4：日志外置 + 双模式

- `ActionLog` 接收 `mode: 'dock' | 'overlay'` prop（由父组件按 `window.innerWidth >= LOG_BREAKPOINT` 决定）。
- `dock`（PC）：`position: relative`，原生尺寸，放在 `GameStage` 右侧（外层 flex row）。
- `overlay`（iPad）：`position: absolute`，在 `GameStage` 内盖右侧，默认收起、点击 tab 弹出。
- `_board-table.scss`：删除 `__log` grid 列定义（日志不再占 grid 列），`__slot--log` 在 overlay 模式下移出 grid。
- `__log-tab` / `__log-popout` 改 `position: absolute`。

### Step 5：顶栏按钮放大补偿

- `_app.scss`：`header-actions` 内按钮、链接字体放大（约 1.25–1.4×）。
- 验证 scale 后 PC 顶栏按钮仍清晰可点。

### Step 6：PC 宽屏阈值验证

- PC（视口 ≥ 1500）：左侧画布 + 右侧日志常驻。
- iPad（视口 < 1500）：画布全宽 + 日志浮层。

---

## 6. 验收标准

| 场景 | 预期 |
|------|------|
| iPad Pro 12.9 横屏 1366×1024 | scale=1，布局与现状一致，无回归 |
| iPad Air 横屏 1194×834 | scale≈0.813，等比缩小一屏全显，无滚动条，两侧窄暗边 |
| iPad mini 横屏 1133×744 | scale≈0.727，等比缩小一屏全显，无滚动条，暗边略宽 |
| 竖屏任意 iPad | 显示旋转遮罩，游戏不渲染 |
| PC 1920×1080 | scale=1 封顶，画布居中 1366 宽，右侧日志常驻填满余宽，两侧暗边美化背景 |
| PC 2560×1440 | 同上，暗边更宽，日志面板更宽 |
| Modal/弹窗 | 原生尺寸清晰，不受 scale 影响 |
| 触屏点击 | 坐标正确，无偏移 |

---

## 7. 相关约束（来自项目记忆）

- `client_react.router_type`：必须用 `createBrowserRouter + RouterProvider`（`useBlocker` 需要）。GameStage 不得破坏路由结构，仅在 `App.tsx` 渲染层包裹。
- `client_react.early_return_isolation`：Vue→React 迁移陷阱，modal portal 等共享 UI 必须提取为变量在所有 return 分支都渲染。日志浮层改造需注意此约束。
- `client_react.zustand_selector_stable_reference`：Zustand selector 必须返回稳定引用，禁止 `{...x}` 展开。GameStage 视口状态若入 store 须遵守。
- `ui.collapsible_sidebar.hide_completely`：折叠状态应几乎不占空间。日志收起态须遵循。

---

## 8. 后续演进（非本次范围）

- 手机竖屏（<640px）：当前竖屏直接遮罩，未来若支持需单独布局方案。
- scale 上限可调：若 PC 大屏希望放大而非留边，可放宽封顶（如 1.25），需评估字体糊化。
- 多基准分辨率：若未来支持更多设计基准，可扩展为按宽高比区间选不同基准。
