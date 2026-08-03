import type { TreeNodeDTO } from '@/types/collab'

export type WorkTreeAxis = 'horizontal' | 'vertical'
export type WorkTreeSort = 'tree' | 'time'

export const CARD = { w: 196, h: 92 }
export const PREVIEW = { w: 148, h: 52 }
export const AXIS_STEP = 180
export const MIN_STATION_GAP = 168
export const PX_PER_DAY = 36
export const MIN_RANGE_DAYS = 28
export const SIDE_GAP = 132
export const PREVIEW_GAP = 58
export const PREVIEW_LIMIT = 6
export const PADDING = 300
export const BOUNDS_PAD = 100

export function isPerson(n: TreeNodeDTO): boolean {
  return n.node_type_key === 'person'
}

export function isMatter(n: TreeNodeDTO): boolean {
  const k = n.node_type_key
  return k === 'work_item' || k === 'milestone' || k === 'scope'
}

export function assigneeIds(n: TreeNodeDTO): number[] {
  return (n.assignees || []).map((a) => a.user_id)
}

export function isAssignedTo(n: TreeNodeDTO, userId: number | null | undefined): boolean {
  return userId != null && assigneeIds(n).includes(userId)
}

export function primaryAssignee(n: TreeNodeDTO) {
  const list = n.assignees || []
  if (!list.length) return null
  return list.find((a) => a.role_key === 'primary') || list[0]
}

export function displayAssigneeName(n: TreeNodeDTO): string {
  const a = primaryAssignee(n)
  if (!a) return '未指定负责人'
  return (
    a.display_name?.trim() ||
    a.nickname?.trim() ||
    a.username?.trim() ||
    `用户${a.user_id}`
  )
}

function parseTime(raw?: string | null): Date | null {
  if (!raw) return null
  const t = Date.parse(raw)
  return Number.isNaN(t) ? null : new Date(t)
}

export function nodeEventTime(n: TreeNodeDTO): Date | null {
  return (
    parseTime(n.milestone_at) ||
    parseTime(n.due_at) ||
    parseTime(n.start_at) ||
    parseTime(n.progress_json?.updated_at) ||
    null
  )
}

export function personAnchorTime(person: TreeNodeDTO, matters: TreeNodeDTO[]): Date | null {
  let best: Date | null = nodeEventTime(person)
  for (const m of matters) {
    const t = nodeEventTime(m)
    if (!t) continue
    if (!best || t < best) best = t
  }
  return best
}

export interface FlatPerson {
  node: TreeNodeDTO
  index: number
  children: TreeNodeDTO[]
}

export interface PlacedNode {
  node: TreeNodeDTO
  center: { x: number; y: number }
  side: number
  children: TreeNodeDTO[]
  isOrigin: boolean
}

export interface PreviewChild {
  node: TreeNodeDTO
  center: { x: number; y: number }
  overflowCount: number
  parentPersonId: number
}

export interface TimeMark {
  at: Date
  label: string
  nodeId: number
  onAxis?: { x: number; y: number }
}

export interface LayoutResult {
  placed: PlacedNode[]
  previews: PreviewChild[]
  axisStart: { x: number; y: number }
  axisEnd: { x: number; y: number }
  contentBounds: { x: number; y: number; w: number; h: number }
  originNodeId: number | null
  globalMarks: TimeMark[]
  focusNodeId: number | null
}

export function hasLeaderOnSpine(roots: TreeNodeDTO[], ownerUserId: number | null | undefined): boolean {
  if (ownerUserId == null) return false
  const walk = (n: TreeNodeDTO): boolean => {
    if (isPerson(n) && isAssignedTo(n, ownerUserId)) return true
    return (n.children || []).some(walk)
  }
  return roots.some(walk)
}

