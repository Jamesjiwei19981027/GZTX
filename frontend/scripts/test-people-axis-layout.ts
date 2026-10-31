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

// 树：head(主干0) - l1(主干1) - l2(主干2)；l1 下挂 c1、c2；c1 下挂 g1
const nodes = [
  node('head', undefined, 0),
  node('l1', undefined, 1),
  node('l2', undefined, 2),
  node('c1', 'l1'),
  node('c2', 'l1'),
  node('g1', 'c1'),
]

// Responsibility depth advances along the chosen orientation. Peers never
// become each other's managers merely because of their display order.
for (const orientation of ['horizontal', 'vertical'] as const) {
  const layout = computeAxisLayout(nodes, orientation, {}, 0)
  const main = (id: string) => orientation === 'horizontal' ? layout.positions.get(id)!.x : layout.positions.get(id)!.y
  const cross = (id: string) => orientation === 'horizontal' ? layout.positions.get(id)!.y : layout.positions.get(id)!.x
  assert(main('head') === main('l1') && main('l1') === main('l2'), `${orientation}: first-level owners share one tier`)
  assert(main('c1') > main('l1') && main('g1') > main('c1'), `${orientation}: each reporting level advances`)
  assert(main('c1') === main('c2') && cross('c1') !== cross('c2'), `${orientation}: siblings remain peers`)
  const root = orientation === 'horizontal' ? layout.terminusPosition.x : layout.terminusPosition.y
  assert(root < main('head'), `${orientation}: project final owner heads the hierarchy`)
  const spaced = computeAxisLayout(nodes, orientation, {}, 120)
  const spacedRoot = orientation === 'horizontal' ? spaced.terminusPosition.x : spaced.terminusPosition.y
  assert(spacedRoot === root - 120, `${orientation}: spacing moves final owner away from the first tier`)
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
  const result = computeAxisLayout(wideTree, orientation, {}, 0)
  const positions = [...result.positions.entries()]
  for (let a = 0; a < positions.length; a++) {
    for (let b = a + 1; b < positions.length; b++) {
      const [aid, ap] = positions[a]
      const [bid, bp] = positions[b]
      assert(Math.abs(ap.x - bp.x) >= CARD_W + 16 || Math.abs(ap.y - bp.y) >= CARD_H + 16,
        `${orientation}: cards ${aid}/${bid} have readable separation`)
    }
  }
  const end = result.terminusPosition
  assert(positions.every(([, p]) => orientation === 'horizontal'
    ? end.x < p.x : end.y < p.y), `${orientation}: final owner precedes all branches`)
  const collapsed = computeAxisLayout(wideTree, orientation, { l1: false }, 0)
  assert(!collapsed.positions.has('c1') && !collapsed.positions.has('g1'), 'collapsed descendants have no canvas positions')
}

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
