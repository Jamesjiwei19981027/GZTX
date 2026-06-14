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
  TaskFilterParams,
  PaginatedResponse,
  TaskStats
} from '@/types'

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
        filterParams.value = { ...filterParams.value, ...params }
      }
      const response = await getTaskList(filterParams.value)
      tasks.value = response.items
      pagination.value = {
        total: response.total,
        page: response.page,
        page_size: response.page_size,
        total_pages: response.total_pages
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
      const response = await getTodayTasks()
      tasks.value = response.items
      pagination.value = {
        total: response.total,
        page: response.page,
        page_size: response.page_size,
        total_pages: response.total_pages
      }
      return response
    } finally {
      loading.value = false
    }
  }

  // 获取任务详情
  async function fetchTaskDetail(taskId: number) {
    loading.value = true
    try {
      const response = await getTaskDetail(taskId)
      currentTask.value = response
      return response
    } finally {
      loading.value = false
    }
  }

  // 创建任务
  async function addTask(data: CreateTaskRequest) {
    loading.value = true
    try {
      const response = await createTask(data)
      tasks.value.unshift(response)
      return response
    } finally {
      loading.value = false
    }
  }

  // 更新任务
  async function editTask(taskId: number, data: UpdateTaskRequest) {
    loading.value = true
    try {
      const response = await updateTask(taskId, data)
      const index = tasks.value.findIndex(t => t.id === taskId)
      if (index !== -1) {
        tasks.value[index] = response
      }
      if (currentTask.value?.id === taskId) {
        currentTask.value = response
      }
      return response
    } finally {
      loading.value = false
    }
  }

  // 标记完成
  async function markComplete(taskId: number) {
    const response = await completeTask(taskId)
    const task = tasks.value.find(t => t.id === taskId)
    if (task) {
      task.status = 2
      task.completed_at = response.completed_at
    }
    return response
  }

  // 取消完成
  async function markUncomplete(taskId: number) {
    const response = await uncompleteTask(taskId)
    const task = tasks.value.find(t => t.id === taskId)
    if (task) {
      task.status = 0
      task.completed_at = undefined
    }
    return response
  }

  // 删除任务
  async function removeTask(taskId: number) {
    await deleteTask(taskId)
    tasks.value = tasks.value.filter(t => t.id !== taskId)
  }

  // 批量完成
  async function batchComplete(taskIds: number[]) {
    await batchCompleteTask(taskIds)
    tasks.value.forEach(task => {
      if (taskIds.includes(task.id)) {
        task.status = 2
      }
    })
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