export function flattenPersons(
  roots: TreeNodeDTO[],
  sort: WorkTreeSort,
  finalOwnerUserId?: number | null,
): FlatPerson[] {
  const orderedRoots = [...roots]
  if (finalOwnerUserId != null) {
    orderedRoots.sort((a, b) => {
      const ao = isPerson(a) && isAssignedTo(a, finalOwnerUserId) ? 1 : 0
      const bo = isPerson(b) && isAssignedTo(b, finalOwnerUserId) ? 1 : 0
      if (ao !== bo) return ao - bo
      return a.id - b.id
    })
  }

  const persons: TreeNodeDTO[] = []
  const mattersOf = new Map<number, TreeNodeDTO[]>()

  const walk = (n: TreeNodeDTO) => {
    if (isPerson(n)) {
      persons.push(n)
      const matters: TreeNodeDTO[] = []
      for (const c of n.children || []) {
        if (isPerson(c)) walk(c)
        else matters.push(c)
      }
      mattersOf.set(n.id, matters)
    } else {
      for (const c of n.children || []) walk(c)
    }
  }
  for (const r of orderedRoots) walk(r)

  if (finalOwnerUserId != null && persons.length > 1) {
    const idx = persons.findIndex((p) => isAssignedTo(p, finalOwnerUserId))
    if (idx >= 0 && idx !== persons.length - 1) {
      const [owner] = persons.splice(idx, 1)
      persons.push(owner)
    }
  }

  let ordered = persons
  if (sort === 'time') {
    ordered = [...persons].sort((a, b) => {
      const ta = nodeEventTime(a)
      const tb = nodeEventTime(b)
      if (!ta && !tb) return a.id - b.id
      if (!ta) return 1
      if (!tb) return -1
      return ta.getTime() - tb.getTime()
    })
    if (finalOwnerUserId != null) {
      const idx = ordered.findIndex((p) => isAssignedTo(p, finalOwnerUserId))
      if (idx >= 0 && idx !== ordered.length - 1) {
        const [o] = ordered.splice(idx, 1)
        ordered.push(o)
      }
    }
  }

  return ordered.map((node, index) => ({
    node,
    index,
    children: mattersOf.get(node.id) || [],
  }))
}

function stationOffsets(
  times: (Date | null)[],
  rangeStart: Date,
  rangeEnd: Date,
): number[] {
  const n = times.length
  if (n === 0) return []
  if (n === 1) return [0]
  const spanMs = Math.max(1, rangeEnd.getTime() - rangeStart.getTime())
  const daySpan = Math.max(
    MIN_RANGE_DAYS,
    Math.abs((rangeEnd.getTime() - rangeStart.getTime()) / 86400000),
  )
  const axisLen = Math.max((n - 1) * MIN_STATION_GAP, daySpan * PX_PER_DAY)
  const offsets = times.map((t, i) => {
    if (!t) return (i / (n - 1)) * axisLen
    const u = Math.min(1, Math.max(0, (t.getTime() - rangeStart.getTime()) / spanMs))
    return u * axisLen
  })
  for (let i = 1; i < n; i++) {
    if (offsets[i] < offsets[i - 1] + MIN_STATION_GAP) {
      offsets[i] = offsets[i - 1] + MIN_STATION_GAP
    }
  }
  return offsets
}

