#!/usr/bin/env bash
set -euo pipefail

# =============================================================================
# Citadels Online — 仅更新游戏项目并重启服务的脚本（阿里云 Debian）
#
# 与 deploy-aliyun.sh 的区别：
#   * 只做「拉代码 → 构建 → 迁移数据 → 重启游戏服务」
#   * 完全不含系统依赖安装、Node/Caddy 安装、Caddyfile 配置、防火墙设置
#     （这些只在首次完整部署 deploy-aliyun.sh --install 时执行一次）
#
# 日常更新用法（在服务器上执行）：
#
#   cd /opt/citadels/citadels-online
#   bash scripts/update-aliyun.sh
#
# 参数说明：
#   --skip-backup       跳过数据库/头像备份
#   --skip-build        跳过 npm 构建步骤
#   --branch NAME       分支/标签名（默认 main）
#   --yes               跳过交互确认
#   -h, --help          显示帮助
#
# 说明：拉取前会自动清理已跟踪文件的本地漂移（先备份 diff 到 backups/ 再重置），
#       以免 package-lock.json 等漂移阻塞 git pull；未跟踪文件（含 .env、data/）不触碰。
# =============================================================================

INSTALL_ROOT="/opt/citadels"
DATA_DIR="${INSTALL_ROOT}/data"
BACKUP_DIR="${INSTALL_ROOT}/backups"
DEFAULT_REPO_DIR="${INSTALL_ROOT}/citadels-online"
DB_PATH="${DATA_DIR}/citadels.sqlite"
AVATAR_DIR="${DATA_DIR}/avatars"
SERVICE_NAME="citadels"
APP_PORT="8081"
HEALTH_URL="http://127.0.0.1:${APP_PORT}"
HEALTH_TIMEOUT=40

SKIP_BACKUP=false
SKIP_BUILD=false
BRANCH="main"
ASSUME_YES=false

while [ $# -gt 0 ]; do
  case "$1" in
    --skip-backup) SKIP_BACKUP=true; shift ;;
    --skip-build) SKIP_BUILD=true; shift ;;
    --yes) ASSUME_YES=true; shift ;;
    -h|--help) sed -n '2,26p' "$0"; exit 0 ;;
    --branch) BRANCH="${2:?--branch 需要一个值}"; shift 2 ;;
    *) echo "未知参数: $1 (使用 --help 查看用法)"; exit 1 ;;
  esac
done

log()  { echo "[update] $(date '+%Y-%m-%d %H:%M:%S') $*"; }
warn() { echo "[update WARN] $*" >&2; }
fail() { echo "[update ERROR] $*" >&2; exit 1; }

[ "$(id -u)" -eq 0 ] || fail "请以 root 运行 (sudo bash scripts/update-aliyun.sh)"

# 解析仓库目录：优先使用脚本所在 git 根目录，否则使用默认路径
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
if REPO_DIR="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null)"; then
  :
else
  REPO_DIR="$DEFAULT_REPO_DIR"
fi

[ -d "$REPO_DIR/.git" ] || fail "代码目录不存在或不是 git 仓库: $REPO_DIR（请先运行 scripts/deploy-aliyun.sh --install）"

confirm() {
  [ "$ASSUME_YES" = true ] && return 0
  local question="$1"
  read -r -p "$question [y/N] " answer
  [ "$answer" = "y" ] || [ "$answer" = "Y" ]
}

# -----------------------------------------------------------------------------
# 备份（数据库 + 用户头像）
# -----------------------------------------------------------------------------
backup_data() {
  if [ "$SKIP_BACKUP" = true ]; then log "跳过数据库/头像备份"; return; fi
  mkdir -p "$BACKUP_DIR"
  local stamp
  stamp="$(date +%F_%H%M%S)"
  if [ -f "$DB_PATH" ]; then
    local backup_file="${BACKUP_DIR}/citadels-${stamp}.sqlite"
    log "备份数据库: $DB_PATH -> $backup_file"
    cp "$DB_PATH" "$backup_file"
    # 只保留最近 30 个数据库备份
    ls -t "$BACKUP_DIR"/citadels-*.sqlite 2>/dev/null | tail -n +31 | xargs -r rm -f
  else
    warn "数据库文件不存在，跳过数据库备份: $DB_PATH"
  fi
  if [ -d "$AVATAR_DIR" ]; then
    local avatar_backup="${BACKUP_DIR}/avatars-${stamp}.tar.gz"
    log "备份用户头像: $AVATAR_DIR -> $avatar_backup"
    tar -czf "$avatar_backup" -C "$DATA_DIR" avatars
    # 只保留最近 30 个头像备份
    ls -t "$BACKUP_DIR"/avatars-*.tar.gz 2>/dev/null | tail -n +31 | xargs -r rm -f
  else
    warn "头像目录不存在，跳过头像备份: $AVATAR_DIR"
  fi
}

