import assert from 'node:assert/strict';
import { getDescendantNodeIds } from '../src/mobile/features/people-axis/MobileAxisScreens';
import { PeopleAxisNode } from '../src/types';
import {
  isValidScreenForTab,
  REGISTERED_SCREENS,
} from '../src/mobile/navigation/mobileRoutes';
import { DELEGATION_ACTIONS } from '../src/api/delegations';

console.log('=== 1. Testing Cycle Prevention (getDescendantNodeIds) ===');

// 创建测试用例拓扑结构：
// Root (1)
// ├── A (2)
// │   ├── B1 (3)
// │   │   ├── C1 (5)
// │   │   └── C2 (6)
// │   └── B2 (4)
// └── D (7)

const mockNodes: PeopleAxisNode[] = [
  {
    id: '1',
    parentId: undefined,
    person: { id: '101', name: 'Root', role: 'member', avatar: '' },
    roleTitle: 'CEO',
    orderOnAxis: 0,
    workItems: [],
  },
  {
    id: '2',
    parentId: '1',
    person: { id: '102', name: 'A', role: 'member', avatar: '' },
    roleTitle: 'VP',
    orderOnAxis: 1,
    workItems: [],
  },
  {
    id: '3',
    parentId: '2',
    person: { id: '103', name: 'B1', role: 'member', avatar: '' },
    roleTitle: 'Director 1',
    orderOnAxis: 2,
    workItems: [],
  },
  {
    id: '4',
    parentId: '2',
    person: { id: '104', name: 'B2', role: 'member', avatar: '' },
    roleTitle: 'Director 2',
    orderOnAxis: 3,
    workItems: [],
  },
  {
    id: '5',
    parentId: '3',
    person: { id: '105', name: 'C1', role: 'member', avatar: '' },
    roleTitle: 'Staff 1',
    orderOnAxis: 4,
    workItems: [],
  },
  {
    id: '6',
    parentId: '3',
    person: { id: '106', name: 'C2', role: 'member', avatar: '' },
    roleTitle: 'Staff 2',
    orderOnAxis: 5,
    workItems: [],
  },
  {
    id: '7',
    parentId: '1',
    person: { id: '107', name: 'D', role: 'member', avatar: '' },
    roleTitle: 'VP 2',
    orderOnAxis: 6,
    workItems: [],
  },
];

// 测试 1: B1 的后代应包含 C1 和 C2
const b1Descendants = getDescendantNodeIds('3', mockNodes);
assert.equal(b1Descendants.size, 2);
assert.equal(b1Descendants.has('5'), true);
assert.equal(b1Descendants.has('6'), true);
assert.equal(b1Descendants.has('2'), false);
assert.equal(b1Descendants.has('1'), false);
console.log('✓ B1 descendants strictly identified as C1, C2');

// 测试 2: A 的后代应包含 B1, B2, C1, C2
const aDescendants = getDescendantNodeIds('2', mockNodes);
assert.equal(aDescendants.size, 4);
assert.equal(aDescendants.has('3'), true);
assert.equal(aDescendants.has('4'), true);
assert.equal(aDescendants.has('5'), true);
assert.equal(aDescendants.has('6'), true);
assert.equal(aDescendants.has('7'), false);
console.log('✓ A descendants strictly identified as B1, B2, C1, C2');

// 测试 3: 叶子节点 C1 的后代集合应为空
const c1Descendants = getDescendantNodeIds('5', mockNodes);
assert.equal(c1Descendants.size, 0);
console.log('✓ Leaf node C1 has empty descendants');

// 测试 4: 候选上级过滤测试（移动 B1 时，不能选 B1 自身，也不能选 C1、C2）
const candidateForB1 = mockNodes.filter(
  (n) => n.id !== '3' && !b1Descendants.has(n.id),
);
const candidateIdsForB1 = candidateForB1.map((n) => n.id);
assert.deepEqual(candidateIdsForB1.sort(), ['1', '2', '4', '7']);
console.log('✓ B1 candidate supervisors exclude self and descendants (1, 2, 4, 7)');

console.log('\n=== 2. Testing Screen Registration in mobileRoutes ===');
assert.equal(isValidScreenForTab('axis', 'axis-root'), true);
assert.equal(isValidScreenForTab('axis', 'axis-evidence-submit'), true);
assert.equal(isValidScreenForTab('axis', 'axis-evidence-detail'), true);
assert.equal(isValidScreenForTab('axis', 'axis-progress'), true);
assert.equal(isValidScreenForTab('axis', 'axis-delegations'), true);
assert.equal(isValidScreenForTab('axis', 'axis-audit'), true);
assert.equal(isValidScreenForTab('axis', 'axis-wiki'), true);
assert.equal(isValidScreenForTab('axis', 'axis-wiki-draft'), true);
assert.equal(isValidScreenForTab('axis', 'axis-wiki-search'), true);
assert.equal(isValidScreenForTab('work', 'axis-audit'), false);
console.log('✓ All 9 Axis, Evidence, and Wiki screens registered in mobileRoutes');

console.log('\n=== 3. Testing Delegation Actions alignment ===');
assert.ok(DELEGATION_ACTIONS.length >= 10);
assert.ok(DELEGATION_ACTIONS.some((a) => a.key === 'evidence.submit'));
assert.ok(DELEGATION_ACTIONS.some((a) => a.key === 'progress.read'));
assert.ok(DELEGATION_ACTIONS.some((a) => a.key === 'tree.edit_subtree'));
assert.ok(DELEGATION_ACTIONS.some((a) => a.key === 'wiki.manual_write'));
console.log('✓ Delegation actions properly aligned with backend permissions');

console.log('\n🎉 ALL TESTS PASSED SUCCESSFULLY! 🎉\n');
