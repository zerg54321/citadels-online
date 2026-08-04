# 移除 Bootstrap 依赖方案

> 本前端已从 Vue3 重构为 React，按约束 `client_react.bootstrap_removal_policy` 应完全移除 Bootstrap，不再保留任何 Bootstrap 相关代码或样式。本文档为该重构的技术实施 plan，制定后留待后期动手。
>
> 制定日期：2026-08-02
> 关联文档：`RESPONSIVE_SCALING_PLAN.md`、`UI_OPTIMIZATION_PLAN.md`

---

## 1. 背景与目标

### 1.1 现状

- `client-react` 仍通过 `src/scss/_bootstrap.scss` 全量引入 Bootstrap 4.6 SCSS（functions + variables + 完整 bootstrap.scss），仅取 CSS 部分。
- **无 Bootstrap JS 依赖**：未装 `react-bootstrap`/`bootstrap` JS/`jquery`/`popper.js`，所有交互靠 React 状态驱动；modal 用 `createPortal` + `modal fade show d-block` 静态类名实现，非 Bootstrap JS 行为。
- 编译期产生 300+ 条 Sass deprecation 警告（`@import` / `if()` / `darken()` / `map-merge` / `abs(%)`），全部来自 `node_modules/bootstrap`，已通过 `vite.config.ts` 的 `silenceDeprecations` 临时静默，但根因（Bootstrap 4 不再升级修复旧语法）未消除。
- 全量 Bootstrap CSS（`assets/index-*.css` 224.89 kB / gzip 37.79 kB）随包下发，其中大量组件样式本项目未使用，是纯负担。

### 1.2 目标

1. 从 `package.json` 移除 `bootstrap` 依赖，删除 `_bootstrap.scss`，移除 `main.scss` 中对它的 `@import`。
2. 删除 `vite.config.ts` 中为 Bootstrap 临时加的 `silenceDeprecations` 配置。
3. 用**自维护的轻量工具类 + 组件类**替代被使用的 Bootstrap 样式，视觉零回归。
4. 产物 CSS 体积显著下降（预期 < 120 kB）。

### 1.3 非目标

- 不引入 Tailwind / Tachyons 等新原子 CSS 框架（保持零运行时依赖、自维护即可）。
- 不改任何业务逻辑、不改 DOM 语义结构（仅替换样式来源）。
- 不动 `common` / `server` 包。

---

## 2. 使用面全貌（迁移工作量依据）

> 以下统计基于 `client-react/src`，截至 2026-08-02。

### 2.1 SCSS 层对 Bootstrap 的依赖（极小）

| 位置 | 引用 | 迁移动作 |
|------|------|----------|
| `src/scss/_bootstrap.scss:1-6` | `@import` functions / variables / bootstrap 全量 | 整文件删除 |
| `src/scss/main.scss:1` | `@import './bootstrap'` | 删除该行 |
| `src/scss/main.scss:83` | `$purple` | 改为字面量 `#6f42c1` 或新增 `--bs-purple` CSS 变量 |
| `src/scss/main.scss:87` | `$black` | 改为字面量 `#000` |
| `src/scss/main.scss:100-102` | `@each $size,$length in $spacers` 生成 `.gap-*` | 用 `:root` 上 6 个 `--space-*` CSS 变量手写 `.gap-0..5`，或直接内联 |
| `src/scss/_bootstrap.scss:4` | `$enable-gradients: true` | 随文件删除 |

**结论**：SCSS 自有代码对 Bootstrap 变量的引用只有 3 处，迁移成本可忽略。

### 2.2 组件层对 Bootstrap 类的使用（约 35 文件 / 200+ 处）

按类别归纳（仅列高频与代表性 file:line，完整清单见后续 grep 基线）：

#### A. 布局 / Flexbox（最高频）
`d-flex` / `d-block` / `flex-column` / `flex-row` / `flex-wrap` / `flex-fill` / `flex-grow-1` / `flex-shrink-0` / `flex-column-reverse` / `justify-content-*` / `align-items-*` / `align-self-end` / `h-100` / `w-100` / `w-auto`

