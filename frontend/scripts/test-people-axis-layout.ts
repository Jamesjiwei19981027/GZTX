/**
 * 人轴地铁布局算法（peopleAxisFlowLayout）单测：
 *   npx tsx scripts/test-people-axis-layout.ts
 */
import {
  computeAxisLayout,
  collectHiddenNodeIds,
  CARD_W,
  CARD_H,
} from '../src/components/views/peopleAxisFlowLayout'
import type { PeopleAxisNode, TeamMember } from '../src/types'

let passed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
  passed += 1
}

const person = (id: string): TeamMember => ({ id, name: id, role: 'r', avatar: '' })
const node = (id: string, parentId: string | undefined, orderOnAxis = 0): PeopleAxisNode => ({
  id,
  parentId,
  person: person(id),
  orderOnAxis,
  roleTitle: 'r',
  workItems: [],
})

// 树：head(主干0) - l1(主干1) - l2(主干2)；l1 下挂 c1、c2；c1 下挂 g1
const nodes = [
  node('head', undefined, 0),
  node('l1', undefined, 1),
  node('l2', undefined, 2),
  node('c1', 'l1'),
  node('c2', 'l1'),
  node('g1', 'c1'),
]

// --- 横向主轴 ---
const h = computeAxisLayout(nodes, 'horizontal', {}, 0)
assert(h.trunkOrder.join(',') === 'head,l1,l2', 'trunk order follows orderOnAxis')

const center = (id: string) => {
  const p = h.positions.get(id)!
  return { x: p.x + CARD_W / 2, y: p.y + CARD_H / 2 }
}
assert(center('head').x === 0 && center('head').y === 0, 'head sits on spine origin')
assert(center('l1').x > center('head').x && center('l2').x > center('l1').x, 'stations advance along X')
assert(center('l1').y < 0 !== center('l2').y < 0, 'stations alternate above/below the spine')
assert(h.spineCoord === 0, 'spine stays at coord 0')

// l1 的下属沿远离主轴方向外扩，孙辈更远
const l1Side = Math.sign(center('l1').y)
assert(Math.sign(center('c1').y) === l1Side && Math.abs(center('c1').y) > Math.abs(center('l1').y), 'children extend away from spine')
assert(Math.abs(center('g1').y) > Math.abs(center('c1').y), 'grandchildren extend further')
assert(center('c1').x !== center('c2').x && center('c1').y === center('c2').y, 'siblings spread along the axis')

// 终责在最后一站之后
const l2c = center('l2')
assert(h.terminusPosition.x + 100 > l2c.x, 'terminus sits past the last station')

// alongDelta 推移终责
const h2 = computeAxisLayout(nodes, 'horizontal', {}, 120)
assert(h2.terminusPosition.x - h.terminusPosition.x === 120, 'alongDelta shifts terminus along the axis')

// --- 纵向主轴 ---
const v = computeAxisLayout(nodes, 'vertical', {}, 0)
const vCenter = (id: string) => {
  const p = v.positions.get(id)!
  return { x: p.x + CARD_W / 2, y: p.y + CARD_H / 2 }
}
assert(vCenter('l1').y > vCenter('head').y && vCenter('l2').y > vCenter('l1').y, 'vertical stations advance along Y')
assert(vCenter('l1').x < 0 !== vCenter('l2').x < 0, 'vertical stations alternate left/right')

// --- 折叠隐藏 ---
const hiddenAll = collectHiddenNodeIds(nodes, { l1: false })
assert(hiddenAll.has('c1') && hiddenAll.has('c2') && hiddenAll.has('g1'), 'collapsing l1 hides entire subtree')
assert(!hiddenAll.has('l1') && !hiddenAll.has('head'), 'collapsed parent itself stays visible')
const hiddenLeaf = collectHiddenNodeIds(nodes, { c1: false })
assert(hiddenLeaf.has('g1') && !hiddenLeaf.has('c2'), 'collapsing c1 hides only its branch')

console.log(`people-axis metro layout: ${passed} assertions passed`)
