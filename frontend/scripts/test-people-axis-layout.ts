/**
 * 人轴地铁布局算法（peopleAxisFlowLayout）单测：
 *   npx tsx scripts/test-people-axis-layout.ts
 */
import {
  computeAxisLayout,
  collectHiddenNodeIds,
  CARD_W,
  CARD_H,
  responsibilityScope,
} from '../src/components/views/peopleAxisFlowLayout'
import type { PeopleAxisNode, TeamMember } from '../src/types'
import { mapTreeToPeopleAxis } from '../src/api/mappers'
import type { BackendTreeNode } from '../src/api/backend'
import { withAxisPersonMetadata } from '../src/api/axisPerson'

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

// 与 APP 端对齐的样例树期望坐标一致性断言
const sampleTree = [
  node('R', undefined, 0),
  node('A', 'R', 1),
  node('B', 'R', 2),
  node('A1', 'A', 0),
  node('A2', 'A', 1),
]

const sampleH = computeAxisLayout(sampleTree, 'horizontal', {})
assert(sampleH.positions.get('R')!.x === 0 && sampleH.positions.get('R')!.y === 216, 'sample tree horizontal: R(0, 216)')
assert(sampleH.positions.get('A')!.x === 328 && sampleH.positions.get('A')!.y === 108, 'sample tree horizontal: A(328, 108)')
assert(sampleH.positions.get('B')!.x === 328 && sampleH.positions.get('B')!.y === 432, 'sample tree horizontal: B(328, 432)')
assert(sampleH.positions.get('A1')!.x === 656 && sampleH.positions.get('A1')!.y === 0, 'sample tree horizontal: A1(656, 0)')
assert(sampleH.positions.get('A2')!.x === 656 && sampleH.positions.get('A2')!.y === 216, 'sample tree horizontal: A2(656, 216)')

const sampleV = computeAxisLayout(sampleTree, 'vertical', {})
assert(sampleV.positions.get('R')!.x === 288 && sampleV.positions.get('R')!.y === 0, 'sample tree vertical: R(288, 0)')
assert(sampleV.positions.get('A')!.x === 144 && sampleV.positions.get('A')!.y === 256, 'sample tree vertical: A(144, 256)')
assert(sampleV.positions.get('B')!.x === 576 && sampleV.positions.get('B')!.y === 256, 'sample tree vertical: B(576, 256)')
assert(sampleV.positions.get('A1')!.x === 0 && sampleV.positions.get('A1')!.y === 512, 'sample tree vertical: A1(0, 512)')
assert(sampleV.positions.get('A2')!.x === 288 && sampleV.positions.get('A2')!.y === 512, 'sample tree vertical: A2(288, 512)')

const singleRootH = computeAxisLayout([node('r0', undefined, 0)], 'horizontal', {})
assert(singleRootH.positions.get('r0')!.x === 0 && singleRootH.positions.get('r0')!.y === 0, 'single root at origin horizontal')
const singleRootV = computeAxisLayout([node('r0', undefined, 0)], 'vertical', {})
assert(singleRootV.positions.get('r0')!.x === 0 && singleRootV.positions.get('r0')!.y === 0, 'single root at origin vertical')

// 单根树：root -> child -> grandchild；child has two siblings.
const nodes = [
  node('head', undefined, 0),
  node('l1', 'head', 1),
  node('l2', 'head', 2),
  node('c1', 'l1', 0),
  node('c2', 'l1', 1),
  node('g1', 'c1', 0),
]

// Responsibility depth advances along the chosen orientation. Peers never
// become each other's managers merely because of their display order.
for (const orientation of ['horizontal', 'vertical'] as const) {
  const layout = computeAxisLayout(nodes, orientation, {})
  const main = (id: string) => orientation === 'horizontal' ? layout.positions.get(id)!.x : layout.positions.get(id)!.y
  const cross = (id: string) => orientation === 'horizontal' ? layout.positions.get(id)!.y : layout.positions.get(id)!.x
  assert(main('head') === 0, `${orientation}: single root starts at the origin`)
  assert(main('l1') - main('head') === (orientation === 'horizontal' ? 328 : 256), `${orientation}: child level step is fixed`)
  assert(main('c1') > main('l1') && main('g1') > main('c1'), `${orientation}: each reporting level advances`)
  assert(main('c1') === main('c2') && cross('c1') !== cross('c2'), `${orientation}: siblings remain peers`)
  const expectedCenter = (cross('c1') + cross('c2')) / 2
  assert(cross('l1') === expectedCenter,
    `${orientation}: parent is centered over its child subtree`)
}

