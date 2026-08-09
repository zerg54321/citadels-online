# 音效素材清单（SFX Manifest）

> 本文档列出 citadels-online 客户端所需的全部音效事件、触发链路与文件映射。
>
> **当前状态（2026-08-09）：40 个采样文件已就位并已接线**，由 `generate_sfx.py`（Python + ffmpeg）程序化生成，**原创 / 公有领域，无第三方许可约束**。播放层 `utils/audio.ts` 通过 howler.js 优先播放这些采样，Web Audio 合成作为回退（采样缺失/howler 不可用时）。
>
> **P0+P1 修订（2026-08-10）：修复 `dispatchAv` 双播 bug（lead>0 的 6 个重音事件此前各播两次）；按"单回合 8~12 声"目标删减/降级——turn_handoff 他人提示移除、role_reveal 仅被刺/被偷受害者、kill/rob_settle 旁观不播、destroy 旁观降至 0.3 gain、build_expensive 他人走 distant(0.3)、draw_card 仅自己、earn_distant 0.3 gain、self_countdown_tick 收紧至 ≤5s。详见各事件表"备注"列。**
>
> 后续若替换为外部 CC0 采样，按下表"文件名"替换对应文件，并在本文件末尾 ATTRIBUTION 段记录来源 URL + 许可证。`utils/audio.ts` 无需改动（howler 按文件名懒加载）。

---

## 1. mp3 / ogg 优先级

**优先 mp3，浏览器不支持时回退 ogg。**

`audio.ts:64-67` 的 `sourcesFor()` 对同时有 mp3+ogg 的事件返回 `[mp3, ogg]`，howler 按数组顺序尝试——浏览器支持 mp3 就播 mp3，不支持才回退 ogg。mp3-only 的事件只返回 `[mp3]`。

有 ogg 回退的事件（`audio.ts:58-62` 的 `HAS_OGG` 集合）：
`hover` `click` `panel_open` `error` `countdown_tick` `role_reveal` `stamp_kill` `stamp_rob` `build_expensive` `turn_handoff` `win` `lose`

其余事件（`earn_1/2/3` `earn_distant` `draw` `draw_distant` `build_cheap` `build_cheap_distant` `kill_victim` `kill_neutral` `rob_base` `rob_perp` `rob_victim` `destroy_victim` `destroy_perp` `destroy_neutral`）只有 mp3。

---

## 2. 音效分层模型（D9）

| 层 | 触发源 | 听众 | 音量/质感 |
|---|---|---|---|
| **L1 local-only** | UI-handler | 仅自己 | 全额 |
| **L2 global 量感分流** | feed/state-diff | 全场 | 自己=清脆饱满；他人=极弱沉闷远景（distant 变体） |
| **L3 global 广播** | feed | 全场高优 | 统一基础广播 |

---

## 3. 音频引擎调用链路

一个音效从触发到播放的完整路径：

```
触发源（feed / state-diff / UI-handler）
  → dispatchAv(event, opts)         [utils/av.ts]    按 audioLeadMs 排程
    → playSfx(audioId, opts)        [utils/audio.ts]  读 muted/sfxVolume
      → eventToFiles(id, opts)      [utils/audio.ts]  选文件 + 变体
        → tryHowler(files, vol)     [utils/audio.ts]  howler 采样优先
          ↗ 成功 → 播放 mp3/ogg
          ↘ 失败 → synthFallback()  [utils/audio.ts]  Web Audio 合成回退
```

- `dispatchAv`（`av.ts:37`）：带 `audioLeadMs` 提前量排程。**P0 修复**：lead>0 时只 `setTimeout` 一次（此前立即播 + 延迟播各一次，6 个最响事件叠成双份）；lead<0 按 |lead| 延迟一次；lead=0 立即播一次。`playUi`（`av.ts:64`）无提前量，用于 L1 UI 事件。
- `playSfx`（`audio.ts:314`）：读 `settingsSlice` 的 `muted`/`sfxVolume`，静音或音量 0 则不播。
- `eventToFiles`（`audio.ts:94`）：按事件 id + `role` + `amount` + `distant` 选具体文件。

