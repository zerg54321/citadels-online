# Citadels Online（富饶之城在线）

基于 [antbrl/citadels-online](https://github.com/antbrl/citadels-online) 的 Monorepo：在线桌游《富饶之城 / Citadels》。

当前重点：**6 人 3v3 团队竞技**在线对局，配套离线规则引擎、AI 托管、自动模拟与回放可视化，便于后续接入策略评估。

## 项目定位

- **前端**：React 18 + Vite + Zustand + React Router + i18next（`client-react/`，现役）；旧 Vue 3 客户端 `client/` 保留为遗留参考
- **服务端**：Express + Socket.IO + better-sqlite3 + JWT，服务端权威，负责在线房间、玩家动作、状态同步与游戏规则
- **共享协议**：`common/` 包，提供纯类型 / 枚举 / 框架无关的 view 纯函数（含单测，作为前端行为契约）
- **离线引擎**：`server/src/engine`，可独立跑完一整局，适合 AI 训练、自动对局、回放导出
- **回放系统**：一局完整过程序列化为 JSON，浏览器中查看

## 文档索引

| 文档 | 说明 |
|---|---|
| [docs/IMPROVEMENT_PLAN_2026.md](./docs/IMPROVEMENT_PLAN_2026.md) | **当前优化计划**（防 bug / 逻辑抽取 / 测试 / UI 现代化，含 React 重构记录） |
| [docs/archive/](./docs/archive/) | 已归档文档（旧 `ROADMAP.md`、`DEV_DEPLOY.md`、`DEPENDENCY_BASELINE.md`、`CODE_IMPROVEMENT_PLAN.md`） |
| [scripts/README.md](./scripts/README.md) | 本地调试脚本、自动模拟、回放脚本说明 |

## 仓库结构

```text
common/        共享类型、枚举与 view 纯函数（先 build）
server/        权威规则、房间、Socket、数据库、离线引擎
client-react/  React 前端（现役）
client/        Vue 前端（遗留参考，不再投入）
scripts/       Windows 本地开发与自动测试脚本
docs/          说明文档
```

## 当前能力概览

### 1. 在线对局
- 房间创建、入座、开局、出牌、回合推进
- 登录 / 注册 / 昵称、SQLite 战绩与竞技排名
- 观战与房间列表

### 2. 离线规则引擎
- 规则逻辑抽象到 [server/src/engine](server/src/engine)
- 可独立跑完一整局，不依赖 Socket 或在线房间
- 适合 AI 训练、策略对比、自动模拟与回放生成

### 3. 回放与可视化
- 一局过程导出为 JSON 回放
- 浏览器回放页面，查看大轮、行动流、棋盘与玩家状态
- 回放文件可放到服务端或前端静态资源目录中直接查看

### 4. 自动对局与脚本测试
- 脚本自动生成 6 人对局
- 本地脚本做自动推进、断言与回放生成

## 环境要求

- Node.js **20.x LTS**（本机与 VPS 一致）
- npm 10+
- Windows 下建议使用脚本启动；Linux/macOS 也可手动启动

## 快速开始

### 1) 安装依赖

构建顺序是**铁律**：`common` 必须先 build，server / client 才能引用其 `dist`。

```bash
cd common && npm install && npm run build
cd ../server && npm install
cd ../client-react && npm install
```

> Windows PowerShell 若拦截 `npm`，使用 `npm.cmd`。

### 2) 推荐：Windows 一键启动（React 客户端）

在仓库根目录执行：

```powershell
.\scripts\dev-start.cmd          # 启动后端（8081）+ 旧 Vue 前端（3000）
.\scripts\dev-react-start.cmd    # 启动 React 前端（3010，共用同一后端）
.\scripts\dev-react-restart.cmd  # 重启 React 前端
.\scripts\dev-react-stop.cmd     # 停止 React 前端
```

启动后可访问：

| 服务 | 地址 | 说明 |
|---|---|---|
| React 前端（现役） | http://127.0.0.1:**3010**/ | Vite dev，代理 `/s/` 与 `/api` 到 8081 |
| 后端 | http://127.0.0.1:**8081**/ | Express + Socket.IO |
| 旧 Vue 前端（遗留） | http://127.0.0.1:3000/ | 可选，仅作对照 |

> Socket 路径固定为 **`/s/`**（client Vite 代理与 server 一致；改路径须三处同改）。

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

- 修改 `common` 后必须先 rebuild common，再启 server / 刷新 client
- VPS / CI 脚本必须同一顺序

## 本机类生产（prod-like）

```bash
cd common && npm run build
cd ../client-react && npm run build
cd ../server && npm run build
node dist/index.js
```

浏览器只访问 `http://localhost:8081`（或 `PORT`）。用途：验证静态资源、`history` fallback、同域 Socket。

## VPS 部署

部署形态为**单 VPS + 一体 Node**（Express + Socket.IO + 静态前端 + 本机 SQLite）。

### 形态

```
Internet → Nginx / Caddy (443)
              ├─ /s/  → WebSocket 升级 → Node
              └─ /    → Node（SPA + API）
Node 单进程 + 本机 SQLite
```

- **不要**用 Vercel 跑游戏服（无合适长连接 + 内存房间模型）
- 默认不上 Supabase；数据库与 Node 同机即可

### 进程

- systemd 或 pm2 运行 `node dist/index.js`（或 `npm run start:prod --prefix server`）
- 部署时 build，进程启动命令避免每次全量编译
- 崩溃自动重启；日志轮转

### 环境变量

| 变量 | 用途 | 开发默认 | 生产 |
|---|---|---|---|
| `PORT` | HTTP 端口 | `8081` | 如 `3000`，由反代转发 |
| `NODE_ENV` | `development` / `production` | development | production |
| `DATABASE_PATH` | SQLite 路径 | `./data/citadels.sqlite` | 数据盘固定路径 |
| `JWT_SECRET` | 登录态密钥 | 本地固定测试串 | 强随机，勿入库 |
| `DEBUG` | 如 `citadels-server` | 可选开启 | 默认关闭 |

- 提供 `.env.example`，**不提交** `.env`
- 禁止把密钥写进前端 `VITE_*`

### 发布步骤

1. `git pull`
2. 三包 `npm ci`（或 `npm install`）：`common` / `server` / `client-react`
3. 按上文构建顺序 build
4. 数据库迁移（若有）
5. 重启进程（如 `systemctl restart citadels`）
6. 健康检查：首页 HTTP 200 + Socket 可连接

### 上线前检查表

- [ ] Node 主版本与开发一致（20.x）
- [ ] `NODE_ENV=production`
- [ ] 已 build `client-react`，非 dev 代理
- [ ] 反代已开启 WebSocket（`/s/`）
- [ ] 密钥非默认值
- [ ] 防火墙主要开放 80/443

### 数据与备份

- SQLite：数据文件放在固定目录（勿被发布覆盖）；定期拷贝备份
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

## 离线引擎与回放

离线回放不依赖在线房间，可直接通过引擎跑完一局并产出 JSON：

```bat
scripts\generate-replay.cmd
```

默认生成的回放文件写入 `server/replays/`、`client/public/replays/`、`client/replays/`，然后在浏览器打开 `http://127.0.0.1:3000/replay-viewer.html`。

## 自动对局与测试脚本

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
