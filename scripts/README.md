# 本地调试脚本说明

Windows 下一键启停开发环境（游戏服 + 前端）。

| 脚本 | 作用 |
|---|---|
| `dev-start.cmd` | 编译 common/server，后台启动后端与 Vite 前端 |
| `dev-stop.cmd` | 停止进程，并释放 8081 / 3000 端口 |
| `dev-status.cmd` | 查看 pid、端口监听、访问地址 |
| `dev-restart.cmd` | 先 stop 再 start |
| `sim-6p.cmd` / `sim-6p.js` | 6 人 3v3 自动入座开局 + L0 随机合法着法推进 |
| `test-complete-bonus.js` | 建成城 +8/+6 与队分结算的本地断言（需先 build server） |
| `test-matches.js` | P3 战绩落库 + 历史/排名查询断言 |
| `test-p4-autoplay.js` | P4 时限/托管标记/ranked_win_eligible 惩罚断言 |
| `test-p5-ai.js` | P5 添加 AI + 1人5AI 自动推进断言 |

---

## 前置条件

1. 已安装 **Node.js 20.x**，且 `node`、`npm.cmd` 在 PATH 中  
2. 已安装依赖：

```bat
cd common && npm install && npm run build
cd ..\server && npm install
cd ..\client && npm install
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
.\dev-status.cmd
.\dev-stop.cmd
.\dev-restart.cmd
```

CMD 在 `scripts` 目录下可直接：`dev-start.cmd`。

---

## 访问地址

| 服务 | 地址 |
|---|---|
| 前端（日常开发） | http://127.0.0.1:3000/ |
| 后端 API / Socket | http://127.0.0.1:8081/ |
| 健康检查 | http://127.0.0.1:8081/api/health |

- 前端通过 Vite 代理：`/s/`（Socket）、`/api`（账号等）→ 后端 8081  
- 浏览器请优先用前端地址玩；登录后创建房间 / 入座

---

## 各脚本行为

### `dev-start.cmd`

1. 检查 `node` / `npm.cmd`  
2. 若已有 `.dev-pids\*.pid`，提示先执行 `dev-stop`  
3. `common`：`npm run build`  
4. `server`：`npx tsc`  
5. 后台启动：
   - `server`：`node dist/index.js`（端口 **8081**）
   - `client`：`npm run dev -- --host 127.0.0.1 --port 3000`
6. 写入 pid 到 `.dev-pids\`，日志到 `.dev-logs\`

**不会**自动 `npm install`。依赖变更后请手动安装。

### `dev-stop.cmd`

1. 按 `.dev-pids` 中的 pid 结束进程（含子进程尝试）  
2. 若 8081 / 3000 仍被占用，强制结束监听进程  
3. 清理 pid 文件  

适合：换代码后重启、端口被占用、异常残留进程。

### `dev-status.cmd`

- 打印 server/client pid 文件内容  
- 检查 8081、3000 是否 LISTEN  
- 打印常用 URL  

### `dev-restart.cmd`

等价于 `dev-stop` → `dev-start`。

---

## 日志与 pid 目录

| 路径 | 说明 |
|---|---|
| `.dev-pids\server.pid` | 后端主进程 pid |
| `.dev-pids\client.pid` | 前端 npm 进程 pid（子进程可能另有监听 pid） |
| `.dev-logs\server.out.log` / `server.err.log` | 后端标准输出 / 错误 |
| `.dev-logs\client.out.log` / `client.err.log` | 前端输出 / 错误 |

上述目录已在根 `.gitignore` 中忽略，不会提交。

查日志示例：

```bat
type .dev-logs\server.err.log
type .dev-logs\client.out.log
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