ensure_avatar_dir_env() {
  local env_file="$REPO_DIR/.env"
  if [ -f "$env_file" ] && ! grep -q '^AVATAR_DIR=' "$env_file"; then
    echo "AVATAR_DIR=${DATA_DIR}/avatars" >> "$env_file"
    log "已追加 AVATAR_DIR=${DATA_DIR}/avatars 到 .env"
  fi
}

# 将旧仓库内 data/avatars 迁移到统一数据目录 /opt/citadels/data/avatars，
# 保证既有上传头像在更新后不丢失（仅迁移一次，新增文件不动）。
migrate_avatars() {
  local old_dir="${REPO_DIR}/data/avatars"
  if [ -d "$old_dir" ]; then
    mkdir -p "$AVATAR_DIR"
    log "迁移用户头像: $old_dir -> $AVATAR_DIR"
    cp -an "$old_dir"/. "$AVATAR_DIR"/ || true
    rm -rf "$old_dir"
    log "旧头像目录已迁移并清理"
  fi
}

# -----------------------------------------------------------------------------
# 拉取前清理工作区
# -----------------------------------------------------------------------------
# 部署服务器上的 git 仓库本不应有本地改动。但 npm install/ci 失败回退时可能
# 重写 package-lock.json，导致下一次 git pull --ff-only 被"本地修改"阻塞而卡住。
# 这里在任何 git 写操作前，把已跟踪文件的本地漂移【先备份 diff 再重置】，避免卡住；
# 未跟踪文件（?? 开头，例如仓库内可能残留的数据）一律不删，只提示。
prepare_worktree() {
  local porcelain
  porcelain="$(git -c core.quotepath=false status --porcelain 2>/dev/null || true)"

  local untracked
  untracked="$(printf '%s\n' "$porcelain" | awk '/^\?\?/ { print substr($0,4) }')"
  if [ -n "$untracked" ]; then
    warn "检测到未跟踪文件（保留不动、不处理）："
    printf '%s\n' "$untracked" | sed 's/^/    /'
  fi

  local tracked
  tracked="$(printf '%s\n' "$porcelain" | awk '/^\?\?/ { next } NF { print }')"
  if [ -n "$tracked" ]; then
    local stamp diff_file
    stamp="$(date +%F_%H%M%S)"
    diff_file="${BACKUP_DIR}/worktree-${stamp}.diff"
    mkdir -p "$BACKUP_DIR"
    log "检测到已跟踪文件改动，备份到 $diff_file 后重置工作区"
    git -c core.quotepath=false diff HEAD > "$diff_file" 2>/dev/null || true
    git reset --hard HEAD || fail "无法重置工作区，请手动处理后重试"
    log "已重置已跟踪文件到 HEAD（部署目录应保持干净）"
  fi
}

# -----------------------------------------------------------------------------
# 构建
# -----------------------------------------------------------------------------
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
cd "$REPO_DIR"
log "repo=${REPO_DIR} branch=${BRANCH}"
confirm "确认更新游戏到 ${BRANCH} 分支并重启服务？" || { echo "已取消"; exit 0; }

backup_data
log "停止服务: $SERVICE_NAME"
systemctl stop "$SERVICE_NAME" || true

prepare_worktree

log "git pull"
git fetch --all >/dev/null 2>&1 || true
git checkout "$BRANCH" 2>/dev/null || true
git pull --ff-only || fail "git pull 失败，请手动解决冲突"

if [ "$SKIP_BUILD" = false ]; then
  build_app
else
  log "跳过构建步骤"
fi

ensure_avatar_dir_env
migrate_avatars

start_service
health_check

log "============================================"
log "游戏更新完成 ✓"
log "============================================"
log "  首页: $HEALTH_URL"
log "  日志: journalctl -u $SERVICE_NAME -f"
