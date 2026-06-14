// 用户相关类型
export interface User {
  id: number
  username: string
  email?: string
  nickname: string
  avatar_url?: string
  notify_pref?: NotifyPref
  created_at: string
}

export interface NotifyPref {
  email_enabled: boolean
  web_push_enabled: boolean
  wx_subscribe_enabled: boolean
  daily_digest_time: string
  default_remind_before: number
}

// 认证相关类型
export interface LoginRequest {
  username: string
  password: string
}

export interface RegisterRequest {
  username: string
  password: string
  email: string
  nickname: string
}

export interface AuthResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user: User
}

export interface RefreshResponse {
  access_token: string
  expires_in: number
}

// 任务相关类型
export type TaskStatus = 0 | 1 | 2 // 0=待办, 1=进行中, 2=已完成
export type TaskPriority = 0 | 1 | 2 // 0=低, 1=中, 2=高

export interface Task {
  id: number
  title: string
  description?: string
  priority: TaskPriority
  priority_label: string
  status: TaskStatus
  status_label: string
  due_date?: string
  due_date_relative?: string
  is_overdue: boolean
  category?: Category
  tags: Tag[]
  reminders: Reminder[]
  is_recurring: boolean
  recurrence_rule?: RecurrenceRule
  completed_at?: string
  created_at: string
  updated_at?: string
}

export interface RecurrenceRule {
  frequency: 'daily' | 'weekly' | 'monthly' | 'yearly' | 'custom'
  interval?: number
  days_of_week?: number[] // 0-6, Sunday=0
  day_of_month?: number
  month_of_year?: number
  end_date?: string
}

export interface CreateTaskRequest {
  title: string
  description?: string
  priority?: TaskPriority
  category_id?: number
  tag_ids?: number[]
  due_date?: string
  reminders?: CreateReminderRequest[]
  is_recurring?: boolean
  recurrence_rule?: RecurrenceRule
}

export interface UpdateTaskRequest extends Partial<CreateTaskRequest> {
  status?: TaskStatus
}

// 分类相关类型
export interface Category {
  id: number
  name: string
  color: string
  icon?: string
  sort_order: number
  task_count: number
  is_default: boolean
}

export interface CreateCategoryRequest {
  name: string
  color?: string
  icon?: string
  sort_order?: number
}

export interface UpdateCategoryRequest extends Partial<CreateCategoryRequest> {}

// 标签相关类型
export interface Tag {
  id: number
  name: string
  color: string
}

export interface CreateTagRequest {
  name: string
  color?: string
}

export interface UpdateTagRequest extends Partial<CreateTagRequest> {}

// 提醒相关类型
export interface Reminder {
  id: number
  task_id: number
  remind_at: string
  remind_type: number // 0=截止前, 1=指定时间
  is_sent: boolean
}

export interface CreateReminderRequest {
  remind_at: string
  remind_type?: number
}

// 分页相关类型
export interface PaginationParams {
  page?: number
  page_size?: number
  sort_by?: string
  sort_order?: 'asc' | 'desc'
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

// 任务统计
export interface TaskStats {
  total: number
  completed: number
  pending: number
  in_progress: number
  overdue: number
  completion_rate: number
  by_priority: {
    high: { total: number; completed: number }
    medium: { total: number; completed: number }
    low: { total: number; completed: number }
  }
  by_category: Array<{
    category_id: number
    category_name: string
    total: number
    completed: number
  }>
}

// 提醒概览
export interface ReminderOverview {
  upcoming: Array<{
    id: number
    task_id: number
    task_title: string
    remind_at: string
    remind_type: number
    time_until: string
  }>
  sent_today: number
  total_today: number
}

// API 响应格式
export interface ApiResponse<T> {
  code: number
  message: string
  data?: T
  detail?: {
    field: string
    error: string
  }
}

// 筛选参数
export interface TaskFilterParams extends PaginationParams {
  status?: TaskStatus
  priority?: TaskPriority
  category_id?: number
  tag_ids?: string
  due_date_from?: string
  due_date_to?: string
  search?: string
  is_recurring?: boolean
  include_deleted?: boolean
}

// Element Plus 组件需要的上传类型
export interface UploadFile {
  name: string
  url: string
}