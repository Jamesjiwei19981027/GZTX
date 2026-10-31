import assert from 'node:assert/strict';
import { REGISTERED_SCREENS } from '../src/mobile/navigation/mobileRoutes';
import {
  buildDraftKey,
  saveOfflineDraft,
  getOfflineDraft,
  listOfflineDrafts,
  clearOfflineDraft,
  clearUserOfflineDrafts,
} from '../src/mobile/features/adaptation/offlineDrafts';

console.log('--- Testing T12 Mobile Adaptation & Exception Contracts ---');

// 1. 验证 15 个 T12 页面 key 均已在 REGISTERED_SCREENS.me 中登记
const t12RequiredScreens = [
  'adapt-empty',          // 66: 空状态与首次使用
  'adapt-offline',        // 67: 断网与启动恢复
  'adapt-load-fail',      // 68: 加载失败 / 模型不可用
  'adapt-forbidden',      // 69: 权限不足 / 角色变化
  'adapt-danger-confirm', // 70: 删除与高风险操作确认
  'adapt-narrow-320',     // 71: 窄屏适配 · 320
  'adapt-wide-430',       // 72: 宽屏手机 · 430
  'adapt-font-150',       // 73: 系统大字体 · 150%
  'adapt-font-200',       // 74: 系统大字体 · 200%
  'adapt-dark-mode',      // 75: 深色模式
  'adapt-tablet-split',   // 76: 平板双栏
  'adapt-landscape',      // 77: 横屏手机
  'adapt-keyboard-inset', // 78: 键盘弹出与输入
  'adapt-account-delete', // 96: 删除账号确认
  'adapt-boot-sync',      // 97: 启动与同步中 / 敏感操作二次验证
];

for (const screen of t12RequiredScreens) {
  assert.ok(
    REGISTERED_SCREENS.me.has(screen),
    `REGISTERED_SCREENS.me must contain T12 screen key: ${screen}`,
  );
}
console.log(`✓ All ${t12RequiredScreens.length} T12 adaptation screen keys registered in navigation routes`);

// 2. 验证 offlineDrafts 离线草稿隔离逻辑
// 设置 Node 内存模拟 localStorage
class MemoryStorage {
  private store: Map<string, string> = new Map();

  get length() {
    return this.store.size;
  }

  key(index: number): string | null {
    return Array.from(this.store.keys())[index] || null;
  }

  getItem(key: string): string | null {
    return this.store.get(key) || null;
  }

  setItem(key: string, value: string): void {
    this.store.set(key, value);
  }

  removeItem(key: string): void {
    this.store.delete(key);
  }

  clear(): void {
    this.store.clear();
  }
}

// 注入模拟 storage
(globalThis as unknown as { localStorage: MemoryStorage }).localStorage = new MemoryStorage();

// 测试 buildDraftKey 格式
const key1 = buildDraftKey(101, 2, 'report', 'draft_1');
assert.equal(key1, 'gzt_draft_v1:101:2:report:draft_1');

const keyAll = buildDraftKey('user_a', null, 'task', 'new');
assert.equal(keyAll, 'gzt_draft_v1:user_a:all:task:new');
console.log('✓ buildDraftKey format and null-safe normalization passed');

// 测试草稿保存与读取
saveOfflineDraft({
  userId: '101',
  projectId: '2',
  formKind: 'report',
  entityId: 'draft_1',
  title: '项目周报草稿',
  data: { text: '本周完成 T11 与 T12 开发' },
});

const retrieved = getOfflineDraft<{ text: string }>({
  userId: '101',
  projectId: '2',
  formKind: 'report',
  entityId: 'draft_1',
});

assert.ok(retrieved !== null);
assert.equal(retrieved?.title, '项目周报草稿');
assert.equal(retrieved?.data.text, '本周完成 T11 与 T12 开发');
assert.equal(retrieved?.version, 1);
console.log('✓ saveOfflineDraft and getOfflineDraft round-trip passed');

// 测试项目与用户隔离性：不同项目不可互相读取
const crossProjectDraft = getOfflineDraft({
  userId: '101',
  projectId: '999', // 错误项目 ID
  formKind: 'report',
  entityId: 'draft_1',
});
assert.equal(crossProjectDraft, null, 'Cross-project draft retrieval must return null');

// 测试不同用户不可互相读取
const crossUserDraft = getOfflineDraft({
  userId: '102', // 另一用户
  projectId: '2',
  formKind: 'report',
  entityId: 'draft_1',
});
assert.equal(crossUserDraft, null, 'Cross-user draft retrieval must return null');
console.log('✓ Strict isolation between users and projects verified');

// 测试保存多个草稿并列表拉取
saveOfflineDraft({
  userId: '101',
  projectId: '2',
  formKind: 'task',
  entityId: 'task_new_1',
  title: '新建任务暂存',
  data: { title: '测试任务' },
});

saveOfflineDraft({
  userId: '999', // 外部用户
  projectId: '2',
  formKind: 'task',
  entityId: 'task_other',
  title: '他人任务',
  data: {},
});

const user101Drafts = listOfflineDrafts('101', '2');
assert.equal(user101Drafts.length, 2, 'User 101 should see exactly 2 drafts for project 2');

// 测试单项删除
clearOfflineDraft({
  userId: '101',
  projectId: '2',
  formKind: 'task',
  entityId: 'task_new_1',
});
assert.equal(listOfflineDrafts('101', '2').length, 1);

// 测试退出登录清理当前用户全部草稿
clearUserOfflineDrafts('101');
assert.equal(listOfflineDrafts('101').length, 0, 'User 101 drafts should be completely purged');
assert.equal(listOfflineDrafts('999').length, 1, 'User 999 drafts must not be affected by user 101 logout');
console.log('✓ clearOfflineDraft and clearUserOfflineDrafts lifecycle passed');

console.log('All T12 Mobile Adaptation assertions PASSED!\n');
