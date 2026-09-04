import type { Priority } from '../types'

/**
 * 快速添加语法糖：`#标签` 与 `p0/p1/p2` 优先级。
 *
 * `p0` 最紧急（对齐业界 P0 口径）→ High；`p1` → Medium；`p2` → Low。
 * 命中的记号从标题里剔除，避免「修复登录 p0」把 p0 当标题内容留着。
 */

const PRIORITY_BY_TOKEN: Record<string, Priority> = {
  p0: 'High',
  p1: 'Medium',
  p2: 'Low',
}

// 标签允许中英文数字下划线连字符；`#` 前必须是行首或空白，避免吃掉 URL 里的锚点
const TAG_PATTERN = /(^|\s)#([\w一-龥-]+)/gu
// 优先级记号必须独立成词
const PRIORITY_PATTERN = /(^|\s)(p[012])(?=\s|$)/giu

export type QuickAddSyntax = {
  /** 剔除记号后的标题 */
  title: string
  /** 第一个 `#标签`（后端当前一条任务只挂一个标签） */
  tag?: string
  /** 命中的全部标签，按出现顺序去重 */
  tags: string[]
  priority?: Priority
  /** 命中的原始记号，用于 UI 回显 */
  matched: string[]
}

export function parseQuickAddSyntax(input: string): QuickAddSyntax {
  const matched: string[] = []
  const tags: string[] = []
  let priority: Priority | undefined

  let text = input.replace(PRIORITY_PATTERN, (_all, lead: string, token: string) => {
    // 同一行写了多个优先级时，第一个生效
    if (!priority) {
      priority = PRIORITY_BY_TOKEN[token.toLowerCase()]
      matched.push(token.toLowerCase())
    }
    return lead
  })

  text = text.replace(TAG_PATTERN, (_all, lead: string, name: string) => {
    if (!tags.includes(name)) {
      tags.push(name)
      matched.push(`#${name}`)
    }
    return lead
  })

  const title = text.replace(/\s{2,}/g, ' ').trim()

  return {
    title,
    ...(tags[0] ? { tag: tags[0] } : {}),
    tags,
    ...(priority ? { priority } : {}),
    matched,
  }
}
