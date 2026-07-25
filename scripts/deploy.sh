#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Citadels Online — one-click deploy for Vultr / Debian 12
#
# Two modes (auto-detected, can be forced with --install):
#   * Install  : provisions a fresh box — system deps, Node 20, clones the repo
#                (if needed), builds, writes systemd unit + Nginx reverse proxy,
#                configures ufw, optional Let's Encrypt TLS, starts the service.
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
#   # With a domain + free HTTPS certificate:
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
#   --domain DOMAIN     Domain name for Nginx + Let's Encrypt TLS
#   --email EMAIL       Email for Let's Encrypt (required with --domain if not
#                       registered yet; otherwise --register-unsafely-without-email)
#   --git-url URL       Git URL to clone when the repo is not present yet
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
NGINX_SITE="citadels"
NODE_MAJOR=20

MODE=""
SKIP_BACKUP=false
SKIP_BUILD=false
DOMAIN=""
EMAIL=""
GIT_URL=""
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

# Must run as root (systemd / nginx / ufw / apt need it).
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
  apt-get install -y ca-certificates curl gnupg git build-essential nginx ufw openssl \
    lsb-release
  if ! command -v node >/dev/null 2>&1; then
    log "安装 Node.js ${NODE_MAJOR}.x (NodeSource)..."
    curl -fsSL "https://deb.nodesource.com/setup_${NODE_MAJOR}.x" | bash -
    apt-get install -y nodejs
  fi
  node -v
  npm -v
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

write_nginx_site() {
  log "写入 Nginx 站点: ${NGINX_SITE}"
  local server_name="_"
  [ -n "$DOMAIN" ] && server_name="$DOMAIN"
  cat > "/etc/nginx/sites-available/${NGINX_SITE}" <<EOF
server {
    listen 80;
    listen [::]:80;
    server_name ${server_name};

    client_max_body_size 10m;

    # Block the admin management API from the public internet entirely.
    # Admin is only reachable via an SSH tunnel to 127.0.0.1:8081, which
    # bypasses Nginx. This is a third independent gate on top of the
    # IP-allowlist + token checks enforced inside Node.
    location /api/admin {
        return 404;
    }

    # Socket.IO WebSocket endpoint
    location /s/ {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_read_timeout 86400s;
        proxy_send_timeout 86400s;
    }

    # SPA + REST API
    location / {
        proxy_pass http://127.0.0.1:${APP_PORT};
        proxy_http_version 1.1;
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
    }
}
EOF
  ln -sf "/etc/nginx/sites-available/${NGINX_SITE}" "/etc/nginx/sites-enabled/${NGINX_SITE}"
  # Remove the default site if it conflicts on port 80.
  rm -f /etc/nginx/sites-enabled/default
  nginx -t
  systemctl reload nginx || systemctl restart nginx
}

setup_firewall() {
  log "配置 ufw 防火墙..."
  ufw allow OpenSSH >/dev/null 2>&1 || ufw allow 22/tcp >/dev/null 2>&1 || true
  ufw allow 'Nginx Full' >/dev/null 2>&1 || { ufw allow 80/tcp >/dev/null 2>&1 || true; ufw allow 443/tcp >/dev/null 2>&1 || true; }
  yes | ufw --force enable >/dev/null 2>&1 || true
  ufw status || true
}

setup_tls() {
  [ -z "$DOMAIN" ] && return 0
  log "申请 Let's Encrypt 证书: ${DOMAIN}"
  export DEBIAN_FRONTEND=noninteractive
  apt-get install -y certbot python3-certbot-nginx
  local certbot_args=(--nginx -d "$DOMAIN" --non-interactive --agree-tos --redirect)
  if [ -n "$EMAIL" ]; then
    certbot_args+=(--email "$EMAIL")
  else
    certbot_args+=(--register-unsafely-without-email)
  fi
  certbot "${certbot_args[@]}"
  # Make sure the app knows its public origin.
  if [ -f "$REPO_DIR/.env" ] && grep -q '^CORS_ORIGIN=' "$REPO_DIR/.env"; then
    sed -i "s|^CORS_ORIGIN=.*|CORS_ORIGIN=https://${DOMAIN}|" "$REPO_DIR/.env"
  fi
}

# -----------------------------------------------------------------------------
# Build (shared)
# -----------------------------------------------------------------------------

build_app() {
  log "构建 common"
  ( cd "$REPO_DIR/common" && npm ci && npm run build )
  log "构建 client-react"
  ( cd "$REPO_DIR/client-react" && npm ci && npm run build )
  log "构建 server"
  ( cd "$REPO_DIR/server" && npm ci && npm run build )
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
  write_nginx_site
  setup_firewall
  setup_tls
  start_service
  health_check
  log "首次部署完成 ✓"
  log "  本机:   $HEALTH_URL"
  [ -n "$DOMAIN" ] && log "  公网:   https://${DOMAIN}"
  log "  日志:   journalctl -u $SERVICE_NAME -f"
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
# Reload nginx if the site config changed.
if [ -f "/etc/nginx/sites-enabled/${NGINX_SITE}" ]; then
  nginx -t && systemctl reload nginx || true
fi
start_service
health_check
log "部署完成 ✓"
log "  首页: $HEALTH_URL"
log "  日志: journalctl -u $SERVICE_NAME -f"