代表：`App.tsx:81,121`、`HomeScreen.tsx:115,153`、`GameScreen.tsx:21`、`RoomScreen.tsx:63`、`PlayerCity.tsx:124,171`、`DistrictCard.tsx:79,84,112,124`、`PlayerHand.tsx:88,89`

#### B. 间距（高频）
`p-0..5` / `px-*` / `py-*` / `pt-*` / `pb-*` / `pl-*` / `pr-*` / `m-0..5` / `mx-*` / `my-*` / `mt-*` / `mb-*` / `ml-*` / `mr-*` / `gap-2`

代表：遍布所有 modal（`App.tsx:90`、`AuthPanel.tsx:177,235`、`LobbyScreen.tsx:98`、`RoomScreen.tsx:70`）、`DistrictCard.tsx:79,100,112`、`PlayerCity.tsx:124,125,171`

#### C. 文本
`text-center` / `text-left` / `text-truncate` / `text-wrap` / `text-white` / `text-light` / `text-dark` / `text-danger` / `text-white-50` / `small`

代表：`HomeScreen.tsx:129,167,170,175`、`DistrictCard.tsx:103,118`、`CharactersList.tsx:90,92,96`

#### D. 背景与边框
`bg-dark` / `bg-secondary` / `bg-primary` / `bg-info` / `bg-danger` / `bg-warning` / `bg-light` / `bg-white` / `bg-black` / `bg-black-alpha`（自定义）/ `border-0` / `border` / `border-dark` / `border-light` / `border-primary` / `border-secondary` / `rounded` / `shadow` / `shadow-sm`

代表：`DistrictCard.tsx:79,113,114,123`、`CharactersList.tsx:90-96,131,143`、`PlayerCity.tsx:125,127-132,165`

#### E. 组件类（中频，需重点替换）
- **modal**：`modal fade show d-block` / `modal-dialog` / `modal-dialog-centered` / `modal-content` / `modal-header` / `modal-title` / `modal-body` / `modal-footer` / `close` — 用于 `App.tsx`、`AuthPanel.tsx`、`LobbyScreen.tsx`、`RoomScreen.tsx`、`common/Modal.tsx`。**已统一封装在 `common/Modal.tsx`**，是迁移的最大受益点。
- **card**：`card` / `card-body` / `card-header` / `card-picture` — `DistrictCard.tsx:79,123,124`、`CharactersList.tsx:129,131`、`LobbyScreen.tsx:184`、`RoomEntryScreen.tsx:190`、`PlayerCity.tsx:123`
- **badge**：`badge` / `badge-pill` / `badge-info` / `badge-danger` / `badge-warning` / `badge-light` / `badge-dark` / `badge-secondary` — `CharactersList.tsx:143-179`、`DistrictCard.tsx:103,113,114`、`PlayerCity.tsx:127,140-155,165`
- **list-group**：`list-group` / `list-group-flush` / `list-group-item` / `list-group-item-warning` / `list-group-item-dark` — `CharactersList.tsx:133,137`、`LobbyScreen.tsx:140`、`PlayerScore.tsx:41,48`
- **btn**：`btn` / `btn-gold`（自定义）/ `btn-outline-gold`（自定义）/ `btn-primary` / `btn-secondary` / `btn-success` / `btn-danger` / `btn-warning` / `btn-dark` / `btn-outline-secondary` / `btn-outline-danger` / `btn-sm` / `btn-lg` — `LobbyScreen.tsx:234`、`BoardScreen.tsx:497`、`LoadingSpinner.tsx:6`、`PlayersList.tsx:135,136,140`、`RoomEntryScreen.tsx:193`。注 `btn-gold`/`btn-outline-gold` 已是自定义（`main.scss:116-151`），保留即可。
- **alert**：`alert` / `alert-danger` — `AuthPanel.tsx:186,242,251`、`StatsScreen.tsx:109`、`HomeScreen.tsx:168`
- **form**：`form-group` / `form-control` — `AuthPanel.tsx:187,189,191,194,202,205,249,283,291,294,301,311,314`
- **spinner**：`spinner-border` — `LoadingSpinner.tsx:7`
- **table**：原生 `<table>` 配少量 `text-*`，无 `table` 类 — `EndGameModal.tsx:145`、`LobbyScreen.tsx` settings 表

