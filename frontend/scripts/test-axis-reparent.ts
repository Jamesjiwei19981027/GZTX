import assert from 'node:assert/strict'
import { reparentVerdict, isDescendantNode, nodeDepth, nodeSubtreeHeight } from '../src/components/views/peopleAxisUtils'
import type { PeopleAxisNode } from '../src/types'

const makeNode = (
  id: string,
  parentId: string | undefined,
  name: string,
  nodeOrigin: 'project' | 'subordinate' = 'project',
  isTerminalPM = false,
): PeopleAxisNode => ({
  id,
  parentId,
  isTerminalPM,
  nodeOrigin,
  person: { id, name, role: 'Role', avatar: '' },
  orderOnAxis: 0,
  roleTitle: 'Role',
  workItems: [],
})

const nodes: PeopleAxisNode[] = [
  makeNode('root', undefined, '王总', 'project', true),
  makeNode('l2_a', 'root', '李经理', 'project'),
  makeNode('l3_a', 'l2_a', '张工', 'project'),
  makeNode('l4_a', 'l3_a', '赵助理', 'project'),
  makeNode('l2_b', 'root', '陈主管', 'project'),
  makeNode('l2_sub', 'root', '孙外包', 'subordinate'),
  makeNode('l3_sub', 'l2_sub', '钱外协', 'subordinate'),
]

// 基础树函数断言
assert.equal(isDescendantNode(nodes, 'l2_a', 'l4_a'), true)
assert.equal(isDescendantNode(nodes, 'l2_a', 'l2_b'), false)
assert.equal(nodeDepth(nodes, 'root'), 1)
assert.equal(nodeDepth(nodes, 'l2_a'), 2)
assert.equal(nodeDepth(nodes, 'l3_a'), 3)
assert.equal(nodeDepth(nodes, 'l4_a'), 4)
assert.equal(nodeSubtreeHeight(nodes, 'l4_a'), 1)
assert.equal(nodeSubtreeHeight(nodes, 'l3_a'), 2)
assert.equal(nodeSubtreeHeight(nodes, 'l2_a'), 3)
assert.equal(nodeSubtreeHeight(nodes, 'root'), 4)

const allCanRelink = () => true

// 0. 同一节点 -> null
assert.equal(reparentVerdict(nodes, 'l3_a', 'l3_a', { canRelink: allCanRelink }), null)

// 1. 拖的是根节点 ->「终责人不能挂到别人下面」
const r1Zh = reparentVerdict(nodes, 'root', 'l2_b', { canRelink: allCanRelink, lang: 'zh' })
assert.deepEqual(r1Zh, { ok: false, reason: '终责人不能挂到别人下面' })
const r1En = reparentVerdict(nodes, 'root', 'l2_b', { canRelink: allCanRelink, lang: 'en' })
assert.deepEqual(r1En, { ok: false, reason: 'Final owner cannot be moved under another person' })

// 2. 目标就是当前上级 ->「已经是他的上级」
const r2Zh = reparentVerdict(nodes, 'l3_a', 'l2_a', { canRelink: allCanRelink, lang: 'zh' })
assert.deepEqual(r2Zh, { ok: false, reason: '已经是他的上级' })
const r2En = reparentVerdict(nodes, 'l3_a', 'l2_a', { canRelink: allCanRelink, lang: 'en' })
assert.deepEqual(r2En, { ok: false, reason: 'Already their direct manager' })

// 3. 目标是自己的后代 ->「不能挂到自己的下属下面」
const r3Zh = reparentVerdict(nodes, 'l2_a', 'l4_a', { canRelink: allCanRelink, lang: 'zh' })
assert.deepEqual(r3Zh, { ok: false, reason: '不能挂到自己的下属下面' })
const r3En = reparentVerdict(nodes, 'l2_a', 'l4_a', { canRelink: allCanRelink, lang: 'en' })
assert.deepEqual(r3En, { ok: false, reason: 'Cannot be placed under direct or indirect subordinates' })

// 4. 目标层级 + 被拖子树人员高度 > 4 ->「人员最多四层」
// l4_a 的 depth=4，l2_b 的 height=1 -> 4 + 1 = 5 > 4
const r4Zh = reparentVerdict(nodes, 'l2_b', 'l4_a', { canRelink: allCanRelink, lang: 'zh' })
assert.deepEqual(r4Zh, { ok: false, reason: '人员最多四层' })
const r4En = reparentVerdict(nodes, 'l2_b', 'l4_a', { canRelink: allCanRelink, lang: 'en' })
assert.deepEqual(r4En, { ok: false, reason: 'People axis supports up to 4 levels' })

// 5. 被拖节点 node_origin=='project' 且目标 node_origin=='subordinate' ->「项目成员不能挂到下级自建人员下面」
const r5Zh = reparentVerdict(nodes, 'l2_b', 'l3_sub', { canRelink: allCanRelink, lang: 'zh' })
assert.deepEqual(r5Zh, { ok: false, reason: '项目成员不能挂到下级自建人员下面' })
const r5En = reparentVerdict(nodes, 'l2_b', 'l3_sub', { canRelink: allCanRelink, lang: 'en' })
assert.deepEqual(r5En, { ok: false, reason: 'Project members cannot be assigned under self-added personnel' })

// 6. 当前用户对源或目标无权限 ->「没有权限调整此人的上级」
const noPermOnSource = (id: string) => id !== 'l3_a'
const r6Source = reparentVerdict(nodes, 'l3_a', 'l2_b', { canRelink: noPermOnSource, lang: 'zh' })
assert.deepEqual(r6Source, { ok: false, reason: '没有权限调整此人的上级' })
const noPermOnTarget = (id: string) => id !== 'l2_b'
const r6Target = reparentVerdict(nodes, 'l3_a', 'l2_b', { canRelink: noPermOnTarget, lang: 'zh' })
assert.deepEqual(r6Target, { ok: false, reason: '没有权限调整此人的上级' })

// 7. 合法用例 -> ok: true
const okZh = reparentVerdict(nodes, 'l4_a', 'l2_b', { canRelink: allCanRelink, lang: 'zh' })
assert.deepEqual(okZh, { ok: true, reason: '松手设为「陈主管」的下属' })
const okEn = reparentVerdict(nodes, 'l4_a', 'l2_b', { canRelink: allCanRelink, lang: 'en' })
assert.deepEqual(okEn, { ok: true, reason: 'Release to set as subordinate of 陈主管' })

console.log('reparentVerdict: 6 invalid rules + valid rule assertions PASSED')