---

## 4. 事件清单与触发链路

### L1 — local-only（仅自己听到）

| 事件 id | 触发源 | 调用点 | 播放文件 |
|---|---|---|---|
| `ui_hover` | 卡牌/按钮 hover | （未接线，预留） | `hover.mp3` / `hover.ogg` |
| `ui_click` | 点击 ActionPanel 按钮 | `ActionPanel.tsx` onClick → `playUi('ui_click')` | `click.mp3` / `click.ogg` |
| `ui_panel_open` | 打开设置/聊天面板 | （未接线，预留） | `panel_open.mp3` / `panel_open.ogg` |
| `ui_error` | sendMove 失败 | `BoardScreen.tsx` sendMove catch → `playUi('ui_error')` | `error.mp3` / `error.ogg` |
| `self_countdown_tick` | 自己倒计时 ≤5s 每秒 | `BoardScreen.tsx` countdown effect → `playUi('self_countdown_tick')` | `countdown_tick.mp3` / `countdown_tick.ogg` |

### L2 — global 量感分流（自己清脆 / 他人 distant）

| 事件 id | 触发源 | 调用点 | 播放文件 |
|---|---|---|---|
| `earn_gold` | feed `earn`（收租） | `useAvFeedDispatch` case `earn` → `dispatchAv('earn_gold', {amount, distant})` | 自己：`earn_1.mp3`(amount=1) / `earn_2.mp3`(2-3) / `earn_3.mp3`(4+)；他人：`earn_distant.mp3`（P1：gainMul 0.3，保留微弱经济信号） |
| `draw_card` | 手牌数 +1（state-diff） | `useAvStateDispatch` hand-length 边沿 → `dispatchAv('draw_card')`（P1：仅自己，他人抽牌已删除——信息量最低，建筑师每回合必触发） | 自己：`draw.mp3`（`draw_distant.mp3` 保留备用但不再触发） |
| `build_cheap` | feed `build`（cost 1-3） | `useAvFeedDispatch` case `build` → `dispatchAv('build_cheap', {distant})` | 自己：`build_cheap.mp3`；他人：`build_cheap_distant.mp3` |

### L3 — global 广播（全员同一基础声）

| 事件 id | 触发源 | 调用点 | 播放文件 |
|---|---|---|---|
| `role_reveal` | 角色卡翻面（seat/self 卡） | `CharacterCard.tsx` displayBack 边沿 → `dispatchAv('role_reveal')`（`claimRevealAudio` 去重）**P1：仅 `killed‖robbed` 受害者翻面触发；普通轮到翻面静默** | `role_reveal.mp3` / `role_reveal.ogg` |
| `stamp_kill` | feed `kill`（刺客选目标） | `useAvFeedDispatch` case `kill` → `dispatchAv('stamp_kill')` | `stamp_kill.mp3` / `stamp_kill.ogg` |
| `stamp_rob` | feed `rob`（盗贼选目标） | `useAvFeedDispatch` case `rob` → `dispatchAv('stamp_rob')` | `stamp_rob.mp3` / `stamp_rob.ogg` |
| `kill_settle` | feed `call_killed`（被刺角色结算轮到） | `useAvFeedDispatch` case `call_killed` → `dispatchAv('kill_settle', {role})`**P1：role=other 旁观不播，仅 victim/刺客** | 受害=`kill_victim.mp3`；刺客=`kill_neutral.mp3`（旁观已不播） |
| `rob_settle` | feed `rob_move`/`rob_move_empty`（金币转移） | `useAvFeedDispatch` case `rob_move` → `dispatchAv('rob_settle', {role, amount})`**P1：role=other 旁观不播，仅盗贼/被偷者** | LAYER：`rob_base.mp3` + 60ms后 `rob_perp.mp3`(盗贼) / `rob_victim.mp3`(被偷者)（旁观已不播） |
| `build_expensive` | feed `build`（cost ≥4） | `useAvFeedDispatch` case `build` → `dispatchAv('build_expensive', {distant})` | 自己：`build_expensive.mp3` / `build_expensive.ogg`；**P1：他人 distant gainMul 0.3（无独立 distant 采样，降 gain；synth 回退走 distantChain 低通）** |
| `destroy` | feed `destroy`（军阀拆迁） | `useAvFeedDispatch` case `destroy` → `dispatchAv('destroy', {role})` | 受害=`destroy_victim.mp3`；军阀=`destroy_perp.mp3`；他人=`destroy_neutral.mp3`（**P1：neutral gainMul 0.3**） |
| `turn_handoff` | ~~feed `call`（他人角色轮到）~~ | **P1：feed 驱动的他人提示已移除**（频率最高、信息量最低）。自己回合仍由 `BoardScreen` → `playTurnSound()`（复用 `turn_handoff` 采样）提示 | `turn_handoff.mp3` / `turn_handoff.ogg`（仅 self-turn 使用） |
| `win_stinger` | gameProgress → FINISHED（胜） | `useAvStateDispatch` progress 边沿 → `dispatchAv('win_stinger')` | `win.mp3` / `win.ogg` |
| `lose_stinger` | gameProgress → FINISHED（负） | `useAvStateDispatch` progress 边沿 → `dispatchAv('lose_stinger')` | `lose.mp3` / `lose.ogg` |

