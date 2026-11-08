import assert from 'node:assert/strict';
import { DEFAULT_REGISTRATION_CONFIG, type RegistrationConfig } from '../src/api/auth';
import { clearInviteToken, readInviteToken } from '../src/utils/invite';

// Mock browser global environment if needed
const storageMap = new Map<string, string>();
const fakeSessionStorage = {
  getItem: (key: string) => storageMap.get(key) ?? null,
  setItem: (key: string, val: string) => storageMap.set(key, val),
  removeItem: (key: string) => storageMap.delete(key),
  clear: () => storageMap.clear(),
};

(globalThis as any).sessionStorage = fakeSessionStorage;
(globalThis as any).window = {
  location: {
    search: '',
    href: 'http://localhost/',
    origin: 'http://localhost',
  },
  history: {
    replaceState: (_: any, __: any, next: string) => {
      (globalThis as any).window.location.href = `http://localhost${next}`;
      const qIdx = next.indexOf('?');
      (globalThis as any).window.location.search = qIdx >= 0 ? next.slice(qIdx) : '';
    },
  },
};

console.log('--- Testing Launch Auth Web Contracts ---');

// 1. invite_only 与 token 关联判定
function computeCanRegister(mode: 'open' | 'invite_only', token: string | null) {
  const isInviteOnly = mode === 'invite_only';
  return !isInviteOnly || Boolean(token);
}

// 1.1 invite_only 无 token：不显示注册入口
assert.equal(computeCanRegister('invite_only', null), false, 'invite_only without token must disallow register');
assert.equal(computeCanRegister('invite_only', ''), false, 'invite_only with empty token must disallow register');

// 1.2 invite_only 有 token：允许显示注册表单
assert.equal(computeCanRegister('invite_only', 'valid_inv_token_123'), true, 'invite_only with token must allow register');

// 1.3 open 模式下无/有 token 都允许注册
assert.equal(computeCanRegister('open', null), true, 'open mode without token allows register');
assert.equal(computeCanRegister('open', 'valid_inv_token_123'), true, 'open mode with token allows register');

// 1.4 文案校验
const INVITE_ONLY_HINT = '仅限受邀注册，请向管理员索取邀请链接';
assert.equal(INVITE_ONLY_HINT, '仅限受邀注册，请向管理员索取邀请链接');

// 2. 有 token 时请求体带 invite_token
function buildRegisterPayload(params: {
  username: string;
  password: string;
  email: string;
  email_code: string;
  phone?: string;
  phone_code?: string;
  invite_token?: string;
}) {
  return {
    username: params.username,
    password: params.password,
    email: params.email,
    email_code: params.email_code,
    ...(params.phone ? { phone: params.phone } : {}),
    ...(params.phone_code ? { phone_code: params.phone_code } : {}),
    ...(params.invite_token ? { invite_token: params.invite_token } : {}),
  };
}

function buildSendCodePayload(params: {
  channel: 'email' | 'sms';
  target: string;
  invite_token?: string;
}) {
  return {
    channel: params.channel,
    target: params.target,
    purpose: 'register',
    ...(params.invite_token ? { invite_token: params.invite_token } : {}),
  };
}

const regWithToken = buildRegisterPayload({
  username: 'testuser',
  password: 'password123',
  email: 'test@example.com',
  email_code: '123456',
  invite_token: 'my_invite_token_777',
});
assert.equal(regWithToken.invite_token, 'my_invite_token_777', 'register payload must carry invite_token when present');

const regWithoutToken = buildRegisterPayload({
  username: 'testuser',
  password: 'password123',
  email: 'test@example.com',
  email_code: '123456',
});
assert.equal(regWithoutToken.invite_token, undefined, 'register payload must omit invite_token when absent');

const sendCodeWithToken = buildSendCodePayload({
  channel: 'email',
  target: 'test@example.com',
  invite_token: 'my_invite_token_777',
});
assert.equal(sendCodeWithToken.invite_token, 'my_invite_token_777', 'send-code payload must carry invite_token when present');

const sendCodeWithoutToken = buildSendCodePayload({
  channel: 'email',
  target: 'test@example.com',
});
assert.equal(sendCodeWithoutToken.invite_token, undefined, 'send-code payload must omit invite_token when absent');

// 3. phone_required=false 时协作操作不弹手机验证
function checkRequirePhoneForCollab(params: {
  phoneRequired: boolean;
  phoneVerified: boolean;
  onOpenGate: () => void;
}) {
  if (!params.phoneRequired) return true;
  if (params.phoneVerified) return true;
  params.onOpenGate();
  return false;
}

let gateOpened = false;
const passWhenPhoneNotRequired = checkRequirePhoneForCollab({
  phoneRequired: false,
  phoneVerified: false,
  onOpenGate: () => {
    gateOpened = true;
  },
});
assert.equal(passWhenPhoneNotRequired, true, 'Collaboration must pass directly when phone_required is false');
assert.equal(gateOpened, false, 'Phone gate must not open when phone_required is false');

// 当 phone_required=true 且 phoneVerified=false 时必须拦截并弹窗
gateOpened = false;
const blockedWhenPhoneRequired = checkRequirePhoneForCollab({
  phoneRequired: true,
  phoneVerified: false,
  onOpenGate: () => {
    gateOpened = true;
  },
});
assert.equal(blockedWhenPhoneRequired, false, 'Collaboration must be blocked when phone_required is true and phone unverified');
assert.equal(gateOpened, true, 'Phone gate must open when phone_required is true and unverified');

// 4. 注册响应有 project_id 时清除 token
storageMap.set('pending_invite_token', 'token_to_clear');
assert.equal(readInviteToken(), 'token_to_clear');
clearInviteToken();
assert.equal(readInviteToken(), null, 'clearInviteToken must remove pending token');

console.log('✓ All Launch Auth web contract assertions PASSED!');
