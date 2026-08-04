# 富饶之城 · Citadels Online

> **经典桌游《富饶之城》的非官方在线版 · 6 人 3v3 团队竞技**

> **English**: [Read Me in English](./README.en.md)

暗夜执权，金石铸城。铁甲隐于阴影，八面角色化身，筹谋五色城邦——在这座每局必有新谋略的城池里，先建成第八座城区者问鼎。

本项目是在线桌游《富饶之城 / Citadels》的非官方实现，支持登录对战、竞技排名、AI 托管与自动模拟，规则以服务端为权威。

<p>
  <img alt="React" src="https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white" />
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-6-3178C6?logo=typescript&logoColor=white" />
  <img alt="Vite" src="https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white" />
  <img alt="Zustand" src="https://img.shields.io/badge/Zustand-5-593D88?logo=zustand&logoColor=white" />
  <img alt="Express" src="https://img.shields.io/badge/Express-4-000000?logo=express&logoColor=white" />
  <img alt="Socket.IO" src="https://img.shields.io/badge/Socket.IO-4-010101?logo=socket.io&logoColor=white" />
  <img alt="SQLite" src="https://img.shields.io/badge/SQLite-3-003B57?logo=sqlite&logoColor=white" />
  <img alt="Node.js" src="https://img.shields.io/badge/Node.js-20-339933?logo=node.js&logoColor=white" />
  <img alt="i18next" src="https://img.shields.io/badge/i18next-24-26A69A?logo=i18next&logoColor=white" />
  <img alt="License" src="https://img.shields.io/badge/License-MIT-green" />
</p>

---

## ✨ 特性一览

- 🎮 **6 人 3v3 团队竞技**：座位奇偶分队，建成城固定 8 区，首完 +4 / 同回合后完 +2
- ⚔️ **经典八大角色**：刺客、盗贼、魔法师、国王、主教、商人、建筑师、领主，身藏绝技
- 🌆 **五色城区经营**：竞技、贵族、宗教、商业、军事五类城区，收集金币优先建成
- 🤖 **AI 托管**：回合超时或掉线自动进入托管，由 AI 代为决策，避免卡局
- 🔀 **自动模拟**：离线规则引擎可独立跑完整局，适合策略评估与 AI 训练
- 🌍 **中英双语**：默认中文，可一键切换 English

---

## 🛠 技术栈

| 模块 | 技术 |
|---|---|
| 前端 `client-react/` | React 18 · Vite · Zustand · React Router · i18next |
| 服务端 `server/` | Express · Socket.IO · better-sqlite3 · JWT |
| 共享 `common/` | 纯类型 / 枚举 / 视图纯函数（含单测，作为前端行为契约） |

三层 Monorepo，规则引擎位于 `server/src/engine`，可脱离 Socket 独立运行。

---

## 🚀 快速开始（开发）

### 环境要求

- Node.js **20.x LTS**（仓库 `.nvmrc` 固定为 `20`）
- npm 10+

> Windows 下若 PowerShell 拦截 `npm`，请使用 `npm.cmd`。

### 1. 安装依赖

构建顺序是**铁律**：`common` 必须先 build，server / client-react 才能引用其 `dist`。

```bash
cd common && npm install && npm run build
cd ../server && npm install
cd ../client-react && npm install
```

### 2. 一键启动（Windows）

在仓库根目录执行：

```powershell
.\scripts\dev-start.cmd          # 启动后端（8081）+ 前端（3010）
.\scripts\dev-restart.cmd        # 先 stop 再 start（全栈重启）
.\scripts\dev-stop.cmd           # 停止后端 + 前端
.\scripts\dev-status.cmd         # 查看 pid、端口、访问地址
```

启动后访问：

| 服务 | 地址 | 说明 |
|---|---|---|
| 前端（React，现役） | http://127.0.0.1:**3010**/ | Vite dev，代理 `/s/` 与 `/api` 到 8081 |
| 后端 | http://127.0.0.1:**8081**/ | Express + Socket.IO |

> Socket 路径固定为 **`/s/`**（前端 Vite 代理与 server 一致；如改动须两处同改）。

### 3. 手动双进程（Linux / macOS）

```bash
# 终端 1 —— 后端
cd server
npm run start          # 或 npm run start:debug

# 终端 2 —— 前端
cd client-react
npm run dev -- --host 127.0.0.1 --port 3010
```

### 4. 本机类生产（prod-like）

```bash
npm run build            # 按序构建 common → client-react → server
node server/dist/index.js
```

浏览器只访问 `http://localhost:8081`（或 `PORT`），用于验证静态资源、`history` fallback 与同域 Socket。

---

## 📦 常用脚本

根目录 `package.json` 提供了聚合命令：

| 命令 | 作用 |
|---|---|
| `npm run build` | 按序构建 common → client-react → server（部署、上线前必跑） |
| `npm run typecheck` | 构建 common 后对 server 做类型检查 |
| `npm run lint` | 对 common / server / client-react 依次执行 ESLint |

子包各自还提供 `test`（vitest）、`typecheck` 等，详见各 `package.json`。

---

## 🧪 测试

- `common`：视图纯函数单测（`vitest run`）
- `server`：覆盖核心规则、AI 评估、引擎一致性等（`npm run test --prefix server`）

详见 [scripts/README.md](./scripts/README.md) 与 [docs/TESTING.md](./docs/TESTING.md)。

---

## 📄 文档索引

| 文档 | 说明 |
|---|---|
| [docs/GAMERULES.md](./docs/GAMERULES.md) | 游戏规则与模式约定 |
| [docs/TESTING.md](./docs/TESTING.md) | 测试结构、命令与用例说明 |
| [docs/UI_OPTIMIZATION_PLAN.md](./docs/UI_OPTIMIZATION_PLAN.md) | UI 优化计划（含进度标注，部分已完成） |
| [docs/IMPROVEMENT_PLAN_2026.md](./docs/IMPROVEMENT_PLAN_2026.md) | 历史优化与重构记录 |
| [docs/AI_ROADMAP.md](./docs/AI_ROADMAP.md) | AI 策略路线图与评估体系 |
| [scripts/README.md](./scripts/README.md) | 部署、运行与自动模拟说明 |

> 生产部署（阿里云一键部署、日常更新、管理后台隧道访问等）请参考 [scripts/README.md](./scripts/README.md)。

---

## 📌 仓库结构

```text
common/        共享类型、枚举与视图纯函数（先 build）
server/        权威规则、房间、Socket、数据库、离线规则引擎
client-react/  React 前端（现役）
scripts/       开发脚本、自动模拟、部署脚本
docs/          技术文档
```

---

## ⚖️ 许可证

本项目基于 [MIT License](./LICENSE) 发布。桌面游戏《富饶之城 / Citadels》由 Bruno Faidutti 设计，版权归原作者及发行方所有；本项目仅作学习交流与技术探索，非商业用途。角色与卡牌美术为 AI 生成原创素材，未使用原版游戏原画。

---

在线对局：**https://www.citadels.cloud**