---

## 5. 刺杀链路（详细时序）

刺杀涉及三个独立时刻，每个播放不同音效：

### 时刻 ① 刺客选目标（feed `kill`）

| 项目 | 说明 |
|------|------|
| **触发** | 刺客提交 `ASSASSIN_KILL`，服务端推 feed `{kind:'kill', params:{role}}` |
| **调用** | `useAvFeedDispatch` case `kill` → `dispatchAv('stamp_kill')` |
| **文件** | `stamp_kill.mp3`（重砸低频 thud） |
| **听众** | 全场（L3 广播） |
| **意义** | "有人被刺杀了"——戏剧性重击，全员听到但此时只能从行动日志看到被刺角色名 |

### 时刻 ② 被刺角色亮牌翻面（CharacterCard 视觉）

| 项目 | 说明 |
|------|------|
| **触发** | 被刺角色的座位牌轮到时翻面（`exportPlayerCharacters` 的 `turnReached` 变 true） |
| **调用** | `CharacterCard.tsx` displayBack 边沿 → `dispatchAv('role_reveal')`（`claimRevealAudio` 去重）**P1：仅 `killed` 为 true 时触发；普通角色轮到翻面静默** |
| **文件** | `role_reveal.mp3`（庄严双音 chord） |
| **听众** | 全场 |
| **视觉** | 💀 印章砸下（motion.div spring 动画），**无声**——thud 已在时刻①播放 |

### 时刻 ③ 被刺角色结算（feed `call_killed`）

| 项目 | 说明 |
|------|------|
| **触发** | 被刺角色轮到时被跳过，服务端推 feed `{kind:'call_killed', params:{player, role}}` |
| **调用** | `useAvFeedDispatch` case `call_killed` → `dispatchAv('kill_settle', {role})` |
| **role 判定** | `params.player === selfUsername` → `victim`；`getLastIssuedKillRole() === params.role` → `perpetrator`；否则 `other` |
| **文件** | 受害=`kill_victim.mp3`（心悸警报，低频脉冲2次）；刺客=`kill_neutral.mp3`（中性基础）。**P1：role=other 旁观不播**（受害在 ①stamp_kill 已听 thud） |
| **听众** | 按角色分化（D9 REPLACE：受害听心悸，刺客听中性；旁观静默） |

### 自己被刺的完整体验

1. 刺客提交 → 你听到 `stamp_kill.mp3`（重击 thud）
2. ...时间流逝，其他角色行动...
3. 轮到你的角色 → 座位牌翻面 → `role_reveal.mp3` + 💀印章砸下（无声）
4. 同一时刻 feed `call_killed` 到达 → `params.player === 你的username` → `kill_victim.mp3`（心悸警报）

---

## 6. 偷窃链路（详细时序）

