import type { Task } from '../types'

export type ReportExportInput = {
  projectName: string
  rangeLabel: string
  exportedAt: string
  kpis: { total: number; completed: number; inProgress: number; todo: number; overdue: number; completionRate: number }
  trend: { name: string; created: number; completed: number }[]
  workload: { name: string; todo: number; done: number }[]
  tasks: Pick<Task, 'title' | 'status' | 'dueDate' | 'priority' | 'assignee'>[]
}

const STATUS_LABEL: Record<string, string> = { 'To Do': '待办', 'In Progress': '进行中', Done: '已完成' }
const PRIORITY_LABEL: Record<string, string> = { High: '高', Medium: '中', Low: '低' }

/**
 * 报表导出：把页面上当前筛选（项目 + 时间范围）下看到的统计、趋势、负载和任务清单
 * 排成一张 CSV（Excel 可直接打开）。内容全部来自页面已有数据，保证与屏幕一致。
 */
export function buildReportCsvRows(input: ReportExportInput): (string | number)[][] {
  const rows: (string | number)[][] = [
    ['项目', input.projectName],
    ['时间范围', input.rangeLabel],
    ['导出时间', input.exportedAt],
    [],
    ['任务统计'],
    ['总任务', input.kpis.total],
    ['已完成', input.kpis.completed],
    ['进行中', input.kpis.inProgress],
    ['待办', input.kpis.todo],
    ['已逾期', input.kpis.overdue],
    ['完成率', `${input.kpis.completionRate}%`],
    [],
    ['任务趋势'],
    ['日期', '新建', '完成'],
    ...input.trend.map(t => [t.name, t.created, t.completed]),
    [],
    ['成员负载'],
    ['成员', '待办执行', '已完成'],
    ...input.workload.map(w => [w.name, w.todo, w.done]),
    [],
    ['任务清单'],
    ['标题', '状态', '优先级', '截止日期', '负责人'],
    ...input.tasks.map(t => [
      t.title,
      STATUS_LABEL[t.status] || t.status,
      PRIORITY_LABEL[t.priority as string] || (t.priority as string),
      t.dueDate || '',
      t.assignee?.name || '',
    ]),
  ]
  return rows
}
