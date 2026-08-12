import { PeopleAxisNode } from '../../types'

/**
 * 人轴地铁布局：把责任树映射为 React Flow 的绝对坐标。
 *
 * - 主干（parentId 为空）是地铁线：总指挥在起点，其余领导沿轴分列两侧交错；
 * - 下属从领导出发，沿垂直于主轴的方向逐级外扩；
 * - 终责（Terminus）钉在主轴末端，可用 alongDelta 沿轴向偏移。
 *
 * 返回的是"基准位置"。用户拖拽产生的偏移（dragOffsets）由调用方叠加，
 * 这样重置布局 = 清空偏移即可回到基准。
 */

export type AxisOrientation = 'horizontal' | 'vertical'

export interface AxisLayoutResult {
  /** nodeId -> 基准 top-left 位置 */
  positions: Map<string, { x: number; y: number }>
  /** 主干节点 id，按轴序排列（首位是总指挥） */
  trunkOrder: string[]
  /** 终责节点（虚拟站点）的 top-left 位置 */
  terminusPosition: { x: number; y: number }
  /** 主轴线所在的横/纵坐标（flow 坐标系），横向主轴时为 y，纵向时为 x */
  spineCoord: number
}

export const CARD_W = 350
export const CARD_H = 250
export const TERMINUS_W = 200
export const TERMINUS_H = 76

const GAP_ALONG_H = 500
const GAP_ALONG_V = 430
const GAP_PERP = 400
const CHILD_STEP = 440
const CHILD_SPREAD_H = 390
const CHILD_SPREAD_V = 300
const TERMINUS_GAP = 320

export function computeAxisLayout(
  nodes: PeopleAxisNode[],
  orientation: AxisOrientation,
  expandedNodes: Record<string, boolean>,
  alongDelta: number,
): AxisLayoutResult {
  const positions = new Map<string, { x: number; y: number }>()
  const trunk = nodes
    .filter((n) => !n.parentId)
    .sort((a, b) => a.orderOnAxis - b.orderOnAxis)
  const trunkOrder = trunk.map((n) => n.id)
  const childrenOf = (parentId: string) => nodes.filter((n) => n.parentId === parentId)

  const setCenter = (id: string, cx: number, cy: number) => {
    positions.set(id, { x: cx - CARD_W / 2, y: cy - CARD_H / 2 })
  }

  /** 递归放置某个节点的下属：沿垂直主轴方向外扩一层，兄弟沿主轴方向铺开 */
  const layoutChildren = (
    parentId: string,
    pcx: number,
    pcy: number,
    dir: 1 | -1,
  ) => {
    if (expandedNodes[parentId] === false) return
    const kids = childrenOf(parentId)
    kids.forEach((kid, idx) => {
      const spread = (idx - (kids.length - 1) / 2)
      let cx: number
      let cy: number
      if (orientation === 'horizontal') {
        cx = pcx + spread * CHILD_SPREAD_H
        cy = pcy + dir * CHILD_STEP
      } else {
        cx = pcx + dir * CHILD_STEP
        cy = pcy + spread * CHILD_SPREAD_V
      }
      setCenter(kid.id, cx, cy)
      layoutChildren(kid.id, cx, cy, dir)
    })
  }

  let lastAlong = 0
  trunk.forEach((leader, i) => {
    const along = i * (orientation === 'horizontal' ? GAP_ALONG_H : GAP_ALONG_V)
    lastAlong = along
    // 总指挥骑在主轴上；其余领导交错分列两侧
    const side: 1 | -1 = i === 0 ? 1 : i % 2 === 1 ? -1 : 1
    const perp = i === 0 ? 0 : side * GAP_PERP
    const cx = orientation === 'horizontal' ? along : perp
    const cy = orientation === 'horizontal' ? perp : along
    setCenter(leader.id, cx, cy)
    // 下属继续向远离主轴的方向外扩；总指挥的下属挂向正方向一侧
    layoutChildren(leader.id, cx, cy, i === 0 ? 1 : side)
  })

  const terminusAlong = lastAlong + TERMINUS_GAP + alongDelta
  const terminusPosition =
    orientation === 'horizontal'
      ? { x: terminusAlong - TERMINUS_W / 2, y: -TERMINUS_H / 2 }
      : { x: -TERMINUS_W / 2, y: terminusAlong - TERMINUS_H / 2 }

  return { positions, trunkOrder, terminusPosition, spineCoord: 0 }
}

/** 折叠状态下需要隐藏的节点集合（父节点收起时整棵子树都不显示） */
export function collectHiddenNodeIds(
  nodes: PeopleAxisNode[],
  expandedNodes: Record<string, boolean>,
): Set<string> {
  const hidden = new Set<string>()
  const childrenOf = (parentId: string) => nodes.filter((n) => n.parentId === parentId)
  const hideSubtree = (id: string) => {
    childrenOf(id).forEach((kid) => {
      hidden.add(kid.id)
      hideSubtree(kid.id)
    })
  }
  nodes.forEach((n) => {
    if (expandedNodes[n.id] === false) hideSubtree(n.id)
  })
  return hidden
}
