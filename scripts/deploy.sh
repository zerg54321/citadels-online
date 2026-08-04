#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Citadels Online — one-click deploy for Vultr / Debian 12
#
# Two modes (auto-detected, can be forced with --install):
#   * Install  : provisions a fresh box — system deps, Node 20, clones the repo
#                (if needed), builds, writes systemd unit + Caddy reverse proxy
#                (automatic HTTPS via Let's Encrypt when --domain is given),
#                configures ufw, starts the service.
#   * Update   : the existing flow — backup DB, stop, git pull, rebuild, restart,
#                health check. This is the default once the service is installed.
#
# Typical first-time deploy on a fresh Vultr Debian 12 server (as root):
#
#   apt-get update && apt-get install -y git curl
#   git clone https://github.com/<you>/citadels-online.git /opt/citadels/citadels-online
#   cd /opt/citadels/citadels-online
#   bash scripts/deploy.sh --install
#
#   # With a domain — Caddy obtains & renews the HTTPS certificate automatically:
#   bash scripts/deploy.sh --install --domain citadels.example.com
#   # (optional) Let's Encrypt expiry-notification email:
#   bash scripts/deploy.sh --install --domain citadels.example.com --email you@example.com
#
# Later updates (from the repo dir):
#
#   bash scripts/deploy.sh                  # pull + rebuild + restart
#   bash scripts/deploy.sh --skip-build     # restart only (after a manual build)
#
# Flags:
#   --install           Force full provisioning (idempotent — safe to re-run)
#   --skip-backup       Skip the SQLite backup step
#   --skip-build        Skip the npm build step (update mode)
#   --domain DOMAIN     Domain name for Caddy + automatic Let's Encrypt TLS
#   --email EMAIL       Email for Let's Encrypt (optional; Caddy uses an anonymous
#                       ACME account when omitted, --domain works without it)
#   --git-url URL       Git URL to clone when the repo is not present yet
#                       (default: https://github.com/zerg54321/citadels-online.git)
#   --branch NAME       Branch/tag to checkout after clone / pull (default: main)
#   --yes               Skip interactive confirmations
#   -h, --help          Show this help
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
    -h|--help) sed -n '2,44p' "$0"; exit 0 ;;
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

# Must run as root (systemd / caddy / ufw / apt need it).
[ "$(id -u)" -eq 0 ] || fail "请以 root 运行 (sudo bash scripts/deploy.sh)"

# Resolve repo dir: prefer the git root the script lives in, else the default.
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if REPO_DIR="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  REPO_DIR="$DEFAULT_REPO_DIR"
fi

service_installed() { systemctl list-unit-files "${SERVICE_NAME}.service" >/dev/null 2>&1 && systemctl is-enabled "${SERVICE_NAME}.service" >/dev/null 2>&1; }

# Auto-detect mode: if the systemd unit is missing, this is a first run.
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
# Provisioning steps (install mode)
# -----------------------------------------------------------------------------

install_deps() {
  log "安装系统依赖 (Debian)..."
  export DEBIAN_FRONTEND=noninteractive
  apt-get update -y
  apt-get install -y ca-certificates curl gnupg git build-essential ufw openssl \
    lsb-release debian-keyring debian-archive-keyring apt-transport-https
  # Install Caddy from the official Cloudsmith repo (replaces nginx + certbot;
  # Caddy handles reverse proxy + automatic Let's Encrypt TLS in one binary).
  if ! command -v caddy >/dev/null 2>&1; then
    log "安装 Caddy (官方源)..."
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
      | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
    curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.sh' \
      | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
    apt-get update -y
    apt-get install -y caddy
  fi
  if ! command -v node >/dev/null 2>&1; then
    log "安装 Node.js ${NODE_MAJOR}.x (NodeSource)..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  fi
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
# Admin management API (access via SSH tunnel to 127.0.0.1:8081)
ADMIN_TOKEN=${admin_token}
ADMIN_ALLOW_IPS=127.0.0.1,::1
EOF
  chmod 600 "$env_file"
  log "已生成随机 JWT_SECRET 与 ADMIN_TOKEN（请勿提交 .env）"
  log "管理面访问: ssh -L 8081:127.0.0.1:8081 root@<vps> 然后本地打开 http://127.0.0.1:8081/admin"
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
# 日志走 journald：journalctl -u ${SERVICE_NAME} -f

[Install]
WantedBy=multi-user.target
EOF
  systemctl daemon-reload
}

