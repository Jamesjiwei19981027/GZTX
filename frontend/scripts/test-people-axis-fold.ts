/**
 * 人轴「下属默认折叠」纯逻辑单测（peopleAxisFold + computeAxisLayout 的 fold 模式）：
 *   npx tsx scripts/test-people-axis-fold.ts
 */
import {
  axisMemberIds, revealAncestors, pulledSubtree, loadPulled, savePulled, pulledStorageKey,
  type AxisFoldSpec,
} from '../src/components/views/peopleAxisFold'
import {
  computeAxisLayout, CARD_W, CARD_H, FOLDED_ROW_H, FOLDED_ROW_GAP, FOLDED_STEM_H,
} from '../src/components/views/peopleAxisFlowLayout'
import type { PeopleAxisNode } from '../src/types'

let passed = 0
function assert(cond: boolean, msg: string) {
  if (!cond) {
    console.error(`FAIL: ${msg}`)
    process.exit(1)
  }
  passed += 1
}
const same = (a: Iterable<string>, b: string[]) => [...a].sort().join(',') === [...b].sort().join(',')

const node = (id: string, parentId: string | undefined, orderOnAxis = 0): PeopleAxisNode => ({
  id, parentId, person: { id, name: id, role: 'r', avatar: '' }, orderOnAxis, roleTitle: 'r', workItems: [],
})
const spec = (pulled: string[] = [], rows: string[] = [], selfNodeId: string | null = null): AxisFoldSpec =>
  ({ pulled: new Set(pulled), expandedRows: new Set(rows), selfNodeId })

//        R
//      / | \
//     A  B  C
//    /\  |
//  A1 A2 B1
//  |
//  A1a
const tree = [
  node('R', undefined), node('A', 'R', 1), node('B', 'R', 2), node('C', 'R', 3),
  node('A1', 'A', 0), node('A2', 'A', 1), node('B1', 'B', 0), node('A1a', 'A1', 0),
]

// ---- revealAncestors ----
assert(revealAncestors(tree, 'A1a').join(',') === 'A1,A,R', 'revealAncestors: 从近到远列出全部上级')
assert(revealAncestors(tree, 'R').length === 0, 'revealAncestors: 根没有上级')
assert(revealAncestors(tree, 'nope').length === 0, 'revealAncestors: 不存在的 id 返回空')
const loop = [node('X', 'Y'), node('Y', 'X')]
assert(revealAncestors(loop, 'X').join(',') === 'Y', 'revealAncestors: 有环时不死循环')

// ---- axisMemberIds ----
assert(same(axisMemberIds(tree, spec()), ['R']), '默认只有根上轴')
assert(same(axisMemberIds(tree, spec([], [], 'A2')), ['R', 'A']), '本人的所有上级默认上轴，本人折叠')
assert(same(axisMemberIds(tree, spec([], [], 'R')), ['R']), '本人是根时没有额外上轴人员')
assert(same(axisMemberIds(tree, spec(['A'])), ['R', 'A']), '被拉出的人上轴')
assert(same(axisMemberIds(tree, spec(['A1a'])), ['R']), '父级没上轴的拉出者先忽略')
assert(same(axisMemberIds(tree, spec(['A1a', 'A1', 'A'])), ['R', 'A', 'A1', 'A1a']), '整条链都拉出后逐级上轴，与集合顺序无关')
assert(same(axisMemberIds(tree, spec(['ghost', 'A'])), ['R', 'A']), '失效 id 直接忽略')
assert(same(axisMemberIds(tree, spec([], [], 'ghost')), ['R']), '本人节点已不存在时直接忽略')
assert(same(axisMemberIds(tree, spec(['R'])), ['R']), '拉出集合里有根不会重复也不报错')
assert(axisMemberIds(loop, spec(['X', 'Y'])).size === 0, '全是环时不死循环')
const orphanTree = [node('R', undefined), node('Z', 'deleted-parent')]
assert(same(axisMemberIds(orphanTree, spec()), ['R', 'Z']), '父级不在当前节点集里的人按根处理')

