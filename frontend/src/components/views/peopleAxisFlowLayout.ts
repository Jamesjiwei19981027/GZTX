import { PeopleAxisNode } from '../../types'

export type AxisOrientation = 'horizontal' | 'vertical'
export interface AxisLayoutResult {
  positions: Map<string, { x: number; y: number }>
  roots: PeopleAxisNode[]
  levels: Map<string, number>
}

export const CARD_W = 240
export const CARD_H = 168

/** Depth follows the selected direction; peers share a tier. Reserve each
 * subtree's perpendicular span so reporting lines never imply sibling rank. */
export function computeAxisLayout(
  nodes: PeopleAxisNode[],
  orientation: AxisOrientation,
  expandedNodes: Record<string, boolean>,
): AxisLayoutResult {
  const horizontal = orientation === 'horizontal'
  const alongSize = horizontal ? CARD_W : CARD_H
  const crossSize = horizontal ? CARD_H : CARD_W
  const gap = 48
  const levelStep = alongSize + 88
  const positions = new Map<string, { x: number; y: number }>()
  const levels = new Map<string, number>()
  const children = new Map<string, PeopleAxisNode[]>()
  const ids = new Set(nodes.map(n => n.id))
  const roots: PeopleAxisNode[] = []
  for (const n of nodes) {
    if (n.parentId && ids.has(n.parentId)) {
      children.set(n.parentId, [...(children.get(n.parentId) || []), n])
    } else roots.push(n)
  }
  const sort = (a: PeopleAxisNode, b: PeopleAxisNode) => a.orderOnAxis - b.orderOnAxis || a.id.localeCompare(b.id)
  roots.sort(sort)
  children.forEach(list => list.sort(sort))
  const spans = new Map<string, number>()
  const measuring = new Set<string>()
  const measure = (n: PeopleAxisNode): number => {
    if (spans.has(n.id)) return spans.get(n.id)!
    if (measuring.has(n.id)) return crossSize
    measuring.add(n.id)
    const kids = expandedNodes[n.id] === false ? [] : children.get(n.id) || []
    const span = Math.max(crossSize, kids.reduce((sum, k) => sum + measure(k), 0) + Math.max(0, kids.length - 1) * gap)
    spans.set(n.id, span)
    measuring.delete(n.id)
    return span
  }
  roots.forEach(measure)
  const place = (n: PeopleAxisNode, start: number, depth: number) => {
    if (positions.has(n.id)) return
    const cross = start + measure(n) / 2
    const along = depth * levelStep
    levels.set(n.id, depth + 1)
    positions.set(n.id, {
      x: horizontal ? along : cross - CARD_W / 2,
      y: horizontal ? cross - CARD_H / 2 : along,
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
  return { positions, roots, levels }
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
