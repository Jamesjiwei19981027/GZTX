import type {
  Category,
  PeopleAxisNode,
  Priority,
  Project,
  Status,
  Task,
  TeamMember,
  UserProfile,
  AxisWorkItem,
  AxisEvidence,
} from '../types'
import type { BackendUser } from './auth'
import type {
  BackendMember,
  BackendProject,
  BackendTask,
  BackendAssignee,
  BackendTreeNode,
} from './backend'

const STATUS_TO_UI: Record<number, Status> = {
  0: 'To Do',
  1: 'In Progress',
  2: 'Done',
}

const STATUS_TO_API: Record<Status, number> = {
  'To Do': 0,
  'In Progress': 1,
  Done: 2,
}

const PRIORITY_TO_UI: Record<number, Priority> = {
  0: 'Low',
  1: 'Medium',
  2: 'High',
  // backend has no Urgent; map high as High
}

const PRIORITY_TO_API: Record<Priority, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
  Urgent: 2,
}

const CATEGORY_FALLBACK: Category = 'Work'

export function mapUser(u: BackendUser): UserProfile {
  return {
    id: String(u.id),
    name: u.nickname || u.username || `用户${u.id}`,
    email: u.email || '',
    avatar: u.avatar_url || '',
    role: '成员',
  }
}

export function mapProject(p: BackendProject): Project {
  return {
    id: String(p.id),
    name: p.name,
    description: p.final_owner
      ? `终责：${p.final_owner.nickname || p.final_owner.username || p.final_owner.user_id}`
      : '',
    color: '#0058be',
    active: p.status !== 'archived',
  }
}

export function mapTask(t: BackendTask, projectId = 'all'): Task {
  const catName = t.category?.name
  const category: Category =
    catName === 'Health' ||
    catName === 'Personal' ||
    catName === 'Shopping' ||
    catName === 'Documentation' ||
    catName === 'Work'
      ? catName
      : CATEGORY_FALLBACK

  const resolvedProject =
    t.project_id != null
      ? String(t.project_id)
      : projectId === 'all'
        ? ''
        : projectId

  const dueDate = t.due_date ? t.due_date.slice(0, 10) : ''
  const dueTime = t.due_date && t.due_date.length >= 16 ? t.due_date.slice(11, 16) : undefined
  const assignees = (t.assignees || (t.assignee ? [t.assignee] : [])).map(mapAssignee)
  const primary = assignees.find((member) => member.roleKey === 'primary') || assignees[0]

  return {
    id: String(t.id),
    title: t.title,
    description: t.description,
    priority: PRIORITY_TO_UI[t.priority] ?? 'Medium',
    status: STATUS_TO_UI[t.status] ?? 'To Do',
    category,
    dueDate,
    dueTime,
    assignees,
    assignee: primary,
    assigneeUserIds: assignees.map((member) => member.id),
    subtasks: [],
    progress: t.completion_rate ?? (t.status === 2 ? 100 : t.status === 1 ? 50 : 0),
    tag: t.tags?.[0]?.name,
    categoryId: t.category?.id,
    tagIds: t.tags?.map((item) => item.id),
    attachments: [],
    completedAt: t.completed_at,
    projectId: resolvedProject,
    linkedNodeId: t.project_node_id != null ? String(t.project_node_id) : undefined,
    sourceChannel: t.source_channel || undefined,
    sourceTitle: t.source_title || undefined,
    sourceUrl: t.source_url || undefined,
    sourceMessageId: t.source_message_id || undefined,
    sourceMeta: t.source_meta || undefined,
  }
}

export function uiStatusToApi(s: Status): number {
  return STATUS_TO_API[s]
}

export function uiPriorityToApi(p: Priority): number {
  return PRIORITY_TO_API[p]
}

export function apiPriorityToUi(priority: number): Priority {
  return PRIORITY_TO_UI[priority] ?? 'Medium'
}

