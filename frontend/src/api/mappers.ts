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
  Language,
} from '../types'
import { fromApiDueDate, toLocalDateString } from '../utils/datetime'
import { readAxisPersonMetadata } from './axisPerson'
import type { BackendUser } from './auth'
import {
  type BackendMember,
  type BackendProject,
  type BackendTask,
  type BackendAssignee,
  type BackendTreeNode,
  listNodeEvidence,
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
}

const PRIORITY_TO_API: Record<Priority, number> = {
  Low: 0,
  Medium: 1,
  High: 2,
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

  // 后端出参是 UTC（带 Z），这里换算成本地日期/时刻再渲染
  const { date: dueDate, time: dueTime } = fromApiDueDate(t.due_date)
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
    subtasks: (t.checklist || []).map((item) => ({
      id: item.id,
      title: item.title,
      completed: Boolean(item.completed),
    })),
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
    isRecurring: t.is_recurring || undefined,
    recurrenceRule: t.recurrence_rule || undefined,
    parentTaskId: t.parent_task_id != null ? String(t.parent_task_id) : undefined,
  }
}

export function uiStatusToApi(s: Status): number {
  return STATUS_TO_API[s]
}

export function uiPriorityToApi(p: Priority): number {
  return PRIORITY_TO_API[p] ?? 1
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
    dueDate: toLocalDateString(n.due_at || n.milestone_at || ''),
    evidences,
  }
}

export type UiOffsetPoint = { x: number; y: number }
export type UiOffsetsMap = {
  horizontal?: UiOffsetPoint | null
  vertical?: UiOffsetPoint | null
}

/**
 * 按当前展开方向提取节点的 UI 布局偏移。
 * 规则严格按 MOBILE-SPEC 第 6 节：
 * 1. 优先取 ui_offsets[orientation]；
 * 2. 否则，仅在 orientation === 'horizontal' 时回退旧的 ui_offset；
 * 3. 都没有则返回 { x: 0, y: 0 }。
 */
export function pickUiOffset(
  node: {
    ui_offsets?: UiOffsetsMap | null
    ui_offset?: UiOffsetPoint | null
    uiOffsets?: UiOffsetsMap | null
    uiOffset?: UiOffsetPoint | null
    progress_json?: {
      ui_offsets?: UiOffsetsMap | null
      ui_offset?: UiOffsetPoint | null
    } | null
  } | null | undefined,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
): UiOffsetPoint {
  if (!node) return { x: 0, y: 0 }
  const offsets = node.ui_offsets ?? node.uiOffsets ?? node.progress_json?.ui_offsets
  const byDir = offsets?.[orientation]
  if (byDir && typeof byDir.x === 'number' && typeof byDir.y === 'number') {
    return { x: byDir.x, y: byDir.y }
  }
  if (orientation === 'horizontal') {
    const single = node.ui_offset ?? node.uiOffset ?? node.progress_json?.ui_offset
    if (single && typeof single.x === 'number' && typeof single.y === 'number') {
      return { x: single.x, y: single.y }
    }
  }
  return { x: 0, y: 0 }
}

/** 将后端嵌套人树映射为新 UI 的 PeopleAxisNode 列表（扁平） */
export function mapTreeToPeopleAxis(
  roots: BackendTreeNode[],
  finalOwnerUserId?: number | null,
  orientation: 'horizontal' | 'vertical' = 'horizontal',
): PeopleAxisNode[] {
  const out: PeopleAxisNode[] = []
  let order = 0

  // The compatibility parameter is intentionally retained for callers that
  // still pass the project owner id. Terminal status now follows the first
  // root in tree order and never depends on assignee matching.
  void finalOwnerUserId
  const treeOrder = (a: BackendTreeNode, b: BackendTreeNode) =>
    (a.sort_order ?? 0) - (b.sort_order ?? 0) || a.id - b.id
  const orderedRoots = [...roots].sort(treeOrder)
  const firstPersonRoot = (items: BackendTreeNode[]): BackendTreeNode | undefined => {
    for (const item of [...items].sort(treeOrder)) {
      if (item.node_type_key === 'person') return item
      const nested = firstPersonRoot(item.children || [])
      if (nested) return nested
    }
    return undefined
  }
  const firstRootId = firstPersonRoot(orderedRoots)?.id

  const walkPerson = (n: BackendTreeNode, parentPersonId?: string) => {
    if (n.node_type_key !== 'person') {
      for (const c of [...(n.children || [])].sort(treeOrder)) walkPerson(c, parentPersonId)
      return
    }
    const primary = n.assignees?.find(a => a.role_key === 'primary') || n.assignees?.[0]
    const metadata = readAxisPersonMetadata(n.description)
    const legacyParts = /(?:^|\/)\s*risk=(?:low|medium|high)\s*$/.test(n.description || '')
      ? (n.description || '').split(' / ')
      : []
    const person: TeamMember = {
      id: String(primary?.user_id ?? n.id),
      name:
        primary?.display_name ||
        primary?.nickname ||
        primary?.username ||
        metadata.name ||
        n.title,
      role: '负责人',
      avatar: primary?.avatar_url || '',
      department: metadata.department ?? (legacyParts.length >= 3 ? legacyParts[1].trim() : ''),
    }
    const matters: AxisWorkItem[] = []
    for (const c of n.children || []) {
      if (c.node_type_key === 'person') continue
      matters.push(mapMatter(c))
    }
    const isTerminal = n.id === firstRootId

    const offset = pickUiOffset(n, orientation)
    const rawOffsets = n.ui_offsets ?? n.progress_json?.ui_offsets ?? null
    const rawOffset = n.ui_offset ?? n.progress_json?.ui_offset ?? null
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
      // The person form stores title=name and description=role / department /
      // risk=… . Recover that explicit form format without treating free notes
      // on legacy nodes as job titles.
      roleTitle: metadata.roleTitle || legacyParts[0]?.trim() || n.title,
      nodeOrigin: n.node_origin || 'project',
      responsibilityPermissions: {
        evidence_submit: 'inherit', allow_add_subordinates: true, allow_add_work_items: true,
        ...n.responsibility_permissions,
      },
      workItems: matters,
      ownerUserIds,
      uiOffsets: rawOffsets,
      uiOffset: rawOffset,
      layoutOffset: offset,
    } as PeopleAxisNode)

    for (const c of [...(n.children || [])].sort(treeOrder)) {
      if (c.node_type_key === 'person') walkPerson(c, String(n.id))
    }
  }

  for (const r of orderedRoots) walkPerson(r)
  return out
}

