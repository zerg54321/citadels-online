# 部署脚本

本目录包含 Citadels Online 的一键部署脚本。

## 脚本列表

| 脚本 | 适用环境 | 说明 |
|------|----------|------|
| `deploy.sh` | Vultr / Debian 12 (海外) | 通用部署脚本 |
| `deploy-aliyun.sh` | 阿里云 Debian 12 (国内) | 阿里云专用，**首次完整部署**，自动配置国内镜像源加速 |
| `update-aliyun.sh` | 阿里云 Debian 12 (国内) | **日常游戏更新**，仅拉代码、构建、迁移数据、重启，不含系统依赖/Caddy/防火墙 |

---

## 快速开始

### 阿里云部署（推荐国内用户）

#### 1. 一键安装（全新服务器）

```bash
# 无域名部署（通过 IP 直接访问）
apt-get update && apt-get install -y curl && \
curl -fsSL https://raw.githubusercontent.com/zerg54321/citadels-online/main/scripts/deploy-aliyun.sh | \
bash -s -- --install
```

#### 2. 带域名部署（自动 HTTPS）

```bash
apt-get update && apt-get install -y curl && \
curl -fsSL https://raw.githubusercontent.com/zerg54321/citadels-online/main/scripts/deploy-aliyun.sh | \
bash -s -- --install --domain your.domain.com --email admin@example.com
```

#### 3. 使用 Gitee 镜像（GitHub 访问慢时）

```bash
apt-get update && apt-get install -y curl && \
curl -fsSL https://gitee.com/<your-gitee-id>/citadels-online/raw/main/scripts/deploy-aliyun.sh | \
bash -s -- --install --git-url https://gitee.com/<your-gitee-id>/citadels-online.git
```

#### 4. 后续更新（日常更新，推荐）

```bash
cd /opt/citadels/citadels-online
bash scripts/update-aliyun.sh
```

`update-aliyun.sh` 只执行：备份(数据库+头像) → 停止服务 → `git pull` → 构建 → 数据迁移 → 重启 → 健康检查，
**不会**重复执行系统依赖安装、Node/Caddy 安装、Caddyfile 配置和防火墙设置（这些仅在首次部署时执行一次）。

> 若误运行 `deploy-aliyun.sh` 且未加 `--install`，当检测到已部署服务时会提示改用
> `update-aliyun.sh` 并退出，不会触发全量部署。

#### 5. 首次部署脚本参数

如需强制重新完整部署：

```bash
cd /opt/citadels/citadels-online
bash scripts/deploy-aliyun.sh --install
```

---

## 参数说明

### `deploy-aliyun.sh` 参数

> 该脚本仅用于**首次完整部署**（未加 `--install` 时：若服务未部署则安装，若已部署则提示改用 `update-aliyun.sh`）。

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--install` | 强制完整安装模式（幂等） | 自动检测 |
| `--skip-build` | 跳过 npm 构建步骤 | 禁用 |
| `--domain DOMAIN` | 域名，用于 Caddy 自动 HTTPS | 无 |
| `--email EMAIL` | Let's Encrypt 证书到期通知邮箱 | 无 |
| `--git-url URL` | Git 仓库地址 | GitHub 仓库 |
| `--branch NAME` | 分支或标签名 | `main` |
| `--yes` | 跳过交互确认 | 禁用 |
| `-h`, `--help` | 显示帮助 | - |

### `update-aliyun.sh` 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--skip-backup` | 跳过数据库/头像备份 | 禁用 |
| `--skip-build` | 跳过 npm 构建步骤 | 禁用 |
| `--branch NAME` | 分支或标签名 | `main` |
| `--yes` | 跳过交互确认 | 禁用 |
| `-h`, `--help` | 显示帮助 | - |

### `deploy.sh` 参数

Vultr/海外通用脚本，仍为「安装 + 更新」合一的旧版流程（不设 `AVATAR_DIR`，头像位于仓库内 `data/avatars`）。参数同原版 `deploy-aliyun.sh`，并保留 `--skip-backup`。

---

## 部署后配置

### 1. 阿里云安全组

部署完成后，需在阿里云控制台开放以下端口：

| 端口 | 协议 | 用途 |
|------|------|------|
| 22 | TCP | SSH 远程登录 |
| 80 | TCP | HTTP 访问（会重定向到 HTTPS） |
| 443 | TCP | HTTPS 访问 |

**配置路径**：阿里云控制台 → ECS → 实例 → 安全组 → 配置规则 → 入方向

### 2. 管理后台

管理后台仅允许通过 **SSH 隧道**访问，不可直接暴露到公网：

