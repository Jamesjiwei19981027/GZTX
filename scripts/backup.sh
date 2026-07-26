#!/usr/bin/env bash
# WorkTodo 备份脚本
#
# 修复要点（旧版形同虚设）：
# 1. 旧版备份 /opt/worktodo/data/worktodo.db —— 两套编排都不在该路径
#    （开发是 ./backend/data 绑定挂载，生产是 backend_data 命名卷），永远备份不到；
# 2. 旧版对活动 SQLite 直接 cp —— 写入进行中拷贝会得到损坏快照，
#    现改用 SQLite 在线备份 API（sqlite3.Connection.backup）；
# 3. 旧版硬编码容器名 worktodo-db-1 —— 改用 docker compose 服务名；
# 4. 旧版只备数据库 —— 证据/附件对象库（COLLAB_OBJECT_ROOT、UPLOAD_DIR）
#    从未被备份，丢了同样是数据丢失，现一并打包。
#
# 用法：
#   scripts/backup.sh                       # 用 docker-compose.prod.yml
#   COMPOSE_FILE=docker-compose.yml scripts/backup.sh
#   BACKUP_DIR=/mnt/backup scripts/backup.sh
#
# crontab（每日 02:00）：
#   0 2 * * * cd /opt/worktodo && ./scripts/backup.sh >> /var/log/worktodo-backup.log 2>&1
#
# 恢复见 scripts/restore.sh。**上线前请至少演练一次恢复**。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
BACKUP_DIR="${BACKUP_DIR:-$REPO_ROOT/backups}"
RETENTION_DAYS="${RETENTION_DAYS:-30}"
DATE="$(date +%Y%m%d_%H%M%S)"

cd "$REPO_ROOT"
mkdir -p "$BACKUP_DIR"

if ! docker compose -f "$COMPOSE_FILE" ps >/dev/null 2>&1; then
    echo "[$DATE] ERROR: 无法访问 docker compose（COMPOSE_FILE=$COMPOSE_FILE）" >&2
    exit 1
fi

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# 判定服务是否在运行（compose ps 只列出运行中的服务名）
service_running() { compose ps --services --status running 2>/dev/null | grep -qx "$1"; }

backed_up=0

# ---------- PostgreSQL ----------
if service_running db; then
    DB_USER="${DB_USER:-worktodo}"
    DB_NAME="${DB_NAME:-worktodo}"
    OUT="$BACKUP_DIR/worktodo_${DATE}.sql.gz"
    # -T 关闭 TTY 分配，否则输出会被注入 \r 导致 dump 损坏
    compose exec -T db pg_dump -U "$DB_USER" "$DB_NAME" | gzip > "$OUT"
    # pg_dump 失败时 gzip 仍会产出一个小文件，用 PIPESTATUS 判定真实结果
    if [ "${PIPESTATUS[0]}" -ne 0 ]; then
        rm -f "$OUT"
        echo "[$DATE] ERROR: pg_dump 失败" >&2
        exit 1
    fi
    echo "[$DATE] PostgreSQL 备份完成: $(basename "$OUT") ($(du -h "$OUT" | cut -f1))"
    backed_up=1
fi

# ---------- SQLite ----------
# 在 backend 容器内用 stdlib sqlite3 的在线备份 API 生成一致性快照，再拷出来。
# 镜像里不一定有 sqlite3 CLI，但一定有 python。
if [ "$backed_up" -eq 0 ] && service_running backend; then
    SQLITE_PATH="${SQLITE_PATH:-/app/data/worktodo.db}"
    if compose exec -T backend test -f "$SQLITE_PATH" 2>/dev/null; then
        TMP_IN_CONTAINER="/tmp/worktodo_backup_${DATE}.db"
        compose exec -T backend python -c "
import sqlite3, sys
src = sqlite3.connect('${SQLITE_PATH}')
dst = sqlite3.connect('${TMP_IN_CONTAINER}')
with dst:
    src.backup(dst)   # 在线备份：对并发写入安全，不会拿到撕裂的快照
dst.close(); src.close()
"
        CID="$(compose ps -q backend)"
        docker cp "${CID}:${TMP_IN_CONTAINER}" "$BACKUP_DIR/worktodo_${DATE}.db"
        compose exec -T backend rm -f "$TMP_IN_CONTAINER"
        gzip -f "$BACKUP_DIR/worktodo_${DATE}.db"
        echo "[$DATE] SQLite 备份完成: worktodo_${DATE}.db.gz"
        backed_up=1
    fi
fi

if [ "$backed_up" -eq 0 ]; then
    echo "[$DATE] ERROR: 既没有运行中的 db 服务，也没找到 SQLite 库，未产生任何备份" >&2
    exit 1
fi

# ---------- 对象库（证据文件 / 附件 / 上传）----------
# 数据库里只存元数据与路径，实际文件在 /app/data/objects 与 /app/data/uploads；
# 只备数据库、不备这些文件，恢复出来的系统所有证据附件都是 404。
if service_running backend; then
    CID="$(compose ps -q backend)"
    OBJ_OUT="$BACKUP_DIR/objects_${DATE}.tar.gz"
    if compose exec -T backend sh -c 'test -d /app/data/objects || test -d /app/data/uploads'; then
        compose exec -T backend tar -czf - -C /app/data \
            --ignore-failed-read objects uploads 2>/dev/null > "$OBJ_OUT" || true
        if [ -s "$OBJ_OUT" ]; then
            echo "[$DATE] 对象库备份完成: $(basename "$OBJ_OUT") ($(du -h "$OBJ_OUT" | cut -f1))"
        else
            rm -f "$OBJ_OUT"
            echo "[$DATE] WARN: 对象库为空或打包失败" >&2
        fi
    fi
fi

# ---------- 清理过期备份 ----------
find "$BACKUP_DIR" -maxdepth 1 -name 'worktodo_*.sql.gz' -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true
find "$BACKUP_DIR" -maxdepth 1 -name 'worktodo_*.db.gz'  -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true
find "$BACKUP_DIR" -maxdepth 1 -name 'objects_*.tar.gz'  -mtime "+$RETENTION_DAYS" -delete 2>/dev/null || true

echo "[$DATE] 备份结束，保留 ${RETENTION_DAYS} 天；目录: $BACKUP_DIR"
