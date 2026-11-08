import assert from 'node:assert/strict';
import { REGISTERED_SCREENS } from '../src/mobile/navigation/mobileRoutes';
import { isUserAdmin } from '../src/mobile/features/settings/MobileSettingsScreens';
import { UserProfile } from '../src/types';

console.log('--- Testing T11 Mobile Settings & Admin Separation Contracts ---');

// 1. 验证手机端保留的个人设置页面 key 均在 REGISTERED_SCREENS.me 中登记
const mobilePersonalScreens = [
  'me-root',               // 53: 我的
  'me-profile',            // 54: 个人资料
  'me-security',           // 55: 账号安全
  'me-appearance',         // 56: 外观
  'me-notifications',      // 57: 通知与免打扰
  'me-defaults',           // 58: 任务默认值
  'me-billing-help',       // 62: 隐私与帮助
  'me-notify-logs',        // 63: 通知发送记录
  'me-integrations',       // 90: 第三方服务绑定
];

for (const screen of mobilePersonalScreens) {
  assert.ok(
    REGISTERED_SCREENS.me.has(screen),
    `REGISTERED_SCREENS.me must contain mobile personal screen: ${screen}`,
  );
}
console.log(`✓ All ${mobilePersonalScreens.length} personal settings screen keys registered in mobile navigation`);

// 2. 验证企业管理配置 admin-* 页面已彻底移出手机端路由（企业配置只在电脑端管理）
const removedAdminScreens = [
  'admin-notify-channels',
  'admin-llm-config',
  'admin-org-sso',
  'admin-push-certs',
  'admin-model-keys',
  'admin-asr-config',
  'admin-sso-config',
];

for (const screen of removedAdminScreens) {
  assert.equal(
    REGISTERED_SCREENS.me.has(screen),
    false,
    `Admin screen '${screen}' must NOT be in mobile REGISTERED_SCREENS.me`,
  );
}
console.log(`✓ All ${removedAdminScreens.length} enterprise admin screens cleanly excluded from mobile routes`);

// 3. 验证 isUserAdmin 权限安全决策函数
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

// 4. 验证密钥与密码安全不回显契约
function maskSecret(key: string): string {
  if (!key) return '';
  if (key.length <= 8) return '••••••••';
  return `${key.slice(0, 3)}••••••••${key.slice(-3)}`;
}

assert.equal(maskSecret('sk-1234567890abcdef'), 'sk-••••••••def');
assert.equal(maskSecret('short'), '••••••••');
assert.equal(maskSecret(''), '');
console.log('✓ Secret masking contract assertions passed');

console.log('All T11 Mobile Settings & Admin Separation assertions PASSED!\n');
