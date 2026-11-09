import type { Status, PeopleAxisNode, Language } from '../../types'

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

/** Check if targetId is an existing descendant of ancestorId. */
export function isDescendantNode(nodes: PeopleAxisNode[], ancestorId: string, targetId: string): boolean {
  if (ancestorId === targetId) return true
  const directChildren = nodes.filter(n => n.parentId === ancestorId)
  return directChildren.some(child => isDescendantNode(nodes, child.id, targetId))
}

/** 1-based depth from root (root = 1). */
export function nodeDepth(nodes: PeopleAxisNode[], id: string): number {
  const byId = new Map(nodes.map(n => [n.id, n]))
  let depth = 1
  let current = byId.get(id)
  const visited = new Set<string>()
  while (current?.parentId && byId.has(current.parentId) && !visited.has(current.parentId)) {
    depth++
    visited.add(current.id)
    current = byId.get(current.parentId)
  }
  return depth
}

/** Personnel height of node's subtree (leaf = 1). */
export function nodeSubtreeHeight(nodes: PeopleAxisNode[], id: string): number {
  const childrenMap = new Map<string, string[]>()
  nodes.forEach(n => {
    if (n.parentId) {
      childrenMap.set(n.parentId, [...(childrenMap.get(n.parentId) || []), n.id])
    }
  })
  const visited = new Set<string>()
  function height(curId: string): number {
    if (visited.has(curId)) return 1
    visited.add(curId)
    const kids = childrenMap.get(curId) || []
    if (kids.length === 0) return 1
    return 1 + Math.max(...kids.map(k => height(k)))
  }
  return height(id)
}

export interface ReparentVerdictResult {
  ok: boolean
  reason: string
}

/**
 * Validate reparenting drop according to CARD-SPEC §3 rules.
 * Returns null if sourceId === targetId or node not found.
 */
export function reparentVerdict(
  nodes: PeopleAxisNode[],
  sourceId: string,
  targetId: string,
  opts: {
    canRelink: (id: string) => boolean
    lang?: Language
    finalOwnerNodeId?: string | null
  },
): ReparentVerdictResult | null {
  if (sourceId === targetId) return null
  const lang = opts.lang || 'zh'
  const byId = new Map(nodes.map(n => [n.id, n]))
  const src = byId.get(sourceId)
  const tgt = byId.get(targetId)
  if (!src || !tgt) return null

  // 1. 拖的是项目终责人 →「终责人不能挂到别人下面」
  const isTerminal = Boolean(
    (src as any).isTerminal ||
    src.isTerminalPM ||
    (opts.finalOwnerNodeId && src.id === opts.finalOwnerNodeId),
  )
  if (isTerminal) {
    return {
      ok: false,
      reason: lang === 'zh' ? '终责人不能挂到别人下面' : 'Final owner cannot be moved under another person',
    }
  }

  // 2. 目标就是当前上级 →「已经是他的上级」
  if (src.parentId === targetId) {
    return {
      ok: false,
      reason: lang === 'zh' ? '已经是他的上级' : 'Already their direct manager',
    }
  }

  // 3. 目标是自己的后代 →「不能挂到自己的下属下面」
  if (isDescendantNode(nodes, sourceId, targetId)) {
    return {
      ok: false,
      reason: lang === 'zh' ? '不能挂到自己的下属下面' : 'Cannot be placed under direct or indirect subordinates',
    }
  }

  // 4. 目标层级 + 被拖子树人员高度 > 4 →「人员最多四层」
  const tgtDepth = nodeDepth(nodes, targetId)
  const srcHeight = nodeSubtreeHeight(nodes, sourceId)
  if (tgtDepth + srcHeight > 4) {
    return {
      ok: false,
      reason: lang === 'zh' ? '人员最多四层' : 'People axis supports up to 4 levels',
    }
  }

  // 5. 被拖节点 node_origin=='project' 且目标 node_origin=='subordinate' →「项目成员不能挂到下级自建人员下面」
  const srcOrigin = src.nodeOrigin || 'project'
  const tgtOrigin = tgt.nodeOrigin || 'project'
  if (srcOrigin === 'project' && tgtOrigin === 'subordinate') {
    return {
      ok: false,
      reason: lang === 'zh' ? '项目成员不能挂到下级自建人员下面' : 'Project members cannot be assigned under self-added personnel',
    }
  }

  // 6. 当前用户对源或目标无权限 →「没有权限调整此人的上级」
  if (!opts.canRelink(sourceId) || !opts.canRelink(targetId)) {
    return {
      ok: false,
      reason: lang === 'zh' ? '没有权限调整此人的上级' : 'No permission to change manager for this person',
    }
  }

  return {
    ok: true,
    reason: lang === 'zh' ? `松手设为「${tgt.person.name}」的下属` : `Release to set as subordinate of ${tgt.person.name}`,
  }
}

