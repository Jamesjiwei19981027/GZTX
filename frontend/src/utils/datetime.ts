/**
 * 三端 due_date 契约：后端出参一律 UTC 带 `Z`，客户端本地渲染、UTC 提交。
 *
 * 历史实现直接对 ISO 串做 `slice(0, 10)` / `slice(11, 16)`，等于把 UTC 当本地时间读，
 * 东八区用户看到的日期会在 08:00 之前整体偏一天。
 */

const pad = (n: number) => String(n).padStart(2, '0')

/** 本地日期（YYYY-MM-DD）+ 可选本地时刻（HH:mm）→ UTC ISO 字符串 */
export function toApiDueDate(date?: string, time?: string): string | undefined {
  if (!date) return undefined
  const day = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date.trim())
  if (!day) return undefined
  const clock = /^(\d{1,2}):(\d{2})/.exec((time || '').trim())
  const local = new Date(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    clock ? Number(clock[1]) : 0,
    clock ? Number(clock[2]) : 0,
    0,
    0,
  )
  if (Number.isNaN(local.getTime())) return undefined
  return local.toISOString()
}

/**
 * UTC ISO → 本地 `{ date, time }`。
 *
 * 本地时刻正好 00:00:00 视为「只有日期、没有具体时刻」，与后端 ICS 导出的全天事件同口径。
 */
export function fromApiDueDate(iso?: string | null): { date: string; time?: string } {
  if (!iso) return { date: '' }
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) {
    // 兜底：非法值退回按前 10 位当日期，至少不让整条任务失去截止日期
    return { date: String(iso).slice(0, 10) }
  }
  const date = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`
  const midnight = d.getHours() === 0 && d.getMinutes() === 0 && d.getSeconds() === 0
  return midnight ? { date } : { date, time: `${pad(d.getHours())}:${pad(d.getMinutes())}` }
}

/** UTC ISO → 本地 `YYYY-MM-DD`（空值返回空串） */
export function toLocalDateString(iso?: string | null): string {
  return fromApiDueDate(iso).date
}

/** 本地 `YYYY-MM-DD` 当天 00:00 的 UTC ISO，用于 `due_date_from` 这类范围查询 */
export function localDayStartToApi(date: string): string | undefined {
  return toApiDueDate(date)
}

/** 本地 `YYYY-MM-DD` 当天 23:59:59 的 UTC ISO，用于 `due_date_to` 这类范围查询 */
export function localDayEndToApi(date: string): string | undefined {
  const day = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(date.trim())
  if (!day) return undefined
  const local = new Date(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    23,
    59,
    59,
    999,
  )
  if (Number.isNaN(local.getTime())) return undefined
  return local.toISOString()
}
