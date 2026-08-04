# 部署脚本

本目录包含 Citadels Online 的一键部署脚本。

## 脚本列表

| 脚本 | 适用环境 | 说明 |
|------|----------|------|
| `deploy.sh` | Vultr / Debian 12 (海外) | 通用部署脚本 |
| `deploy-aliyun.sh` | 阿里云 Debian 12 (国内) | 阿里云专用，自动配置国内镜像源加速 |

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

#### 4. 后续更新

```bash
cd /opt/citadels/citadels-online
bash scripts/deploy-aliyun.sh
```

---

## 参数说明

### `deploy-aliyun.sh` 参数

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `--install` | 强制完整安装模式（幂等） | 自动检测 |
| `--skip-backup` | 跳过数据库备份 | 禁用 |
| `--skip-build` | 跳过 npm 构建步骤 | 禁用 |
| `--domain DOMAIN` | 域名，用于 Caddy 自动 HTTPS | 无 |
| `--email EMAIL` | Let's Encrypt 证书到期通知邮箱 | 无 |
| `--git-url URL` | Git 仓库地址 | GitHub 仓库 |
| `--branch NAME` | 分支或标签名 | `main` |
| `--yes` | 跳过交互确认 | 禁用 |
| `-h`, `--help` | 显示帮助 | - |

### `deploy.sh` 参数

与 `deploy-aliyun.sh` 相同。

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

### 4. 数据库备份

脚本会自动备份数据库到 `/opt/citadels/backups/`，保留最近 30 个备份。

手动备份：
```bash
cp /opt/citadels/data/citadels.sqlite /opt/citadels/backups/manual-backup-$(date +%F).sqlite
```

---

## 目录结构

部署完成后的目录结构：

```
/opt/citadels/
├── citadels-online/          # 项目源码
│   ├── .env                  # 环境变量（JWT_SECRET 等）
│   ├── common/               # 公共模块
│   ├── client-react/         # 前端代码
│   ├── server/               # 服务端代码
│   └── scripts/              # 部署脚本
├── data/
│   └── citadels.sqlite       # SQLite 数据库
└── backups/
    └── citadels-*.sqlite     # 数据库备份
```

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

### Q: 更新后数据库丢失？

脚本默认会在更新前自动备份数据库到 `/opt/citadels/backups/`。如需手动恢复：
```bash
# 列出所有备份
ls -lt /opt/citadels/backups/

# 恢复指定备份
cp /opt/citadels/backups/citadels-2024-01-01_120000.sqlite /opt/citadels/data/citadels.sqlite
systemctl restart citadels
```

### Q: 如何使用自定义域名？

```bash
# 1. 在阿里云域名解析添加 A 记录
#    主机记录: @
#    记录值: <服务器公网 IP>

# 2. 重新运行部署脚本（会更新 Caddy 配置）
cd /opt/citadels/citadels-online
bash scripts/deploy-aliyun.sh --domain your.domain.com --email admin@example.com
```

---

## 系统要求

- **操作系统**: Debian 12 (Bookworm) / Ubuntu 22.04+
- **架构**: x86_64 / ARM64
- **内存**: ≥ 1GB
- **磁盘**: ≥ 5GB 可用空间
- **网络**: 需要访问 GitHub 和 npm 镜像源
