import { PeopleAxisNode } from '../../types'
import { axisMemberIds, type AxisFoldSpec } from './peopleAxisFold'

export type AxisOrientation = 'horizontal' | 'vertical'

/** 折叠组里的一行：y 相对领导卡片顶部 */
export interface FoldedStackEntry {
  memberId: string
  y: number
  height: number
  expanded: boolean
}

export interface AxisLayoutResult {
  positions: Map<string, { x: number; y: number }>
  roots: PeopleAxisNode[]
  levels: Map<string, number>
  /** 领导 id -> 他卡片下方的折叠组（仅 fold 模式且组可见时才有） */
  stacks: Map<string, FoldedStackEntry[]>
  /** 每个上轴人员占的整块面积（卡片 + 折叠组） */
  footprints: Map<string, { width: number; height: number }>
}

export const CARD_W = 240
export const CARD_H = 168
export const FOLDED_ROW_H = 44
export const FOLDED_ROW_GAP = 6
export const FOLDED_STEM_H = 12

/** Depth follows the selected direction; peers share a tier. Reserve each
 * subtree's perpendicular span so reporting lines never imply sibling rank.
 * 传入 fold 时只布局上轴人员，其余直属下属折叠在领导卡片正下方并计入领导占位；
 * 省略 fold 时与折叠功能引入前完全一致。 */
export function computeAxisLayout(
  nodes: PeopleAxisNode[],
  orientation: AxisOrientation,
  expandedNodes: Record<string, boolean>,
  fold?: AxisFoldSpec,
): AxisLayoutResult {
  const horizontal = orientation === 'horizontal'
  const crossSize = horizontal ? CARD_H : CARD_W
  const gap = 48
  const levelGap = 88
  const positions = new Map<string, { x: number; y: number }>()
  const levels = new Map<string, number>()
  const stacks = new Map<string, FoldedStackEntry[]>()
  const footprints = new Map<string, { width: number; height: number }>()
  const sort = (a: PeopleAxisNode, b: PeopleAxisNode) => a.orderOnAxis - b.orderOnAxis || a.id.localeCompare(b.id)

  const memberIds = fold ? axisMemberIds(nodes, fold) : null
  const laid = memberIds ? nodes.filter(n => memberIds.has(n.id)) : nodes
  const children = new Map<string, PeopleAxisNode[]>()
  const foldedChildren = new Map<string, PeopleAxisNode[]>()
  const ids = new Set(laid.map(n => n.id))
  const roots: PeopleAxisNode[] = []
  for (const n of laid) {
    if (n.parentId && ids.has(n.parentId)) {
      children.set(n.parentId, [...(children.get(n.parentId) || []), n])
    } else roots.push(n)
  }
  if (memberIds) {
    for (const n of nodes) {
      if (!memberIds.has(n.id) && n.parentId && memberIds.has(n.parentId)) {
        foldedChildren.set(n.parentId, [...(foldedChildren.get(n.parentId) || []), n])
      }
    }
  }
  roots.sort(sort)
  children.forEach(list => list.sort(sort))
  foldedChildren.forEach(list => list.sort(sort))

  const stackOf = (n: PeopleAxisNode): FoldedStackEntry[] => {
    if (!fold || expandedNodes[n.id] === false) return []
    let y = CARD_H + FOLDED_STEM_H
    return (foldedChildren.get(n.id) || []).map(member => {
      const expanded = fold.expandedRows.has(member.id)
      const entry = { memberId: member.id, y, height: expanded ? CARD_H : FOLDED_ROW_H, expanded }
      y += entry.height + FOLDED_ROW_GAP
      return entry
    })
  }
  const footprintHeight = (n: PeopleAxisNode): number => {
    const stack = stackOf(n)
    if (stack.length === 0) return CARD_H
    const last = stack[stack.length - 1]
    return last.y + last.height
  }
  // 沿主轴方向每一层按最高的足迹留位，折叠组展开后不会压到下一层
  const alongOf = (n: PeopleAxisNode) => horizontal ? CARD_W : footprintHeight(n)
  const crossOf = (n: PeopleAxisNode) => horizontal ? footprintHeight(n) : CARD_W

  const levelAlong: number[] = []
  const visited = new Set<string>()
  const survey = (n: PeopleAxisNode, depth: number) => {
    if (visited.has(n.id)) return
    visited.add(n.id)
    levelAlong[depth] = Math.max(levelAlong[depth] || 0, alongOf(n))
    if (expandedNodes[n.id] === false) return
    ;(children.get(n.id) || []).forEach(k => survey(k, depth + 1))
  }
  roots.forEach(n => survey(n, 0))
  const alongStart: number[] = []
  levelAlong.forEach((size, depth) => {
    alongStart[depth] = depth === 0 ? 0 : alongStart[depth - 1] + levelAlong[depth - 1] + levelGap
  })

  const spans = new Map<string, number>()
  const measuring = new Set<string>()
  const measure = (n: PeopleAxisNode): number => {
    if (spans.has(n.id)) return spans.get(n.id)!
    if (measuring.has(n.id)) return crossSize
    measuring.add(n.id)
    const kids = expandedNodes[n.id] === false ? [] : children.get(n.id) || []
    const span = Math.max(crossOf(n), kids.reduce((sum, k) => sum + measure(k), 0) + Math.max(0, kids.length - 1) * gap)
    spans.set(n.id, span)
    measuring.delete(n.id)
    return span
  }
  roots.forEach(measure)
  const place = (n: PeopleAxisNode, start: number, depth: number) => {
    if (positions.has(n.id)) return
    const cross = start + measure(n) / 2
    const along = alongStart[depth] ?? 0
    const height = footprintHeight(n)
    levels.set(n.id, depth + 1)
    footprints.set(n.id, { width: CARD_W, height })
    const stack = stackOf(n)
    if (stack.length) stacks.set(n.id, stack)
    positions.set(n.id, {
      x: horizontal ? along : cross - CARD_W / 2,
      y: horizontal ? cross - height / 2 : along,
    })
    if (expandedNodes[n.id] === false) return
    const kids = children.get(n.id) || []
    const total = kids.reduce((sum, k) => sum + measure(k), 0) + Math.max(0, kids.length - 1) * gap
    let cursor = start + (measure(n) - total) / 2
    kids.forEach(k => { place(k, cursor, depth + 1); cursor += measure(k) + gap })
  }
  let cursor = 0
  roots.forEach(n => {
    const rootSpan = measure(n)
    place(n, cursor, 0)
    cursor += rootSpan + gap * 2
  })
  return { positions, roots, levels, stacks, footprints }
}

