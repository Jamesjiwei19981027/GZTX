import type { Category, Priority } from '../types'

/** 分类显示名：只改显示，存储值（Work 等）不变 */
const CATEGORY_LABELS: Record<string, string> = {
  Work: '工作',
  Personal: '个人',
  Documentation: '文档',
  Shopping: '购物',
  Health: '健康',
}

export const categoryLabel = (category: Category | string | null | undefined): string =>
  (category && CATEGORY_LABELS[category]) || category || ''

const PRIORITY_LABELS: Record<string, string> = { High: '高优先级', Medium: '中优先级', Low: '低优先级' }

export const priorityLabel = (priority: Priority | string | null | undefined): string =>
  (priority && PRIORITY_LABELS[priority]) || ''
