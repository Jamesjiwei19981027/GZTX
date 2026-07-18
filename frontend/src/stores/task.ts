import { defineStore } from 'pinia'
import { ref } from 'vue'
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
  getTaskStats
} from '@/api/task'
import type {
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskCompleteRequest,
  TaskFilterParams,
  TaskStats
} from '@/types'

import { ElNotification } from 'element-plus'
import { useSoundEffects } from '@/composables/useSoundEffects'

// Sound effects instance (singleton via composable)
const { playFeedbackSound } = useSoundEffects()

// Simple notification helper
function notifyFeedback(title: string, message: string) {
  ElNotification({ title, message, duration: 3000 })
}

/**
 * Convert a local datetime string to UTC ISO format.
 * The backend stores datetimes as naive strings and compares them with UTC,
 * so all datetime fields sent to the API must be in UTC.
 */
function toUTC(dt?: string): string | undefined {
  if (!dt) return dt
  const d = new Date(dt)
  if (isNaN(d.getTime())) return dt
  // Format as naive UTC string (no timezone suffix) for backend SQLite compatibility
  return d.toISOString().replace('Z', '').replace('T', ' ')
}

/**
 * Convert a UTC datetime string (from backend) back to local time.
 * Backend stores naive UTC strings; appending 'Z' makes JS parse it as UTC,
 * then toISOString converts to the local-equivalent UTC representation.
 */
