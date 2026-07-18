# 部署 / 开发约定

## 0. 文档目的与范围

- **读者**：维护者与协作者
- **范围**：本机开发、类生产验证、VPS 上线；不含商业 SLA
- **产品重心**：**6 人 3v3 竞技**；娱乐模式仅维持可玩
- **部署形态**：**单 VPS + 一体 Node**（Express + Socket.IO + 静态前端 + 本机数据库）
- **相关文档**：[开发路线图](./ROADMAP.md)、[依赖基线表](./DEPENDENCY_BASELINE.md)

---

## 1. 仓库结构约定

| 路径 | 职责 |
|---|---|
| `common/` | 协议、枚举、共享类型；**先 build** |
| `server/` | 权威规则、房间、Socket、（未来）账号/战绩 API |
| `client/` | Vue SPA |
| 根 `package.json` | 编排脚本与 `engines`；业务依赖不堆在根上 |

- monorepo，**不**拆成两个独立 git 仓库（除非未来明确要拆）
- 共享包：`citadels-common` 使用 `file:../common`

---

## 2. 运行时基线

| 项 | 约定 |
|---|---|
| Node | **20.x LTS**（本机与 VPS 一致） |
| 包管理 | npm + **提交各包 lockfile**（`common` / `server` / `client`） |
| OS 开发 | Windows 可；上线 **Linux（推荐 Ubuntu LTS）** |
| 时区 / 日志 | 服务器建议 UTC 或明确设置 `TZ`；日志打 stdout，由 systemd 等收集 |

- 根目录 `engines.node` 应与本文一致（`^20`）
- 可选：增加 `.nvmrc` / `.node-version`，内容为 `20`

---

## 3. 环境变量约定

| 变量 | 用途 | 开发默认 | 生产 |
|---|---|---|---|
| `PORT` | HTTP 端口 | `8081` | 如 `3000`，由反代转发 |
| `NODE_ENV` | `development` / `production` | development | production |
| `DATABASE_PATH` 或 `DATABASE_URL` | SQLite 路径或 Postgres | 如 `./data/citadels.sqlite` | 数据盘固定路径 |
| `JWT_SECRET` 或会话密钥 | 登录态 | 本地固定测试串 | 强随机，勿入库 |
| `DEBUG` | 如 `citadels-server` | 可选开启 | 默认关闭 |

- 提供 `.env.example`，**不提交** `.env`
- 禁止把密钥写进前端 `VITE_*`（除将来若拆前端时的公开 API/WS 基址）

---

## 4. 本地开发流程

### 4.1 首次安装

```bash
cd common && npm install && npm run build
cd ../server && npm install
cd ../client && npm install
```

Windows PowerShell 若拦截 `npm`，使用 `npm.cmd`。

### 4.2 日常开发（推荐：一键脚本）

Windows（仓库根目录）：

```bat
scripts\dev-start.cmd    # build common/server 后后台启动 server + client
scripts\dev-status.cmd   # 查看 pid / 端口
scripts\dev-stop.cmd     # 停止进程并释放 8081/3000
scripts\dev-restart.cmd  # 先 stop 再 start
```

| 项 | 说明 |
|---|---|
| 前端 | http://127.0.0.1:3000/ |
| 后端 | http://127.0.0.1:8081/ |
| 日志 | `.dev-logs\server.*.log` / `client.*.log` |
| pid | `.dev-pids\`（已 gitignore） |

完整参数、FAQ、与手动启动对比见 **[scripts/README.md](../scripts/README.md)**。

### 4.2b 手动双进程

```bash
# 终端 1
cd server
npm run start
# 或：npm run start:debug

# 终端 2
cd client
npm run dev
```

- 浏览器：Vite 提示的地址（常见 `http://127.0.0.1:3000`）
- Socket 路径固定为 **`/s/`**（client Vite 代理与 server 一致；改路径须三处同改）

### 4.3 本机类生产（L2）

```bash
cd common && npm run build
cd ../client && npm run build
cd ../server && npm run build
node dist/index.js
```

浏览器只访问：`http://localhost:8081`（或 `PORT`）。

用途：验证静态资源、`history` fallback、同域 Socket。

### 4.4 多人对战测试

- **UI**：多 Chrome 用户配置 / 多浏览器  
  - 同一浏览器配置下多标签 ≈ **同一玩家**（`localStorage[roomId]`）
- **自动化**：Socket 脚本模拟 N 人（不替代 UI 验收）
- **倒计时**：测试时可将行动时限调短（如 10s）

