import { apiRequest, getApiBase, getToken } from './client'

/** 获取当前用户的 ICS 订阅地址（免登录签名 URL，供系统日历持续同步） */
export async function getCalendarFeedUrl(): Promise<string> {
  const data = await apiRequest<{ url: string }>('/tasks/calendar-feed-url')
  return `${window.location.origin}${data.url}`
}

/** 重置 ICS 订阅令牌：旧地址立即失效，已添加的日历需要重新订阅 */
export async function resetCalendarFeedUrl(): Promise<string> {
  const data = await apiRequest<{ url: string }>('/tasks/calendar-feed-url/reset', {
    method: 'POST',
  })
  return `${window.location.origin}${data.url}`
}

/** 下载当前用户任务的 iCalendar 文件（.ics，可导入系统日历） */
export async function downloadTasksIcs(): Promise<void> {
  const res = await fetch(`${getApiBase()}/tasks/export.ics`, {
    headers: { Authorization: `Bearer ${getToken() || ''}` },
  })
  if (!res.ok) throw new Error(`导出失败（HTTP ${res.status}）`)
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'worktodo.ics'
  a.click()
  URL.revokeObjectURL(url)
}

/** 后端任务：status 0待办 1进行中 2完成；priority 0低 1中 2高 */
export type BackendTask = {
  id: number
  title: string
  description?: string
  priority: number
  priority_label?: string
  status: number
  status_label?: string
  due_date?: string
  completed_at?: string
  created_at?: string
  category?: { id: number; name: string; color?: string } | null
  tags?: { id: number; name: string }[]
  completion_rate?: number
  project_id?: number | null
  project_node_id?: number | null
  origin?: string
  source_channel?: string | null
  source_title?: string | null
  source_url?: string | null
  source_message_id?: string | null
  source_meta?: Record<string, unknown> | null
  assignees?: BackendAssignee[]
  assignee?: BackendAssignee | null
  is_recurring?: boolean
  recurrence_rule?: string | null
  parent_task_id?: number | null
  checklist?: BackendChecklistItem[] | null
  is_deleted?: boolean
  deleted_at?: string | null
}

export type BackendChecklistItem = {
  id: string
  title: string
  completed: boolean
}

export type BackendAssignee = {
  user_id: number
  role_key?: string
  display_name?: string
  nickname?: string
  username?: string
  avatar_url?: string | null
}

export type BackendProject = {
  id: number
  company_id: number
  name: string
  status?: string
  pm_user_id?: number | null
  final_owner_user_id?: number | null
  created_by?: number | null
  final_owner?: {
    user_id: number
    nickname?: string
    username?: string
    avatar_url?: string
  } | null
  final_owner_along_delta?: number
  member_count?: number
}

export type BackendTreeNode = {
  id: number
  parent_id: number | null
  node_type_key: string
  title: string
  description?: string | null
  node_origin?: 'project' | 'subordinate'
  responsibility_permissions?: Partial<import('../types').ResponsibilityPermissions>
  allow_clear_text_progress?: boolean
  sort_order?: number
  depth?: number
  start_at?: string | null
  due_at?: string | null
  milestone_at?: string | null
  progress_json?: { status?: string; percent?: number; ui_offset?: { x: number; y: number } }
  ui_offset?: { x: number; y: number } | null
  assignees?: {
    user_id: number
    role_key?: string
    display_name?: string
    nickname?: string
    username?: string
    avatar_url?: string
  }[]
  children?: BackendTreeNode[]
}

export type BackendMember = {
  user_id: number
  display_name?: string
  nickname?: string
  username?: string
  avatar_url?: string
  role?: string
}

export type BackendCategory = {
  id: number
  name: string
  color?: string
  icon?: string | null
  is_default?: boolean
}

export type BackendTag = {
  id: number
  name: string
  color?: string
}

export type BackendAttachment = {
  id: number
  original_name: string
  mime_type?: string
  file_size?: number
  download_url: string
}

export async function listTasks(params?: { page?: number; page_size?: number; search?: string }) {
  const q = new URLSearchParams()
  q.set('page', String(params?.page ?? 1))
  q.set('page_size', String(params?.page_size ?? 100))
  if (params?.search) q.set('search', params.search)
  return apiRequest<{ items: BackendTask[]; total: number }>(`/tasks?${q}`)
}

export async function listProjectTasks(projectId: number, params?: {page?:number;page_size?:number}) {
  const q = new URLSearchParams({page:String(params?.page ?? 1),page_size:String(params?.page_size ?? 100)});
  return apiRequest<{items:BackendTask[];total:number}>(`/projects/${projectId}/tasks?${q}`);
}