function fromUTC(dt?: string): string | undefined {
  if (!dt) return dt
  // The backend returns naive strings like "2026-07-08 08:30:00" which are UTC
  // Append 'Z' so JavaScript treats it as UTC
  const utcStr = dt.replace(' ', 'T')
  const d = new Date(utcStr.endsWith('Z') ? utcStr : utcStr + 'Z')
  if (isNaN(d.getTime())) return dt
  // Return as local time string in "YYYY-MM-DD HH:mm:ss" format
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`
}

/**
 * Convert datetime fields in task data to UTC before sending to API.
 */
function convertToUTC(data: Record<string, any>): Record<string, any> {
  const result = { ...data }
  if (result.due_date) {
    result.due_date = toUTC(result.due_date)
  }
  if (result.follow_up_remind_at) {
    result.follow_up_remind_at = toUTC(result.follow_up_remind_at)
  }
  if (Array.isArray(result.reminders)) {
    result.reminders = result.reminders.map((r: any) => ({
      ...r,
      remind_at: toUTC(r.remind_at) || r.remind_at
    }))
  }
  return result
}

const PRIORITY_LABELS: Record<number, string> = { 0: '低', 1: '中', 2: '高' }
const STATUS_LABELS: Record<number, string> = { 0: '待办', 1: '进行中', 2: '已完成' }

/**
 * Convert UTC datetime fields in task response back to local time for display.
 * Also normalizes optional arrays / labels so store always holds a strict Task.
 */
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
  if (result.due_date) {
    result.due_date = fromUTC(result.due_date)
  }
  if (result.created_at) {
    result.created_at = fromUTC(result.created_at)
  }
  if (result.updated_at) {
    result.updated_at = fromUTC(result.updated_at)
  }
  if (result.completed_at) {
    result.completed_at = fromUTC(result.completed_at)
  }
  if (result.follow_up_remind_at) {
    result.follow_up_remind_at = fromUTC(result.follow_up_remind_at)
  }
  result.reminders = result.reminders.map((r) => ({
    ...r,
    remind_at: fromUTC(r.remind_at) || r.remind_at,
  }))
  return result
}

export const useTaskStore = defineStore('task', () => {
  // 状态
  const tasks = ref<Task[]>([])
  const currentTask = ref<Task | null>(null)
  const loading = ref(false)
  const pagination = ref({
    total: 0,
    page: 1,
    page_size: 20,
    total_pages: 0
  })
  const stats = ref<TaskStats | null>(null)

  // 筛选条件
  const filterParams = ref<TaskFilterParams>({})

  // 获取任务列表
  async function fetchTasks(params?: TaskFilterParams) {
    loading.value = true
    try {
      if (params) {
        // Replace filterParams entirely when params are explicitly provided
        // This prevents stale search/filter state from leaking across pages
        filterParams.value = { ...params }
      }
      const response = await getTaskList(filterParams.value)
      tasks.value = (response.items ?? []).map((t) => convertFromUTC(t)!).filter(Boolean)
      pagination.value = {
        total: response.total,
        page: response.page,
        page_size: response.page_size,
        total_pages: response.total_pages,
      }
      return response
    } finally {
      loading.value = false
    }
  }

  // 获取今日待办
  async function fetchTodayTasks() {
    loading.value = true
    try {
      const items = await getTodayTasks()
      const list = (items ?? []).map((t) => convertFromUTC(t)!).filter(Boolean)
      tasks.value = list
      pagination.value = {
        total: list.length,
        page: 1,
        page_size: list.length || 20,
        total_pages: 1,
      }
      return list
    } finally {
      loading.value = false
    }
  }

  // 获取任务详情
  async function fetchTaskDetail(taskId: number) {
    loading.value = true
    try {
      const response = await getTaskDetail(taskId)
      currentTask.value = convertFromUTC(response)
      return currentTask.value
    } finally {
      loading.value = false
    }
  }

  // 创建任务
  async function addTask(data: CreateTaskRequest) {
    loading.value = true
    try {
      const utcData = convertToUTC(data as any) as CreateTaskRequest
      const response = convertFromUTC(await createTask(utcData))
      if (response) {
        tasks.value.unshift(response)
      }
      return response
    } finally {
      loading.value = false
    }
  }

  // 更新任务
  async function editTask(taskId: number, data: UpdateTaskRequest) {
    loading.value = true
    try {
      const utcData = convertToUTC(data as any) as UpdateTaskRequest
      const response = convertFromUTC(await updateTask(taskId, utcData))
      if (response) {
        const index = tasks.value.findIndex((t) => t.id === taskId)
        if (index !== -1) {
          tasks.value[index] = response
        }
        if (currentTask.value?.id === taskId) {
          currentTask.value = response
        }
      }
      return response
    } finally {
      loading.value = false
    }
  }

  // M1: 标记完成（带评价数据 + 条件反馈）
  async function markComplete(taskId: number, data?: TaskCompleteRequest) {
    const utcData = data ? (convertToUTC(data as any) as TaskCompleteRequest) : data
    const resultTask = convertFromUTC(await completeTask(taskId, utcData))
    if (!resultTask) return null
    const index = tasks.value.findIndex((t) => t.id === taskId)
    if (index !== -1) {
      tasks.value[index] = resultTask
    }
    if (currentTask.value?.id === taskId) {
      currentTask.value = resultTask
    }
    // M1: 根据是否需要跟进显示不同反馈
    if (resultTask.needs_follow_up) {
      notifyFeedback('📋 已设置跟进提醒', `「${resultTask.title}」将在指定时间提醒您继续跟进。`)
    } else {
      notifyFeedback('🎉 任务已完成', `「${resultTask.title}」已标记为完成！`)
    }
    // Apple-style feedback sound: ascending triple note (achievement feel)
    playFeedbackSound('task_complete')
    return resultTask
  }

  // 取消完成
  async function markUncomplete(taskId: number) {
    const response = convertFromUTC(await uncompleteTask(taskId))
    if (response) {
      const index = tasks.value.findIndex((t) => t.id === taskId)
      if (index !== -1) {
        tasks.value[index] = response
      }
      if (currentTask.value?.id === taskId) {
        currentTask.value = response
      }
    }
    return response
  }

  // 删除任务
  async function removeTask(taskId: number) {
    await deleteTask(taskId)
    tasks.value = tasks.value.filter(t => t.id !== taskId)
    // Apple-style feedback sound: descending single note (gentle warning)
    playFeedbackSound('task_delete')
  }

  // 批量完成
  async function batchComplete(taskIds: number[]) {
    await batchCompleteTask(taskIds)
    tasks.value.forEach(task => {
      if (taskIds.includes(task.id)) {
        task.status = 2
      }
    })
    // Apple-style feedback sound for batch completion
    playFeedbackSound('task_complete')
  }

  // 批量删除
  async function batchRemove(taskIds: number[]) {
    await batchDeleteTask(taskIds)
    tasks.value = tasks.value.filter(t => !taskIds.includes(t.id))
  }

  // 获取统计
  async function fetchStats(period: 'today' | 'week' | 'month' | 'year') {
    const response = await getTaskStats(period)
    stats.value = response
    return response
  }

  // 清除当前任务
  function clearCurrentTask() {
    currentTask.value = null
  }

  // 重置筛选
  function resetFilter() {
    filterParams.value = {}
  }

  return {
    tasks,
    currentTask,
    loading,
    pagination,
    stats,
    filterParams,
    fetchTasks,
    fetchTodayTasks,
    fetchTaskDetail,
    addTask,
    editTask,
    markComplete,
    markUncomplete,
    removeTask,
    batchComplete,
    batchRemove,
    fetchStats,
    clearCurrentTask,
    resetFilter
  }
})