// Wide and deep branches must remain separate in either orientation, including
// adjacent trunk owners with their own descendants.
const wideTree = [
  ...nodes,
  ...Array.from({ length: 5 }, (_, i) => node(`c${i + 3}`, 'l1', i + 2)),
  ...Array.from({ length: 4 }, (_, i) => node(`head-child-${i}`, 'head', i)),
  node('g2', 'c2'), node('g3', 'c3'), node('l2-child', 'l2'),
]
for (const orientation of ['horizontal', 'vertical'] as const) {
  const result = computeAxisLayout(wideTree, orientation, {})
  const positions = [...result.positions.entries()]
  for (let a = 0; a < positions.length; a++) {
    for (let b = a + 1; b < positions.length; b++) {
      const [aid, ap] = positions[a]
      const [bid, bp] = positions[b]
      assert(Math.abs(ap.x - bp.x) >= CARD_W + 16 || Math.abs(ap.y - bp.y) >= CARD_H + 16,
        `${orientation}: cards ${aid}/${bid} have readable separation`)
    }
  }
  const collapsed = computeAxisLayout(wideTree, orientation, { l1: false })
  assert(collapsed.positions.has('l1') && !collapsed.positions.has('c1') && !collapsed.positions.has('g1'), 'collapsed descendants do not occupy span')
}

const multiRoot = computeAxisLayout([node('r1', undefined, 0), node('r2', undefined, 1)], 'horizontal', {})
assert(multiRoot.roots.map(n => n.id).join(',') === 'r1,r2', 'multiple roots are returned in tree order')
assert(multiRoot.positions.get('r2')!.y > multiRoot.positions.get('r1')!.y, 'multiple roots are laid out side by side')

// --- 折叠隐藏 ---
const hiddenAll = collectHiddenNodeIds(nodes, { l1: false })
assert(hiddenAll.has('c1') && hiddenAll.has('c2') && hiddenAll.has('g1'), 'collapsing l1 hides entire subtree')
assert(!hiddenAll.has('l1') && !hiddenAll.has('head'), 'collapsed parent itself stays visible')
const hiddenLeaf = collectHiddenNodeIds(nodes, { c1: false })
assert(hiddenLeaf.has('g1') && !hiddenLeaf.has('c2'), 'collapsing c1 hides only its branch')

const scope = responsibilityScope(nodes, new Set(['c1']), null)
assert(scope.direct.has('c1') && scope.mine.has('g1'), 'my scope includes assigned owner and descendants')
assert(scope.visible.has('l1') && !scope.visible.has('c2') && !scope.visible.has('l2'), 'my scope retains management path without unrelated branches')
assert(responsibilityScope(nodes, new Set(), null).visible.size === 0, 'unassigned members receive no invented responsibilities')
const taskOwner = { ...node('task-owner', undefined), workItems: [{ id: 'assigned-task' }] } as PeopleAxisNode
assert(responsibilityScope([taskOwner], new Set(['assigned-task']), null).direct.has('task-owner'), 'task assignments retain their responsible person in my view')
const mapped = mapTreeToPeopleAxis([{
  id: 100, node_type_key: 'person', title: '林悦', description: '设计负责人 / 体验部 / risk=low',
  assignees: [{ user_id: 3, role_key: 'collaborator', display_name: '陈宇' }, { user_id: 2, role_key: 'primary', display_name: '林悦' }],
} as BackendTreeNode])
assert(mapped[0].person.name === '林悦', 'the primary owner is shown even when collaborators come first')
assert(mapped[0].roleTitle === '设计负责人', 'persisted project role survives reload instead of becoming the person name')
assert(mapped[0].person.department === '体验部', 'legacy person department survives reload and editing')
const note = '保留原有项目分工说明'
const description = withAxisPersonMetadata(note, { name: '刘洋', roleTitle: '客户端负责人', department: '研发部' })
const editedDescription = withAxisPersonMetadata(description, { name: '王琳', roleTitle: '移动端负责人', department: '研发部' })
const edited = mapTreeToPeopleAxis([{ id: 101, node_type_key: 'person', title: '旧姓名', description: editedDescription, assignees: [] } as unknown as BackendTreeNode])[0]
assert(edited.person.name === '王琳' && edited.roleTitle === '移动端负责人', 'manual person and project role round-trip independently')
assert(editedDescription.includes(note) && editedDescription.split('@axis-person ').length === 2, 'editing metadata preserves notes and replaces the existing record')
console.log(`people-axis hierarchy: ${passed} assertions passed`)