再 start。若 stop 后仍提示，可手动删 `.dev-pids\` 下 pid 文件，并确认 8081/3000 无残留进程。

### 3. 端口已被占用

`dev-stop` 会尝试释放 8081/3000。仍占用时：

```bat
netstat -ano | findstr ":8081"
netstat -ano | findstr ":3000"
```

用任务管理器结束对应 PID，或再执行一次 `dev-stop`。

### 4. 前端打开是 404

可试：http://127.0.0.1:3000/index.html  

或看 `.dev-logs\client.out.log` 是否 Vite 已 ready。  
`dev-status` 显示 3000 LISTEN 且后端 health 为 ok 时，服务一般正常。

### 5. 改了 TypeScript / 依赖后

- 只改 server 源码：可 `dev-restart`（start 会 tsc）  
- 改了 `common`：restart 会 rebuild common  
- 新增 npm 包：在对应包目录 `npm install` 后再 start  
- 改了 client 源码：Vite 一般热更新，不必重启；大改配置可 restart  

### 6. PowerShell：`The term 'dev-start.cmd' is not recognized`

原因：PowerShell 默认**不从当前目录**加载命令（安全策略）。

在 `scripts` 目录下请用：

```powershell
.\dev-start.cmd
```

在仓库根目录请用：

```powershell
.\scripts\dev-start.cmd
```

或：

```powershell
cmd /c scripts\dev-start.cmd
```

### 7. PowerShell 执行策略

`.cmd` 一般不受 PS 脚本策略影响。若仍失败，用上一节的 `cmd /c ...`。

### 7. 登录 / 数据库

开发默认 SQLite：`data\citadels.sqlite`（见 `.env.example`）。  
创建房间与入座需要先注册登录（P1）。

---

## 与手动启动的关系

| 方式 | 适用 |
|---|---|
| `scripts\dev-*.cmd` | 日常联调、快速开关 |
| 双终端 `server` + `client` | 需要看实时控制台、调试 server inspect |
| 仅 `node server/dist` + 已 build 的 client | 类生产（L2），见 `docs/DEV_DEPLOY.md` |

---

## 离线回放生成（TrainingEngine）

不依赖 Socket / 在线房间，用 `server/src/engine` 同步跑完一局并写出 JSON：

```bat
scripts\generate-replay.cmd
```

输出：

| 路径 | 用途 |
|---|---|
| `server/replays/example-replay.json` | 服务端副本 |
| `client/public/replays/example-replay.json` | Vite 静态资源（推荐） |
| `client/replays/example-replay.json` | 备用 |

查看：

1. 前端已启动时打开 http://127.0.0.1:3000/replay-viewer.html  
2. 点 **加载示例回放**，或 **打开本地 JSON** 选择生成的文件  

说明：

- `CITADELS_SYNC=1` 使阶段切换同步执行  
- 策略为贪心盖房（与 sim-6p 类似），**真实规则：城内不可重复同名建筑**  
- 回放 JSON **v2**：一页 = 一大轮；每条行动含 `frameAfter` 与技能目标  
- 查看：http://127.0.0.1:3000/replay-viewer.html（左棋盘 / 右行动流 / 跳转大轮）

---

## 六人自动对局 `sim-6p`

**前置：** 后端已在 8081 运行（`dev-start` 或仅 server）。

```bat
REM 仓库根目录 PowerShell
.\scripts\sim-6p.cmd

REM 可选：限制最大行动尝试次数（默认 500）
node scripts\sim-6p.js --max-steps 800

REM 观战模式：放慢出牌，并打印房间链接（需前端 dev 也在跑）
node scripts\sim-6p.js --watch
node scripts\sim-6p.js --watch --delay 800 --max-steps 2000
```

### 用浏览器观战 sim-6p

**方式 A — 首页房间列表（推荐）**

1. `.\scripts\dev-start.cmd`  
2. 另开终端：`node scripts\sim-6p.js --watch`（或普通 sim-6p）  
3. 浏览器打开 http://127.0.0.1:3000/ ，在 **当前房间** 列表看到该局  
4. 点 **观战**（对局中）或 **加入**（仍在大厅时）  

列表约每 4 秒刷新；也可点「刷新」。`GET /api/rooms` 提供同样数据。

**方式 B — 终端打印的链接**

1. 运行带 `--watch` 的 sim-6p  
2. 打开打印的 `http://127.0.0.1:3000/room/xxxxxx`  
3. 或直接打开 `.../room/xxx?spectate=1` 自动观战  

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

说明：L0 不追求最优，但会尝试盖房（不再优先 FINISH_TURN）；**模式与分队**是必过项，打完终局为增强断言。

建成加分 +4/+2 的确定性检查：

```bat
cd server && npx tsc
cd ..
node scripts\test-complete-bonus.js
```

战绩入库与排名（P3，需 server 在 8081）：

```bat
node scripts\test-matches.js
```

更多约定：`docs/DEV_DEPLOY.md`。
