# Citadels Online（富饶之城在线）

基于 [antbrl/citadels-online](https://github.com/antbrl/citadels-online) 的 Monorepo：在线桌游《富饶之城 / Citadels》。

当前重点：**6 人 3v3 团队竞技**在线对局，配套离线规则引擎、AI 托管与自动模拟，便于后续接入策略评估。

## 项目定位

- **前端**：React 18 + Vite + Zustand + React Router + i18next（`client-react/`，现役）
- **服务端**：Express + Socket.IO + better-sqlite3 + JWT，服务端权威，负责在线房间、玩家动作、状态同步与游戏规则
- **共享协议**：`common/` 包，提供纯类型 / 枚举 / 框架无关的 view 纯函数（含单测，作为前端行为契约）
- **离线引擎**：`server/src/engine`，可独立跑完一整局，适合 AI 训练、自动对局与策略评估

## 文档索引

| 文档 | 说明 |
|---|---|
| [docs/IMPROVEMENT_PLAN_2026.md](./docs/IMPROVEMENT_PLAN_2026.md) | 优化计划（防 bug / 逻辑抽取 / 测试 / React 重构 + UI 现代化记录） |
| [docs/AI_ROADMAP.md](./docs/AI_ROADMAP.md) | AI 策略优化路线图与评估体系 |
| [docs/GAMERULES.md](./docs/GAMERULES.md) | 游戏规则约定 |
| [scripts/README.md](./scripts/README.md) | 本地调试脚本、自动模拟说明 |

## 仓库结构

```text
common/        共享类型、枚举与 view 纯函数（先 build）
server/        权威规则、房间、Socket、数据库、离线引擎
client-react/  React 前端（现役）
scripts/       本地开发脚本、自动模拟、VPS 部署脚本
docs/          说明文档
```

## 当前能力概览

### 1. 在线对局
- 房间创建、入座、开局、出牌、回合推进
- 登录 / 注册 / 昵称、SQLite 战绩与竞技排名
- 观战与房间列表

### 2. 离线规则引擎
- 规则逻辑在 [server/src/engine](server/src/engine)，可独立跑完一整局，不依赖 Socket 或在线房间
- 适合 AI 训练、策略对比、自动模拟

### 3. 自动对局与脚本测试
- `scripts/sim-6p.js` 自动生成 6 人对局，端到端走通 HTTP + Socket 在线栈
- 服务端 `vitest` 覆盖核心规则与 AI 评估

## 环境要求

- Node.js **20.x LTS**（本机与 VPS 一致）
- npm 10+
- Windows 下建议使用 `scripts/dev-*.cmd` 启动；Linux/macOS 也可手动启动

## 快速开始

### 1) 安装依赖

构建顺序是**铁律**：`common` 必须先 build，server / client-react 才能引用其 `dist`。

```bash
cd common && npm install && npm run build
cd ../server && npm install
cd ../client-react && npm install
```

> Windows PowerShell 若拦截 `npm`，使用 `npm.cmd`。

### 2) Windows 一键启动

在仓库根目录执行：

```powershell
.\scripts\dev-start.cmd          # 启动后端（8081）+ React 前端（3010）
.\scripts\dev-restart.cmd        # 先 stop 再 start（全栈重启）
.\scripts\dev-stop.cmd           # 停止后端 + 前端
.\scripts\dev-status.cmd         # 查看 pid、端口、访问地址
```

启动后可访问：

| 服务 | 地址 | 说明 |
|---|---|---|
| React 前端（现役） | http://127.0.0.1:**3010**/ | Vite dev，代理 `/s/` 与 `/api` 到 8081 |
| 后端 | http://127.0.0.1:**8081**/ | Express + Socket.IO |

> Socket 路径固定为 **`/s/`**（client-react Vite 代理与 server 一致；改路径须两处同改）。

### 3) 手动双进程

```bash
# 终端 1
cd server
npm run start          # 或 npm run start:debug

# 终端 2
cd client-react
npm run dev -- --host 127.0.0.1 --port 3010
```

## 构建顺序（铁律）

```
1. common        → tsc → common/dist
2. client-react  → tsc -b && vite build → client-react/dist
3. server        → tsc → server/dist（依赖 common）
4. 启动          → node server/dist/index.js
                   静态目录指向 ../client-react/dist
```

- 修改 `common` 后必须先 rebuild common，再启 server / 刷新 client-react
- VPS / CI 脚本必须同一顺序
- 根目录 `npm run build` 已按此顺序串联三包

## 本机类生产（prod-like）

```bash
npm run build            # common → client-react → server
node server/dist/index.js
```

浏览器只访问 `http://localhost:8081`（或 `PORT`）。用途：验证静态资源、`history` fallback、同域 Socket。

## VPS 部署（Vultr / Debian 12）

部署形态为**单 VPS + 一体 Node**（Express + Socket.IO + 静态前端 + 本机 SQLite），由 `scripts/deploy.sh` 一键完成。

### 形态

```
Internet → Caddy (80 / 443, 自动 HTTPS)
              ├─ /s/  → WebSocket 升级 → Node (8081)
              └─ /    → Node（SPA + API）
Node 单进程 + 本机 SQLite，systemd 守护
```

- **不要**用 Vercel 跑游戏服（无合适长连接 + 内存房间模型）
- 默认不上 Supabase；数据库与 Node 同机即可

### 首次部署（fresh Vultr Debian 12，以 root 执行）

```bash
apt-get update && apt-get install -y git curl
git clone https://github.com/<you>/citadels-online.git /opt/citadels/citadels-online
cd /opt/citadels/citadels-online
bash scripts/deploy.sh --install
# 有域名 —— Caddy 自动签发并续期 Let's Encrypt 证书：
bash scripts/deploy.sh --install --domain citadels.example.com
# （可选）Let's Encrypt 到期提醒邮箱：
bash scripts/deploy.sh --install --domain citadels.example.com --email you@example.com
```

`--install` 会自动：安装系统依赖与 Node 20、生成 `.env`（含随机 `JWT_SECRET`）、构建三包、写入 systemd 单元、配置 Caddy 反代（自动处理 `/s/` WebSocket 升级与 80→443 跳转）、配置 ufw 防火墙、（传 `--domain` 时自动签发 Let's Encrypt 证书）并启动。脚本幂等，可重复执行。

### 后续更新（仓库目录内）

```bash
bash scripts/deploy.sh              # 备份 DB → git pull → 重建 → 重启 → 健康检查
bash scripts/deploy.sh --skip-build # 仅重启（已手动构建时）
```

### 环境变量（`server/.env` 或仓库根 `.env`）

| 变量 | 用途 | 开发默认 | 生产 |
|---|---|---|---|
| `PORT` | HTTP 端口 | `8081` | `8081`（由 Caddy 反代） |
| `NODE_ENV` | `development` / `production` | development | production |
| `DATABASE_PATH` | SQLite 路径 | `./data/citadels.sqlite` | `/opt/citadels/data/citadels.sqlite` |
| `JWT_SECRET` | 登录态密钥 | 本地固定测试串 | 强随机，由 deploy.sh 自动生成 |
| `CORS_ORIGIN` | 生产允许的前端来源 | `http://localhost:8081` | 站点公网 URL |
| `ENFORCE_HTTPS` | Node 直连 TLS 时才置 1 | `0` | `0`（由 Caddy 处理 80→443） |

- 提供 `.env.example`，**不提交** `.env`
- 禁止把密钥写进前端 `VITE_*`

### 上线前检查表

- [ ] Node 主版本与开发一致（20.x）
- [ ] `NODE_ENV=production`
- [ ] 已 build `client-react`，非 dev 代理
- [ ] Caddy 已运行（自动处理 `/s/` WebSocket 与 HTTPS）
- [ ] `JWT_SECRET` 非默认值
- [ ] 防火墙仅开放 22 / 80 / 443

### 数据与备份

- SQLite：数据文件放在 `/opt/citadels/data/`（勿被发布覆盖）；`deploy.sh` 每次更新前自动备份，保留最近 30 份
- 密码哈希存储；备份文件权限收紧

## 游戏模式与规则约定

| 模式 | 条件 | 战绩 |
|---|---|---|
| **竞技** | 仅 6 人强制 3v3（座位 135 vs 246）；建成城固定 8；首完 **+4** / 同回合后完 **+2**；队总分相同则平局 | 进排名 |
| **娱乐** | 非 6 人、含 AI 等 | 可查历史，不进排名 |

- 禁止游客入座；未登录可观战
- 账号字段：帐号名 + 密码 + 游戏内昵称（可改，默认=帐号名；榜单显示昵称）
- 行动时限：开局房主可配（默认建议 120s）；超时强制托管
- **有效托管**（AI 实际代打过至少一步）才触发战绩惩罚：己方胜则该玩家不计 ranking 胜；己方负则对方正常计胜
- 团队模式允许军阀拆队友；UI 需明显警告 + 二次确认

详见 [docs/GAMERULES.md](./docs/GAMERULES.md)。

## 自动对局脚本

```bat
scripts\sim-6p.cmd
node scripts\sim-6p.js --max-steps 800
node scripts\sim-6p.js --watch
```

相关脚本说明见 [scripts/README.md](./scripts/README.md)。

## 语言与说明

- 客户端默认中文，可切换为 English
- 当前功能以稳定性与可扩展性为主，后续将继续把规则引擎与 AI 策略能力往上补

## 许可证

原项目采用 MIT 许可证，详见 [LICENSE](./LICENSE)。