export function collectHiddenNodeIds(nodes: PeopleAxisNode[], expandedNodes: Record<string, boolean>): Set<string> {
  const hidden = new Set<string>()
  const children = new Map<string, string[]>()
  nodes.forEach(n => {
    if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) || []), n.id])
  })
  const hide = (id: string) => {
    for (const child of children.get(id) || []) {
      if (hidden.has(child)) continue
      hidden.add(child)
      hide(child)
    }
  }
  nodes.forEach(n => { if (expandedNodes[n.id] === false) hide(n.id) })
  return hidden
}

/** A presentation scope, never an authorization decision. Keep ancestors for
 * reporting context and descendants for delegated responsibility. */
export function responsibilityScope(nodes: PeopleAxisNode[], owned: Set<string> | null, userId: number | null) {
  const byId = new Map(nodes.map(n => [n.id, n]))
  const direct = new Set(nodes.filter(n => owned
    ? owned.has(n.id) || n.workItems.some(item => owned.has(item.id))
    : userId != null && n.ownerUserIds?.includes(userId)).map(n => n.id))
  const children = new Map<string, string[]>()
  nodes.forEach(n => { if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) || []), n.id]) })
  const mine = new Set<string>()
  const queue = [...direct]
  while (queue.length) {
    const id = queue.pop()!
    if (mine.has(id)) continue
    mine.add(id)
    queue.push(...(children.get(id) || []))
  }
  const visible = new Set(mine)
  direct.forEach(id => {
    let parent = byId.get(id)?.parentId
    const visited = new Set<string>([id])
    while (parent && byId.has(parent) && !visited.has(parent)) {
      visited.add(parent); visible.add(parent); parent = byId.get(parent)?.parentId
    }
  })
  return { direct, mine, visible }
}