### 时刻 ① 盗贼选目标（feed `rob`）

| 项目 | 说明 |
|------|------|
| **触发** | 盗贼提交 `THIEF_ROB`，服务端推 feed `{kind:'rob', params:{role}}` |
| **调用** | `useAvFeedDispatch` case `rob` → `dispatchAv('stamp_rob')` |
| **文件** | `stamp_rob.mp3`（金属叮 + thud） |
| **听众** | 全场 |

### 时刻 ② 被偷角色亮牌翻面

| 项目 | 说明 |
|------|------|
| **触发** | 被偷角色座位牌翻面 |
| **文件** | `role_reveal.mp3`（**P1：仅 `robbed` 为 true 时触发**）；💰 印章砸下（无声） |

### 时刻 ③ 被偷角色结算（feed `rob_move` / `rob_move_empty`）

| 项目 | 说明 |
|------|------|
| **触发** | 被偷角色轮到时金币转移，服务端推 feed `{kind:'rob_move', params:{player, thief, amount, role}}` |
| **调用** | `useAvFeedDispatch` case `rob_move` → `dispatchAv('rob_settle', {role, amount})` |
| **role 判定** | `params.thief === selfUsername` → `perpetrator`；`params.player === selfUsername` → `victim`；否则 `other` |
| **文件** | LAYER 叠加：基础 `rob_base.mp3` + 60ms后 `rob_perp.mp3`(盗贼) / `rob_victim.mp3`(被偷者)。**P1：role=other 旁观不播** |
| **0 金币** | feed `rob_move_empty` → 同上但 amount=0 |

---

## 7. role 分类（D9）

L3 结算事件的 `role` 由 `useAvFeedDispatch` 从 feed params + 本地 self + 本地发出的 move 历史判定：

| feed kind | role 数据源 | 判定逻辑 |
|-----------|------------|----------|
| `call_killed` | `params.player`(受害 username) + `utils/avIssuedMoves.ts`(本地发出的 ASSASSIN_KILL 目标) | `player===self` → victim；`issuedKill===role` → perpetrator；否则 other |
| `rob_move` / `rob_move_empty` | `params.thief`(盗贼 username) + `params.player`(受害 username) | `thief===self` → perpetrator；`player===self` → victim；否则 other |
| `destroy` | `params.player`(军阀 username) + `params.victim`(受害 username) | `player===self` → perpetrator；`victim===self` → victim；否则 other |

> **注意**：`call_killed` 的 `params.player` 是被刺角色的**持有者**（受害），不是刺客。刺客身份 feed 不含，须靠本地 `gameSlice.sendMove` 在发出 `ASSASSIN_KILL` 时 `recordIssuedKill(data)` 记录目标，再由 `useAvFeedDispatch` 比对。新轮 feed `round` 时 `clearIssuedKill` 清理。

---

## 8. 变体与 intensity（D10）

`intensity`(1-3) 同时驱动视觉 spring 刚度/缩放幅度与音频变体+音量：

| intensity | 视觉 | 音频 |
|---|---|---|
| 1 | 轻回弹小缩放 | 轻音、低音量 |
| 2 | 中等 | 中等 |
| 3 | 重落地大回弹 | 重音、高音量 |

建造 intensity 由 cost 决定：1-3费 → `build_cheap`(L2)；≥4费 → `build_expensive`(L3)。

`earn_gold` 按 amount 选变体：1 → `earn_1`；2-3 → `earn_2`；4+ → `earn_3`。**禁逐枚循环**（amount 是聚合数）。

---

## 9. 无 feed 的事件说明

以下游戏行为**不发 feed**，音效走 state-diff 或无音效：

| 行为 | feed? | 音效触发方式 |
|------|-------|-------------|
| 选金币 +2（`TAKE_GOLD`） | 无 | **无音效**（`earn` feed 专指收租，非选金币） |
| 摸牌（建筑师抽2/铁匠铺/选牌） | 无 | state-diff：`board.hand.length` 递增 → `draw_card`（**P1：仅自己手牌递增触发，他人抽牌已删除**） |
| 角色选牌（`CHOOSE_CHARACTER`） | 无 | 无音效（选牌本身无声） |
| 胜负结算 | 无 | state-diff：`gameProgress` → FINISHED 边沿 → `win/lose_stinger` |

