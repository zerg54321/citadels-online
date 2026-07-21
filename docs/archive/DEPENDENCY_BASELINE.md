# 依赖基线表

与 [部署 / 开发约定](./DEV_DEPLOY.md) 配套。业务期以「能稳定做 3v3 / 账号」为准，**不**追求全库 latest。

## 图例

| 策略 | 含义 |
|---|---|
| **冻结** | 业务期不升，除非安全必修且验证通过 |
| **锁定** | 钉在当前大/小版本线，可补丁，勿跨大版本 |
| **可升** | 有明确收益时单独 PR 升级 |
| **待引入** | 计划功能用，选型方向已定 |
| **废弃 / 勿用** | 勿新增依赖；计划删除 |
| **禁止追新** | 明确不要为 latest 而动 |

---

## 1. 运行时 / 工具链

| 依赖 | 位置 | 约定 | 策略 | 说明 |
|---|---|---|---|---|
| Node.js | 全局 | **20.x LTS** | **锁定 20** | 本机与 VPS 一致；根 `engines` 应对齐 |
| npm | 全局 | 随 Node 20 | 锁定 | 生产优先 `npm ci` |
| TypeScript | common / server / client | **6.0.x**（当前 6.0.3） | **锁定** | 三包同一版本；勿无故升 7 |
| tsconfig | 各包 | `module`/`moduleResolution` Node16 系；`skipLibCheck` | 冻结思路 | 见各包 `tsconfig.json` |

---

## 2. common

| 依赖 | 当前 | 策略 | 说明 |
|---|---|---|---|
| 业务 runtime | 无 | 冻结 | 保持薄协议层 |
| typescript | 6.0.3 | 锁定 | 宜作 devDependency，避免当 runtime |
| eslint 相关 | 旧插件 | 冻结 | 不挡业务；以后再理 |

`package.json` 声明 `"type": "commonjs"`，并提供 `exports` 指向 `dist`。

---

## 3. server（游戏核心 — 保守）

| 依赖 | package 范围 | 策略 | 说明 |
|---|---|---|---|
| express | ^4.17 | **冻结主版本** | 可升 4.x 补丁；**不**上 Express 5 除非单独立项 |
| socket.io | ^4.0 | **锁定 4.x** | 与 client **同主版本** |
| connect-history-api-fallback | ^1.6 | 冻结 | SPA history 回退 |
| debug | ^4.3 | 冻结 | |
| citadels-common | file:../common | 冻结结构 | |
| nanoid | ^3.1 | **可移除 / 冻结** | ID 可用 `crypto` 自实现；勿升 nanoid 4（ESM） |
| nanoid-dictionary | ^4.2 | **废弃候选** | 若 ID 自实现则删除 |
| @types/* | 旧 | 冻结 | 配合 skipLibCheck |
| tslint | ^6 | **废弃** | 勿新增规则 |
| better-sqlite3 或 pg | — | **待引入** | 优先同机 SQLite |
| bcrypt / argon2 | — | **待引入** | 密码哈希 |
| jsonwebtoken 等 | — | **待引入** | 登录态 |

**禁止：** 换 Nest/Fastify、自研替换 Socket.IO 协议、单机阶段上 Redis。

---

## 4. client（前端 — 业务期冻结 UI 栈）

| 依赖 | package 范围 | 策略 | 说明 |
|---|---|---|---|
| vue | ^3.0 | **冻结 3.x 小步** | 升 3.4/3.5 需 UI 回归；禁止无目的大版本折腾 |
| vue-router | ^4.0 | 冻结 4.x | |
| vuex | ^4.0 | **冻结** | 新功能可用 composable；**不**先全量迁 Pinia |
| vue-i18n | ^9.0 | 冻结 9.x | 现支持 zh / en |
| vite | ^2.0 | **冻结至业务稳定** | 升 Vite 5+ 单独立项 |
| @vitejs/plugin-vue | ^1.1 | 随 Vite | |
| socket.io-client | ^4.0 | **锁定 4.x** | 与 server 一致 |
| bootstrap | ^4.6 | **冻结 4** | 升 5 = UI 专项 |
| jquery / popper.js | 既有 | 冻结 | Bootstrap 4 tooltip 等 |
| sass | ~1.32 | 冻结 | 乱升易与 BS4 冲突 |
| twemoji | ^13 | 冻结 | |
| eslint* | 7.x 系 | 冻结 | 不挡业务 |
| typescript | 6.0.3 | 锁定 | 与 common/server 一致 |

**禁止追新：** 同时升级 Vite5 + Bootstrap5 + Pinia + ESLint flat config。

---

## 5. 按业务阶段允许的变更

| 阶段 | 允许 | 不允许 |
|---|---|---|
| 现在～3v3 / 账号 | Node 文档与 engines 对齐 20；新增 sqlite / bcrypt / jwt；业务代码 | 大升 Vite / Vue / Bootstrap |
| 战绩与托管稳定后 | Vite 单独分支升级；Vue 补丁/小版本 | 换后端框架 |
| UI 大改 | Bootstrap 5 或新组件库 | 夹带协议 / 状态机重写 |
| 多实例（远期） | Redis + socket.io adapter | 过早优化 |

---

## 6. 安全与审计

| 动作 | 约定 |
|---|---|
| `npm audit` | 修复 **高危且不破坏 API** 的项；不强制 0 vulnerability |
| 新增依赖 | 必须说明用途；优先 Node 标准库（如 `crypto`） |
| lockfile | 必须提交；VPS 优先 `npm ci` |

---

## 7. 版本对齐矩阵（强制）

| 组 | 规则 |
|---|---|
| socket.io ↔ socket.io-client | 主版本相同（当前 4） |
| vue ↔ @vue/compiler-sfc | 版本匹配 |
| typescript | common / server / client 同一 6.0.x |
| Node | 开发 = 生产 = 20.x |

---

## 8. 一句话基线

> **游戏核心（Express + Socket.IO 4 + Vue3/Vuex + Vite2 + Bootstrap4）业务期冻结；TypeScript 6 与 Node 20 锁定；只新增账号 / DB / 安全所需库；前端工具链升级单独立项，不挡 3v3 竞技。**

---

## 9. 采样参考（非合同版本）

某次本机安装采样（会随 lock 变化，以 lockfile 为准）：

| 包 | 版本 |
|---|---|
| vue | 3.1.x |
| vite | 2.3.x |
| socket.io / socket.io-client | 4.1.x |
| express | 4.17.x |
| typescript | 6.0.3 |