function dateKey(value: string): string {
  return value ? value.slice(0, 10) : ''
}

function todayKey(today: Date): string {
  const y = today.getFullYear()
  const m = String(today.getMonth() + 1).padStart(2, '0')
  const d = String(today.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

function isCompleted(item: AxisWorkItem): boolean {
  const st = String(item.status || '').toLowerCase()
  return (
    item.status === 'Done' ||
    st === 'done' ||
    st === 'completed' ||
    (typeof item.progress === 'number' && item.progress >= 100)
  )
}

/** id 都是纯数字时按数值比较（"9" 在 "10" 前，与 APP 一致），否则退回文字比较。 */
function compareIds(a: string, b: string): number {
  if (/^\d+$/.test(a) && /^\d+$/.test(b)) {
    const diff = Number(a) - Number(b)
    if (diff !== 0) return diff < 0 ? -1 : 1
    return 0
  }
  return a.localeCompare(b)
}

/** Stable card ordering: overdue, upcoming, undated, then completed. */
export function sortCardTasks(items: AxisWorkItem[], today: Date): AxisWorkItem[] {
  const now = todayKey(today)
  return [...items].sort((a, b) => {
    const aDone = isCompleted(a)
    const bDone = isCompleted(b)
    if (aDone !== bDone) return aDone ? 1 : -1
    const ad = dateKey(a.dueDate)
    const bd = dateKey(b.dueDate)
    const aOverdue = Boolean(ad && ad < now && !aDone)
    const bOverdue = Boolean(bd && bd < now && !bDone)
    if (aOverdue !== bOverdue) return aOverdue ? -1 : 1
    if (!ad && bd) return 1
    if (ad && !bd) return -1
    if (ad !== bd) return ad.localeCompare(bd)
    return compareIds(a.id, b.id)
  })
}

export function summarizeCardTasks(items: AxisWorkItem[], today: Date): {
  visible: AxisWorkItem[]
  total: number
  hiddenCount: number
  overdueIds: Set<string>
} {
  const sorted = sortCardTasks(items, today)
  const now = todayKey(today)
  const overdueIds = new Set(
    sorted
      .filter(item => !isCompleted(item) && Boolean(dateKey(item.dueDate) && dateKey(item.dueDate) < now))
      .map(item => item.id),
  )
  return { visible: sorted.slice(0, 2), total: sorted.length, hiddenCount: Math.max(0, sorted.length - 2), overdueIds }
}

export function extraRootIds(nodes: PeopleAxisNode[]): string[] {
  const ids = new Set(nodes.map(node => node.id))
  const roots = nodes.filter(node => !node.parentId || !ids.has(node.parentId))
    .sort((a, b) => a.orderOnAxis - b.orderOnAxis || a.id.localeCompare(b.id))
  return roots.slice(1).map(node => node.id)
}

export function cardTaskChip(
  item: AxisWorkItem,
  today: Date,
  lang: Language = 'zh',
): { text: string; tone: 'over' | 'today' | 'normal' | 'done' | 'none' } {
  if (isCompleted(item)) {
    return { text: lang === 'zh' ? '已完成' : 'Done', tone: 'done' }
  }
  if (!item.dueDate) {
    return { text: lang === 'zh' ? '无日期' : 'No date', tone: 'none' }
  }
  const match = item.dueDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) {
    return { text: lang === 'zh' ? '无日期' : 'No date', tone: 'none' }
  }
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const dueStart = new Date(y, m - 1, d).getTime()
  const diffDays = Math.round((todayStart - dueStart) / 86400000)

  if (diffDays > 0) {
    return {
      text: lang === 'zh' ? `逾期 ${diffDays} 天` : `Overdue ${diffDays} d`,
      tone: 'over',
    }
  }
  if (diffDays === 0) {
    return { text: lang === 'zh' ? '今天' : 'Today', tone: 'today' }
  }
  return {
    text: `${String(m).padStart(2, '0')}/${String(d).padStart(2, '0')}`,
    tone: 'normal',
  }
}

export function isWorkItemOverdue(
  item: AxisWorkItem,
  today: Date = new Date(),
): boolean {
  if (isCompleted(item) || !item.dueDate) return false
  const match = item.dueDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return false
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const dueStart = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
  return dueStart < todayStart
}

export function getWorkItemOverdueDays(
  item: AxisWorkItem,
  today: Date = new Date(),
): number {
  if (!isWorkItemOverdue(item, today)) return 0
  const match = item.dueDate.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!match) return 0
  const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
  const dueStart = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3])).getTime()
  return Math.max(0, Math.round((todayStart - dueStart) / 86400000))
}

