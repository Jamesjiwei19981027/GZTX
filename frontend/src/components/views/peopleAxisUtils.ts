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
export function floatingEdgePath(source: RectCoords, target: RectCoords): string {
  const from = borderAnchor(source, target.centerX, target.centerY)
  const to = borderAnchor(target, source.centerX, source.centerY)
  const dist = Math.hypot(to.x - from.x, to.y - from.y)
  const k = round2(Math.min(160, Math.max(28, dist * 0.42)))
  const [c1x, c1y] = controlPoint(from, k)
  const [c2x, c2y] = controlPoint(to, k)
  return `M ${from.x} ${from.y} C ${round2(c1x)} ${round2(c1y)}, ${round2(c2x)} ${round2(c2y)}, ${to.x} ${to.y}`
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