export async function createTask(body: {
  title: string
  description?: string
  priority?: number
  status?: number
  category_id?: number
  tag_ids?: number[]
  due_date?: string
  company_id?: number | null
  project_id?: number | null
  project_node_id?: number | null
  origin?: 'personal' | 'project_link'
  linked_readonly?: boolean
  source_channel?: string | null
  source_title?: string | null
  source_url?: string | null
  source_message_id?: string | null
  source_meta?: Record<string, unknown> | null
  assignee_user_ids?: number[]
  is_recurring?: boolean
  recurrence_rule?: string | null
  checklist?: BackendChecklistItem[]
}) {
  return apiRequest<BackendTask>('/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export type TaskExtractDraft = {
  title: string
  description?: string
  priority: number
  status: number
  due_date?: string | null
  category?: string | null
  company_id?: number | null
  project_id?: number | null
  origin: 'personal' | 'project_link'
  source_channel: string
  source_title?: string | null
  source_url?: string | null
  source_message_id?: string | null
  source_meta?: Record<string, unknown>
}

export async function extractTaskFromChat(body: {
  chat_text: string
  source_channel?: string
  source_title?: string
  source_url?: string
  source_message_id?: string
  source_meta?: Record<string, unknown>
  company_id?: number | null
  project_id?: number | null
}) {
  return apiRequest<{ draft: TaskExtractDraft; provider: string }>('/tasks/extract-from-chat', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listCategories() {
  return apiRequest<BackendCategory[]>('/categories')
}

export async function listTags() {
  return apiRequest<BackendTag[]>('/tags')
}

export async function createTag(name: string) {
  return apiRequest<BackendTag>('/tags', {
    method: 'POST',
    body: JSON.stringify({ name }),
  })
}

export async function listTaskAttachments(taskId: number) {
  return apiRequest<BackendAttachment[]>(`/tasks/${taskId}/attachments`)
}

export async function uploadTaskAttachment(taskId: number, file: File) {
  const body = new FormData()
  body.append('file', file)
  return apiRequest<BackendAttachment>(`/tasks/${taskId}/attachments`, {
    method: 'POST',
    body,
  })
}

export async function updateTask(
  id: number,
  body: Partial<{
    title: string
    description: string
    priority: number
    status: number
    category_id: number | null
    tag_ids: number[]
    due_date: string | null
    project_id: number | null
    project_node_id: number | null
    company_id: number | null
    origin: string
    linked_readonly: boolean
    assignee_user_ids: number[]
    checklist: BackendChecklistItem[]
  }>,
) {
  return apiRequest<BackendTask>(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

/** 完成任务；重复任务（is_recurring 且非实例）完成后后端会在响应里带 next_instance */
export async function completeTask(id: number) {
  return apiRequest<BackendTask & { next_instance?: BackendTask | null }>(
    `/tasks/${id}/complete`,
    {
      method: 'PATCH',
      body: JSON.stringify({}),
    },
  )
}

export async function uncompleteTask(id: number) {
  return apiRequest<BackendTask>(`/tasks/${id}/uncomplete`, {
    method: 'PATCH',
    body: '{}',
  })
}

export async function deleteTask(id: number) {
  return apiRequest(`/tasks/${id}`, { method: 'DELETE' })
}

/** 回收站：软删任务分页列表（30 天后由后端定时清除） */
export async function listTrashTasks(params?: { page?: number; page_size?: number }) {
  const q = new URLSearchParams()
  q.set('page', String(params?.page ?? 1))
  q.set('page_size', String(params?.page_size ?? 50))
  return apiRequest<{ items: BackendTask[]; total: number }>(`/tasks/trash?${q}`)
}

/** 恢复软删任务，返回完整序列化任务 */
export async function restoreTask(id: number) {
  return apiRequest<BackendTask>(`/tasks/${id}/restore`, {
    method: 'POST',
    body: '{}',
  })
}

/** 批量顺延：仅替换日期部分，保留原时刻 */
export async function batchRescheduleTasks(taskIds: number[], dueDate: string) {
  return apiRequest<{ updated_count: number }>('/tasks/batch/reschedule', {
    method: 'PATCH',
    body: JSON.stringify({ task_ids: taskIds, due_date: dueDate }),
  })
}

export async function batchCompleteTasks(taskIds: number[]) {
  return apiRequest<{ updated_count?: number }>('/tasks/batch/complete', {
    method: 'PATCH',
    body: JSON.stringify({ task_ids: taskIds }),
  })
}

export async function batchDeleteTasks(taskIds: number[]) {
  return apiRequest<{ deleted_count?: number }>('/tasks/batch', {
    method: 'DELETE',
    body: JSON.stringify({ task_ids: taskIds }),
  })
}

/** 健康检查（免鉴权）；设置页读取 version 展示 */
export async function getHealth() {
  return apiRequest<{
    status: string
    database?: string
    migration?: string
    version?: string
    timestamp?: string
  }>('/health')
}

export type BackendCompany = {
  id: number
  name: string
  slug?: string
  status?: string
  my_membership?: {
    status?: string
    is_super_admin?: boolean
    is_org_leader?: boolean
    title?: string | null
  } | null
}

export async function listMyCompanies() {
  return apiRequest<{ items: BackendCompany[] }>('/companies/mine')
}

export async function createCompany(body: {
  name: string
  slug: string
  policy_preset?: string
}) {
  return apiRequest<BackendCompany>('/companies', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listProjects(companyId: number) {
  return apiRequest<{ items: BackendProject[]; total: number }>(
    `/projects?company_id=${companyId}&as_admin=true`,
  )
}

export async function createProject(body: { name: string; company_id: number }) {
  return apiRequest<BackendProject>('/projects', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function acceptProjectInvitation(token: string) {
  return apiRequest<{ project_id: number; role: string }>(
    `/projects/invitations/${encodeURIComponent(token)}/accept`,
    { method: 'POST', body: '{}' },
  )
}

export async function getProject(projectId: number) {
  return apiRequest<BackendProject>(`/projects/${projectId}`)
}

export async function getProjectTree(projectId: number) {
  return apiRequest<{ project_id: number; nodes: BackendTreeNode[] }>(
    `/projects/${projectId}/tree?format=nested`,
  )
}

export async function listProjectMembers(projectId: number) {
  return apiRequest<{ items: BackendMember[] }>(
    `/projects/${projectId}/members`,
  )
}

export async function createNode(
  projectId: number,
  body: {
    parent_id?: number | null
    node_type_key: string
    title: string
    description?: string
    due_at?: string
    sort_order?: number
    assignees?: { user_id: number; role_key?: string }[]
    node_origin?: 'project' | 'subordinate'
    responsibility_permissions?: import('../types').ResponsibilityPermissions
    allow_clear_text_progress?: boolean
  },
) {
  return apiRequest<BackendTreeNode>(`/projects/${projectId}/nodes`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function moveNode(
  nodeId: number,
  body: { new_parent_id?: number | null; sort_order?: number },
) {
  return apiRequest<BackendTreeNode>(`/nodes/${nodeId}/move`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function getTreeNode(nodeId: number) {
  return apiRequest<BackendTreeNode>(`/nodes/${nodeId}`)
}

export async function updateTreeNode(nodeId: number, body: {
  title?: string; description?: string
  assignees?: { user_id: number; role_key: string }[]
  responsibility_permissions?: import('../types').ResponsibilityPermissions
}) {
  return apiRequest<BackendTreeNode>(`/nodes/${nodeId}`, { method: 'PATCH', body: JSON.stringify(body) })
}

export async function setNodeAssignees(nodeId: number, userIds: number[]) {
  return apiRequest(`/nodes/${nodeId}/assignees`, {
    method: 'PUT',
    body: JSON.stringify({
      assignees: userIds.map((user_id, i) => ({
        user_id,
        role_key: i === 0 ? 'primary' : 'member',
      })),
    }),
  })
}

export type NodeDeletionPreview = {
  node_id:number; descendants:Array<{id:number;title:string;node_type_key:string;node_origin:string}>;
  descendant_count:number; affected_user_ids:number[]; affected_task_count:number; affected_evidence_count:number;
  handover_candidates:Array<{id:number;title:string}>; requires_confirmation:boolean; warning:string; preview_token:string;
};
export function previewNodeDeletion(nodeId:number) {
  return apiRequest<NodeDeletionPreview>(`/nodes/${nodeId}/deletion-preview`);
}
export function deletePersonNode(nodeId:number, options:{preview_token:string;cascade?:boolean;handover_to_node_id?:number}) {
  const q=new URLSearchParams({preview_token:options.preview_token});
  if(options.cascade) q.set('cascade','true');
  if(options.handover_to_node_id) q.set('handover_to_node_id',String(options.handover_to_node_id));
  return apiRequest<{id:number;is_deleted:boolean;revoked_user_ids:number[]}>(`/nodes/${nodeId}?${q}`,{method:'DELETE'});
}

export async function listNodeEvidence(nodeId: number) {
  return apiRequest<{
    items: {
      id: number
      summary_text?: string
      status?: string
      submitted_at?: string
      evidence_kind?: string
      external_url?: string
      structured?: { evidence_kind?: string; external_url?: string }
    }[]
  }>(`/nodes/${nodeId}/evidence`)
}

export async function submitEvidence(
  nodeId: number,
  body: {
    summary: string
    evidence_kind?: string
    external_url?: string
    file_ids?: number[]
  },
) {
  return apiRequest(`/nodes/${nodeId}/evidence`, {
    method: 'POST',
    body: JSON.stringify({
      summary_text: body.summary,
      evidence_kind: body.evidence_kind,
      external_url: body.external_url,
      file_ids: body.file_ids || [],
    }),
  })
}