#### F. Grid 系统（低频但需重写）
`row` / `col-auto` / `col` / `col-lg-7` / `col-lg-5` / `col-lg-8` / `col-lg-4` / `no-gutters` / `container` / `container-fluid` / `container-lg` / `align-items-center`

代表：`HomeScreen.tsx:105,106,133,149,150,249`、`LobbyScreen.tsx:185,187,216`、`GameScreen.tsx:14,16`、`RoomEntryScreen.tsx:178`、`AdminScreen.tsx:71,79`、`StatsScreen.tsx:87`

**仅 `HomeScreen` 与 `LobbyScreen` 用了响应式 `col-lg-*`**，其余多为 `container`/`container-fluid` 宽度约束。

### 2.3 响应式断点使用

- **`col-lg-*` / `mb-lg-0`**：仅 `HomeScreen.tsx:106,133,150,249`（首页两栏布局）。
- 其余响应式类（`sm-`/`md-`/`xl-`）几乎未用。
- 这意味着**响应式 grid 是迁移中最需小心的一块**，但也最局部（基本只 `HomeScreen` 一个文件）。

### 2.4 Bootstrap JS

**零使用**。modal/dropdown/collapse 全部靠 React 状态 + `createPortal` 实现（见 `common/Modal.tsx:28-38` 注释明确说明用了 Bootstrap 4 modal 的 class 名但非其 JS）。无 `data-toggle`/`data-dismiss`/`data-bs-*` 属性（`App.tsx:11` 注释提到 Vue 时代用过 `data-toggle`，React 版已移除）。

---

## 3. 方案决策

### 3.1 总体策略：自维护 SCSS 工具层 + 组件类，逐类平替

不引入新框架。在 `src/scss/` 新增一个 `utilities.scss`（轻量原子工具，覆盖 A/B/C/D 类）+ 重写各组件类（E 类）。删除 `_bootstrap.scss` 后，其余 scss 文件（`_app.scss`/`_board-table.scss` 等自定义样式）几乎不受影响——它们用的是 CSS 变量与字面量，不依赖 Bootstrap 变量。

### 3.2 关键决策

1. **工具类命名沿用 Bootstrap 同名**（`d-flex`/`p-3`/`text-center` 等），仅替换实现来源。理由：200+ 处 className 无需改动，迁移风险与 diff 都最小，纯样式层平替。
2. **组件类（modal/card/badge/list-group/btn/alert/form）也尽量同名**，在新建 `components.scss` 里手写等价样式；视觉用 `:root` 既有 CSS 变量（`--gold`/`--bg-panel`/`--parchment` 等）对齐现有暗金主题。
3. **`col-lg-*` 响应式**：`HomeScreen` 改用 CSS Grid（`grid-template-columns: repeat(auto-fit, minmax(...))`）或媒体查询 flex，`LobbyScreen` 同理。定义一个 `--bp-lg: 992px` 与 Bootstrap 4 默认一致，避免行为偏移。
4. **`$spacers` → CSS 变量**：在 `:root` 加 `--space-0..5`（0 / 0.25rem / 0.5rem / 1rem / 1.5rem / 3rem，与 Bootstrap 4 `$spacers` 默认值一致），`.gap-*`/`.p-*`/`.m-*` 全部 `var(--space-*)`。
5. **`bg-black-alpha` / `gradient-*` 已是自定义类**（非 Bootstrap），保留原样。
6. **`spinner-border`**：自写一个 keyframe 旋转 + `border` 透明边的等价类（4 行 CSS）。

### 3.3 不替代、直接删除的 Bootstrap 部分

全量 Bootstrap 中**未使用**的组件（navbar/nav-tabs/breadcrumb/pagination/carousel/accordion/jumbotron/media/toast/tooltip/popover/progress/input-group/custom-*/dropdown 的 JS 行为等）直接不实现，自然消失。