// ---- pulledSubtree ----
const pulledAll = new Set(['A', 'A1', 'A1a', 'B'])
assert(same(pulledSubtree(tree, 'A', pulledAll), ['A', 'A1', 'A1a']), '收回连同下面所有被拉出的人')
assert(same(pulledSubtree(tree, 'A1', pulledAll), ['A1', 'A1a']), '收回只影响自己的子树')
assert(same(pulledSubtree(tree, 'A', new Set(['A', 'A1a'])), ['A', 'A1a']), '下面隔着未拉出的人也要一并移出')
assert(same(pulledSubtree(tree, 'A', new Set(['A', 'B'])), ['A']), '别的分支不受影响')
assert(pulledSubtree(loop, 'X', new Set(['X', 'Y'])).size === 2, '有环时不死循环')

// ---- 本机存取 ----
const store = new Map<string, string>()
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
  setItem: (k: string, v: string) => { store.set(k, v) },
}
assert(pulledStorageKey(7, 3) === 'axis-pulled:7:3', '存储键为 axis-pulled:<用户>:<项目>')
assert(loadPulled(7, 3).size === 0, '没存过时读出空集合')
savePulled(7, 3, ['A', 'B'])
assert(store.get('axis-pulled:7:3') === '["A","B"]', '保存为 JSON 数组')
assert(same(loadPulled(7, 3), ['A', 'B']), '读回保存的集合')
assert(loadPulled(8, 3).size === 0 && loadPulled(7, 4).size === 0, '按用户和项目隔离')
store.set('axis-pulled:7:5', 'not json')
assert(loadPulled(7, 5).size === 0, '坏数据读出空集合')
store.set('axis-pulled:7:6', '{"a":1}')
assert(loadPulled(7, 6).size === 0, '不是数组读出空集合')
store.set('axis-pulled:7:7', '["A",3,null,"B"]')
assert(same(loadPulled(7, 7), ['A', 'B']), '只保留字符串')
assert(loadPulled(null, 3).size === 0 && loadPulled(7, null).size === 0, '缺用户或项目时读出空集合')
savePulled(null, 3, ['A'])
assert(![...store.keys()].some(k => k.includes('null')), '缺用户时不写入')
;(globalThis as { localStorage?: unknown }).localStorage = {
  getItem: () => { throw new Error('denied') },
  setItem: () => { throw new Error('denied') },
}
assert(loadPulled(7, 3).size === 0, '读本机存储抛错时返回空集合')
savePulled(7, 3, ['A'])
assert(true, '写本机存储抛错时不外抛')

// ---- 布局：fold 省略或全部上轴时与旧结果完全一致 ----
const toObj = (m: Map<string, { x: number; y: number }>) => JSON.stringify([...m.entries()])
for (const orientation of ['horizontal', 'vertical'] as const) {
  const old = computeAxisLayout(tree, orientation, {})
  const allPulled = computeAxisLayout(tree, orientation, {}, spec(tree.map(n => n.id)))
  assert(toObj(old.positions) === toObj(allPulled.positions), `${orientation}: 所有人都拉出时与不折叠的布局一致`)
  assert(old.stacks.size === 0 && allPulled.stacks.size === 0, `${orientation}: 全部上轴时没有折叠组`)
  const collapsedPulled = computeAxisLayout(tree, orientation, { A: false }, spec(tree.map(n => n.id)))
  const oldCollapsed = computeAxisLayout(tree, orientation, { A: false })
  assert(toObj(collapsedPulled.positions) === toObj(oldCollapsed.positions), `${orientation}: 收起下属时同样一致`)
}

