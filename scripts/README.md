# 本地调试脚本说明

Windows 下一键启停开发环境（游戏服 + React 前端），以及自动模拟与 VPS 部署脚本。

| 脚本 | 作用 |
|---|---|
| `dev-start.cmd` | 编译 common/server，后台启动后端（8081）+ React 前端（3010） |
| `dev-stop.cmd` | 停止后端 + 前端，并释放 8081 / 3010 端口 |
| `dev-status.cmd` | 查看 pid、端口监听、访问地址 |
| `dev-restart.cmd` | 先 stop 再 start（全栈） |
| `sim-6p.cmd` / `sim-6p.js` | 6 人 3v3 自动入座开局 + L0 合法着法推进（端到端在线栈冒烟） |
| `deploy.sh` | VPS（Vultr / Debian 12）一键部署与更新 |

> 旧的 Vue 前端开发脚本与遗留 `test-*.js` 冒烟脚本已移除：逻辑测试已迁至 `server` 的 `vitest` 套件，端到端在线冒烟由 `sim-6p.js` 覆盖。

---

## 前置条件

1. 已安装 **Node.js 20.x**，且 `node`、`npm.cmd` 在 PATH 中
2. 已安装依赖：

```bat
cd common && npm install && npm run build
cd ..\server && npm install
cd ..\client-react && npm install
```

3. 在**仓库根目录**执行脚本（或双击 `scripts` 下的 cmd；脚本会自行切到根目录）

---

## 常用命令

### 仓库根目录

**CMD：**

```bat
scripts\dev-start.cmd
scripts\dev-status.cmd
scripts\dev-stop.cmd
scripts\dev-restart.cmd
```

**PowerShell（必须带路径前缀）：**

```powershell
.\scripts\dev-start.cmd
.\scripts\dev-status.cmd
.\scripts\dev-stop.cmd
.\scripts\dev-restart.cmd
```

### 已在 `scripts` 目录内

PowerShell **不会**自动执行当前目录下的命令，不要写 `dev-start.cmd`，应写：

```powershell
.\dev-start.cmd
```

CMD 在 `scripts` 目录下可直接：`dev-start.cmd`。

---

## 访问地址

| 服务 | 地址 |
|---|---|
| 前端（日常开发） | http://127.0.0.1:3010/ |
| 后端 API / Socket | http://127.0.0.1:8081/ |
| 健康检查 | http://127.0.0.1:8081/api/health |

- 前端通过 Vite 代理：`/s/`（Socket）、`/api`（账号等）→ 后端 8081
- 浏览器请优先用前端地址玩；登录后创建房间 / 入座

---

## 各脚本行为

### `dev-start.cmd`

1. 检查 `node` / `npm.cmd` / `client-react\node_modules`
2. 若已有 `.dev-pids\*.pid`，提示先执行 `dev-stop`
3. `common`：`npm run build`
4. `server`：`npx tsc`
5. 后台启动：
   - `server`：`node dist/index.js`（端口 **8081**，`CITADELS_FAST=1` 缩短计时便于 sim-6p；人类对局可去掉）
   - `client-react`：`npm run dev -- --host 127.0.0.1 --port 3010`