---

## 4. 技术细节

### 4.1 设计 token 落地（`src/scss/_tokens.scss` 新建）

```scss
:root {
  // spacing（对齐 BS4 $spacers）
  --space-0: 0; --space-1: .25rem; --space-2: .5rem;
  --space-3: 1rem; --space-4: 1.5rem; --space-5: 3rem;

  // 断点（对齐 BS4）
  --bp-sm: 576px; --bp-md: 768px; --bp-lg: 992px; --bp-xl: 1200px;

  // 主题色（对齐 BS4 默认，供 bg-*/text-* 使用）
  --c-primary:#007bff; --c-secondary:#6c757d; --c-success:#28a745;
  --c-info:#17a2b8; --c-warning:#ffc107; --c-danger:#dc3545;
  --c-light:#f8f9fa; --c-dark:#343a40; --c-purple:#6f42c1; --c-black:#000;
}
```

### 4.2 工具类生成（`src/scss/_utilities.scss` 新建）

用 SCSS `@each` 批量生成，覆盖本项目实际用到的子集（不必覆盖 Bootstrap 全集）：

```scss
@each $i in 0 1 2 3 4 5 {
  .p-#{$i}  { padding:       var(--space-#{$i}) !important; }
  .px-#{$i} { padding-inline: var(--space-#{$i}) !important; }
  .py-#{$i} { padding-block:  var(--space-#{$i}) !important; }
  .m-#{$i}  { margin:        var(--space-#{$i}) !important; }
  .mx-#{$i} { margin-inline: var(--space-#{$i}) !important; }
  .my-#{$i} { margin-block:  var(--space-#{$i}) !important; }
  .gap-#{$i}{ gap:           var(--space-#{$i}) !important; }
}
// pt/pb/pl/pr/mt/mb/ml/mr 同理按需生成

.d-flex{display:flex!important} .d-block{display:block!important}
.d-none{display:none!important} .d-inline{display:inline!important}
.flex-column{flex-direction:column!important}
.flex-row{flex-direction:row!important}
.flex-wrap{flex-wrap:wrap!important} .flex-nowrap{flex-wrap:nowrap!important}
.flex-fill{flex:1 1 auto!important}
.flex-grow-1{flex-grow:1!important} .flex-shrink-0{flex-shrink:0!important}
.flex-column-reverse{flex-direction:column-reverse!important}
.justify-content-between{justify-content:space-between!important}
.justify-content-center{justify-content:center!important}
.justify-content-start{justify-content:flex-start!important}
.justify-content-end{justify-content:flex-end!important}
.align-items-center{align-items:center!important}
.align-items-start{align-items:flex-start!important}
.align-items-end{align-items:flex-end!important}
.align-self-end{align-self:flex-end!important}
.h-100{height:100%!important} .w-100{width:100%!important} .w-auto{width:auto!important}
.text-center{text-align:center!important} .text-left{text-align:left!important}
.text-right{text-align:right!important}
.text-truncate{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.text-wrap{white-space:normal!important} .text-nowrap{white-space:nowrap!important}
.small{font-size:.875em!important}
.rounded{border-radius:.25rem!important} .rounded-sm{border-radius:.2rem!important}
.rounded-circle{border-radius:50%!important}
.shadow{box-shadow:0 .5rem 1rem rgba(0,0,0,.15)!important}
.shadow-sm{box-shadow:0 .125rem .25rem rgba(0,0,0,.075)!important}
.border-0{border:0!important} .border{border:1px solid var(--c-secondary)!important}
.position-relative{position:relative!important}
.position-absolute{position:absolute!important}
.overflow-auto{overflow:auto!important} .overflow-hidden{overflow:hidden!important}
.cursor-pointer{cursor:pointer!important}

@each $name, $val in (
  primary var(--c-primary), secondary var(--c-secondary), success var(--c-success),
  info var(--c-info), warning var(--c-warning), danger var(--c-danger),
  light var(--c-light), dark var(--c-dark), purple var(--c-purple), black var(--c-black), white #fff
) {
  .bg-#{$name} { background-color: #{$val} !important; }
  .text-#{$name} { color: #{$val} !important; }
}
// 白色文本与 text-muted/text-white-50 等
.text-white{color:#fff!important} .text-light{color:var(--c-light)!important}
.text-dark{color:var(--c-dark)!important} .text-muted{color:var(--c-secondary)!important}
.text-white-50{color:rgba(255,255,255,.5)!important}
.bg-transparent{background-color:transparent!important}
.bg-black-alpha{background-color:rgba(0,0,0,.5)!important} // 已有自定义，保留
```