write_caddyfile() {
  log "写入 Caddyfile: ${CADDY_CONF}"
  # With a domain Caddy serves HTTPS (auto cert) and redirects 80→443.
  # Without one it serves plain HTTP on :80 (IP-only deploy).
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

    # Block the admin management API from the public internet entirely.
    # Admin is only reachable via an SSH tunnel to 127.0.0.1:8081, which
    # bypasses Caddy. Third independent gate on top of the IP-allowlist +
    # token checks enforced inside Node.
    @admin path /api/admin /api/admin/*
    handle @admin {
        respond 404
    }

    # SPA + REST API + Socket.IO WebSocket (Caddy upgrades the connection
    # automatically, no per-location WebSocket plumbing needed).
    reverse_proxy 127.0.0.1:${APP_PORT}
}
EOF
  chmod 644 "$CADDY_CONF"
  caddy validate --config "$CADDY_CONF" --adapter caddyfile
  systemctl enable caddy >/dev/null 2>&1 || true
  systemctl restart caddy || systemctl reload caddy
}

setup_firewall() {
  log "配置 ufw 防火墙..."
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 80/tcp >/dev/null 2>&1 || true
  ufw allow 443/tcp >/dev/null 2>&1 || true
  yes | ufw --force enable >/dev/null 2>&1 || true
  ufw status || true
}

update_cors_origin() {
  [ -z "$DOMAIN" ] && return 0
  # Caddy obtains & renews the TLS certificate itself — no certbot step needed.
  # We only make the app aware of its public origin: ensure_env sets this on
  # first install, this covers later --domain additions on an existing .env.
  if [ -f "$REPO_DIR/.env" ] && grep -q '^CORS_ORIGIN=' "$REPO_DIR/.env"; then
    sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" "$REPO_DIR/.env"
    log "已更新 CORS_ORIGIN=https://${DOMAIN}"
  fi
}

# -----------------------------------------------------------------------------
# Build (shared)
# -----------------------------------------------------------------------------

# Install deps: try npm ci first (reproducible), fall back to npm install
npm_install() {
  local dir="$1"
  cd "$dir"
  if npm ci 2>/dev/null; then
    return 0
  fi
  warn "npm ci failed (lock file may be stale), falling back to npm install..."
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
# Service control + health
# -----------------------------------------------------------------------------

backup_db() {
  if [ "$SKIP_BACKUP" = true ]; then log "跳过数据库备份"; return; fi
  mkdir -p "$BACKUP_DIR"
  if [ -f "$DB_PATH" ]; then
    local backup_file="${BACKUP_DIR}/citadels-$(date +%F_%H%M%S).sqlite"
    log "备份数据库: $DB_PATH -> $backup_file"
    cp "$DB_PATH" "$backup_file"
    # Keep only the 30 most recent backups.
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
# Main
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
  log "首次部署完成 ✓"
  log "  本机:   $HEALTH_URL"
  [ -n "$DOMAIN" ] && log "  公网:   https://${DOMAIN}"
  log "  应用日志: journalctl -u $SERVICE_NAME -f"
  log "  反代日志: journalctl -u caddy -f"
  log "  更新:   bash scripts/deploy.sh"
  exit 0
fi

# ---- update mode ----
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
# Refresh unit/env wiring in case the repo moved or .env was added.
ensure_env
write_systemd_unit
# Reload Caddy if the Caddyfile changed.
if [ -f "$CADDY_CONF" ]; then
  caddy validate --config "$CADDY_CONF" --adapter caddyfile && systemctl reload caddy || true
fi
start_service
health_check
log "部署完成 ✓"
log "  首页: $HEALTH_URL"
log "  日志: journalctl -u $SERVICE_NAME -f"
