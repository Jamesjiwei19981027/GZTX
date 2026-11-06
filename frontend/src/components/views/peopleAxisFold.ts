import type { PeopleAxisNode } from '../../types'

/**
 * 「项目全貌」下属默认折叠：谁画成完整卡片（上轴人员）的纯逻辑。
 * 拉出状态只属于操作者本人，按「用户 id + 项目 id」存在本机，不进后端。
 */
export type AxisFoldSpec = {
  /** 被操作者拉到人轴的人 */
  pulled: Set<string>
  /** 当前展开成卡片的折叠行（只在内存里） */
  expandedRows: Set<string>
  /** 当前用户本人的节点；他的所有上级默认上轴 */
  selfNodeId: string | null
  /** 折叠行高度；手机画布缩放小，行要更高才好点。省略时用默认值 */
  rowHeight?: number
}

const byIdOf = (nodes: PeopleAxisNode[]) => new Map(nodes.map(n => [n.id, n]))

/** 从近到远的所有上级 id，遇到环或缺失的父级就停 */
export function revealAncestors(nodes: PeopleAxisNode[], id: string): string[] {
  const byId = byIdOf(nodes)
  const result: string[] = []
  const seen = new Set<string>([id])
  let parent = byId.get(id)?.parentId
  while (parent && byId.has(parent) && !seen.has(parent)) {
    seen.add(parent)
    result.push(parent)
    parent = byId.get(parent)?.parentId
  }
  return result
}

/** 上轴人员：根人员 + 父级也在轴上的拉出者 + 当前用户本人的所有上级；失效 id 一律忽略 */
export function axisMemberIds(nodes: PeopleAxisNode[], spec: AxisFoldSpec): Set<string> {
  const byId = byIdOf(nodes)
  const members = new Set<string>()
  nodes.forEach(n => { if (!n.parentId || !byId.has(n.parentId)) members.add(n.id) })
  if (spec.selfNodeId && byId.has(spec.selfNodeId)) {
    revealAncestors(nodes, spec.selfNodeId).forEach(id => members.add(id))
  }
  // 拉出者要等父级上轴才算数：沿树自上而下收敛，直到不再增加
  let grew = true
  while (grew) {
    grew = false
    for (const n of nodes) {
      if (members.has(n.id) || !spec.pulled.has(n.id)) continue
      if (n.parentId && members.has(n.parentId)) { members.add(n.id); grew = true }
    }
  }
  return members
}

/** 「收回」要移出拉出集合的 id：他本人 + 他下面所有被拉出的人 */
export function pulledSubtree(nodes: PeopleAxisNode[], id: string, pulled: Set<string>): Set<string> {
  const children = new Map<string, string[]>()
  nodes.forEach(n => {
    if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) || []), n.id])
  })
  const result = new Set<string>([id])
  const queue = [id]
  const seen = new Set<string>([id])
  while (queue.length) {
    const current = queue.pop()!
    for (const child of children.get(current) || []) {
      if (seen.has(child)) continue
      seen.add(child)
      queue.push(child)
      if (pulled.has(child)) result.add(child)
    }
  }
  return result
}

export const pulledStorageKey = (userId: number | string, projectId: number | string) => `axis-pulled:${userId}:${projectId}`

export function loadPulled(userId: number | string | null | undefined, projectId: number | string | null | undefined): Set<string> {
  if (userId == null || !projectId) return new Set()
  try {
    const raw = localStorage.getItem(pulledStorageKey(userId, projectId))
    const parsed: unknown = raw ? JSON.parse(raw) : []
    return new Set(Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [])
  } catch {
    return new Set()
  }
}

export function savePulled(
  userId: number | string | null | undefined,
  projectId: number | string | null | undefined,
  ids: Iterable<string>,
) {
  if (userId == null || !projectId) return
  try {
    localStorage.setItem(pulledStorageKey(userId, projectId), JSON.stringify([...ids]))
  } catch {
    // 本机存储不可用时拉出状态只在本次打开内有效
  }
}
