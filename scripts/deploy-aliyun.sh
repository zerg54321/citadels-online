#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Citadels Online — 阿里云 Debian 12 一键部署脚本
#
# 适配阿里云国内节点，自动配置国内镜像源加速：
#   - npm 淘宝源
#   - Node.js 国内镜像（npmmirror）
#   - GitHub → Gitee 镜像（可选）
#
# 两种模式（自动检测，可用 --install 强制）：
#   * 安装模式：全新服务器部署 — 系统依赖、Node 20、克隆仓库、构建、
#              配置 systemd + Caddy 反向代理、防火墙、启动服务
#   * 更新模式：已有服务更新 — 备份数据库、拉取代码、重新构建、重启
#
# 一键部署命令（在全新阿里云 Debian 12 服务器上执行）：
#
#   apt-get update && apt-get install -y curl && \
#   curl -fsSL https://raw.githubusercontent.com/zerg54321/citadels-online/main/scripts/deploy-aliyun.sh | \
#   bash -s -- --install
#
# 带域名部署（自动 HTTPS）：
#
#   curl -fsSL https://raw.githubusercontent.com/zerg54321/citadels-online/main/scripts/deploy-aliyun.sh | \
#   bash -s -- --install --domain your.domain.com
#
# 后续更新（在服务器上执行）：
#
#   cd /opt/citadels/citadels-online
#   bash scripts/deploy-aliyun.sh
#
# 参数说明：
#   --install           强制完整安装（幂等，可重复执行）
#   --skip-backup       跳过 SQLite 备份
#   --skip-build        跳过 npm 构建步骤（更新模式）
#   --domain DOMAIN     域名，用于 Caddy 自动 HTTPS
#   --email EMAIL       Let's Encrypt 邮箱（可选）
#   --git-url URL       Git 仓库地址（默认 GitHub，可改为 Gitee 镜像）
#   --branch NAME       分支/标签名（默认 main）
#   --yes               跳过交互确认
#   -h, --help          显示帮助
# =============================================================================

INSTALL_ROOT="/opt/citadels"
DATA_DIR="${INSTALL_ROOT}/data"
BACKUP_DIR="${INSTALL_ROOT}/backups"
DEFAULT_REPO_DIR="${INSTALL_ROOT}/citadels-online"
DB_PATH="${DATA_DIR}/citadels.sqlite"
SERVICE_NAME="citadels"
APP_PORT="8081"
HEALTH_URL="http://127.0.0.1:${APP_PORT}"
HEALTH_TIMEOUT=40
CADDY_CONF="/etc/caddy/Caddyfile"
NODE_MAJOR=20

# 国内镜像源
NPM_REGISTRY="https://registry.npmmirror.com"
NODE_SOURCE_MIRROR="https://mirrors.tuna.tsinghua.edu.cn/nodesource/deb"

MODE=""
SKIP_BACKUP=false
SKIP_BUILD=false
DOMAIN=""
EMAIL=""
GIT_URL="https://github.com/zerg54321/citadels-online.git"
BRANCH="main"
ASSUME_YES=false

while [ $# -gt 0 ]; do
  case "$1" in
    --install) MODE="install"; shift ;;
    --skip-backup) SKIP_BACKUP=true; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --yes) ASSUME_YES=true; shift ;;
    -h|--help) sed -n '2,42p' "$0"; exit 0 ;;
    --domain) DOMAIN="${2:?--domain 需要一个值}"; shift 2 ;;
    --email) EMAIL="${2:?--email 需要一个值}"; shift 2 ;;
    --git-url) GIT_URL="${2:?--git-url 需要一个值}"; shift 2 ;;
    --branch) BRANCH="${2:?--branch 需要一个值}"; shift 2 ;;
    *) echo "未知参数: $1 (使用 --help 查看用法)"; exit 1 ;;
  esac
done

log()  { echo "[deploy] $(date '+%Y-%m-%d %H:%M:%S') $*"; }
warn() { echo "[deploy WARN] $*" >&2; }
fail() { echo "[deploy ERROR] $*" >&2; exit 1; }

# 必须以 root 运行（systemd / caddy / ufw / apt 需要）
[ "$(id -u)" -eq 0 ] || fail "请以 root 运行 (sudo bash scripts/deploy-aliyun.sh)"

# 解析仓库目录：优先使用脚本所在 git 根目录，否则使用默认路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if REPO_DIR="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  REPO_DIR="$DEFAULT_REPO_DIR"
fi

service_installed() { systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1 && systemctl is-enabled "${SERVICE_NAME}.service" >/dev/null 2>&1; }

# 自动检测模式：如果 systemd 服务不存在，则为首次安装
if [ -z "$MODE" ]; then
  if service_installed; then MODE="update"; else MODE="install"; fi
fi

log "mode=${MODE} repo=${REPO_DIR}$( [ -n "$DOMAIN" ] && echo " domain=${DOMAIN}" )"

confirm() {
  [ "$ASSUME_YES" = true ] && return 0
  local question="$1"
  read -r -p "$question [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ]
}

