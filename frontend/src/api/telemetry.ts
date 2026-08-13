/**
 * 轻遥测（最小版）：track(name, props?) 入内存队列，
 * 5 秒或满 20 条批量 POST /events；失败静默丢弃，绝不影响主流程；未登录不发。
 */
import { getApiBase, getToken } from './client'

type TelemetryEvent = {
  name: string
  ts: string
  props?: Record<string, unknown>
}

const FLUSH_INTERVAL_MS = 5000
const FLUSH_BATCH_SIZE = 20

let queue: TelemetryEvent[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

async function flush(): Promise<void> {
  if (flushTimer) {
    clearTimeout(flushTimer)
    flushTimer = null
  }
  if (queue.length === 0) return
  const token = getToken()
  if (!token) {
    // 未登录：丢弃而不是积压，避免登录后误发匿名期事件
    queue = []
    return
  }
  const events = queue.splice(0, queue.length)
  try {
    await fetch(`${getApiBase()}/events`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ events }),
    })
  } catch {
    // 失败静默丢弃：遥测绝不影响主流程
  }
}

export function track(name: string, props?: Record<string, unknown>): void {
  if (!getToken()) return
  queue.push({ name, ts: new Date().toISOString(), props })
  if (queue.length >= FLUSH_BATCH_SIZE) {
    void flush()
    return
  }
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      void flush()
    }, FLUSH_INTERVAL_MS)
  }
}