```bash
# 在本地机器执行（将 8081 端口转发到服务器）
ssh -L 8081:127.0.0.1:8081 root@<服务器IP>

# 然后在本地浏览器访问
open http://127.0.0.1:8081/admin
```

### 3. 服务管理

```bash
# 查看服务状态
systemctl status citadels

# 查看应用日志
journalctl -u citadels -f

# 查看 Caddy 反代日志
journalctl -u caddy -f

# 重启服务
systemctl restart citadels

# 停止服务
systemctl stop citadels
```

### 4. 数据备份

`update-aliyun.sh` 每次更新前会自动备份**数据库和用户上传头像**到 `/opt/citadels/backups/`，各保留最近 30 份：

```bash
ls -lt /opt/citadels/backups/
# citadels-<时间戳>.sqlite       数据库备份
# avatars-<时间戳>.tar.gz        用户头像备份
```

手动备份：

```bash
# 数据库
cp /opt/citadels/data/citadels.sqlite /opt/citadels/backups/manual-backup-$(date +%F).sqlite

# 头像
tar -czf /opt/citadels/backups/avatars-manual-$(date +%F).tar.gz -C /opt/citadels/data avatars
```

---

## 目录结构

部署完成后的目录结构：

```
/opt/citadels/
├── citadels-online/          # 项目源码
│   ├── .env                  # 环境变量（JWT_SECRET、DATABASE_PATH、AVATAR_DIR 等）
│   ├── common/               # 公共模块
│   ├── client-react/         # 前端代码
│   ├── server/               # 服务端代码
│   └── scripts/              # 部署脚本
├── data/
│   ├── citadels.sqlite       # SQLite 数据库
│   └── avatars/              # 用户上传头像（{userId}.webp）
└── backups/
    ├── citadels-*.sqlite     # 数据库备份
    └── avatars-*.tar.gz      # 用户头像备份
```

> 数据库与用户上传头像均存放在 git 仓库**外部**的 `/opt/citadels/data/`，因此
> `git pull` / 重新 clone / `git clean` 仓库都不会影响用户数据，且两者都会被更新脚本备份。
> 旧版部署若头像曾存于仓库内 `data/avatars`，首次执行 `update-aliyun.sh` 时会自动迁移到 `/opt/citadels/data/avatars`。

---

## 国内镜像源

`deploy-aliyun.sh` 已自动配置以下国内镜像：

| 资源 | 镜像源 | 用途 |
|------|--------|------|
| npm 包 | `registry.npmmirror.com` | 加速 npm install |
| Node.js | `mirrors.tuna.tsinghua.edu.cn` | 加速 Node.js 安装 |
| Caddy | Cloudsmith 官方 | 反代服务器 |

如需手动配置：
```bash
# 设置 npm 淘宝源
npm config set registry https://registry.npmmirror.com --global
```

---

## 常见问题

### Q: 部署完成后无法访问？

1. 检查阿里云安全组是否开放 80/443 端口
2. 检查服务是否启动：`systemctl status citadels`
3. 查看日志排查问题：`journalctl -u citadels -n 50`

### Q: HTTPS 证书申请失败？

1. 确保域名已解析到服务器 IP
2. 确保 80 端口已开放（Let's Encrypt 需要验证）
3. 查看 Caddy 日志：`journalctl -u caddy -n 50`

### Q: 更新后数据丢失？

`update-aliyun.sh` 默认会在更新前自动备份数据库到 `/opt/citadels/backups/`（头像打包为 `avatars-*.tar.gz`）。如需手动恢复：
```bash
# 列出所有备份
ls -lt /opt/citadels/backups/

# 恢复数据库
cp /opt/citadels/backups/citadels-2024-01-01_120000.sqlite /opt/citadels/data/citadels.sqlite

# 恢复用户头像
tar -xzf /opt/citadels/backups/avatars-2024-01-01_120000.tar.gz -C /opt/citadels/data

systemctl restart citadels
```

### Q: 如何使用自定义域名？

```bash
# 1. 在阿里云域名解析添加 A 记录
#    主机记录: @
#    记录值: <服务器公网 IP>

# 2. 重新运行完整部署脚本（会更新 Caddy 配置，需加 --install）
cd /opt/citadels/citadels-online
bash scripts/deploy-aliyun.sh --install --domain your.domain.com --email admin@example.com
```

---

## 系统要求

- **操作系统**: Debian 12 (Bookworm) / Ubuntu 22.04+
- **架构**: x86_64 / ARM64
- **内存**: ≥ 1GB
- **磁盘**: ≥ 5GB 可用空间
- **网络**: 需要访问 GitHub 和 npm 镜像源
