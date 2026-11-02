import assert from 'node:assert/strict';
import { resolveDirectSupervisor } from '../src/mobile/features/reports/reportCapabilities';

console.log('--- Testing B4: Direct supervisor resolution without guessing in frontend ---');

// 模拟场景：项目经理（user.id = 1）同时是项目创建者与项目经理
const currentUserId = 1;
const projectMembers = [
  { id: 1, name: '张经理 (项目负责人)', role: '项目经理' },
  { id: 2, name: '李开发', role: '研发工程师' },
  { id: 3, name: '王总监', role: '技术总监' },
];

// 模拟 1：无服务器草稿时（旧逻辑会根据 pmBinding 把 parentUserId 赋为 1，即自己）
// 旧逻辑模拟：
const guessedParentUserIdByOldLogic: number | null = 1; // 旧代码：pmBinding.user_id
const oldSupervisor = resolveDirectSupervisor(projectMembers, currentUserId, guessedParentUserIdByOldLogic);
// 旧逻辑下：supervisor.isSelf 为 true，导致无法提交！
const oldCanSubmit = !oldSupervisor.isSelf;

// 新逻辑要求：parentUserId 不在前端瞎猜，无服务器草稿时 parentUserId 必须为 null
const newParentUserIdWithoutDraft: number | null = null;
const supervisorWithoutDraft = resolveDirectSupervisor(projectMembers, currentUserId, newParentUserIdWithoutDraft);

// 验证判定函数：只有在 parentUserId != null 且 supervisor.isSelf 时才拦截
function canSubmitReport(parentUserId: number | null, isSelf: boolean): boolean {
  // 旧逻辑如果瞎猜，这里会被拦截
  if (parentUserId != null && isSelf) return false;
  return true;
}

// 先验证旧逻辑下的缺陷：旧逻辑会导致项目经理无法提交！
assert.strictEqual(oldCanSubmit, false, '旧逻辑下项目经理会被误判为直属领导是自己而无法提交');

// 断言新改法要求：
// 1. 无服务器草稿时，parentUserId 为 null，可以提交（提交时由系统按人轴计算）
assert.strictEqual(
  canSubmitReport(newParentUserIdWithoutDraft, supervisorWithoutDraft.isSelf),
  true,
  '新逻辑下无服务器草稿时项目经理必须允许提交，不被前端拦截',
);

// 2. 当服务器草稿显式给出接收人就是自己时（例如服务器草稿 draft.parent_user_id === 1），仍然必须拦截
const serverDraftParentUserId = 1;
const supervisorWithServerDraft = resolveDirectSupervisor(projectMembers, currentUserId, serverDraftParentUserId);
assert.strictEqual(supervisorWithServerDraft.isSelf, true, '服务器草稿若指出接收人是自己，isSelf 仍为 true');
assert.strictEqual(
  canSubmitReport(serverDraftParentUserId, supervisorWithServerDraft.isSelf),
  false,
  '服务器草稿明确指出直属领导是自己时，必须拦截提交',
);

// 3. 当服务器草稿指出接收人是总监（id: 3）时，正常提交给总监
const serverDraftWithSupervisor = 3;
const supervisorWithManager = resolveDirectSupervisor(projectMembers, currentUserId, serverDraftWithSupervisor);
assert.strictEqual(supervisorWithManager.isValid, true);
assert.strictEqual(supervisorWithManager.name, '王总监');
assert.strictEqual(canSubmitReport(serverDraftWithSupervisor, supervisorWithManager.isSelf), true);

console.log('✓ B4: Direct supervisor resolution contract passed');

console.log('--- Testing B4: MyReportEditor source contract (no pmBinding guessing) ---');
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const editorSource = fs.readFileSync(
  path.resolve(__dirname, '../src/mobile/features/reports/MyReportEditor.tsx'),
  'utf-8',
);

// 1. 不能再有根据 pmBinding 推断 parentUserId 的逻辑
assert.strictEqual(
  editorSource.includes('pmBinding'),
  false,
  'MyReportEditor.tsx 严禁使用 pmBinding 推断 parentUserId',
);

// 2. 必须包含「提交时由系统按人轴确定直属接收人」
assert.ok(
  editorSource.includes('提交时由系统按人轴确定直属接收人'),
  'MyReportEditor.tsx 必须在 parentUserId == null 时展示“提交时由系统按人轴确定直属接收人”',
);

// 3. 提交拦截仅在 parentUserId != null 且 supervisor.isSelf 时生效
assert.ok(
  editorSource.includes('parentUserId != null && supervisor.isSelf'),
  'MyReportEditor.tsx 必须仅在 parentUserId 来自服务器且为自己时拦截提交',
);

console.log('✓ B4: MyReportEditor source assertions passed');

