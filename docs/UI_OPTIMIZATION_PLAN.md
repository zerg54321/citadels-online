# UI 优化计划

> 取自 2026-07-26 对 `client-react` 全量代码审计。审计覆盖 7 个维度（美术素材 / 动画 / 音效 / 组件质量 / 布局 / 细节打磨 / 新手引导），全部带 `file:line` 证据。本计划按"性价比 + 依赖关系"分 6 个阶段排序。
>
> 制定日期：2026-07-26

> **进度更新（2026-08-05）**：以下子项已完成，对应审计结论不再成立——
> - ~~16 个头像全部字节相同~~ → 已替换为 16 张各不相同的美术素材
> - ~~Bootstrap 4 (EOL) 与 BEM 双系统并存~~ → Bootstrap 已彻底移除，统一为自维护 SCSS（见 `docs/archive/BOOTSTRAP_REMOVAL_PLAN.md`）
> - 其余阶段（美术地基、动效、音效、新手引导等）仍为待办，按本计划推进。

---

## 1. 审计结论速览

| 维度 | 评级 | 核心问题 |
|------|------|----------|
| 美术素材 | 业余 | 16 个头像全部字节相同；角色图 46MB / 单张 5–7MB 却渲染在 93px；区划卡长宽比 0.67–1.78 乱跳 |
| 动画 | 业余 | 仅 5 个 ambient keyframes，所有关键事件（摸牌/造建筑/翻角色/刺杀/偷窃/胜利）全是瞬切 |
| 音效 | 业余 | 全游戏只有 1 个合成"叮"声，无音量/静音设置 |
| 组件质量 | 及格 | hover 不统一（区划卡弱、手牌 janky），无翻面/建造动画，多处硬编码中文绕过 i18n |
| 布局 | 及格偏优 | ≥1100px 桌面是真"牌桌"；但只有 1 个断点，平板/手机直接退化成滚动列表 |
| 细节打磨 | 业余 | 24+ emoji 当图标且渲染方式不一（twemoji vs 系统 emoji）；Bootstrap 4 (EOL) 与自定义 BEM 双系统并存 |
| 新手引导 | 业余 | 无教程、无游戏内角色说明、无 `?` 按钮、tooltip 全是原生 `title=` |

### 1.1 审计关键证据

- **头像**：`public/avatars/01.png`–`16.png` MD5 全为 `F58A9788304E185D4CAF966FE2B0ECB0`，全部 66586 字节、256×256，即 1 张占位图复制 16 次。
- **角色图**：`src/assets/characters/*.jpg` 8 张，单张 5.1–7.7MB，共 ≈46MB；实际渲染在 `char-card--medium` = 5.8rem × 8rem（≈93×128px），约 17× 过采样；通过 Vite 打包成 CSS `background-image`，无懒加载。
- **区划卡**：`src/assets/cards/*.jpg` 30 张，长宽比从 0.67（portrait，如 great_wall/harbor/keep/library）到 1.78（cathedral）乱跳；`prison.jpg` 仅 514×427、`trading_post.jpg` 仅 400×600 明显偏软。
- **动画**：`package.json` 无 framer-motion / react-spring / gsap / lottie；全仓库仅 5 个 `@keyframes`（`board-pulse` / `crown-glow` / `seat-acting-pulse` / `seat-acting-arrow` / `home-pulse`），全为 ambient/idle，无任何事件驱动动画。
- **音效**：`src/utils/sound.ts` 仅导出 `playTurnSound()`（Web Audio 合成两音"叮"）；`BoardScreen.tsx:120-128` 仅在自己回合开始触发。
- **emoji 图标**：24+ 个 emoji 当功能图标，且两套渲染——`<Emoji>`（twemoji SVG）与裸 JSX emoji（系统字体）混用，例：`SeatPanel.tsx:139,151,154`（🪙⭐👑）是裸 emoji，`DistrictCard.tsx:93` 的 🪙 是 twemoji。
- **i18n 缺口**：`PlayerHand.tsx:113` `"点击要保留的牌"`、`PlayerCity.tsx:155-156` `"实时总分"/"分"`、`LobbyScreen.tsx:206` `"10s（测试）"`、`CharactersList.tsx:105` 全角括号 全部绕过 `react-i18next`。
- **重复样式**：7 处 modal 重复 `style={{ background:'rgba(0,0,0,0.65)', zIndex:1050 }}`（`App.tsx:74` / `AuthPanel.tsx:174,232` / `Modal.tsx:28` / `EndGameModal.tsx:121` / `LobbyScreen.tsx:95` / `RoomScreen.tsx:69`）。
- **Bootstrap**：`_bootstrap.scss:1-6` 全量导入 Bootstrap 4.6.2（EOL），与自定义 BEM SCSS（`seat-panel__*` / `board-table__*`）双系统并存；`PlayerCity.tsx` 几乎纯 Bootstrap，`SeatPanel.tsx` 几乎纯 BEM。
- **断点**：`_board-table.scss:822-843` 仅 1 个 `@media (max-width: 1100px)`，以下退化为滚动 2 列列表。
- **新手引导**：无教程；`CharacterCard.tsx` 连 `title` 都没设，仅 `CharactersList.tsx:138` 用原生 `title=`；`HomeScreen.tsx:135-141` 仅 4 条静态文字步骤。