export function computeLayout(opts: {
  roots: TreeNodeDTO[]
  axis: WorkTreeAxis
  sort: WorkTreeSort
  userId?: number | null
  lastNodeId?: number | null
  expandedNodeId?: number | null
  visibleLevels?: number
  finalOwnerUserId?: number | null
  /** PM 拖动终责后的额外轴向偏移（像素） */
  leaderAlongDelta?: number
}): LayoutResult {
  const {
    roots,
    axis,
    sort,
    userId = null,
    lastNodeId = null,
    expandedNodeId = null,
    visibleLevels = 8,
    finalOwnerUserId = null,
    leaderAlongDelta = 0,
  } = opts

  const flatAll = flattenPersons(roots, sort, finalOwnerUserId)
  const maxDepth = Math.max(0, visibleLevels - 1)
  const flat = flatAll.filter((f) => (f.node.depth ?? 0) <= maxDepth)

  let focusNodeId: number | null = null
  if (flat.length) {
    const mine = flat.find((f) => isAssignedTo(f.node, userId))
    if (mine) focusNodeId = mine.node.id
    else if (lastNodeId != null && flat.some((f) => f.node.id === lastNodeId)) {
      focusNodeId = lastNodeId
    } else focusNodeId = flat[0].node.id
  }

  if (!flat.length) {
    return {
      placed: [],
      previews: [],
      axisStart: { x: 0, y: 0 },
      axisEnd: { x: 400, y: 0 },
      contentBounds: { x: 0, y: 0, w: 400, h: 400 },
      originNodeId: null,
      globalMarks: [],
      focusNodeId: null,
    }
  }

  const rawMarks: TimeMark[] = []
  const collect = (n: TreeNodeDTO) => {
    if (n.node_type_key === 'milestone' || n.due_at || n.milestone_at) {
      const at = nodeEventTime(n)
      if (at) rawMarks.push({ at, label: n.title, nodeId: n.id })
    }
    for (const c of n.children || []) collect(c)
  }
  for (const r of roots) collect(r)

  const personTimes = flat.map((f) => personAnchorTime(f.node, f.children))
  const allTimes: Date[] = [
    ...rawMarks.map((m) => m.at),
    ...personTimes.filter((t): t is Date => t != null),
  ]
  let rangeStart: Date | undefined
  let rangeEnd: Date | undefined
  if (allTimes.length) {
    let minT = allTimes[0].getTime()
    let maxT = allTimes[0].getTime()
    for (const t of allTimes) {
      const ms = t.getTime()
      if (ms < minT) minT = ms
      if (ms > maxT) maxT = ms
    }
    if (maxT <= minT) maxT = minT + MIN_RANGE_DAYS * 86400000
    let spanDays = Math.abs((maxT - minT) / 86400000)
    if (spanDays < MIN_RANGE_DAYS) {
      const extra = Math.ceil((MIN_RANGE_DAYS - spanDays) / 2) * 86400000
      minT -= extra
      maxT += extra
    } else {
      const pad = Math.max(3, Math.floor(spanDays / 8)) * 86400000
      minT -= pad
      maxT += pad
    }
    rangeStart = new Date(minT)
    rangeEnd = new Date(maxT)
  }

  let baseOffsets =
    rangeStart && rangeEnd
      ? stationOffsets(personTimes, rangeStart, rangeEnd)
      : flat.map((_, i) => i * AXIS_STEP)

  let leaderId: number | null = null
  let leaderIndex = -1
  if (finalOwnerUserId != null) {
    for (let i = 0; i < flat.length; i++) {
      if (isAssignedTo(flat[i].node, finalOwnerUserId)) {
        leaderId = flat[i].node.id
        leaderIndex = i
        break
      }
    }
  }
  const offsets = [...baseOffsets]
  if (leaderId != null && leaderIndex >= 0) {
    let maxOther = 0
    for (let i = 0; i < offsets.length; i++) {
      if (i === leaderIndex) continue
      if (offsets[i] > maxOther) maxOther = offsets[i]
    }
    offsets[leaderIndex] = maxOther + MIN_STATION_GAP * 1.65 + Math.max(0, leaderAlongDelta)
  }

  const axisLen = offsets.length ? Math.max(...offsets) : AXIS_STEP
  let placed: PlacedNode[] = flat.map((f, i) => {
    const isLeader = leaderId != null && f.node.id === leaderId
    const along = offsets[i]
    let center: { x: number; y: number }
    if (isLeader) {
      center =
        axis === 'vertical'
          ? { x: PADDING, y: PADDING + along }
          : { x: PADDING + along, y: PADDING }
    } else {
      const side = i % 2 === 0 ? -1 : 1
      center =
        axis === 'vertical'
          ? { x: PADDING + (side < 0 ? -SIDE_GAP : SIDE_GAP), y: PADDING + along }
          : { x: PADDING + along, y: PADDING + (side < 0 ? -SIDE_GAP : SIDE_GAP) }
    }
    return {
      node: f.node,
      center,
      side: isLeader ? 0 : i % 2 === 0 ? -1 : 1,
      children: f.children,
      isOrigin: isLeader,
    }
  })

  const leaderPlaced = placed.find((p) => p.isOrigin) || null
  let axisStart =
    axis === 'vertical'
      ? { x: PADDING, y: PADDING - MIN_STATION_GAP * 0.45 }
      : { x: PADDING - MIN_STATION_GAP * 0.45, y: PADDING }
  let axisEnd = leaderPlaced
    ? axis === 'vertical'
      ? { x: PADDING, y: leaderPlaced.center.y }
      : { x: leaderPlaced.center.x, y: PADDING }
    : axis === 'vertical'
      ? { x: PADDING, y: PADDING + axisLen + MIN_STATION_GAP * 0.45 }
      : { x: PADDING + axisLen + MIN_STATION_GAP * 0.45, y: PADDING }

  const previews: PreviewChild[] = []
  for (const parent of placed) {
    const kids = parent.children
    if (!kids.length) continue
    const showAll = expandedNodeId === parent.node.id
    const visible = showAll ? kids.slice(0, PREVIEW_LIMIT) : kids.slice(0, 3)
    const overflow = Math.max(0, kids.length - visible.length)
    const outward = parent.side === 0 ? 1 : parent.side < 0 ? -1 : 1
    visible.forEach((node, i) => {
      const c =
        axis === 'vertical'
          ? {
              x: parent.center.x + outward * (SIDE_GAP + 20 + PREVIEW.w / 2),
              y: parent.center.y + (i - (visible.length - 1) / 2) * PREVIEW_GAP,
            }
          : {
              x: parent.center.x + (i - (visible.length - 1) / 2) * (PREVIEW.w + 10),
              y: parent.center.y + outward * (SIDE_GAP + 16 + PREVIEW.h / 2),
            }
      previews.push({
        node,
        center: c,
        overflowCount: i === visible.length - 1 ? overflow : 0,
        parentPersonId: parent.node.id,
      })
    })
  }

  let globalMarks: TimeMark[] = []
  if (rangeStart && rangeEnd && rawMarks.length) {
    const rs = rangeStart
    const re = rangeEnd
    const spanMs = Math.max(1, re.getTime() - rs.getTime())
    const drawLen =
      axis === 'vertical' ? axisEnd.y - axisStart.y : axisEnd.x - axisStart.x
    globalMarks = rawMarks.map((m) => {
      const u = Math.min(1, Math.max(0, (m.at.getTime() - rs.getTime()) / spanMs))
      const onAxis =
        axis === 'vertical'
          ? { x: axisStart.x, y: axisStart.y + drawLen * u }
          : { x: axisStart.x + drawLen * u, y: axisStart.y }
      return { ...m, onAxis }
    })
  }

  let minX = axisStart.x
  let minY = axisStart.y
  let maxX = axisEnd.x
  let maxY = axisEnd.y
  const expandBox = (c: { x: number; y: number }, w: number, h: number) => {
    minX = Math.min(minX, c.x - w / 2)
    maxX = Math.max(maxX, c.x + w / 2)
    minY = Math.min(minY, c.y - h / 2)
    maxY = Math.max(maxY, c.y + h / 2)
  }
  for (const p of placed) expandBox(p.center, CARD.w, CARD.h)
  for (const p of previews) expandBox(p.center, PREVIEW.w, PREVIEW.h)
  for (const m of globalMarks) {
    if (m.onAxis) expandBox(m.onAxis, 56, 36)
  }

  const raw = {
    x: minX - BOUNDS_PAD,
    y: minY - BOUNDS_PAD,
    w: maxX - minX + BOUNDS_PAD * 2,
    h: maxY - minY + BOUNDS_PAD * 2,
  }
  const shiftX = -raw.x
  const shiftY = -raw.y
  const shift = (c: { x: number; y: number }) => ({ x: c.x + shiftX, y: c.y + shiftY })

  placed = placed.map((p) => ({ ...p, center: shift(p.center) }))
  const shiftedPreviews = previews.map((p) => ({ ...p, center: shift(p.center) }))
  axisStart = shift(axisStart)
  axisEnd = shift(axisEnd)
  globalMarks = globalMarks.map((m) =>
    m.onAxis ? { ...m, onAxis: shift(m.onAxis) } : m,
  )

  return {
    placed,
    previews: shiftedPreviews,
    axisStart,
    axisEnd,
    contentBounds: { x: 0, y: 0, w: raw.w, h: raw.h },
    originNodeId: leaderId,
    globalMarks,
    focusNodeId,
  }
}
