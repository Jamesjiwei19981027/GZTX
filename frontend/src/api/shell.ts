/** 消息 / 通知 / 活动 / 报表趋势 / 偏好 / 在线状态 */
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
  orientation?: 'horizontal' | 'vertical',
) {
  return apiRequest(`/nodes/${nodeId}/layout`, {
    method: 'PUT',
    body: JSON.stringify({
      offset_x: offset.x,
      offset_y: offset.y,
      ...(orientation ? { orientation } : {}),
    }),
  })
}

export type TaskStatsPeriod = 'week' | 'month' | 'quarter';
function taskStatsQuery(period: string, projectId?: string) {
  const params = new URLSearchParams({ period, timezone_offset: String(-new Date().getTimezoneOffset()) });
  if (projectId && projectId !== 'all' && Number(projectId) > 0) params.set('project_id', projectId);
  return params.toString();
}

export async function getTaskTrend(period: TaskStatsPeriod = 'week', projectId?: string) {
  return apiRequest<{
    period: string
    series: { date: string; created: number; completed: number }[]
  }>(`/tasks/stats/trend?${taskStatsQuery(period, projectId)}`)
}

export async function getTaskStats(period = 'month', projectId?: string) {
  return apiRequest<{
    total: number
    completed: number
    pending: number
    in_progress: number
    overdue: number
  }>(`/tasks/stats?${taskStatsQuery(period, projectId)}`)
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

export type MyProjectPermissions = {
  role: 'pm' | 'superadmin' | 'member' | 'outsider'
  is_pm: boolean
  is_superadmin: boolean
  /** PM/超管/有效委托授权（委托是项目粒度，命中即全树可编辑） */
  can_edit_all: boolean
  /** primary/collaborator 指派锚点节点 id；子树传递由前端沿树展开 */
  owned_node_ids: number[]
  via_delegation: boolean
  /** move/delete 只认 tree.edit_any（不可委托） */
  can_move: boolean
  can_delete: boolean
  can_submit_evidence: boolean
  can_read_evidence: boolean
  node_permissions?: Record<string, import('../types').ResponsibilityNodeCapabilities>
}

export async function getMyPermissions(projectId: number) {
  return apiRequest<MyProjectPermissions>(`/projects/${projectId}/my-permissions`)
}

export async function getPeopleAxisAggregate() {
  return apiRequest<{ projects: { project_id: number; project_name: string; company_id: number; pm_user_id?: number; final_owner_user_id?: number; my_role?: string; my_owned_node_ids?: number[]; nodes: Record<string, unknown>[] }[] }>('/users/me/people-axis')
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

export type WorkContact = { id: number; name: string; avatar?: string }
export async function listWorkContacts(companyId: number, projectId?: number) {
  return apiRequest<{ items: WorkContact[] }>(`/companies/${companyId}/contacts${projectId ? `?project_id=${projectId}` : ''}`)
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

export type CommunicationSummary = {
  id: number
  company_id: number
  project_id?: number | null
  scope_type: 'channel' | 'conversation' | 'call'
  scope_id: number
  source_count: number
  summary_text: string
  key_points: string[]
  decisions: string[]
  action_items: string[]
  risks: string[]
  provider: string
  status: string
  error_message?: string | null
  created_at?: string | null
}

export async function createChannelSummary(channelId: number) {
  return apiRequest<CommunicationSummary>(`/channels/${channelId}/summaries`, { method: 'POST', body: '{}' })
}

export async function listChannelSummaries(channelId: number) {
  return apiRequest<{ items: CommunicationSummary[] }>(`/channels/${channelId}/summaries`)
}

export async function createConversationSummary(conversationId: number) {
  return apiRequest<CommunicationSummary>(`/conversations/${conversationId}/summaries`, { method: 'POST', body: '{}' })
}

export async function listConversationSummaries(conversationId: number) {
  return apiRequest<{ items: CommunicationSummary[] }>(`/conversations/${conversationId}/summaries`)
}

export type CallSession = {
  id: number
  company_id: number
  project_id?: number | null
  conversation_id: number
  call_type: 'audio' | 'video'
  status: string
  participants: number[]
  started_at?: string | null
  ended_at?: string | null
}

export type CallRecording = {
  id: number
  call_session_id: number
  status: string
  transcription_status: string
  transcription_provider?: string | null
  transcript_text?: string | null
  transcription_error?: string | null
}

export async function createCallSession(body: { conversation_id: number; call_type: 'audio' | 'video'; project_id?: number }) {
  return apiRequest<CallSession>('/calls/sessions', { method: 'POST', body: JSON.stringify(body) })
}

export async function endCallSession(sessionId: number) {
  return apiRequest<CallSession>(`/calls/sessions/${sessionId}/end`, { method: 'POST', body: '{}' })
}

export async function uploadCallRecording(sessionId: number, file: File) {
  const body = new FormData()
  body.append('file', file)
  return apiRequest<CallRecording>(`/calls/sessions/${sessionId}/recordings`, { method: 'POST', body })
}

export async function transcribeCallSession(sessionId: number) {
  return apiRequest<CallRecording>(`/calls/sessions/${sessionId}/transcribe`, { method: 'POST', body: '{}' })
}

export async function summarizeCallSession(sessionId: number) {
  return apiRequest<CommunicationSummary>(`/calls/sessions/${sessionId}/summarize`, { method: 'POST', body: '{}' })
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
  return apiRequest<{
    id: number
    token: string
    status: string
    expires_at?: string | null
  }>(`/projects/${projectId}/invitations`, {
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
      credentials?: Record<string, string | boolean>
      callback_uri?: string
      last_sync_report?: import('./sso').SyncReport
    }[]
  }>(`/companies/${companyId}/integrations`)
}

export async function triggerOrgSync(companyId: number, provider?: string) {
  return apiRequest<{ status: string; report?: import('./sso').SyncReport }>(`/companies/${companyId}/org-sync${provider ? `?provider=${encodeURIComponent(provider)}` : ''}`, {
    method: 'POST',
    body: '{}',
  })
}

export type CallConfig = {
  configured: boolean
  ice_servers: { urls: string | string[]; username?: string; credential?: string }[]
  message: string
}

export async function getCallConfig(companyId: number) {
  return apiRequest<CallConfig>(`/calls/config?company_id=${companyId}`)
}

export type ExternalMailStatus = {
  provider: string
  configured: boolean
  host?: string | null
  username?: string | null
  reason?: string | null
}

export async function getExternalMailStatus(companyId: number) {
  return apiRequest<ExternalMailStatus>(`/external-mail/status?company_id=${companyId}`)
}

export async function syncExternalMail(companyId: number) {
  return apiRequest<{ provider: string; synced: number; skipped: number }>(`/external-mail/sync?company_id=${companyId}`, {
    method: 'POST',
    body: '{}',
  })
}

export type ExternalMailItem = {
  id: number
  company_id: number
  provider: string
  external_id: string
  from_address?: string | null
  to_addresses: string[]
  subject?: string | null
  headers: Record<string, unknown>
  body_text?: string
  state: 'active' | 'archived' | 'deleted'
  synced_at?: string | null
  created_at?: string | null
}

export async function listExternalMail(companyId: number, state: 'active' | 'archived' | 'deleted' | 'all' = 'active') {
  return apiRequest<{ items: ExternalMailItem[]; total: number }>(`/external-mail?company_id=${companyId}&state=${state}`)
}

export async function getExternalMail(mailId: number) {
  return apiRequest<ExternalMailItem>(`/external-mail/${mailId}`)
}

export async function updateExternalMailState(mailId: number, state: 'active' | 'archived' | 'deleted') {
  return apiRequest<{ id: number; state: string }>(`/external-mail/${mailId}/state`, {
    method: 'PUT',
    body: JSON.stringify({ state }),
  })
}
