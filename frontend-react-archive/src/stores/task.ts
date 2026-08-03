import { create } from 'zustand'
import { message } from '@/utils/antdMessage'
import {
  getTaskList,
  getTodayTasks,
  getTaskDetail,
  createTask,
  updateTask,
  completeTask,
  uncompleteTask,
  deleteTask,
  batchCompleteTask,
  batchDeleteTask,
  getTaskStats,
} from '@/api/task'
import type {
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskCompleteRequest,
  TaskFilterParams,
  TaskStats,
} from '@/types'

/**
 * Convert a local datetime string to UTC naive string for backend SQLite.
 */
function toUTC(dt?: string): string | undefined {
  if (!dt) return dt
  const d = new Date(dt)
  if (isNaN(d.getTime())) return dt
  return d.toISOString().replace('Z', '').replace('T', ' ')
}

/**
 * Convert a UTC datetime string (from backend) back to local time display.
 */
function fromUTC(dt?: string): string | undefined {
  if (!dt) return dt
  const utcStr = dt.replace(' ', 'T')
  const d = new Date(utcStr.endsWith('Z') ? utcStr : utcStr + 'Z')
  if (isNaN(d.getTime())) return dt
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

function convertToUTC(data: Record<string, unknown>): Record<string, unknown> {
  const result = { ...data }
  if (result.due_date && typeof result.due_date === 'string') {
    result.due_date = toUTC(result.due_date)
  }
  if (result.follow_up_remind_at && typeof result.follow_up_remind_at === 'string') {
    result.follow_up_remind_at = toUTC(result.follow_up_remind_at)
  }
  if (Array.isArray(result.reminders)) {
    result.reminders = (result.reminders as Array<Record<string, unknown>>).map((r) => ({
      ...r,
      remind_at: toUTC(r.remind_at as string | undefined) || r.remind_at,
    }))
  }
  return result
}

const PRIORITY_LABELS: Record<number, string> = { 0: '低', 1: '中', 2: '高' }
const STATUS_LABELS: Record<number, string> = { 0: '待办', 1: '进行中', 2: '已完成' }

function convertFromUTC(task: Task | null | undefined): Task | null {
  if (!task) return null
  const result: Task = {
    ...task,
    priority_label: task.priority_label ?? PRIORITY_LABELS[task.priority] ?? '中',
    status_label: task.status_label ?? STATUS_LABELS[task.status] ?? '待办',
    tags: Array.isArray(task.tags) ? task.tags : [],
    reminders: Array.isArray(task.reminders) ? task.reminders : [],
    is_recurring: task.is_recurring ?? false,
  }
  if (result.due_date) result.due_date = fromUTC(result.due_date)
  if (result.created_at) result.created_at = fromUTC(result.created_at)
  if (result.updated_at) result.updated_at = fromUTC(result.updated_at)
  if (result.completed_at) result.completed_at = fromUTC(result.completed_at)
  if (result.follow_up_remind_at) result.follow_up_remind_at = fromUTC(result.follow_up_remind_at)
  result.reminders = result.reminders.map((r) => ({
    ...r,
    remind_at: fromUTC(r.remind_at) || r.remind_at,
  }))
  return result
}

type Pagination = {
  total: number
  page: number
  page_size: number
  total_pages: number
}

type TaskState = {
  tasks: Task[]
  currentTask: Task | null
  loading: boolean
  pagination: Pagination
  stats: TaskStats | null
  filterParams: TaskFilterParams
  fetchTasks: (params?: TaskFilterParams) => Promise<unknown>
  fetchTodayTasks: () => Promise<Task[]>
  fetchTaskDetail: (taskId: number) => Promise<Task | null>
  addTask: (data: CreateTaskRequest) => Promise<Task | null>
  editTask: (taskId: number, data: UpdateTaskRequest) => Promise<Task | null>
  markComplete: (taskId: number, data?: TaskCompleteRequest) => Promise<Task | null>
  markUncomplete: (taskId: number) => Promise<Task | null>
  removeTask: (taskId: number) => Promise<void>
  batchComplete: (taskIds: number[]) => Promise<void>
  batchRemove: (taskIds: number[]) => Promise<void>
  fetchStats: (period: 'today' | 'week' | 'month' | 'year') => Promise<TaskStats>
  clearCurrentTask: () => void
  resetFilter: () => void
}

const defaultPagination: Pagination = {
  total: 0,
  page: 1,
  page_size: 20,
  total_pages: 0,
}

export const useTaskStore = create<TaskState>((set, get) => ({
  tasks: [],
  currentTask: null,
  loading: false,
  pagination: { ...defaultPagination },
  stats: null,
  filterParams: {},

  async fetchTasks(params?: TaskFilterParams) {
    set({ loading: true })
    try {
      if (params) {
        set({ filterParams: { ...params } })
      }
      const response = await getTaskList(get().filterParams)
      const items = (response.items ?? []).map((t) => convertFromUTC(t)!).filter(Boolean)
      set({
        tasks: items,
        pagination: {
          total: response.total,
          page: response.page,
          page_size: response.page_size,
          total_pages: response.total_pages,
        },
      })
      return response
    } finally {
      set({ loading: false })
    }
  },

  async fetchTodayTasks() {
    set({ loading: true })
    try {
      const items = await getTodayTasks()
      const list = (items ?? []).map((t) => convertFromUTC(t)!).filter(Boolean)
      set({
        tasks: list,
        pagination: {
          total: list.length,
          page: 1,
          page_size: list.length || 20,
          total_pages: 1,
        },
      })
      return list
    } finally {
      set({ loading: false })
    }
  },

  async fetchTaskDetail(taskId: number) {
    set({ loading: true })
    try {
      const response = await getTaskDetail(taskId)
      const currentTask = convertFromUTC(response)
      set({ currentTask })
      return currentTask
    } finally {
      set({ loading: false })
    }
  },

  async addTask(data: CreateTaskRequest) {
    set({ loading: true })
    try {
      const utcData = convertToUTC(data as unknown as Record<string, unknown>) as unknown as CreateTaskRequest
      const response = convertFromUTC(await createTask(utcData))
      if (response) {
        set((s) => ({ tasks: [response, ...s.tasks] }))
      }
      return response
    } finally {
      set({ loading: false })
    }
  },

  async editTask(taskId: number, data: UpdateTaskRequest) {
    set({ loading: true })
    try {
      const utcData = convertToUTC(data as unknown as Record<string, unknown>) as unknown as UpdateTaskRequest
      const response = convertFromUTC(await updateTask(taskId, utcData))
      if (response) {
        set((s) => ({
          tasks: s.tasks.map((t) => (t.id === taskId ? response : t)),
          currentTask: s.currentTask?.id === taskId ? response : s.currentTask,
        }))
      }
      return response
    } finally {
      set({ loading: false })
    }
  },

  async markComplete(taskId: number, data?: TaskCompleteRequest) {
    const utcData = data
      ? (convertToUTC(data as unknown as Record<string, unknown>) as unknown as TaskCompleteRequest)
      : data
    const resultTask = convertFromUTC(await completeTask(taskId, utcData))
    if (!resultTask) return null
    set((s) => ({
      tasks: s.tasks.map((t) => (t.id === taskId ? resultTask : t)),
      currentTask: s.currentTask?.id === taskId ? resultTask : s.currentTask,
    }))
    if (resultTask.needs_follow_up) {
      message.success(`已设置跟进提醒：「${resultTask.title}」`)
    } else {
      message.success(`「${resultTask.title}」已标记为完成`)
    }
    return resultTask
  },

  async markUncomplete(taskId: number) {
    const response = convertFromUTC(await uncompleteTask(taskId))
    if (response) {
      set((s) => ({
        tasks: s.tasks.map((t) => (t.id === taskId ? response : t)),
        currentTask: s.currentTask?.id === taskId ? response : s.currentTask,
      }))
    }
    return response
  },

  async removeTask(taskId: number) {
    await deleteTask(taskId)
    set((s) => ({
      tasks: s.tasks.filter((t) => t.id !== taskId),
      currentTask: s.currentTask?.id === taskId ? null : s.currentTask,
    }))
  },

  async batchComplete(taskIds: number[]) {
    await batchCompleteTask(taskIds)
    set((s) => ({
      tasks: s.tasks.map((t) => (taskIds.includes(t.id) ? { ...t, status: 2 as const } : t)),
    }))
  },

  async batchRemove(taskIds: number[]) {
    await batchDeleteTask(taskIds)
    set((s) => ({
      tasks: s.tasks.filter((t) => !taskIds.includes(t.id)),
    }))
  },

  async fetchStats(period: 'today' | 'week' | 'month' | 'year') {
    const response = await getTaskStats(period)
    set({ stats: response })
    return response
  },

  clearCurrentTask() {
    set({ currentTask: null })
  },

  resetFilter() {
    set({ filterParams: {} })
  },
}))