> 注：以上是**骨架示意**，实施时以"本项目实际 grep 到的类集合"为准生成，避免生成未用类。生成前先跑 2.2 的 grep 建立基线清单。

### 4.3 组件类重写（`src/scss/_components.scss` 新建）

只重写被使用的：modal / card / badge / list-group / btn（基础）/ alert / form-control / form-group / spinner-border。每类约 5-20 行，全部用 `:root` 变量与字面量。示例骨架：

```scss
.modal { position:fixed; inset:0; display:none; }            // 静态用法靠 .d-block 显示
.modal.show.d-block { display:block; }
.modal-dialog { max-width:32rem; margin:1.75rem auto; }
.modal-dialog-centered { display:flex; align-items:center; min-height:calc(100% - 3.5rem); }
.modal-content { background:var(--bg-panel); border:1px solid rgba(212,175,55,.35); border-radius:.5rem; box-shadow:0 4px 24px rgba(0,0,0,.45); }
.modal-header { display:flex; justify-content:space-between; align-items:flex-start; padding:1rem; }
.modal-title { margin-bottom:0; line-height:1.5; }
.modal-body { position:relative; padding:1rem; }
.modal-footer { display:flex; justify-content:flex-end; padding:1rem; gap:.5rem; }
.close { background:transparent; border:0; color:#fff; font-size:1.5rem; cursor:pointer; opacity:.7; }
.card { background:var(--bg-panel); border:1px solid rgba(212,175,55,.2); border-radius:.25rem; }
.card-header { padding:.75rem 1.25rem; }
.card-body { padding:1.25rem; }
.badge { display:inline-block; padding:.35em .6em; font-size:75%; border-radius:.25rem; line-height:1; }
.badge-pill { border-radius:10rem; }
.list-group { display:flex; flex-direction:column; }
.list-group-item { padding:.75rem 1.25rem; border:1px solid rgba(0,0,0,.125); }
.list-group-flush .list-group-item { border-right:0; border-left:0; border-radius:0; }
.list-group-item-warning{background-color:#fff3cd;color:#856404}
.list-group-item-dark{background-color:#343a40;color:#fff}
.btn{display:inline-block;font-weight:400;text-align:center;vertical-align:middle;cursor:pointer;border:1px solid transparent;padding:.375rem .75rem;border-radius:.25rem;transition:all .15s}
.btn-sm{padding:.25rem .5rem;font-size:.875rem} .btn-lg{padding:.5rem 1rem;font-size:1.25rem}
.btn-primary{background:var(--c-primary);color:#fff} /* 各色按钮同理 */
.alert{padding:.75rem 1.25rem;border:1px solid transparent;border-radius:.25rem}
.alert-danger{background:#f8d7da;color:#721c24}
.form-control{display:block;width:100%;padding:.375rem .75rem;border:1px solid var(--c-secondary);border-radius:.25rem;background:var(--bg-panel);color:var(--parchment)}
.form-group{margin-bottom:1rem}
.spinner-border{display:inline-block;width:2rem;height:2rem;border:.25em solid currentColor;border-right-color:transparent;border-radius:50%;animation:spin .75s linear infinite}
@keyframes spin{to{transform:rotate(360deg)}}
```

### 4.4 Grid 平替（`src/scss/_grid.scss` 新建）