### 4.5 Windows 注意

- 路径使用 `path.join`；**Linux 区分大小写**，import 与文件名大小写一致
- 换行建议仓库统一 LF（`.gitattributes`：`* text=auto eol=lf`）

---

## 5. 构建顺序（铁律）

```
1. common   → tsc → common/dist
2. client   → vite build → client/dist
3. server   → tsc → server/dist（依赖 common）
4. 启动     → node server/dist/index.js
             静态目录指向 ../client/dist
```

- 修改 `common` 后必须先 rebuild common，再启 server / 刷新 client
- CI / VPS 脚本必须同一顺序

---

## 6. 生产部署约定（VPS）

### 6.1 形态

```
Internet → Nginx / Caddy (443)
              ├─ /s/  → WebSocket 升级 → Node
              └─ /    → Node（SPA + API）
Node 单进程 + 本机 SQLite（或同机 Postgres）
```

- **不要**用 Vercel 跑游戏服（无合适的长连接 + 内存房间模型）
- **默认不上** Supabase；数据库与 Node 同机即可

### 6.2 进程

- systemd 或 pm2 运行 `npm run start:prod --prefix server`（或等价 `node dist/index.js`）
- **部署时 build**，进程启动命令避免每次全量编译
- 崩溃自动重启；日志轮转

### 6.3 发布步骤

1. `git pull`
2. 三包 `npm ci`（或 `npm install`）
3. 按 §5 构建
4. 数据库迁移（若有）
5. 重启进程（如 `systemctl restart citadels`）
6. 健康检查：首页 HTTP 200 + Socket 可连接

### 6.4 数据与备份

- SQLite：数据文件放在固定目录（勿被发布覆盖）；定期拷贝备份
- 密码哈希存储；备份文件权限收紧

### 6.5 上线前检查表

- [ ] Node 主版本与开发一致（20.x）
- [ ] `NODE_ENV=production`
- [ ] 已 build client，非 dev 代理
- [ ] 反代已开启 WebSocket
- [ ] 密钥非默认值
- [ ] 防火墙主要开放 80/443

---

## 7. 开发环境对齐策略（Windows ↔ Linux）

| 级别 | 手段 | 频率 |
|---|---|---|
| 必做 | Node 20 + 同启动命令 + env 模板 | 始终 |
| 建议 | 本机 L2 prod-like | 大改前端 / 路由后 |
| 可选 | WSL2 跑 server | 首次上线前 |
| 可选 | Docker 同镜像 | 部署反复踩坑时再上 |

---

## 8. 功能与模式约定（产品对齐）

| 模式 | 条件 | 战绩 |
|---|---|---|
| **竞技** | 仅 6 人强制 3v3（座位 135 vs 246）；建成城固定 8；首完 **+8** / 同回合后完 **+6**；队总分相同则平局 | 进排名 |
| **娱乐** | 非 6 人、含 AI 等 | 可查历史，不进排名 |

- 禁止游客入座；未登录可观战
- 账号字段：帐号名 + 密码 + 游戏内昵称（可改，默认=帐号名；榜单显示昵称）
- 行动时限：开局房主可配（默认建议 120s）；超时强制托管
- **有效托管**（AI 实际代打过至少一步）才触发战绩惩罚：己方胜则该玩家不计 ranking 胜；己方负则对方正常计胜
- 团队模式允许军阀拆队友；UI 需明显警告 + 二次确认

娱乐模式规则不优先设计，沿用现有经典个人局逻辑即可。

---

## 9. 分支与提交（轻量）

- `main`：默认可部署
- 功能分支：如 `feat/team-3v3`、`feat/auth`
- **不**提交：`node_modules/`、`.env`、本地数据库文件

---

## 10. 验收清单模板

### 开发完成一条功能

- [ ] 若改动 `common`，已 rebuild
- [ ] server `tsc` 通过
- [ ] client dev 可操作
- [ ] （涉及对局）至少 2 人局或脚本冒烟
- [ ] （涉及竞技）6 人分队与终局字段符合 §8

### 准备发 VPS

- [ ] 本机 L2 prod-like 通过
- [ ] §6.5 检查表勾完

---

## 11. 文档维护

以下变更必须同步更新本文及 [DEPENDENCY_BASELINE.md](./DEPENDENCY_BASELINE.md)：

- 端口、Socket 路径 `/s/`
- Node 版本、构建顺序
- 依赖策略或新增核心库