6. 写入 pid 到 `.dev-pids\`，日志到 `.dev-logs\`

**不会**自动 `npm install`。依赖变更后请手动安装。

### `dev-stop.cmd`

1. 按 `.dev-pids` 中的 pid 结束 server 与 client-react 进程（含子进程尝试）
2. 若 8081 / 3010 仍被占用，强制结束监听进程
3. 清理 pid 文件

### `dev-status.cmd`

- 打印 server / client-react pid 文件内容
- 检查 8081、3010 是否 LISTEN
- 打印常用 URL

### `dev-restart.cmd`

等价于 `dev-stop` → `dev-start`（全栈）。

---

## 日志与 pid 目录

| 路径 | 说明 |
|---|---|
| `.dev-pids\server.pid` | 后端主进程 pid |
| `.dev-pids\client-react.pid` | 前端 npm 进程 pid（子进程可能另有监听 pid） |
| `.dev-logs\server.out.log` / `server.err.log` | 后端标准输出 / 错误 |
| `.dev-logs\client-react.out.log` / `client-react.err.log` | 前端输出 / 错误 |

上述目录已在根 `.gitignore` 中忽略，不会提交。

查日志示例：

```bat
type .dev-logs\server.err.log
type .dev-logs\client-react.out.log
```

---

## 常见问题

### 1. `ERROR: node not found` / `npm.cmd not found`

把 Node 安装目录加入 PATH，或用「Node.js command prompt」再执行脚本。

### 2. `pid file exists - run dev-stop first`

先：

```bat
scripts\dev-stop.cmd
```

再 start。若 stop 后仍提示，可手动删 `.dev-pids\` 下 pid 文件，并确认 8081/3010 无残留进程。

### 3. 端口已被占用

`dev-stop` 会尝试释放 8081/3010。仍占用时：

```bat
netstat -ano | findstr ":8081"
netstat -ano | findstr ":3010"
```

用任务管理器结束对应 PID，或再执行一次 `dev-stop`。

### 4. 改了 TypeScript / 依赖后

- 只改 server 源码：可 `dev-restart`（start 会 tsc）
- 改了 `common`：restart 会 rebuild common
- 新增 npm 包：在对应包目录 `npm install` 后再 start
- 改了 client 源码：Vite 一般热更新，不必重启；大改配置可 `dev-restart`

### 5. PowerShell：`The term 'dev-start.cmd' is not recognized`

PowerShell 默认**不从当前目录**加载命令。在 `scripts` 目录下用 `.\dev-start.cmd`；在仓库根目录用 `.\scripts\dev-start.cmd`，或 `cmd /c scripts\dev-start.cmd`。

### 6. 登录 / 数据库

开发默认 SQLite：`data\citadels.sqlite`（见 `.env.example`）。创建房间与入座需要先注册登录（P1）。

---

## 六人自动对局 `sim-6p`

**前置：** 后端已在 8081 运行（`dev-start` 或仅 server）。

```bat
REM 仓库根目录 PowerShell
.\scripts\sim-6p.cmd

REM 可选：限制最大行动尝试次数（默认 4000）
node scripts\sim-6p.js --max-steps 800

REM 观战模式：放慢出牌，并打印房间链接（需前端 dev 也在跑）
node scripts\sim-6p.js --watch
node scripts\sim-6p.js --watch --delay 800 --max-steps 2000
```

`sim-6p.js` 通过 `client-react/node_modules/socket.io-client` 连接，无需 Vue 客户端。

### 用浏览器观战 sim-6p

1. `.\scripts\dev-start.cmd`
2. 另开终端：`node scripts\sim-6p.js --watch`
3. 浏览器打开 http://127.0.0.1:3010/ ，在 **当前房间** 列表看到该局
4. 点 **观战**（对局中）或 **加入**（仍在大厅时）

注意：

- 必须在 **脚本仍在运行** 时观战；脚本结束则机器人断开，房间从内存消失
- 开局后房间状态为 closed，仍可 **观战**，不能再当玩家加入
- 未登录也可观战；加入对战需登录

脚本会：

1. 注册 6 个测试帐号并 Socket 登录
2. 创建房间、6 人入座、开局
3. 断言 `gameMode=competitive_team6`、城建 8、座位 0/2/4=队 A、1/3/5=队 B
4. 用 **L0 合法着法**（优先收租/盖房、再拿资源、结束回合）自动推进
5. 若打到 `FINISHED`：断言队总分与胜/负/平一致

说明：L0 不追求最优，但会尝试盖房；**模式与分队**是必过项，打完终局为增强断言。

---

## VPS 部署 `deploy.sh`

见根 [README.md](../README.md#vps-部署vultr--debian-12) 的 VPS 部署章节。要点：

```bash
# 首次（fresh Vultr Debian 12，root）
bash scripts/deploy.sh --install
# 带域名 + HTTPS
bash scripts/deploy.sh --install --domain citadels.example.com --email you@example.com
# 后续更新
bash scripts/deploy.sh
```

`--install` 自动安装依赖 / Node 20 / 构建 / systemd / Nginx 反代（含 `/s/` WebSocket）/ ufw / 可选 Let's Encrypt。脚本幂等。
