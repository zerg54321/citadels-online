# Citadels Online（富饶之城在线）

基于 [antbrl/citadels-online](https://github.com/antbrl/citadels-online) 的 Monorepo：在线桌游《富饶之城 / Citadels》。

当前重点是把“在线对局”“离线规则引擎”“AI 训练/自动模拟”“回放可视化”串成一套可复用的系统，优先支持：

- VPS 一体部署
- 6 人 3v3 竞技模式
- 离线规则引擎与回放生成
- 便于后续接入 AI 训练或自动策略评估

## 项目定位

这个仓库现在已经不只是一个简单的在线房间 demo，而是一个较完整的“游戏规则 + 实时服务 + 离线模拟 + 回放查看”组合：

- 前端：Vue 3 + Vite + Bootstrap，负责房间、对局、观战与回放页面
- 服务端：Express + Socket.IO，负责在线房间、玩家动作、状态同步与游戏规则
- 共享协议：common 包，提供类型与跨端数据约定
- 离线引擎：server/src/engine，适合做 AI 训练、自动对局、回放导出
- 回放系统：支持把一局完整过程序列化为 JSON，并在浏览器中查看

## 文档索引

| 文档 | 说明 |
|---|---|
| [docs/IMPROVEMENT_PLAN_2026.md](./docs/IMPROVEMENT_PLAN_2026.md) | 当前优化计划（防 bug / 逻辑抽取 / 测试 / UI 美化） |
| [docs/ROADMAP.md](./docs/ROADMAP.md) | 项目分阶段路线与验收目标 |
| [docs/DEV_DEPLOY.md](./docs/DEV_DEPLOY.md) | 开发与部署约定、构建顺序、VPS 部署说明 |
| [docs/DEPENDENCY_BASELINE.md](./docs/DEPENDENCY_BASELINE.md) | 依赖基线与升级策略 |
| [docs/archive/](./docs/archive/) | 已归档文档（旧 `CODE_IMPROVEMENT_PLAN.md` 等） |
| [scripts/README.md](./scripts/README.md) | 本地调试脚本、自动模拟、回放脚本说明 |

## 仓库结构

```text
common/      共享类型与协议
server/      游戏服务、规则引擎、数据库、Socket 逻辑
client/      Vue 前端页面与交互
scripts/     Windows 本地开发与自动测试脚本
docs/        说明文档
```

## 当前能力概览

### 1. 在线对局
- 支持房间创建、入座、开局、出牌、回合推进
- 具备基础登录、数据库、战绩与统计相关能力
- 支持观战与房间列表查看

### 2. 离线规则引擎
- 规则逻辑抽象到 [server/src/engine](server/src/engine)
- 可独立跑完一整局，而不依赖 Socket 或在线房间
- 适合用于 AI 训练、策略对比、自动模拟与回放生成

### 3. 回放与可视化
- 可将一局过程导出为 JSON 回放
- 提供浏览器回放页面，查看大轮、行动流、棋盘与玩家状态
- 回放文件可放到服务端或前端静态资源目录中直接查看

### 4. 自动对局与脚本测试
- 可通过脚本自动生成 6 人对局
- 可用本地脚本做自动推进、断言与回放生成

## 环境要求

- Node.js 20.x LTS
- npm 10+
- Windows 下建议使用脚本启动；Linux/macOS 也可手动启动

## 快速开始

### 1) 安装依赖

```bash
cd common && npm install && npm run build
cd ../server && npm install
cd ../client && npm install
```

### 2) 推荐：Windows 一键启动

在仓库根目录执行：

```bat
scripts\dev-start.cmd
```

PowerShell 下请显式带路径：

```powershell
.\scripts\dev-start.cmd
.\scripts\dev-status.cmd
.\scripts\dev-stop.cmd
```

启动后可访问：

- 前端：http://127.0.0.1:3000/
- 后端：http://127.0.0.1:8081/
- 回放页：http://127.0.0.1:3000/replay-viewer.html

## 运行方式

### 手动启动

```bash
# 终端 1
cd server
npm run start

# 终端 2
cd client
npm run dev
```

### 本机类生产启动

```bash
cd common && npm run build
cd ../client && npm run build
cd ../server && npm run build
node dist/index.js
```

## 离线引擎与回放

离线回放不依赖在线房间，可直接通过引擎跑完一局并产出 JSON：

```bat
scripts\generate-replay.cmd
```

默认生成的回放文件会写入：

- server/replays/example-replay.json
- client/public/replays/example-replay.json
- client/replays/example-replay.json

然后在浏览器中打开：

- http://127.0.0.1:3000/replay-viewer.html

## 自动对局与测试脚本

仓库内已有多种本地脚本，常见用法如下：

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
