#!/usr/bin/env bash
# WorkTodo 恢复脚本 —— 与 scripts/backup.sh 配套。
#
# 上线前必须演练一次：没演练过的备份等于没有备份。
#
# 用法：
#   scripts/restore.sh backups/worktodo_20260726_020000.sql.gz          # PostgreSQL
#   scripts/restore.sh backups/worktodo_20260726_020000.db.gz           # SQLite
#   scripts/restore.sh backups/objects_20260726_020000.tar.gz           # 对象库
#
# 数据库与对象库需分别恢复到同一时间点，否则会出现"有记录没文件"。

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
ARCHIVE="${1:-}"

if [ -z "$ARCHIVE" ]; then
    echo "用法: $0 <备份文件>" >&2
    exit 1
fi
if [ ! -f "$ARCHIVE" ]; then
    echo "ERROR: 找不到备份文件 $ARCHIVE" >&2
    exit 1
fi

cd "$REPO_ROOT"
compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

echo "!! 恢复会覆盖当前数据，且不可撤销。"
echo "   备份文件: $ARCHIVE"
echo "   编排文件: $COMPOSE_FILE"
read -r -p "确认继续？输入 yes: " confirm
[ "$confirm" = "yes" ] || { echo "已取消"; exit 1; }

case "$ARCHIVE" in
    *.sql.gz)
        DB_USER="${DB_USER:-worktodo}"
        DB_NAME="${DB_NAME:-worktodo}"
        echo "==> 恢复 PostgreSQL 到 $DB_NAME"
        # 先断开应用，避免恢复期间写入
        compose stop backend
        gunzip -c "$ARCHIVE" | compose exec -T db psql -U "$DB_USER" -d "$DB_NAME"
        compose start backend
        ;;
    *.db.gz)
        SQLITE_PATH="${SQLITE_PATH:-/app/data/worktodo.db}"
        echo "==> 恢复 SQLite 到 $SQLITE_PATH"
        TMP="$(mktemp)"
        gunzip -c "$ARCHIVE" > "$TMP"
        CID="$(compose ps -q backend)"
        if [ -z "$CID" ]; then
            echo "ERROR: backend 容器未运行，无法定位目标卷" >&2
            rm -f "$TMP"; exit 1
        fi
        compose stop backend
        # 容器已停仍可 docker cp
        docker cp "$TMP" "${CID}:${SQLITE_PATH}"
        rm -f "$TMP"
        compose start backend
        ;;
    objects_*.tar.gz)
        echo "==> 恢复对象库到 /app/data"
        CID="$(compose ps -q backend)"
        [ -n "$CID" ] || { echo "ERROR: backend 容器未运行" >&2; exit 1; }
        compose exec -T backend sh -c 'mkdir -p /app/data'
        docker cp "$ARCHIVE" "${CID}:/tmp/objects_restore.tar.gz"
        compose exec -T backend sh -c 'tar -xzf /tmp/objects_restore.tar.gz -C /app/data && rm -f /tmp/objects_restore.tar.gz'
        ;;
    *)
        echo "ERROR: 无法识别的备份类型: $ARCHIVE" >&2
        echo "       支持 *.sql.gz（PG）、*.db.gz（SQLite）、objects_*.tar.gz（对象库）" >&2
        exit 1
        ;;
esac

echo "==> 恢复完成。请立即验证："
echo "    curl -fsS http://127.0.0.1/api/v1/health"
echo "    登录一个账号，打开任一项目工作树，确认证据附件可下载。"