export function cardOverdueCount(items: AxisWorkItem[], today: Date): number {
  return items.filter(item => isWorkItemOverdue(item, today)).length
}

export function asBackendId(id?: string | null): number | null {
  if (!id) return null
  const n = Number(id)
  return Number.isFinite(n) && n > 0 ? n : null
}

/** 后端材料状态 -> 界面状态。只有明确 adopted 才算“已采纳”，待确认不得误显示为已采纳。 */
export function mapEvidenceStatus(status?: string | null): AxisEvidence['status'] {
  switch (status) {
    case 'adopted': return 'verified'
    case 'rejected': return 'rejected'
    case 'pending_review': return 'awaiting_review'
    case 'superseded': return 'superseded'
    default: return 'pending'
  }
}

export const EVIDENCE_STATUS_LABEL: Record<AxisEvidence['status'], string> = {
  verified: '已采纳',
  rejected: '已驳回',
  awaiting_review: '待负责人确认',
  superseded: '已被新版本替代',
  pending: '判定中',
}

export async function enrichMattersWithEvidence(
  axisNodes: PeopleAxisNode[],
): Promise<PeopleAxisNode[]> {
  const matterIds = Array.from(
    new Set(
      axisNodes
        .flatMap((n) => n.workItems.map((w) => asBackendId(w.id)))
        .filter((id): id is number => id != null),
    ),
  )
  if (!matterIds.length) return axisNodes

  type EvItem = {
    id: number
    summary_text?: string
    status?: string
    submitted_at?: string
    evidence_kind?: string
    external_url?: string
    structured?: { evidence_kind?: string; external_url?: string }
    can_review?: boolean
    reject_reason?: string | null
  }
  const pairs: [number, EvItem[]][] = await Promise.all(
    matterIds.map(async (id) => {
      try {
        const res = await listNodeEvidence(id)
        return [id, res.items || []] as [number, EvItem[]]
      } catch {
        return [id, [] as EvItem[]] as [number, EvItem[]]
      }
    }),
  )
  const byId = new Map<number, EvItem[]>(pairs)

  return axisNodes.map((n) => ({
    ...n,
    workItems: n.workItems.map((wi) => {
      const mid = asBackendId(wi.id)
      const items = mid != null ? byId.get(mid) || [] : []
      if (!items.length) return wi
      const kinds: AxisEvidence['type'][] = [
        'commit',
        'document',
        'figma',
        'log',
        'delivery',
      ]
      const evidences: AxisEvidence[] = items.map((ev) => {
        const raw = (ev.summary_text || '').trim()
        const firstLine = raw.split('\n')[0] || '证据'
        const kindMatch = firstLine.match(/^\[([^\]]+)\]\s*(.*)$/)
        const urlLine = raw.split('\n').find((l) => l.startsWith('url:'))
        const kindRaw =
          ev.evidence_kind ||
          ev.structured?.evidence_kind ||
          kindMatch?.[1] ||
          'document'
        const kind = kinds.includes(kindRaw as AxisEvidence['type'])
          ? (kindRaw as AxisEvidence['type'])
          : 'document'
        return {
          id: String(ev.id),
          type: kind,
          title: kindMatch?.[2] || firstLine,
          url:
            ev.external_url ||
            ev.structured?.external_url ||
            (urlLine ? urlLine.replace(/^url:\s*/, '') : '#'),
          timestamp: (ev.submitted_at || '').slice(5, 16).replace('T', ' ') || '—',
          status: mapEvidenceStatus(ev.status),
          canReview: ev.can_review === true,
          rejectReason: typeof ev.reject_reason === 'string' && ev.reject_reason.trim() ? ev.reject_reason.trim() : undefined,
        }
      })
      return { ...wi, evidences }
    }),
  }))
}

