#!/usr/bin/env bash
set -euo pipefail

# Citadels Online 一键部署脚本（VPS / Debian）
# 用法：在仓库根目录执行 sudo bash scripts/deploy.sh [--skip-backup] [--skip-build]
# 或：sudo bash /opt/citadels/citadels-online/scripts/deploy.sh

# 自动检测仓库根目录（兼容直接 clone 到 /opt/citadels 或 /opt/citadels/citadels-online）
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_DIR="$(git -C "$SCRIPT_DIR" rev-parse --show-toplevel 2>/dev/null || echo "$SCRIPT_DIR")"

SERVICE_NAME="citadels"
DB_PATH="/opt/citadels/data/citadels.sqlite"
BACKUP_DIR="/opt/citadels/backups"
HEALTH_URL="http://127.0.0.1:8081"
HEALTH_TIMEOUT=30

SKIP_BACKUP=false
SKIP_BUILD=false

for arg in "$@"; do
  case "$arg" in
    --skip-backup) SKIP_BACKUP=true ;;
    --skip-build) SKIP_BUILD=true ;;
    *)
      echo "未知参数: $arg"
      echo "用法: $0 [--skip-backup] [--skip-build]"
      exit 1
      ;;
  esac
done

log() {
  echo "[deploy] $(date '+%Y-%m-%d %H:%M:%S') $*"
}

fail() {
  echo "[deploy ERROR] $*"
  exit 1
}

# 1. 确认目录
[ -d "$REPO_DIR" ] || fail "代码目录不存在: $REPO_DIR"
cd "$REPO_DIR"

# 2. 备份数据库（默认开启，加 --skip-backup 跳过）
if [ "$SKIP_BACKUP" = false ]; then
  mkdir -p "$BACKUP_DIR"
  if [ -f "$DB_PATH" ]; then
    BACKUP_FILE="${BACKUP_DIR}/citadels-$(date +%F_%H%M%S).sqlite"
    log "备份数据库: $DB_PATH -> $BACKUP_FILE"
    cp "$DB_PATH" "$BACKUP_FILE"
    # 只保留最近 30 份备份
    ls -t "$BACKUP_DIR"/citadels-*.sqlite 2>/dev/null | tail -n +31 | xargs -r rm -f
  else
    log "警告: 数据库文件不存在，跳过备份"
  fi
else
  log "跳过数据库备份"
fi

# 3. 停止服务
log "停止服务: $SERVICE_NAME"
systemctl stop "$SERVICE_NAME" || true

# 4. 拉取代码
log "git pull"
git pull --ff-only || fail "git pull 失败，请手动解决冲突"

# 5. 构建（默认开启，加 --skip-build 跳过）
if [ "$SKIP_BUILD" = false ]; then
  log "构建 common"
  cd "$REPO_DIR/common"
  npm ci
  npm run build

  log "构建 client"
  cd "$REPO_DIR/client"
  npm ci
  npm run build

  log "构建 server"
  cd "$REPO_DIR/server"
  npm ci
  npm run build
else
  log "跳过构建步骤"
fi

# 6. 启动服务
log "启动服务: $SERVICE_NAME"
systemctl start "$SERVICE_NAME"

# 7. 健康检查
log "等待服务就绪 (最多 ${HEALTH_TIMEOUT}s)"
ELAPSED=0
until curl -sf "$HEALTH_URL" >/dev/null 2>&1; do
  sleep 1
  ELAPSED=$((ELAPSED + 1))
  if [ "$ELAPSED" -ge "$HEALTH_TIMEOUT" ]; then
    fail "服务启动超时，请检查日志: journalctl -u $SERVICE_NAME -n 50"
  fi
done

log "部署完成 ✓"
log "首页: $HEALTH_URL"
log "查看日志: journalctl -u $SERVICE_NAME -f"