```scss
.container{width:100%;margin-inline:auto;padding-inline:1rem;max-width:var(--bp-xl)}
.container-fluid{width:100%;padding-inline:1rem}
.container-lg{width:100%;padding-inline:1rem}
@media(min-width:var(--bp-lg)){.container-lg{max-width:960px}}
.row{display:flex;flex-wrap:wrap;margin-inline:-.75rem}
.no-gutters{margin-inline:0}
.col{flex:1 0 0%}
.col-auto{flex:0 0 auto;width:auto}
@media(min-width:var(--bp-lg)){
  .col-lg-4{flex:0 0 33.33333%;max-width:33.33333%}
  .col-lg-5{flex:0 0 41.66667%;max-width:41.66667%}
  .col-lg-7{flex:0 0 58.33333%;max-width:58.33333%}
  .col-lg-8{flex:0 0 66.66667%;max-width:66.66667%}
  .mb-lg-0{margin-bottom:0!important}
}
.align-items-center{align-items:center!important} // 已在 utilities，grid 仅补 col 逻辑
```

### 4.5 main.scss 调整

```scss
@import './tokens';
@import './utilities';
@import './components';
@import './grid';
@import './animation';
@import './app';
// ...其余原有 @import 不变
```

删除 `@import './bootstrap'` 与 `@import url('https://fonts...')` 之外的改动仅是新增。

---

## 5. 实施步骤

### Step 0：建立基线（不动代码）
1. 跑 2.2 节 grep，导出"本项目实际用到的 Bootstrap 类完整清单"存为 `docs/bootstrap-usage-baseline.txt`（可选，附本 plan）。
2. 全屏截图当前各主要页面（首页/大厅/游戏/结算/Admin/Stats）作为视觉回归对照。

### Step 1：建 token + 工具层（不删 Bootstrap）
- 新建 `_tokens.scss` / `_utilities.scss` / `_grid.scss`。
- 在 `main.scss` 把它们 `@import` 在 `_bootstrap` **之前**。
- 验证：构建通过、视觉无变化（因同名类，新定义与 BS4 冲突但值一致，无害）。

### Step 2：重写组件类（仍不删 Bootstrap）
- 新建 `_components.scss`，`@import` 在 `_bootstrap` 之前。
- 逐组件实现 modal/card/badge/list-group/btn/alert/form/spinner。
- 验证：视觉对比 Step 0 截图，逐页确认无回归。

### Step 3：切换 3 处 SCSS 变量引用
- `main.scss:83` `$purple` → `var(--c-purple)`、`main.scss:87` `$black` → `var(--c-black)`、`main.scss:100-102` `$spacers` 循环 → 删除（已在 `_utilities` 生成 `.gap-*`）。
- 删除 `_bootstrap.scss` 中 `$enable-gradients`（随文件删）。

### Step 4：移除 Bootstrap
- 删除 `src/scss/_bootstrap.scss`。
- 删除 `main.scss:1` 的 `@import './bootstrap'`。
- `package.json` 移除 `"bootstrap": "^4.6.2"`，`npm install`。
- 删除 `vite.config.ts` 的 `css.preprocessorOptions.scss`（`silenceDeprecations`/`quietDeps`）。
- 验证：`npm run build` 应零 sass 警告、零 TS 错误；产物 CSS 体积下降。

### Step 5：回归验证
- 逐页对比 Step 0 截图：首页两栏响应式、大厅设置/玩家双栏、游戏棋盘、DistrictCard/CharacterCard、各 modal、Admin/Stats 表格、LoadingSpinner。
- 交互验证：modal 开关、表单输入、按钮 hover、`col-lg-*` 在窄/宽屏切换。
- `npm run typecheck` + `npm run lint` 全绿。

### Step 6：清理
- 确认 `node_modules/bootstrap` 已随 `npm install` 消失。
- 跑一次全局 grep 确认无残留 `bootstrap` 字样（除文档/注释外）。
- 更新项目记忆 `client_react.bootstrap_removal_policy` 状态为已完成。

---