---

## 2. 阶段划分与依赖

```
Phase 0 (快速胜利) ─┐
                    ├─> Phase 1 (美术地基) ─> Phase 2 (动效体感)  [核心三阶段]
                    │
Phase 3 (音效) ─────┼─> 互相独立，可穿插
Phase 4 (新手引导) ─┤
Phase 5 (响应式) ───┘
Phase 6 (技术债) ──────> 最后做，避免动效开发期重构样式系统
```

**关键依赖**：Phase 1 是 Phase 2 的地基——动画要在统一素材上做才有意义，否则给乱长宽比的卡牌加飞入动画会更难看。

**总估**：约 15–20 个工作日。做完 Phase 0/1/2（约 9–14 天）即达"看不出是业余作品"的及格线。

---

## 3. Phase 0 — 快速胜利（1–2 天）

成本极低、立刻消除最刺眼的"业余感"，且不依赖后续阶段。

### 0.1 替换 16 个占位头像

- 现状：`public/avatars/01.png`–`16.png` 全部字节相同。
- 动作：按 `public/avatars/README.md` 已有规格（256×256 PNG，16–24 个中世纪图标集）填入真实素材。
- 影响范围：`src/utils/avatarUrl.ts:17-22` 解析逻辑不动。
- 验收：6 人对局时 6 个座位头像互不相同。

### 0.2 清理硬编码中文

| 文件:行 | 当前内容 | 动作 |
|---------|----------|------|
| `PlayerHand.tsx:113` | `"点击要保留的牌"` | 接入 `t('ui.tmp_hand_prompt')` |
| `PlayerCity.tsx:155` | `title="实时总分"` | 接入 `t('ui.live_total_score')` |
| `PlayerCity.tsx:156` | `... 分` | 用 `t('ui.score_unit')` 或模板 |
| `LobbyScreen.tsx:206` | `"10s（测试）"` | 接入 i18n key |
| `CharactersList.tsx:105` | 全角括号 `（${...}）` | 改用 i18n 模板插值 |

- 验收：切换到英文 locale，上述位置无中文残留。

### 0.3 抽取重复 modal 遮罩样式

- 现状：7 处重复内联 `style={{ background:'rgba(0,0,0,0.65)', zIndex:1050 }}`。
- 动作：合并为一个 `.app-modal-overlay` class（沿用 `client_react.modal_dark_theme` 既有约定——所有模态框统一深色 `.app-modal` 风格）。
- 验收：grep `rgba(0,0,0,0.65)` 在 modal 相关文件中无残留。

---

## 4. Phase 1 — 美术素材管线（3–5 天，地基）

后续所有视觉提升的地基。先解决"素材本身"再谈"怎么动起来"。

### 1.1 角色图重新编码

- 现状：`src/assets/characters/*.jpg` 1664×2496、单张 5–7MB、共 46MB，渲染在 ~93×128px。
- 动作：下采样到 ~400×560，格式 WebP/AVIF；加 `srcset` 与懒加载。
- 收益：砍掉 ≈95% 资源体积，首屏性能直接起飞。
- 注意：`background.jpg`（134KB）作为卡背，保留。

### 1.2 统一区划卡长宽比