export function mapMember(m: BackendMember): TeamMember {
  return {
    id: String(m.user_id),
    name: m.display_name || m.nickname || m.username || `用户${m.user_id}`,
    role: m.role || '成员',
    avatar: m.avatar_url || '',
    email: undefined,
  }
}

export function mapAssignee(m: BackendAssignee): TeamMember {
  return {
    id: String(m.user_id),
    name: m.display_name || m.nickname || m.username || `用户${m.user_id}`,
    role: m.role_key === 'primary' ? 'Primary' : 'Collaborator',
    roleKey: m.role_key || 'collaborator',
    avatar: m.avatar_url || '',
    email: undefined,
  }
}

function mapMatter(n: BackendTreeNode): AxisWorkItem {
  const pct = n.progress_json?.percent ?? 0
  const st = n.progress_json?.status
  let status: Status = 'To Do'
  if (st === 'done' || st === 'completed' || pct >= 100) status = 'Done'
  else if (pct > 0 || st === 'in_progress') status = 'In Progress'

  const type =
    n.node_type_key === 'milestone'
      ? 'milestone'
      : n.node_type_key === 'scope'
        ? 'scope'
        : 'task'

  const evidences: AxisEvidence[] = []

  return {
    id: String(n.id),
    title: n.title,
    type,
    status,
    progress: Number(pct) || 0,
    dueDate: (n.due_at || n.milestone_at || '').slice(0, 10),
    evidences,
  }
}

/** 将后端嵌套人树映射为新 UI 的 PeopleAxisNode 列表（扁平） */
export function mapTreeToPeopleAxis(
  roots: BackendTreeNode[],
  finalOwnerUserId?: number | null,
): PeopleAxisNode[] {
  const out: PeopleAxisNode[] = []
  let order = 0

  const walkPerson = (n: BackendTreeNode, parentPersonId?: string) => {
    if (n.node_type_key !== 'person') {
      for (const c of n.children || []) walkPerson(c, parentPersonId)
      return
    }
    const primary = n.assignees?.[0]
    const person: TeamMember = {
      id: String(primary?.user_id ?? n.id),
      name:
        primary?.display_name ||
        primary?.nickname ||
        primary?.username ||
        n.title,
      role: '负责人',
      avatar: primary?.avatar_url || '',
    }
    const matters: AxisWorkItem[] = []
    for (const c of n.children || []) {
      if (c.node_type_key === 'person') continue
      matters.push(mapMatter(c))
    }
    const isTerminal =
      finalOwnerUserId != null &&
      (n.assignees || []).some((a) => a.user_id === finalOwnerUserId)

    const offset = n.ui_offset || n.progress_json?.ui_offset
    // 与服务端 acl._owns_path 同口径：只有 primary/collaborator 指派才拥有该子树的编辑权
    const ownerUserIds = (n.assignees || [])
      .filter((a) => a.role_key === 'primary' || a.role_key === 'collaborator')
      .map((a) => a.user_id)
    out.push({
      id: String(n.id),
      person,
      parentId: parentPersonId,
      isTerminalPM: isTerminal,
      orderOnAxis: order++,
      roleTitle: n.title,
      workItems: matters,
      ownerUserIds,
      ...(offset ? { layoutOffset: offset } : {}),
    } as PeopleAxisNode & { layoutOffset?: { x: number; y: number } })

    for (const c of n.children || []) {
      if (c.node_type_key === 'person') walkPerson(c, String(n.id))
    }
  }

  for (const r of roots) walkPerson(r)
  // 终责排到轴末（与产品口径一致）
  out.sort((a, b) => {
    if (a.isTerminalPM && !b.isTerminalPM) return 1
    if (!a.isTerminalPM && b.isTerminalPM) return -1
    return a.orderOnAxis - b.orderOnAxis
  })
  out.forEach((n, i) => {
    n.orderOnAxis = i
  })
  return out
}