export interface CanvasCenterTargetNode {
  id: string
  parentId?: string | null
  isTerminal?: boolean
  isMine?: boolean
  position: { x: number; y: number }
}

/**
 * 计算进入画布或切换方向时的默认中心坐标。
 * 规则严格按 MOBILE-SPEC 第 3 节：
 * 优先以"我"（当前用户为 primary 责任人的节点）为中心；
 * 找不到"我"则以根节点为中心；
 * 均找不到则回退原点中心。
 */
export function calculateCanvasDefaultCenter(
  nodes: CanvasCenterTargetNode[],
  cardWidth = 240,
  cardHeight = 168,
): { x: number; y: number } {
  if (!nodes || nodes.length === 0) {
    return { x: cardWidth / 2, y: cardHeight / 2 }
  }
  const mine = nodes.find(n => Boolean(n.isMine))
  if (mine && mine.position) {
    return {
      x: mine.position.x + cardWidth / 2,
      y: mine.position.y + cardHeight / 2,
    }
  }
  const root = nodes.find(n => !n.parentId || Boolean(n.isTerminal)) ?? nodes[0]
  if (root && root.position) {
    return {
      x: root.position.x + cardWidth / 2,
      y: root.position.y + cardHeight / 2,
    }
  }
  return { x: cardWidth / 2, y: cardHeight / 2 }
}

/** 某节点的全部后代 id（改上级防环用；放在纯工具文件里，脚本测试不必加载界面与样式） */
export function getDescendantNodeIds(nodeId: string, nodes: PeopleAxisNode[]): Set<string> {
  const descendants = new Set<string>();
  const queue = [nodeId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const n of nodes) {
      if (n.parentId === current && !descendants.has(n.id)) {
        descendants.add(n.id);
        queue.push(n.id);
      }
    }
  }
  return descendants;
}

/* ───────── 树序 / 时间序 ───────── */

export type AxisOrderMode = 'tree' | 'time'

/** 一位负责人名下最早的未完成事项日期（YYYY-MM-DD）；没有日期返回 null。 */
export function earliestOpenDueDate(node: PeopleAxisNode): string | null {
  let best: string | null = null
  for (const item of node.workItems) {
    if (item.status === 'Done') continue
    const m = (item.dueDate || '').match(/^\d{4}-\d{2}-\d{2}/)
    if (m && (best === null || m[0] < best)) best = m[0]
  }
  return best
}

/**
 * 时间序：同一上级下的下属，按各自最早未完成事项的日期从早到晚排列，
 * 没有日期的排在最后；日期相同时保持原来的树序，保证结果稳定。
 * 只改 orderOnAxis（同级内的次序），不改上下级关系。
 */
export function applyTimeOrder(nodes: PeopleAxisNode[]): PeopleAxisNode[] {
  const groups = new Map<string, PeopleAxisNode[]>()
  for (const n of nodes) {
    const key = n.parentId ?? '__root__'
    groups.set(key, [...(groups.get(key) || []), n])
  }
  const rank = new Map<string, number>()
  groups.forEach(list => {
    const sorted = [...list].sort((a, b) => {
      const da = earliestOpenDueDate(a)
      const db = earliestOpenDueDate(b)
      if (da !== db) {
        if (da === null) return 1
        if (db === null) return -1
        return da < db ? -1 : 1
      }
      return a.orderOnAxis - b.orderOnAxis || a.id.localeCompare(b.id)
    })
    sorted.forEach((n, i) => rank.set(n.id, i))
  })
  return nodes.map(n => ({ ...n, orderOnAxis: rank.get(n.id) ?? n.orderOnAxis }))
}

/**
 * 松手时的换上级判定：已经停留够久算出了判定就直接用；
 * 还没停够 300 毫秒就松手、但鼠标正好压在别人卡片上时，现场补算一次，
 * 否则快速拖放永远触发不了换上级。
 */
export function resolveReleaseVerdict<V>(
  decided: { targetId: string; verdict: V } | null,
  hoverTargetId: string | null,
  compute: (targetId: string) => V | null,
): { targetId: string; verdict: V } | null {
  if (decided) return decided
  if (!hoverTargetId) return null
  const verdict = compute(hoverTargetId)
  return verdict ? { targetId: hoverTargetId, verdict } : null
}