- 现状：30 张 `src/assets/cards/*.jpg` 比例 0.67–1.78 乱跳；`_district-card.scss:63-72` 用 `background-size: cover` + 固定 7rem × 10rem（0.7），导致 landscape/wide 卡被严重中心裁切。
- 动作：定一个卡框模板（建议 5:7 对齐 `char-card`），统一裁切/重绘全部 30 张；优先补 `prison.jpg`、`trading_post.jpg` 两张低分辨率。
- 验收：所有卡牌在 `.district-card` 容器内显示完整主体，无"有的卡裁脸有的卡裁全景"。

### 1.3 统一图标系统

- 现状：24+ emoji 当图标且两套渲染（`<Emoji>` twemoji SVG vs 裸 JSX 系统 emoji）。
- 动作：选定一套——推荐与现有 `card-back-icon`（`_board-table.scss:762-794` 手绘 CSS）一致的手绘 inline SVG，金色主题。
- 替换点（不限于）：
  - `DistrictCard.tsx:6-12`（`ICON_BY_TYPE` 👑💠💵⚔️🔮）
  - `CharacterCard.tsx:15-24`（角色 emoji 映射）
  - `SeatPanel.tsx:139,151,154`（🪙⭐👑，当前裸 emoji）
  - `BoardScreen.tsx:372-384`
  - `PlayerCity.tsx:163,165`（💀💰 当前裸 emoji，未走 `<Emoji>`）
  - `CharactersList.tsx:167-181`
  - `HomeScreen.tsx:13-16,174,265`
- 验收：grep 所有功能位置无裸 emoji；图标在 1.9rem 下仍锐利无锯齿。

---

## 5. Phase 2 — 游戏体感 / 动效（5–7 天，核心差距）

审计结论：**整个"事件层"是静态的，这是与商业作品最大的体感差距。**

### 2.1 引入动效库

- 现状：`package.json` 无任何动效库。
- 动作：引入 `framer-motion`（React 生态首选，与 `AnimatePresence` 配合好）。

### 2.2 核心事件动画（按戏剧性排序）

| 事件 | 现状（file:line） | 目标效果 |
|------|-------------------|----------|
| 角色翻面/揭示 | `CharacterCard.tsx:93-110` 瞬切两张 background-image | 3D flip，背面→正面翻转 |
| 建造区划 | `PlayerCity.tsx:172` / `SeatPanel.tsx:162` 直接 push | 从手牌飞入城市槽位 |
| 摸牌 | `PlayerHand.tsx:97-109` 直接 map | 新手牌从牌堆滑入 + 扇形展开 |
| 刺杀/偷窃印章 | `CharacterCard.tsx:104-105` 💀/💰 瞬现 | slam 落下 + 震动 |
| 金币变化 | `SeatPanel.tsx:138-153` 直接改数字 | count-up tween |
| 胜利结算 | `EndGameModal.tsx:120-186` 直接 portal 挂载 | 错峰揭晓分数 + 礼花 |

### 2.3 回合交接动画

- 现状：`TurnOrderBar.tsx:25-33` 只有当前 chip 缩放，无"从上一棒传到下一棒"的视觉传递。
- 动作：加一个沿顺序条移动的高亮/光标动画，体现"轮到你了"的传递感。

---

## 6. Phase 3 — 音效（2–3 天）

### 3.1 扩充 SFX 集

- 现状：`src/utils/sound.ts` 仅 `playTurnSound()` 一个合成"叮"。
- 动作：补齐事件音——摸牌/造建筑/刺杀/偷窃/拿金币/回合开始/游戏结束/聊天接收/倒计时告急。
- 实现：可继续 Web Audio 合成（轻量），或引入 howler + 短音频文件。

### 3.2 音量/静音设置 UI

- 现状：无任何设置入口。
- 动作：加 settings 面板（音量滑块 + 静音开关），持久化到 zustand + localStorage。

---

## 7. Phase 4 — 新手引导（2–3 天）

### 4.1 游戏内角色速查

- 现状：`CenterPanel.tsx:127-144` 选角色阶段 `CharacterCard` 连 `title` 都没设。
- 动作：加 hover popover 显示角色能力说明（替换原生 `title=`，做自定义 tooltip 组件）。

### 4.2 `?` 帮助按钮 + 规则弹窗

