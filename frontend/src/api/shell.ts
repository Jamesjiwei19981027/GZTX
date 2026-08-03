/** Remix 壳层 API：消息 / 通知 / 活动 / 报表趋势 / 偏好 / 在线状态 */
import { apiRequest, getApiBase, getToken } from './client'

export type CollabFile = {
  id: number
  company_id: number
  owner_user_id: number
  scope_type: 'channel' | 'conversation'
  scope_id: number
  message_id?: number | null
  storage_key?: string
  original_name: string
  mime_type?: string
  size_bytes: number
  sha256?: string
  download_url: string
  created_at?: string | null
}

export async function listChannels(companyId: number, projectId?: number) {
  const q = projectId ? `?project_id=${projectId}` : ''
  return apiRequest<{ items: { id: number; key: string; name: string; project_id?: number }[] }>(
    `/companies/${companyId}/channels${q}`,
  )
}

export async function listChannelMessages(channelId: number) {
  return apiRequest<{
    items: {
      id: number
      channel_id: number
      user_id: number
      sender_name: string
      sender_avatar: string
      body: string
      likes: number
      message_type?: 'user' | 'system'
       attachments?: { file_id?: number; name?: string; original_name?: string; url?: string; download_url?: string; mime_type?: string; size?: number; size_bytes?: number }[]
      created_at?: string
    }[]
  }>(`/channels/${channelId}/messages?page_size=100`)
}

export async function postChannelMessage(channelId: number, body: string, fileIds: number[] = []) {
  return apiRequest(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, file_ids: fileIds }),
  })
}

export async function postChannelMessageWithAttachments(channelId: number, body: string, attachments: Record<string, unknown>[] = [], fileIds: number[] = []) {
  return apiRequest(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, attachments, file_ids: fileIds }),
  })
}

export async function likeChannelMessage(messageId: number) {
  return apiRequest<{ id: number; likes: number }>(
    `/channels/messages/${messageId}/like`,
    { method: 'POST', body: '{}' },
  )
}

export async function listCollabNotifications(page = 1, state: 'active' | 'archived' | 'all' = 'active') {
  return apiRequest<{
    items: {
      id: number
      template_key: string
      payload?: Record<string, unknown>
      body_text?: string
      read: boolean
      sender?: { user_id: number; name: string; avatar_url?: string } | null
      recipient_user_ids?: number[]
      attachments?: { name?: string; original_name?: string; url?: string; download_url?: string; mime_type?: string; size?: number; file_size?: number }[]
      requires_reply?: boolean
      reply_text?: string | null
      replied_at?: string | null
      archived?: boolean
      archived_at?: string | null
      deleted?: boolean
      created_at?: string
    }[]
    total: number
  }>(`/notifications/collab?page=${page}&page_size=50&state=${state}`)
}

export async function markNotificationRead(id: number) {
  return apiRequest(`/notifications/collab/${id}/read`, {
    method: 'PUT',
    body: '{}',
  })
}

export async function markAllNotificationsRead() {
  return apiRequest(`/notifications/collab/read-all`, {
    method: 'PUT',
    body: '{}',
  })
}

