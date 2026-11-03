import type { Status } from '../../types'

type ProgressItem = {
  progress?: number
  status: Status
}

type ProgressNode = {
  workItems: ProgressItem[]
}

export interface RectCoords {
  left: number
  right: number
  top: number
  bottom: number
  width: number
  height: number
  centerX: number
  centerY: number
}

export type RectSide = 'left' | 'right' | 'top' | 'bottom'

export interface BorderAnchor {
  x: number
  y: number
  side: RectSide
}

const round2 = (n: number) => Math.round(n * 100) / 100

/**
 * Floating anchor (draw.io style): the point where the ray shot from the rect
 * center toward (tx, ty) crosses the rect border. As the other node moves the
 * anchor slides continuously along the border, so edges always "grow" out of
 * the card edge facing the peer instead of a fixed midpoint.
 */
export function borderAnchor(rect: RectCoords, tx: number, ty: number): BorderAnchor {
  const dx = tx - rect.centerX
  const dy = ty - rect.centerY
  const hw = rect.width / 2
  const hh = rect.height / 2
  if (dx === 0 && dy === 0) {
    return { x: round2(rect.right), y: round2(rect.centerY), side: 'right' }
  }
  const scaleX = dx !== 0 ? hw / Math.abs(dx) : Number.POSITIVE_INFINITY
  const scaleY = dy !== 0 ? hh / Math.abs(dy) : Number.POSITIVE_INFINITY
  const t = Math.min(scaleX, scaleY)
  const side: RectSide = scaleX <= scaleY ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'bottom' : 'top')
  return {
    x: round2(rect.centerX + dx * t),
    y: round2(rect.centerY + dy * t),
    side,
  }
}

function controlPoint(anchor: BorderAnchor, k: number): [number, number] {
  switch (anchor.side) {
    case 'right':
      return [anchor.x + k, anchor.y]
    case 'left':
      return [anchor.x - k, anchor.y]
    case 'bottom':
      return [anchor.x, anchor.y + k]
    case 'top':
      return [anchor.x, anchor.y - k]
  }
}

/**
 * Smooth cubic bezier between two cards. Both endpoints sit on the card
 * borders (floating anchors) and the curve leaves each card perpendicular to
 * the side it attaches to, so dragging either card keeps the edge glued and
 * curved without jumps.
 */
export function floatingEdgePath(source: RectCoords, target: RectCoords, sourceAnchor?: BorderAnchor): string {
  const from = sourceAnchor || borderAnchor(source, target.centerX, target.centerY)
  const to = borderAnchor(target, sourceAnchor?.x ?? source.centerX, sourceAnchor?.y ?? source.centerY)
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const k = round2(Math.min(160, Math.max(28, dist * 0.42)))
  const [c1x, c1y] = controlPoint(from, k)
  const [c2x, c2y] = controlPoint(to, k)
  return `M ${from.x} ${from.y} C ${round2(c1x)} ${round2(c1y)}, ${round2(c2x)} ${round2(c2y)}, ${to.x} ${to.y}`
}

/** Straight segment between the same floating card anchors used by curves. */
export function straightEdgePath(source: RectCoords, target: RectCoords): string {
  const from = borderAnchor(source, target.centerX, target.centerY)
  const to = borderAnchor(target, source.centerX, source.centerY)
  return `M ${from.x} ${from.y} L ${to.x} ${to.y}`
}

export function branchEdgeId(parentId: string, childId: string): string {
  // Keep the existing public id contract: branch ids are keyed by child id.
  void parentId
  return `branch-${childId}`
}

export function highlightEdgeIds(nodes: { id: string; parentId: string | null | undefined }[], focusId: string | null): Set<string> {
  const result = new Set<string>()
  if (!focusId) return result
  const byId = new Map(nodes.map(node => [node.id, node]))
  let current = byId.get(focusId)
  while (current?.parentId && byId.has(current.parentId)) {
    result.add(branchEdgeId(current.parentId, current.id))
    current = byId.get(current.parentId)
  }
  for (const node of nodes) {
    if (node.parentId === focusId) result.add(branchEdgeId(focusId, node.id))
  }
  return result
}

export function snapToParentAxis(
  childPos: { x: number; y: number },
  cardSize: { width: number; height: number },
  parentPos: { x: number; y: number },
  orientation: 'horizontal' | 'vertical',
  threshold = 16,
): { pos: { x: number; y: number }; snapped: boolean; guide: { from: { x: number; y: number }; to: { x: number; y: number } } | null } {
  const childCenter = { x: childPos.x + cardSize.width / 2, y: childPos.y + cardSize.height / 2 }
  const parentCenter = { x: parentPos.x + cardSize.width / 2, y: parentPos.y + cardSize.height / 2 }
  const delta = orientation === 'horizontal' ? childCenter.y - parentCenter.y : childCenter.x - parentCenter.x
  if (Math.abs(delta) >= threshold) return { pos: childPos, snapped: false, guide: null }
  const pos = orientation === 'horizontal'
    ? { x: childPos.x, y: parentPos.y }
    : { x: parentPos.x, y: childPos.y }
  const guide = orientation === 'horizontal'
    ? { from: { x: parentCenter.x, y: parentCenter.y }, to: { x: childCenter.x, y: parentCenter.y } }
    : { from: { x: parentCenter.x, y: parentCenter.y }, to: { x: parentCenter.x, y: childCenter.y } }
  return { pos, snapped: true, guide }
}

/** A shared, separate port faces the visible subordinate group as it moves. */
export function subordinatePortAnchor(source: RectCoords, targets: RectCoords[], orientation: 'horizontal' | 'vertical'): BorderAnchor {
  const tx = targets.length ? targets.reduce((sum, t) => sum + t.centerX, 0) / targets.length
    : source.centerX + (orientation === 'horizontal' ? source.width : 0)
  const ty = targets.length ? targets.reduce((sum, t) => sum + t.centerY, 0) / targets.length
    : source.centerY + (orientation === 'vertical' ? source.height : 0)
  const anchor = borderAnchor(source, tx, ty)
  const {width: w, height: h, left, right, top, bottom} = source
  // Offset along the perimeter, wrapping corners continuously instead of
  // clamping each side independently and jumping when the facing side changes.
  const distance = anchor.side === 'top' ? anchor.x - left
    : anchor.side === 'right' ? w + anchor.y - top
    : anchor.side === 'bottom' ? w + h + right - anchor.x
    : 2 * w + h + bottom - anchor.y
  const perimeter = 2 * (w + h)
  if (!perimeter) return anchor
  const p = (distance + 32) % perimeter
  if (p < w) return {x:round2(left+p), y:top, side:'top'}
  if (p < w+h) return {x:right, y:round2(top+p-w), side:'right'}
  if (p < 2*w+h) return {x:round2(right-p+w+h), y:bottom, side:'bottom'}
  return {x:left, y:round2(bottom-p+2*w+h), side:'left'}
}

/** Return the real average progress for a people-axis tree. */
export function averagePeopleAxisProgress(nodes: ProgressNode[]): number {
  let total = 0
  let count = 0
  for (const node of nodes) {
    for (const item of node.workItems) {
      total += item.progress ?? (item.status === 'Done' ? 100 : item.status === 'In Progress' ? 50 : 0)
      count += 1
    }
  }
  return count > 0 ? Math.round(total / count) : 0
}
