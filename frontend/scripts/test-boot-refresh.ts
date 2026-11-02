import assert from 'node:assert/strict';
import { handleBootRefreshFailure, getInviteNotice } from '../src/utils/bootSync';

console.log('--- Testing B1: Project list retention on boot refresh failure ---');

// 1. 模拟先成功加载出项目
const initialProjects = [
  { id: '1', name: '项目 Alpha', description: '', color: '#0058be', active: true },
  { id: '2', name: '项目 Beta', description: '', color: '#4caf50', active: true },
];

const initialTasks = [
  { id: 101, title: '任务一', completed: false },
];

const initialActivities = [
  { id: 201, content: '创建了任务一' },
];

// 2. 模拟随后刷新失败
const failureError = '网络连接超时';
const result = handleBootRefreshFailure(initialProjects, failureError);

// 3. 断言：项目列表仍在，没有被清空！
assert.strictEqual(
  result.projects.length,
  initialProjects.length,
  `项目列表必须保留已有项目，期望 ${initialProjects.length} 个，实际得到 ${result.projects.length} 个`,
);
assert.deepStrictEqual(result.projects, initialProjects, '项目列表必须保留原有的真实项目数组');

// 4. 断言：任务和动态被清空（避免未经验证的假数据造成误导），且错误提示可见
assert.strictEqual(result.tasks.length, 0, '任务列表在失败时应清空');
assert.strictEqual(result.activities.length, 0, '活动动态在失败时应清空');
assert.strictEqual(result.bootError, failureError, '错误信息必须可见');

console.log('✓ B1: Project list retained and error visible on refresh failure');

console.log('--- Testing B3: Invitation refresh failure notice and retry contract ---');

// 邀请接受成功，但随后工作区刷新失败
const failNoticeZh = getInviteNotice(false, 'zh');
assert.strictEqual(
  failNoticeZh,
  '已加入受邀项目，但工作区刷新失败，请点重试',
  '邀请后刷新失败应提示已加入但刷新失败并提示重试',
);
assert.ok(failNoticeZh.includes('重试'), '提示文案应包含重试');

const failNoticeEn = getInviteNotice(false, 'en');
assert.strictEqual(
  failNoticeEn,
  'Joined invited project, but workspace refresh failed. Please retry.',
);

// 重试刷新成功
const successNoticeZh = getInviteNotice(true, 'zh');
assert.strictEqual(successNoticeZh, '已加入受邀项目');

const successNoticeEn = getInviteNotice(true, 'en');
assert.strictEqual(successNoticeEn, 'Joined invited project');

console.log('✓ B3: Invitation notice contract passed');
