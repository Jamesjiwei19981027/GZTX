import type { PeopleAxisNode } from '../../types'

/** 默认展开层数：第 1 层根 + 第 2 层名额内直属下属 */
export const AXIS_DEFAULT_EXPANDED_LEVELS = 2

/** 第 2 层默认上轴名额（超过此名额的直属下属默认折叠） */
export const AXIS_DEFAULT_VISIBLE_PER_LEVEL = 5

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

const sortNodes = (a: PeopleAxisNode, b: PeopleAxisNode) =>
  (a.orderOnAxis ?? 0) - (b.orderOnAxis ?? 0) || a.id.localeCompare(b.id)

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

/**
 * 上轴人员计算规则（遵循折叠门槛）：
 * 1. 根人员是第 1 层，根的直属是第 2 层，第 3 层及以下默认折叠；
 * 2. 上轴人员 = 第 1 层全部 + 第 2 层默认名额内的人 + 拉出的人（父级须上轴）+ 当前用户所有上级；
 * 3. 第 2 层名额分配：常量 AXIS_DEFAULT_VISIBLE_PER_LEVEL (5)。
 *    多根时跨根合计。拉出的人和当前用户上级链上的人先占名额（本身永远上轴，超 5 也不折叠），
 *    剩余名额按现有显示顺序（根顺序，再按兄弟排序 sort_order/orderOnAxis、id）给其余第 2 层人员，排不上的折叠；
 * 4. 失效 id 一律忽略。
 */
export function axisMemberIds(nodes: PeopleAxisNode[], spec: AxisFoldSpec): Set<string> {
  const byId = byIdOf(nodes)
  const members = new Set<string>()

  // 1. 第 1 层：根人员全部上轴
  const roots: PeopleAxisNode[] = []
  for (const n of nodes) {
    if (!n.parentId || !byId.has(n.parentId)) {
      roots.push(n)
    }
  }
  roots.sort(sortNodes)
  for (const r of roots) {
    members.add(r.id)
  }

  // 2. 当前用户本人的所有上级永远上轴
  const selfAncestors = new Set<string>()
  if (spec.selfNodeId && byId.has(spec.selfNodeId)) {
    revealAncestors(nodes, spec.selfNodeId).forEach(id => {
      selfAncestors.add(id)
      members.add(id)
    })
  }

  // 3. 收集第 2 层人员（按多根顺序及兄弟排序）
  const childrenByParent = new Map<string, PeopleAxisNode[]>()
  for (const n of nodes) {
    if (n.parentId && byId.has(n.parentId)) {
      const list = childrenByParent.get(n.parentId)
      if (list) list.push(n)
      else childrenByParent.set(n.parentId, [n])
    }
  }
  for (const list of childrenByParent.values()) {
    list.sort(sortNodes)
  }

  const level2Nodes: PeopleAxisNode[] = []
  for (const root of roots) {
    const children = childrenByParent.get(root.id) || []
    for (const child of children) {
      level2Nodes.push(child)
    }
  }

  // 4. 分配第 2 层名额
  const level2PriorityIds = new Set<string>()
  for (const n of level2Nodes) {
    if (spec.pulled.has(n.id) || selfAncestors.has(n.id)) {
      level2PriorityIds.add(n.id)
      members.add(n.id)
    }
  }

  const remainingQuota = Math.max(0, AXIS_DEFAULT_VISIBLE_PER_LEVEL - level2PriorityIds.size)
  let granted = 0
  for (const n of level2Nodes) {
    if (level2PriorityIds.has(n.id)) continue
    if (granted < remainingQuota) {
      members.add(n.id)
      granted++
    }
  }

  // 5. 拉出者要等父级上轴才算数：沿树自上而下收敛，直到不再增加
  let grew = true
  while (grew) {
    grew = false
    for (const n of nodes) {
      if (members.has(n.id) || !spec.pulled.has(n.id)) continue
      if (n.parentId && members.has(n.parentId)) {
        members.add(n.id)
        grew = true
      }
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

/**
 * 判定当前所有可「收回」的人员 ID 集合。
 * 判定方法（覆盖 _fold-rules.txt，遵循 _fold-threshold.txt）：
 * 1. 根人员与当前用户上级链不提供「收回」；
 * 2. 只有收回后此人确实会离开人轴才显示：
 *    把他及 pulledSubtree 从拉出集合移除后重新计算上轴人员，他不再上轴才给「收回」；
 *    默认名额内的人不显示。
 */
export function computeReturnableIds(
  nodes: PeopleAxisNode[],
  spec: AxisFoldSpec,
  currentMembers?: Set<string>,
): Set<string> {
  const members = currentMembers || axisMemberIds(nodes, spec)
  const byId = byIdOf(nodes)
  const selfAncestors = spec.selfNodeId && byId.has(spec.selfNodeId)
    ? new Set(revealAncestors(nodes, spec.selfNodeId))
    : new Set<string>()

  const returnable = new Set<string>()
  for (const n of nodes) {
    if (!members.has(n.id)) continue
    if (!spec.pulled.has(n.id)) continue
    if (!n.parentId || !byId.has(n.parentId)) continue
    if (selfAncestors.has(n.id)) continue

    const subtree = pulledSubtree(nodes, n.id, spec.pulled)
    const nextPulled = new Set(spec.pulled)
    for (const subId of subtree) {
      nextPulled.delete(subId)
    }
    const nextMembers = axisMemberIds(nodes, { ...spec, pulled: nextPulled })
    if (!nextMembers.has(n.id)) {
      returnable.add(n.id)
    }
  }
  return returnable
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
