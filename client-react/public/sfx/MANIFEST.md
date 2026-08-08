# 音效素材清单（SFX Manifest）

> 本文档列出 citadels-online 客户端所需的全部音效事件。
>
> **当前状态（2026-08-09）：40 个采样文件已就位并已接线**，由 `generate_sfx.py`（Python + ffmpeg）程序化生成，**原创 / 公有领域，无第三方许可约束**。播放层 `utils/audio.ts` 通过 howler.js 优先播放这些采样，Web Audio 合成作为回退（采样缺失/howler 不可用时）。
>
> 后续若替换为外部 CC0 采样，按下表"文件名"替换对应文件，并在本文件末尾 ATTRIBUTION 段记录来源 URL + 许可证。`utils/audio.ts` 无需改动（howler 按文件名懒加载）。

---

## 1. 音效分层模型（D9）

| 层 | 触发源 | 听众 | 音量/质感 |
|---|---|---|---|
| **L1 local-only** | UI-handler | 仅自己 | 全额 |
| **L2 global 量感分流** | feed/state-diff | 全场 | 自己=清脆饱满；他人=极弱沉闷远景（distant 变体） |
| **L3 global 广播** | feed | 全场高优 | 统一基础广播 |

---

## 2. 事件清单（对应 `avConfig.ts`）

### L1 — local-only（仅自己听到）

| 事件 id | 触发 | 描述 | 合成方案（当前） | 采样文件名（后期） |
|---|---|---|---|---|
| `ui_hover` | 卡牌/按钮 hover | 轻摩擦 | 短促低频噪声脉冲 0.05s | `hover.mp3` / `hover.ogg` |
| `ui_click` | 点击可交互元素 | 清脆点按 | 短方波 click 0.03s | `click.mp3` / `click.ogg` |
| `ui_panel_open` | 打开设置/聊天面板 | 面板展开 | 上行 sweep 0.12s | `panel_open.mp3` / `panel_open.ogg` |
| `ui_error` | 金币不足/无法建造等 | 错误提示 | 下行双音 buzz 0.2s | `error.mp3` / `error.ogg` |
| `self_countdown_tick` | 自己倒计时 <10s | 滴答警告 | 短脆 tick 0.04s，随秒重复 | `countdown_tick.mp3` / `countdown_tick.ogg` |

### L2 — global 量感分流（自己清脆 / 他人 distant）

| 事件 id | 触发 | 描述 | 合成方案（当前） | 采样文件名（后期） |
|---|---|---|---|---|
| `earn_gold` | feed `earn` | 拿金币；按 amount 选变体（1=单枚/2-3=滚动/4+=级联） | 三角波上音 + amount 决定重复次数；他人=muffled 低通 distant | `earn_1.mp3`/`earn_2.mp3`/`earn_3.mp3` + `earn_distant.mp3` |
| `draw_card` | state-diff 手牌+1 | 摸牌滑入 | 短促纸张摩擦噪声 0.08s；他人=distant | `draw.mp3` / `draw_distant.mp3` |
| `build_cheap` | feed `build`(self, 低价 1-2费) | 廉价建造落地 | 轻叩木质 0.1s；他人=distant | `build_cheap.mp3` / `build_cheap_distant.mp3` |

### L3 — global 广播（全员同一基础声）

| 事件 id | 触发 | 描述 | 合成方案（当前） | 采样文件名（后期） |
|---|---|---|---|---|
| `role_reveal` | feed `call` | 角色揭示/翻面 | 庄严双音 chord 0.25s | `role_reveal.mp3` / `role_reveal.ogg` |
| `stamp_kill` | feed `kill` | 刺杀印章落位 | 重砸低频 thud 0.15s | `stamp_kill.mp3` / `stamp_kill.ogg` |
| `stamp_rob` | feed `rob` | 偷窃印章落位 | 金属叮 + thud 0.15s | `stamp_rob.mp3` / `stamp_rob.ogg` |
| `kill_settle` | feed `call_killed` | 刺杀结算 | REPLACE：受害=心悸警报（低频脉冲 2 次）；他人=中性基础 | `kill_victim.mp3` / `kill_neutral.mp3` |
| `rob_settle` | feed `rob_move` | 偷窃结算 | LAYER：基础扒窃 + 施害成功收尾 + 受害金库被掏收尾 | `rob_base.mp3` / `rob_perp.mp3` / `rob_victim.mp3` |
| `build_expensive` | feed `build`(高价/紫区) | 高价/紫区建造 | 重落地 + 回响 0.3s | `build_expensive.mp3` / `build_expensive.ogg` |
| `destroy` | feed `destroy` | 军阀拆迁 | REPLACE：受害=受击；军阀=成功；他人=中性 | `destroy_victim.mp3` / `destroy_perp.mp3` / `destroy_neutral.mp3` |
| `turn_handoff` | feed `call`/chip 变化 | 回合交接 | 短过渡音 0.1s | `turn_handoff.mp3` / `turn_handoff.ogg` |
| `win_stinger` | `gameProgress==='FINISHED'` 胜 | 胜利 stinger | 上行 major chord 0.5s | `win.mp3` / `win.ogg` |
| `lose_stinger` | `gameProgress==='FINISHED'` 负 | 失败 stinger | 下行 minor chord 0.5s | `lose.mp3` / `lose.ogg` |

---

## 3. 变体与 intensity（D10）

`intensity`(1-3) 同时驱动视觉 spring 刚度/缩放幅度与音频变体+音量：

| intensity | 视觉 | 音频 |
|---|---|---|
| 1 | 轻回弹小缩放 | 轻音、低音量 |
| 2 | 中等 | 中等 |
| 3 | 重落地大回弹 | 重音、高音量 |

建造 intensity 由 cost + 紫区决定：1-2费=intensity 1（`build_cheap`）、3-5费=intensity 2、6+费/紫区=intensity 3（`build_expensive`）。

---

## 4. 重连安全（边沿触发）

所有游戏事件音效**边沿触发**，从不"状态存在即播"：
- feed 驱动用签名边沿（`lastSigRef`）；
- state-diff 用"首次观测=基线"（`useRef` 初始化为当前值，重连不回放历史）；
- UI-handler 直接调。
- **重连后不得回放累积事件**（否则一片叮当）。

---

## 5. ATTRIBUTION

| 文件名 | 来源 URL | 许可证 | 备注 |
|---|---|---|---|
| `*.mp3` / `*.ogg` | 程序化生成（见 `generate_sfx.py`） | 原创 / Public Domain | 使用 Python + ffmpeg 合成；可自由替换为 CC0 采样 |

所有当前采样音频均为程序化生成，无版权限制。后续若引入第三方 CC0 采样，请更新上表并替换对应文件。用户保留否决/替换权（D12）。