export async function updateNotificationState(id: number, body: { read?: boolean; archived?: boolean }) {
  return apiRequest<{ id: number; read: boolean; archived: boolean; archived_at?: string | null }>(`/notifications/collab/${id}/state`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function deleteNotification(id: number) {
  return apiRequest<{ id: number; deleted: boolean }>(`/notifications/collab/${id}`, { method: 'DELETE' })
}

export async function replyCollabNotification(id: number, text: string) {
  return apiRequest<{ id: number; reply_text: string; replied_at: string }>(`/notifications/collab/${id}/reply`, {
    method: 'POST',
    body: JSON.stringify({ text }),
  })
}

export async function getProjectActivity(projectId: number) {
  return apiRequest<{
    items: {
      id: number | string
      type: string
      title: string
      created_at?: string
      actor_user_id?: number
    }[]
  }>(`/projects/${projectId}/activity?limit=40`)
}

export async function runAxisAudit(projectId: number) {
  return apiRequest<{
    overall_risk: string
    generated_at: string
    nodes: {
      node_id: number
      title: string
      risk_level: string
      summary: string
      suggested_actions: string[]
    }[]
  }>(`/projects/${projectId}/axis-audit`, { method: 'POST', body: '{}' })
}

export async function putNodeLayout(
  nodeId: number,
  offset: { x: number; y: number },
) {
  return apiRequest(`/nodes/${nodeId}/layout`, {
    method: 'PUT',
    body: JSON.stringify({ offset_x: offset.x, offset_y: offset.y }),
  })
}

export async function getTaskTrend(period: 'week' | 'month' | 'quarter' = 'week') {
  const p = period === 'quarter' ? 'month' : period
  return apiRequest<{
    period: string
    series: { date: string; created: number; completed: number }[]
  }>(`/tasks/stats/trend?period=${p}`)
}

export async function getTaskStats(period = 'month') {
  return apiRequest<{
    total: number
    completed: number
    pending: number
    in_progress: number
    overdue: number
  }>(`/tasks/stats?period=${period}`)
}

export async function getUiPrefs() {
  return apiRequest<{ ui: Record<string, string | number> }>(`/users/me/ui-prefs`)
}

export async function putUiPrefs(body: {
  language?: string
  accent?: string
  theme_mode?: string
  task_default_priority?: number
  task_default_category_id?: number
}) {
  return apiRequest(`/users/me/ui-prefs`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function putPresence(status: 'online' | 'busy' | 'offline') {
  return apiRequest(`/users/me/presence`, {
    method: 'PUT',
    body: JSON.stringify({ status }),
  })
}

export async function listPresence(companyId: number) {
  return apiRequest<{ items: { user_id: number; status: string }[] }>(
    `/companies/${companyId}/presence`,
  )
}

export async function listUserActivity(limit = 50) {
  return apiRequest<{
    items: { id: number; project_id?: number; project_name?: string; type: string; title: string; created_at?: string; actor_user_id?: number }[]
  }>(`/users/me/activity?limit=${limit}`)
}

export async function getPeopleAxisAggregate() {
  return apiRequest<{ projects: { project_id: number; project_name: string; company_id: number; nodes: Record<string, unknown>[] }[] }>('/users/me/people-axis')
}

export type DirectConversation = {
  id: number
  company_id: number
  project_id?: number | null
  kind: 'direct' | 'group'
  title?: string | null
  members: { user_id: number; name: string; avatar?: string }[]
  last_message?: { body: string; created_at?: string } | null
}

export async function listDirectConversations(companyId: number) {
  return apiRequest<{ items: DirectConversation[] }>(`/companies/${companyId}/conversations`)
}

export async function createDirectConversation(companyId: number, body: { member_user_ids: number[]; kind?: 'direct' | 'group'; title?: string; project_id?: number }) {
  return apiRequest<{ id: number; member_user_ids: number[]; kind: string }>(`/companies/${companyId}/conversations`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listDirectMessages(conversationId: number) {
  return apiRequest<{ items: { id: number; conversation_id: number; user_id: number; sender_name: string; sender_avatar?: string; body: string; message_type?: string; attachments?: Record<string, unknown>[]; created_at?: string }[] }>(`/conversations/${conversationId}/messages?page_size=100`)
}

export async function postDirectMessage(conversationId: number, body: string, attachments: Record<string, unknown>[] = [], fileIds: number[] = []) {
  return apiRequest(`/conversations/${conversationId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ body, attachments, file_ids: fileIds }),
  })
}

export async function uploadChannelFile(channelId: number, file: File) {
  const body = new FormData()
  body.append('file', file)
  return apiRequest<CollabFile>(`/channels/${channelId}/files`, { method: 'POST', body })
}

export async function uploadConversationFile(conversationId: number, file: File) {
  const body = new FormData()
  body.append('file', file)
  return apiRequest<CollabFile>(`/conversations/${conversationId}/files`, { method: 'POST', body })
}

export async function listChannelFiles(channelId: number) {
  return apiRequest<{ items: CollabFile[] }>(`/channels/${channelId}/files`)
}

export async function listConversationFiles(conversationId: number) {
  return apiRequest<{ items: CollabFile[] }>(`/conversations/${conversationId}/files`)
}

export async function downloadCollabFile(fileId: number) {
  const headers = new Headers()
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)
  const response = await fetch(`${getApiBase()}/collab/files/${fileId}/download`, { headers })
  if (!response.ok) throw new Error(`HTTP ${response.status}`)
  return response.blob()
}

export async function listPinnedLinks(channelId: number) {
  return apiRequest<{ items: { id: number; title: string; url: string; created_by?: number; created_at?: string }[] }>(`/channels/${channelId}/pinned-links`)
}

export async function createPinnedLink(channelId: number, body: { title: string; url: string }) {
  return apiRequest<{ id: number; title: string; url: string }>(`/channels/${channelId}/pinned-links`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function inviteProjectMember(
  projectId: number,
  body: { email?: string; user_id?: number },
) {
  return apiRequest(`/projects/${projectId}/invitations`, {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function listIntegrations(companyId: number) {
  return apiRequest<{
    items: {
      provider: string
      enabled?: boolean
      status?: string
      last_sync_at?: string
      config?: Record<string, unknown>
      has_credentials?: boolean
    }[]
  }>(`/companies/${companyId}/integrations`)
}

export async function triggerOrgSync(companyId: number) {
  return apiRequest(`/companies/${companyId}/org-sync`, {
    method: 'POST',
    body: '{}',
  })
}
