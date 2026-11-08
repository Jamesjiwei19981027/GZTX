import assert from 'node:assert/strict';
import {
  resolveDirectSupervisor,
  getAiDeliveryStatus,
  saveLocalDraft,
  loadLocalDraft,
  clearLocalDraft,
  extractConflicts,
  REPORT_API_GAPS,
} from '../src/mobile/features/reports/reportCapabilities';
import { isValidScreenForTab, REGISTERED_SCREENS } from '../src/mobile/navigation/mobileRoutes';

console.log('--- 1. Testing Direct Supervisor Resolution ---');

const mockMembers = [
  { id: '1', name: '王宁', role: '项目管理者', avatar: 'W' },
  { id: '2', name: '林悦', role: '产品设计', avatar: 'L' },
  { id: '3', name: '陈哲', role: '研发负责', avatar: 'C' },
];

// 自身不能作为直属领导（防循环与假责任链）
const selfResult = resolveDirectSupervisor(mockMembers, '2', '2');
assert.equal(selfResult.isValid, false, 'Direct supervisor cannot be oneself');
assert.equal(selfResult.isSelf, true, 'isSelf must be true');
assert.equal(selfResult.status, 'invalid_self');
assert.equal(selfResult.name, '直属领导不能是自己');

// 未分配上级
const unassignedResult = resolveDirectSupervisor(mockMembers, '2', null);
assert.equal(unassignedResult.isValid, false);
assert.equal(unassignedResult.status, 'unassigned');
assert.equal(unassignedResult.name, '未指定直属领导');

// 正常指定上级
const validResult = resolveDirectSupervisor(mockMembers, '2', '1');
assert.equal(validResult.isValid, true);
assert.equal(validResult.isSelf, false);
assert.equal(validResult.status, 'confirmed');
assert.equal(validResult.name, '王宁');

console.log('✓ Direct Supervisor validation passed');

console.log('--- 2. Testing AI Delivery & Read Status (G01 Defense) ---');

// 未提交的报告
const unsubmittedStatus = getAiDeliveryStatus(null);
assert.equal(unsubmittedStatus.submitted, false);
assert.equal(unsubmittedStatus.leaderDelivery.status, '未提交');

// 已提交、未读的报告
const unreadReport: any = {
  id: 101,
  status: 'submitted',
  submitted_at: '2026-10-19T10:00:00Z',
  read: false,
  read_at: null,
};
const unreadStatus = getAiDeliveryStatus(unreadReport);
assert.equal(unreadStatus.submitted, true);
assert.equal(unreadStatus.leaderDelivery.status, '已送达');
assert.equal(unreadStatus.aiReceipt.confirmed, false, 'G01: AI status must not be faked as confirmed');
assert.equal(unreadStatus.aiReceipt.statusText, '状态暂不可确认');

// 已读报告
const readReport: any = {
  id: 102,
  status: 'submitted',
  submitted_at: '2026-10-19T10:00:00Z',
  read: true,
  read_at: '2026-10-19T10:30:00Z',
};
const readStatus = getAiDeliveryStatus(readReport);
assert.equal(readStatus.leaderDelivery.status, '已读');
assert.equal(readStatus.leaderDelivery.readAt, '2026-10-19T10:30:00Z');
assert.equal(readStatus.aiReceipt.confirmed, false);
assert.equal(readStatus.aiReceipt.statusText, '状态暂不可确认');

console.log('✓ G01 AI delivery & supervisor read status passed');

console.log('--- 3. Testing Local Draft Storage Isolation (G02) ---');

// Mock localStorage for Node environment if needed
if (typeof globalThis.localStorage === 'undefined') {
  const store = new Map<string, string>();
  (globalThis as any).localStorage = {
    getItem: (k: string) => store.get(k) || null,
    setItem: (k: string, v: string) => store.set(k, v),
    removeItem: (k: string) => store.delete(k),
    clear: () => store.clear(),
  };
}

// 保存项目 10 的草稿
saveLocalDraft('user_A', 10, { summary: '项目 10 的进展草稿', draftReportId: 101 });

// 在项目 10 读取草稿
const loadedP10 = loadLocalDraft('user_A', 10);
assert.notEqual(loadedP10, null);
assert.equal(loadedP10?.summary, '项目 10 的进展草稿');

// 在项目 20 读取（跨项目隔离验证）
const loadedP20 = loadLocalDraft('user_A', 20);
assert.equal(loadedP20, null, 'Drafts between projects must be strictly isolated');

// 用户 B 读取（跨用户隔离验证）
const loadedUserB = loadLocalDraft('user_B', 10);
assert.equal(loadedUserB, null, 'Drafts between users must be strictly isolated');

// 清空草稿
clearLocalDraft('user_A', 10);
assert.equal(loadLocalDraft('user_A', 10), null);

console.log('✓ G02 Local draft strict isolation passed');

console.log('--- 4. Testing Registered AI Screens ---');

const expectedScreens = [
  'ai-root',
  'ai-report-create',
  'ai-report-submitted',
  'ai-report-detail',
  'ai-chat',
  'ai-inbox',
  'ai-project-aggregate',
  'ai-leadership',
];

for (const screen of expectedScreens) {
  assert.equal(
    isValidScreenForTab('work', screen),
    true,
    `Screen "${screen}" must be registered under tab "ai"`,
  );
}

assert.equal(
  isValidScreenForTab('work', 'ai-non-existent'),
  false,
  'Unregistered screen must return false',
);

console.log('✓ Registered AI screens truth table passed');

console.log('--- 5. Testing Conflicts Extraction ---');

const mockPayload = {
  conflicts: [
    {
      type: 'task_status_mismatch',
      task_id: 42,
      report_ids: [1, 2],
      statuses: ['In Progress', 'Done'],
      severity: 'warning',
    },
  ],
};

const extracted = extractConflicts(mockPayload);
assert.equal(extracted.length, 1);
assert.equal(extracted[0].type, 'task_status_mismatch');
assert.equal(extracted[0].taskId, 42);
assert.deepEqual(extracted[0].statuses, ['In Progress', 'Done']);

// 空载荷防御
assert.deepEqual(extractConflicts(null), []);
assert.deepEqual(extractConflicts({}), []);

console.log('✓ Conflicts extraction passed');

console.log('--- 6. Verifying API GAPs definitions ---');
assert.equal(REPORT_API_GAPS.G01.code, 'G01');
assert.equal(REPORT_API_GAPS.G02.code, 'G02');
assert.equal(REPORT_API_GAPS.G03.code, 'G03');
assert.equal(REPORT_API_GAPS.G04.code, 'G04');
assert.equal(REPORT_API_GAPS.G05.code, 'G05');

console.log('All reports contract unit assertions PASSED successfully!');