## 6. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| 同名工具类样式与 BS4 细微差异（如 `border-radius` 默认值、`shadow-sm` 阴影参数） | 视觉轻微偏移 | token/工具类值严格对齐 BS4 4.6 默认（见 4.1/4.2）；逐页截图比对 |
| `col-lg-*` 响应式断点行为偏移 | 首页/大厅窄宽屏布局错乱 | `--bp-lg:992px` 与 BS4 一致；Step 5 在 991/992px 边界单独验证 |
| `bg-${color}` 动态拼接（`DistrictCard.tsx:113`、`CharactersList.tsx:145`、`PlayerCity.tsx:127-132`） | 若 token 命名不全则背景丢失 | 动态色名清单（primary/secondary/info/danger/warning/dark/light）须在 `_utilities` 全部覆盖；grep `bg-\$\{` 建立动态色清单 |
| `text-${color}` 动态拼接（`CharactersList.tsx:145`） | 文本色丢失 | 同上，`text-*` 须覆盖动态用到的色名 |
| modal `z-index:1050` 与 portal 层级 | 弹窗被遮挡 | 保留 `zIndex:1050` 与 `RESPONSIVE_SCALING_PLAN` 中"modal 在 scale 容器外"结论一致 |
| `form-control` 聚焦态/placeholder 颜色 | 输入框视觉变化 | 重写时含 `:focus` / `::placeholder` 规则，对照 BS4 `_forms.scss` |
| 遗漏未 grep 到的低频类 | 个别元素失样式 | Step 4 删 BS 后构建仍过（类名不报错），靠 Step 0/5 截图回归兜底 |

---

## 7. 验收标准

| 项 | 预期 |
|----|------|
| `npm run build` | 零 Sass deprecation 警告、零 TS 错误、构建成功 |
| 产物 CSS 体积 | `< assets/index-*.css` 显著下降（目标 < 120 kB，gzip < 22 kB） |
| `package.json` | 无 `bootstrap` 依赖 |
| `node_modules/bootstrap` | 不存在 |
| `src/scss/_bootstrap.scss` | 已删除 |
| `vite.config.ts` | 无 `silenceDeprecations`/`quietDeps` |
| 全局 grep `bootstrap` | 仅文档与历史注释命中 |
| 视觉 | 与 Step 0 截图逐页一致，无回归 |
| 交互 | modal/表单/响应式断点行为一致 |

---

## 8. 相关约束（来自项目记忆）

- `client_react.bootstrap_removal_policy`：本 plan 的根本驱动约束——完全移除 Bootstrap。
- `client_react.router_type`：`createBrowserRouter + RouterProvider`。本 plan 不动路由，但 Step 5 验证需确认弹窗路由页（如 RoomScreen）modal 正常。
- `ui.landscape_orientation`：横屏布局。`col-lg-*` 平替时无需引入竖屏断点。
- `client_react.early_return_isolation`：modal portal 须在所有 return 分支都渲染——本 plan 不改组件结构，仅样式来源，自动满足。

---

## 9. 预估工作量

| 阶段 | 改动文件数 | 预估 |
|------|-----------|------|
| Step 1-2（建 token/工具/组件/grid SCSS） | 新增 4 文件 + 改 main.scss | 2-3h |
| Step 3（3 处变量引用） | main.scss | 10min |
| Step 4（删 Bootstrap） | 4 文件 | 15min |
| Step 5（回归验证） | - | 1-1.5h |
| 合计 | | 约 4-5h |

> 因决策 3.1 选用"同名平替"，35 个组件文件 **零 className 改动**，是工作量可控的关键。若选择"改名迁移"（如 `d-flex`→`flex`），工作量将数倍于此且无收益。

---

## 10. 后续演进（非本次范围）

- 进一步把工具类从 `!important` 原子类演进为按组件 BEM 收敛，减少全局类污染（属 `UI_OPTIMIZATION_PLAN` 范畴）。
- `col-lg-*` 这种残留 grid 可在 `HomeScreen`/`LobbyScreen` 重构时整体换成 CSS Grid 布局。
- 评估引入 CSS Modules 或零运行时 CSS-in-JS，从根本上替代 SCSS 全局类。