// ---- 布局：折叠组 ----
type Rect = { id: string; x: number; y: number; w: number; h: number }
function rects(orientation: 'horizontal' | 'vertical', expandedNodes: Record<string, boolean>, fold: AxisFoldSpec, source = tree): Rect[] {
  const layout = computeAxisLayout(source, orientation, expandedNodes, fold)
  const out: Rect[] = []
  layout.positions.forEach((p, id) => {
    out.push({ id, x: p.x, y: p.y, w: CARD_W, h: CARD_H })
    for (const e of layout.stacks.get(id) || []) {
      out.push({ id: e.memberId, x: p.x, y: p.y + e.y, w: CARD_W, h: e.height })
    }
  })
  return out
}
function overlaps(list: Rect[]) {
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i], b = list[j]
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h) return `${a.id}/${b.id}`
    }
  }
  return ''
}
const wide = [
  ...tree,
  ...Array.from({ length: 4 }, (_, i) => node(`D${i}`, 'R', 10 + i)),
  ...Array.from({ length: 3 }, (_, i) => node(`B1x${i}`, 'B', 5 + i)),
]
for (const orientation of ['horizontal', 'vertical'] as const) {
  const cases: Array<[string, AxisFoldSpec, Record<string, boolean>]> = [
    ['默认折叠', spec(), {}],
    ['拉出 A、B', spec(['A', 'B']), {}],
    ['拉出 A、B 并展开行', spec(['A', 'B'], ['A1', 'A2', 'B1', 'C', 'D0']), {}],
    ['全部展开', spec(['A', 'B', 'A1'], ['A2', 'B1', 'C', 'D0', 'D1', 'D2', 'D3', 'A1a', 'B1x0', 'B1x1', 'B1x2']), {}],
    ['领导收起下属', spec(['A', 'B'], ['A1']), { A: false }],
  ]
  for (const [name, fold, expanded] of cases) {
    const bad = overlaps(rects(orientation, expanded, fold, wide))
    assert(bad === '', `${orientation} ${name}: 卡片与折叠行不重叠（${bad}）`)
  }

  const folded = computeAxisLayout(wide, orientation, {}, spec())
  assert(folded.positions.size === 1 && folded.positions.has('R'), `${orientation}: 默认只布局根`)
  const stack = folded.stacks.get('R')!
  assert(stack.length === 7 && stack.every(e => !e.expanded && e.height === FOLDED_ROW_H), `${orientation}: 根下面是 7 行折叠行`)
  assert(stack[0].y === CARD_H + FOLDED_STEM_H, `${orientation}: 第一行与领导卡片隔一小段竖线`)
  assert(stack[1].y - stack[0].y === FOLDED_ROW_H + FOLDED_ROW_GAP, `${orientation}: 折叠行之间留固定间隙`)
  assert(stack.map(e => e.memberId).join(',') === 'A,B,C,D0,D1,D2,D3', `${orientation}: 折叠行按轴上顺序排`)
  const fp = folded.footprints.get('R')!
  assert(fp.width === CARD_W && fp.height === stack[6].y + FOLDED_ROW_H, `${orientation}: 领导足迹包含整个折叠组`)

  const open = computeAxisLayout(wide, orientation, {}, spec([], ['B']))
  const growth = open.footprints.get('R')!.height - fp.height
  assert(growth === CARD_H - FOLDED_ROW_H, `${orientation}: 展开一行让足迹增加一张卡片与一行的高度差`)
  const openStack = open.stacks.get('R')!
  assert(openStack[1].expanded && openStack[1].height === CARD_H && openStack[2].y - openStack[1].y === CARD_H + FOLDED_ROW_GAP, `${orientation}: 展开行之后的行整体下移让位`)

  const hiddenGroup = computeAxisLayout(wide, orientation, { R: false }, spec())
  assert(hiddenGroup.stacks.size === 0 && hiddenGroup.footprints.get('R')!.height === CARD_H, `${orientation}: 「下属 n」收起时折叠组一并隐藏`)

  const again = computeAxisLayout(wide, orientation, {}, spec([], ['B']))
  assert(toObj(again.positions) === toObj(open.positions), `${orientation}: 同样输入布局稳定`)
}

// 横向：折叠组算进领导的跨度，同层的兄弟卡片要让开
{
  const h = computeAxisLayout(tree, 'horizontal', {}, spec(['A', 'B']))
  const a = h.positions.get('A')!, b = h.positions.get('B')!
  const aBottom = a.y + h.footprints.get('A')!.height
  assert(b.y >= aBottom, '横向：A 的折叠组占位，B 不压上来')
  assert(h.footprints.get('A')!.height === CARD_H + FOLDED_STEM_H + 2 * FOLDED_ROW_H + FOLDED_ROW_GAP, '横向：A 的足迹 = 卡片 + 竖线 + 两行折叠行')
}
// 纵向：每层按该层最高的足迹留位
{
  const v = computeAxisLayout(tree, 'vertical', {}, spec(['A', 'B']))
  const rootFp = v.footprints.get('R')!.height
  assert(v.positions.get('A')!.y === rootFp + 88, '纵向：下一层从根的整块足迹下方开始')
  const childLevel = computeAxisLayout(tree, 'vertical', {}, spec(['A', 'B', 'A1']))
  const levelTwoTallest = Math.max(childLevel.footprints.get('A')!.height, childLevel.footprints.get('B')!.height)
  assert(childLevel.positions.get('A1')!.y === childLevel.positions.get('A')!.y + levelTwoTallest + 88, '纵向：同层取最高足迹')
}

console.log(`people-axis fold: ${passed} assertions passed`)