# -----------------------------------------------------------------------------
# 安装步骤（install 模式）
# -----------------------------------------------------------------------------

install_deps() {
  log "安装系统依赖 (Debian)..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg git build-essential ufw openssl \
    lsb-release debian-keyring debian-archive-keyring apt-transport-https

  # 安装 Caddy（从官方 Cloudsmith 源）
  if ! command -v caddy >/dev/null 2>&1; then
    log "安装 Caddy..."
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.sh' \
      | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt-get update -y
    apt-get install -y caddy
  fi

  # 安装 Node.js（使用清华镜像加速）
  if ! command -v node >/dev/null 2>&1; then
    log "安装 Node.js ${NODE_MAJOR}.x（清华镜像）..."
    # 使用清华 NodeSource 镜像
    curl -fsSL "${NODE_SOURCE_MIRROR}_setup_${NODE_MAJOR}.x" -o /tmp/nodesource_setup.sh || {
      # 清华镜像失败则回退到官方源
      warn "清华 NodeSource 镜像不可用，回退到官方源..."
      curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" -o /tmp/nodesource_setup.sh
    }
    bash /tmp/nodesource_setup.sh
    apt-get install -y nodejs
    rm -f /tmp/nodesource_setup.sh
  fi

  # 配置 npm 淘宝源
  log "配置 npm 国内镜像源: ${NPM_REGISTRY}"
  npm config set registry "${NPM_REGISTRY}" --global

  node -v
  npm -v
  caddy version
}

ensure_repo() {
  mkdir -p "$INSTALL_ROOT" "$DATA_DIR" "$BACKUP_DIR"
  if [ -d "$REPO_DIR/.git" ]; then
    log "仓库已存在: $REPO_DIR"
    return
  fi
  if [ -z "$GIT_URL" ]; then
    fail "仓库不存在于 $REPO_DIR 且未提供 --git-url。请先 clone 仓库或传 --git-url <url>。"
  fi
  log "克隆仓库: $GIT_URL -> $REPO_DIR"
  git clone --branch "$BRANCH" "$GIT_URL" "$REPO_DIR"
}

ensure_env() {
  local env_file="$REPO_DIR/.env"
  if [ -f "$env_file" ]; then
    log ".env 已存在，保留现有配置: $env_file"
    return
  fi
  local jwt_secret
  jwt_secret="$(openssl rand -hex 32)"
  local admin_token
  admin_token="$(openssl rand -hex 32)"
  local origin="http://localhost:${APP_PORT}"
  [ -n "$DOMAIN" ] && origin="https://${DOMAIN}"
  log "生成 .env: $env_file"
  cat > "$env_file" <<EOF
PORT=${APP_PORT}
NODE_ENV=production
DATABASE_PATH=${DB_PATH}
JWT_SECRET=${jwt_secret}
CORS_ORIGIN=${origin}
ENFORCE_HTTPS=0
# 管理面访问（通过 SSH 隧道）: ssh -L 8081:127.0.0.1:8081 root@<vps>
ADMIN_TOKEN=${admin_token}
ADMIN_ALLOW_IPS=127.0.0.1,::1
EOF
  chmod 600 "$env_file"
  log "已生成随机 JWT_SECRET 与 ADMIN_TOKEN（请勿提交 .env）"
}

write_systemd_unit() {
  log "写入 systemd 单元: /etc/systemd/system/${SERVICE_NAME}.service"
  cat > "/etc/systemd/system/${SERVICE_NAME}.service" <<EOF
[Unit]
Description=Citadels Online game server
After=network.target

[Service]
Type=simple
WorkingDirectory=${REPO_DIR}/server
EnvironmentFile=${REPO_DIR}/.env
ExecStart=/usr/bin/node dist/index.js
Restart=on-failure
RestartSec=3
# 日志查看: journalctl -u ${SERVICE_NAME} -f

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
}

write_caddyfile() {
  log "写入 Caddyfile: ${CADDY_CONF}"
  local site_addr=":80"
  [ -n "$DOMAIN" ] && site_addr="${DOMAIN}"
  local global_block=""
  if [ -n "$EMAIL" ]; then
    global_block="{
    email ${EMAIL}
}

"
  fi
  cat > "$CADDY_CONF" <<EOF
