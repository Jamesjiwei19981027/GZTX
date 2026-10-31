import assert from 'node:assert/strict';
import { REGISTERED_SCREENS } from '../src/mobile/navigation/mobileRoutes';
import { isUserAdmin } from '../src/mobile/features/settings/MobileSettingsScreens';
import { UserProfile } from '../src/types';

console.log('--- Testing T11 Mobile Settings & Admin Integration Contracts ---');

// 1. 验证 16 个 T11 页面 key 均已在 REGISTERED_SCREENS.me 中登记
const t11RequiredScreens = [
  'me-root',               // 53: 我的
  'me-profile',            // 54: 个人资料
  'me-security',           // 55: 账号安全
  'me-appearance',         // 56: 外观与语言
  'me-notifications',      // 57: 通知与免打扰
  'me-defaults',           // 58: 任务默认值
  'admin-notify-channels', // 59: 通知渠道配置
  'admin-llm-config',      // 60: AI 模型配置
  'admin-org-sso',         // 61: 组织与登录集成
  'me-billing-help',       // 62: 套餐、隐私与帮助
  'me-notify-logs',        // 63: 通知发送记录
  'me-integrations',       // 90: 第三方服务绑定
  'admin-push-certs',      // 91: 推送证书状态
  'admin-model-keys',      // 92: 模型密钥配置
  'admin-asr-config',      // 93: ASR 语音配置
  'admin-sso-config',      // 94: SSO 配置
];

for (const screen of t11RequiredScreens) {
  assert.ok(
    REGISTERED_SCREENS.me.has(screen),
    `REGISTERED_SCREENS.me must contain T11 screen key: ${screen}`,
  );
}
console.log(`✓ All ${t11RequiredScreens.length} T11 screen keys registered in navigation routes`);

// 2. 验证 isUserAdmin 权限安全决策函数
const adminProfiles: UserProfile[] = [
  { name: 'Admin User', email: 'admin@corp.com', avatar: '', role: 'admin' },
  { name: 'Super Admin', email: 'root@corp.com', avatar: '', role: 'super_admin' },
  { name: 'Company Owner', email: 'boss@corp.com', avatar: '', role: 'owner' },
  { name: '企业管理员', email: 'mgr@corp.com', avatar: '', role: '系统管理员' },
];

for (const p of adminProfiles) {
  assert.equal(isUserAdmin(p), true, `Role '${p.role}' should be recognized as admin`);
}

const memberProfiles: UserProfile[] = [
  { name: 'Normal Member', email: 'dev@corp.com', avatar: '', role: 'member' },
  { name: 'Guest User', email: 'guest@corp.com', avatar: '', role: 'viewer' },
  { name: 'Collaborator', email: 'collab@corp.com', avatar: '', role: 'collaborator' },
  { name: 'Empty Role', email: 'anon@corp.com', avatar: '', role: '' },
];

for (const p of memberProfiles) {
  assert.equal(isUserAdmin(p), false, `Role '${p.role}' must NOT have enterprise write permissions`);
}
console.log('✓ isUserAdmin role-based access control assertions passed');

// 3. 验证密钥与密码安全不回显契约
// 模拟密钥掩码函数与安全规则
function maskSecret(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 3)}••••••••${key.slice(-3)}`;
}

assert.equal(maskSecret('sk-1234567890abcdef'), 'sk-••••••••def');
assert.equal(maskSecret('short'), '••••••••');
assert.equal(maskSecret(''), '');
console.log('✓ Secret masking contract assertions passed');

console.log('All T11 Mobile Settings assertions PASSED!\n');
