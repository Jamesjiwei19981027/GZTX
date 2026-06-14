#!/bin/bash
# 健康检查脚本 - 每5分钟执行

HEALTH_URL="https://your-domain.com/api/v1/health"
WEBHOOK_URL="https://your-webhook-url"
LOG_FILE="/var/log/worktodo-health.log"

response=$(curl -s -o /dev/null -w "%{http_code}" $HEALTH_URL --max-time 10)
DATE=$(date '+%Y-%m-%d %H:%M:%S')

if [ "$response" = "200" ]; then
    echo "[$DATE] Health check OK" >> $LOG_FILE
else
    echo "[$DATE] Health check FAILED (HTTP $response)" >> $LOG_FILE
    # 发送告警
    curl -X POST $WEBHOOK_URL \
        -H "Content-Type: application/json" \
        -d "{\"text\": \"[WorkTodo] 服务异常，HTTP状态码: $response\"}" 2>/dev/null
fi