---

## 10. 重连安全（边沿触发）

所有游戏事件音效**边沿触发**，从不"状态存在即播"：
- **feed 驱动**：`useAvFeedDispatch` 用 `lastProcessedRef`（已处理 index），只处理新增条目；session 切换（`self` 变化）或 feed 缩短时重基线不回放。
- **state-diff 驱动**：`useAvStateDispatch` 用 `handLenRef`/`prevProgressRef`，首次观测=基线（重连不回放历史）。
- **UI-handler 驱动**：直接调，天然边沿。
- **重连后不得回放累积事件**（否则一片叮当）。

---

## 11. 采样文件清单

共 40 个文件（28 mp3 + 12 ogg），位于 `client-react/public/sfx/`：

| 文件名 | 事件 | 有 ogg? |
|--------|------|---------|
| `hover.mp3` / `hover.ogg` | ui_hover | ✓ |
| `click.mp3` / `click.ogg` | ui_click | ✓ |
| `panel_open.mp3` / `panel_open.ogg` | ui_panel_open | ✓ |
| `error.mp3` / `error.ogg` | ui_error | ✓ |
| `countdown_tick.mp3` / `countdown_tick.ogg` | self_countdown_tick | ✓ |
| `earn_1.mp3` | earn_gold (amount=1, 自己) | |
| `earn_2.mp3` | earn_gold (amount=2-3, 自己) | |
| `earn_3.mp3` | earn_gold (amount=4+, 自己) | |
| `earn_distant.mp3` | earn_gold (他人) | |
| `draw.mp3` | draw_card (自己) | |
| `draw_distant.mp3` | draw_card (他人，**P1：已停用**保留备用) | |
| `build_cheap.mp3` | build_cheap (自己) | |
| `build_cheap_distant.mp3` | build_cheap (他人) | |
| `build_expensive.mp3` / `build_expensive.ogg` | build_expensive（自己全量；**P1：他人 distant gainMul 0.3**） | ✓ |
| `role_reveal.mp3` / `role_reveal.ogg` | role_reveal（**P1：仅被刺/被偷受害者**） | ✓ |
| `stamp_kill.mp3` / `stamp_kill.ogg` | stamp_kill | ✓ |
| `stamp_rob.mp3` / `stamp_rob.ogg` | stamp_rob | ✓ |
| `kill_victim.mp3` | kill_settle (受害) | |
| `kill_neutral.mp3` | kill_settle (刺客；**P1：旁观已不播**) | |
| `rob_base.mp3` | rob_settle (基础，盗贼/被偷者；**P1：旁观已不播**) | |
| `rob_perp.mp3` | rob_settle (盗贼尾音) | |
| `rob_victim.mp3` | rob_settle (被偷者尾音) | |
| `destroy_victim.mp3` | destroy (受害) | |
| `destroy_perp.mp3` | destroy (军阀) | |
| `destroy_neutral.mp3` | destroy (他人，**P1：gainMul 0.3**) | |
| `turn_handoff.mp3` / `turn_handoff.ogg` | turn_handoff（**P1：feed 驱动他人提示已移除，仅 self-turn `playTurnSound` 使用**） | ✓ |
| `win.mp3` / `win.ogg` | win_stinger | ✓ |
| `lose.mp3` / `lose.ogg` | lose_stinger | ✓ |

---

## 12. ATTRIBUTION

| 文件名 | 来源 URL | 许可证 | 备注 |
|---|---|---|---|
| `*.mp3` / `*.ogg` | 程序化生成（见 `generate_sfx.py`） | 原创 / Public Domain | 使用 Python + ffmpeg 合成；可自由替换为 CC0 采样 |

所有当前采样音频均为程序化生成，无版权限制。后续若引入第三方 CC0 采样，请更新上表并替换对应文件。用户保留否决/替换权（D12）。