- 现状：对局中无任何规则查询入口。
- 动作：加常驻 `?` 按钮，弹出规则弹窗（复用 `docs/GAMERULES.md` 内容）。

### 4.3 首局引导（可选，成本较高）

- 动作：检测新用户，第一局带标注/高亮提示；或提供一个对 AI 的练习入口。

---

## 8. Phase 5 — 响应式（2–3 天）

### 5.1 平板断点（~768–1100px）

- 现状：`_board-table.scss:822-843` 仅 1100px 一个断点，以下退化成滚动 2 列列表，座位失去空间位置感。
- 动作：加 768–1100px 平板布局，保留座位位置感（缩小而非重排）。

### 5.2 手机竖屏（<640px）

- 动作：自身面板置顶 + 对手压缩成横条；考虑与"为未来移动端预留"的长期目标对齐（见 `IMPROVEMENT_PLAN_2026.md` 1.3）。

---

## 9. Phase 6 — 技术债清理（低优先，1–2 天）

### 6.1 去 Bootstrap 4（EOL）

- 现状：`_bootstrap.scss:1-6` 全量导入 Bootstrap 4.6.2，与自定义 BEM 双系统并存。
- 动作：要么裁剪到只用到的 utility，要么迁 Bootstrap 5 / 纯自定义。`PlayerCity.tsx` 几乎纯 Bootstrap，是主要改造点。

### 6.2 清理死代码

- `_animation.scss`：9 行 Vue transition 残留（`.fade-enter-active/.fade-leave-active`），React 代码无任何组件使用。
- `main.scss:67`：未用的 `.tooltip` class。
- `CharacterCard.tsx:99`：`artKey` 缺失时的 emoji fallback，但 8 张图都在，是死代码。

---

## 10. 推荐执行顺序与里程碑

| 里程碑 | 阶段 | 工作日 | 效果 |
|--------|------|--------|------|
| M1 | Phase 0 | 1–2 | 消除最刺眼违和（头像 + 硬编码字符串 + 重复样式） |
| M2 | Phase 1 | 3–5（累计 4–7） | 美术地基成型，素材统一、体积砍 95% |
| M3 | Phase 2 | 5–7（累计 9–14） | **"看不出是业余作品"的及格线** |
| M4 | Phase 3 + 4 | 4–6（累计 13–20） | 音效 + 新手引导补齐体感闭环 |
| M5 | Phase 5 + 6 | 3–5（累计 16–25） | 响应式 + 技术债，长期可维护性 |

**理由**：
- Phase 0 几乎零成本但消除最刺眼的违和。
- Phase 1 是地基：动画（Phase 2）要在统一素材上做才有意义。
- Phase 2 是体感核心，做完后"业余感"断崖式下降。
- Phase 3/4/5 互相独立，可按兴趣穿插。
- Phase 6 最后做，避免动效开发期间还重构样式系统。

---

## 11. 相关约束（来自项目记忆）

- `client_react.modal_dark_theme`：所有模态框统一使用共享的深色 `.app-modal` 样式类，弃用 Bootstrap 默认浅色 `.modal-content text-dark`。Phase 0.3 的 `.app-modal-overlay` 须遵循此约定。
- `client_react.router_type`：必须用 `createBrowserRouter + RouterProvider`（`useBlocker` 需要）。Phase 5 响应式改动不得破坏路由结构。
- `client_react.early_return_isolation`：Vue→React 迁移陷阱，modal portal 等共享 UI 必须提取为变量在所有 return 分支都渲染。Phase 2 动效若涉及 portal/`AnimatePresence` 需注意此约束。
- `client_react.zustand_selector_stable_reference`：Zustand selector 必须返回稳定引用，禁止 `{...x}` 展开。Phase 3.2 settings store 须遵守。
- `client.avatar.static_package`：放弃 DiceBear 动态头像，改用静态头像包。Phase 0.1 沿用此决策。
- `client.avatar.storage`：自定义头像用文件存储，不存入数据库。Phase 0.1 不涉及自定义上传，但若后续扩展须遵守。

---

## 12. 审计原始证据索引

完整 `file:line` 证据见项目记忆 key `ui.optimization_plan`。本文件为对外文档版，证据摘录见 §1.1。