${global_block}${site_addr} {
    encode zstd gzip

    # 禁止公网访问管理 API（仅限 SSH 隧道访问）
    @admin path /api/admin /api/admin/*
    handle @admin {
        respond 404
    }

    # SPA + REST API + Socket.IO WebSocket
    reverse_proxy 127.0.0.1:${APP_PORT}
}
EOF
  chmod 644 "$CADDY_CONF"
  caddy validate --config "$CADDY_CONF" --adapter caddyfile
  systemctl enable caddy >/dev/null 2>&1 || true
  systemctl restart caddy || systemctl reload caddy
}

setup_firewall() {
  log "配置防火墙..."
  # 阿里云需要同时在安全组开放端口，这里配置 ufw
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  yes | ufw --force enable >/dev/null 2>&1 || true
  ufw status || true
  log "提示: 阿里云控制台需在安全组中开放 80/443 端口"
}

update_cors_origin() {
  [ -z "$DOMAIN" ] && return 0
  if [ -f "$REPO_DIR/.env" ] && grep -q '^CORS_ORIGIN=' "$REPO_DIR/.env"; then
    sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" "$REPO_DIR/.env"
    log "已更新 CORS_ORIGIN=https://${DOMAIN}"
  fi
}

# -----------------------------------------------------------------------------
# 构建（共享）
# -----------------------------------------------------------------------------

# 安装依赖：优先使用 npm ci（可重复构建），失败则回退到 npm install
npm_install() {
  local dir="$1"
  cd "$dir"
  if npm ci 2>/dev/null; then
    return 0
  fi
  warn "npm ci 失败（lock 文件可能过期），回退到 npm install..."
  rm -rf node_modules package-lock.json
  npm install
}

build_app() {
  log "构建 common"
  ( npm_install "$REPO_DIR/common" && npm run build )
  log "构建 client-react"
  ( npm_install "$REPO_DIR/client-react" && npm run build )
  log "构建 server"
  ( npm_install "$REPO_DIR/server" && npm run build )
}

# -----------------------------------------------------------------------------
# 服务控制与健康检查
# -----------------------------------------------------------------------------

backup_db() {
  if [ "$SKIP_BACKUP" = true ]; then log "跳过数据库备份"; return; fi
  mkdir -p "$BACKUP_DIR"
  if [ -f "$DB_PATH" ]; then
    local backup_file="${BACKUP_DIR}/citadels-$(date +%F_%H%M%S).sqlite"
    log "备份数据库: $DB_PATH -> $backup_file"
    cp "$DB_PATH" "$backup_file"
    # 只保留最近 30 个备份
    ls -t "$BACKUP_DIR"/citadels-*.sqlite 2>/dev/null | tail -n +31 | xargs -r rm -f
  else
    log "警告: 数据库文件不存在，跳过备份"
  fi
}

start_service() {
  log "启动服务: $SERVICE_NAME"
  systemctl enable "${SERVICE_NAME}.service" >/dev/null 2>&1 || true
  systemctl restart "$SERVICE_NAME"
}

health_check() {
  log "等待服务就绪 (最多 ${HEALTH_TIMEOUT}s)"
  local elapsed=0
  until curl -sf "$HEALTH_URL" >/dev/null 2>&1; do
    sleep 1
    elapsed=$((elapsed + 1))
    if [ "$elapsed" -ge "$HEALTH_TIMEOUT" ]; then
      fail "服务启动超时，请检查日志: journalctl -u $SERVICE_NAME -n 80"
    fi
  done
  log "健康检查通过 ✓ ($HEALTH_URL)"
}

# -----------------------------------------------------------------------------
# 主流程
# -----------------------------------------------------------------------------

if [ "$MODE" = "install" ]; then
  install_deps
  ensure_repo
  cd "$REPO_DIR"
  log "检出分支: $BRANCH"
  git fetch --all >/dev/null 2>&1 || true
  git checkout "$BRANCH" 2>/dev/null || true
  git pull --ff-only 2>/dev/null || true
  ensure_env
  if [ "$SKIP_BUILD" = false ]; then
    build_app
  else
    log "跳过构建步骤"
  fi
  write_systemd_unit
  write_caddyfile
  update_cors_origin
  setup_firewall
  start_service
  health_check
  log "============================================"
  log "首次部署完成 ✓"
  log "============================================"
  log "  本机访问:   $HEALTH_URL"
  [ -n "$DOMAIN" ] && log "  公网访问:   https://${DOMAIN}"
  log "  应用日志:   journalctl -u $SERVICE_NAME -f"
  log "  反代日志:   journalctl -u caddy -f"
  log "  更新部署:   cd $REPO_DIR && bash scripts/deploy-aliyun.sh"
  exit 0
fi

# ---- 更新模式 ----
[ -d "$REPO_DIR" ] || fail "代码目录不存在: $REPO_DIR"
cd "$REPO_DIR"
backup_db
log "停止服务: $SERVICE_NAME"
systemctl stop "$SERVICE_NAME" || true
log "git pull"
git fetch --all >/dev/null 2>&1 || true
git checkout "$BRANCH" 2>/dev/null || true
git pull --ff-only || fail "git pull 失败，请手动解决冲突"
if [ "$SKIP_BUILD" = false ]; then
  build_app
else
  log "跳过构建步骤"
fi
ensure_env
write_systemd_unit
if [ -f "$CADDY_CONF" ]; then
  caddy validate --config "$CADDY_CONF" --adapter caddyfile && systemctl reload caddy || true
fi
start_service
health_check
log "部署完成 ✓"
log "  首页: $HEALTH_URL"
log "  日志: journalctl -u $SERVICE_NAME -f"