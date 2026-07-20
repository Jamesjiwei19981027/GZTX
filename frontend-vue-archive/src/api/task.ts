import request from './request'
import type {
  Task,
  CreateTaskRequest,
  UpdateTaskRequest,
  TaskCompleteRequest,
  TaskFilterParams,
  PaginatedResponse,
  TaskStats
} from '@/types'

// 获取任务列表
export function getTaskList(params?: TaskFilterParams) {
  return request.get<PaginatedResponse<Task>>('/tasks', { params })
}

// 获取今日待办（后端直接返回任务数组，非分页信封）
export function getTodayTasks() {
  return request.get<Task[]>('/tasks/today')
}

// 获取任务详情
export function getTaskDetail(taskId: number) {
  return request.get<Task>(`/tasks/${taskId}`)
}

// 创建任务
export function createTask(data: CreateTaskRequest) {
  return request.post<Task>('/tasks', data)
}

// 更新任务
export function updateTask(taskId: number, data: UpdateTaskRequest) {
  return request.put<Task>(`/tasks/${taskId}`, data)
}

// 标记任务完成（含评价数据）
export function completeTask(taskId: number, data?: TaskCompleteRequest) {
  return request.patch<Task>(`/tasks/${taskId}/complete`, data || {})
}

// 取消任务完成
export function uncompleteTask(taskId: number) {
  return request.patch<Task>(`/tasks/${taskId}/uncomplete`)
}

// 删除任务
export function deleteTask(taskId: number) {
  return request.delete(`/tasks/${taskId}`)
}

// 批量完成任务
export function batchCompleteTask(taskIds: number[]) {
  return request.patch('/tasks/batch/complete', { task_ids: taskIds })
}

// 批量删除任务
export function batchDeleteTask(taskIds: number[]) {
  return request.delete('/tasks/batch', { data: { task_ids: taskIds } })
}

// 获取任务统计
export function getTaskStats(period: 'today' | 'week' | 'month' | 'year') {
  return request.get<TaskStats>('/tasks/stats', { params: { period } })
}