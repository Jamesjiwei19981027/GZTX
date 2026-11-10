/** 消息 / 通知分页与附件的纯函数（便于单测，不碰界面） */

export const MESSAGE_PAGE_SIZE = 100

type WithId = { id: number | string }

/** 把更早的一页和已有消息合并：按 id 去重、按 id 升序 */
export function mergeMessagesById<T extends WithId>(older: T[], existing: T[]): T[] {
  const map = new Map<string, T>()
  for (const m of older) map.set(String(m.id), m)
  for (const m of existing) map.set(String(m.id), m)
  return [...map.values()].sort((a, b) => Number(a.id) - Number(b.id))
}

/** 轮询拿到最新一页时：保留已经上滑加载出来的更早消息，只刷新最新这一页 */
export function replaceLatestPage<T extends WithId>(previous: T[], latest: T[]): T[] {
  if (latest.length === 0) return previous.length === 0 ? latest : previous
  const oldest = Math.min(...latest.map((m) => Number(m.id)))
  return [...previous.filter((m) => Number(m.id) < oldest), ...latest]
}

/** 后端消息接口没有 total：一页拿满就说明可能还有更早的 */
export function hasMoreOlderMessages(batchLength: number, pageSize = MESSAGE_PAGE_SIZE): boolean {
  return batchLength >= pageSize
}

/** 通知/收件箱按后端 total 判断还有没有下一页 */
export function hasMoreByTotal(loaded: number, total: number): boolean {
  return loaded < total
}

/** 追加下一页并按 id 去重，保持原有顺序（通知是新→旧） */
export function appendPageById<T extends WithId>(existing: T[], incoming: T[]): T[] {
  const seen = new Set(existing.map((m) => String(m.id)))
  return [...existing, ...incoming.filter((m) => !seen.has(String(m.id)))]
}

export type ChatAttachment = {
  fileId?: number
  name: string
  sizeBytes?: number
  url?: string
}

/** 消息里的附件统一成一种形状：名字、大小、文件 id（下载走带登录凭证的接口） */
export function normalizeAttachments(raw: unknown): ChatAttachment[] {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((x): x is Record<string, unknown> => Boolean(x) && typeof x === 'object')
    .map((item) => {
      const fileId = typeof item.file_id === 'number' ? item.file_id : typeof item.id === 'number' ? item.id : undefined
      const sizeRaw = item.size_bytes ?? item.size ?? item.file_size
      return {
        fileId,
        name: String(item.original_name || item.name || '附件'),
        sizeBytes: typeof sizeRaw === 'number' ? sizeRaw : undefined,
        url: typeof item.url === 'string' ? item.url : undefined,
      }
    })
}

export function formatFileSize(bytes?: number): string {
  if (typeof bytes !== 'number' || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}
