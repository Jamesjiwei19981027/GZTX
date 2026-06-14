#!/bin/bash
# 备份脚本 - 每日凌晨2点执行

BACKUP_DIR="/opt/worktodo/backups"
DB_CONTAINER="worktodo-db-1"
DATE=$(date +%Y%m%d_%H%M%S)

mkdir -p $BACKUP_DIR

# PostgreSQL备份
if docker ps | grep -q $DB_CONTAINER; then
    docker exec $DB_CONTAINER pg_dump -U worktodo worktodo > $BACKUP_DIR/worktodo_$DATE.sql
    gzip $BACKUP_DIR/worktodo_$DATE.sql
    echo "[$DATE] PostgreSQL backup created: worktodo_$DATE.sql.gz"
else
    # SQLite备份
    if [ -f /opt/worktodo/data/worktodo.db ]; then
        cp /opt/worktodo/data/worktodo.db $BACKUP_DIR/worktodo_$DATE.db
        gzip $BACKUP_DIR/worktodo_$DATE.db
        echo "[$DATE] SQLite backup created: worktodo_$DATE.db.gz"
    fi
fi

# 删除30天前的备份
find $BACKUP_DIR -name "worktodo_*.sql.gz" -mtime +30 -delete 2>/dev/null
find $BACKUP_DIR -name "worktodo_*.db.gz" -mtime +30 -delete 2>/dev/null

echo "[$DATE] Backup cleanup completed"