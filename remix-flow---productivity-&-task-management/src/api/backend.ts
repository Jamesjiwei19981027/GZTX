import { apiRequest } from './client'

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

export async function listTasks(params?: { page?: number; page_size?: number }) {
  const q = new URLSearchParams()
  q.set('page', String(params?.page ?? 1))
  q.set('page_size', String(params?.page_size ?? 100))
  return apiRequest<{ items: BackendTask[]; total: number }>(`/tasks?${q}`)
}

export async function createTask(body: {
  title: string
  description?: string
  priority?: number
  due_date?: string
}) {
  return apiRequest<BackendTask>('/tasks', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateTask(
  id: number,
  body: Partial<{
    title: string
    description: string
    priority: number
    status: number
    due_date: string
    project_id: number | null
    project_node_id: number | null
    company_id: number | null
    origin: string
    linked_readonly: boolean
  }>,
) {
  return apiRequest<BackendTask>(`/tasks/${id}`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export async function completeTask(id: number) {
  return apiRequest<BackendTask>(`/tasks/${id}/complete`, {
    method: 'PATCH',
    body: JSON.stringify({}),
  })
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

export async function listMyCompanies() {
  return apiRequest<{ items: { id: number; name: string; slug?: string }[] }>(
    '/companies/mine',
  )
}

export async function listProjects(companyId: number) {
  return apiRequest<{ items: BackendProject[]; total: number }>(
    `/projects?company_id=${companyId}&as_admin=true`,
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
    sort_order?: number
    assignees?: { user_id: number; role_key?: string }[]
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
  },
) {
  return apiRequest(`/nodes/${nodeId}/evidence`, {
    method: 'POST',
    body: JSON.stringify({
      summary_text: body.summary,
      evidence_kind: body.evidence_kind,
      external_url: body.external_url,
    }),
  })
}

export async function setFinalOwnerPosition(projectId: number, alongDelta: number) {
  return apiRequest(`/projects/${projectId}/final-owner-position`, {
    method: 'PUT',
    body: JSON.stringify({ along_delta: Math.max(0, Math.round(alongDelta)) }),
  })
}
