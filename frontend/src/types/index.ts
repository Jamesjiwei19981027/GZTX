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

// 任务相关类型（与后端 TaskResponse 对齐）
export type TaskStatus = 0 | 1 | 2 // 0=待办, 1=进行中, 2=已完成
export type TaskPriority = 0 | 1 | 2 // 0=低, 1=中, 2=高

/** API 任务 DTO：列表/详情接口返回体 */
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
  /** 前端或扩展字段，后端 schema 未必始终下发 */
  is_overdue?: boolean
  category?: Category | null
  tags: Tag[]
  reminders: Reminder[]
  is_recurring: boolean
  recurrence_rule?: RecurrenceRule
  completion_rate?: number
  completion_comment?: string
  needs_follow_up?: boolean
  follow_up_reason?: string
  parent_task_id?: number
  follow_up_remind_at?: string
  follow_up_notify_channels?: string
  attachments?: Attachment[]
  completed_at?: string
  created_at?: string
  updated_at?: string
}

/**
 * UI 展示用任务视图：允许缺省字段，组件内自行兜底。
 * 不要用它替代 API 的 Task DTO。
 */
export type TaskView = Partial<Task> &
  Pick<Task, 'id' | 'title' | 'priority' | 'status'>

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

export interface TaskCompleteRequest {
  completion_rate?: number
  completion_comment?: string
  needs_follow_up?: boolean
  follow_up_reason?: string
  follow_up_remind_at?: string
  follow_up_notify_channels?: string
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
  remind_type: number // 0=截止前, 1=指定时间, 3=跟进, 4=每日
  is_sent: boolean
  notify_channels?: string
}

export interface CreateReminderRequest {
  remind_at: string
  remind_type?: number
  notify_channels?: string // 通知方式，逗号分隔: web_push,email,sms,wx,desktop
}

// 附件类型
export interface Attachment {
  id: number
  task_id: number
  original_name: string
  file_size: number
  mime_type: string
  download_url: string
  created_at: string
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
export interface ApiResponse<T = unknown> {
  code: number
  message: string
  data?: T
  detail?: {
    field?: string
    error?: string
    message?: string
  }
}

// 通知 / SMTP / Web Push
export interface VapidPublicKeyResponse {
  publicKey: string
}

export interface SmtpConfig {
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_from: string
  has_password: boolean
}

export interface SmtpConfigUpdate {
  smtp_host?: string
  smtp_port?: number
  smtp_user?: string
  smtp_password?: string
  smtp_from?: string
}

export interface EmailStatus {
  has_email: boolean
  email_address: string
  smtp_configured: boolean
  user_smtp_configured: boolean
  global_smtp_configured: boolean
  smtp_source: 'user' | 'global' | 'none' | string
}

export interface PushSubscriptionPayload {
  endpoint: string
  keys: {
    auth: string
    p256dh: string
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
  needs_follow_up?: boolean
  include_deleted?: boolean
}

// Element Plus 组件需要的上传类型
export interface UploadFile {
  name: string
  url: string
}
