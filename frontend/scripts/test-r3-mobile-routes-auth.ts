import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { isValidScreenForTab, normalizeMobileRoute } from '../src/mobile/navigation/mobileRoutes'
import { parseInviteInput } from '../src/utils/invite'
import { canInviteToProject } from '../src/mobile/features/projects/projectPermissions'

assert.equal(canInviteToProject({ is_pm: false, is_superadmin: false, can_invite: true }), true)
assert.equal(canInviteToProject({ is_pm: true, is_superadmin: false, can_invite: false }), false)
assert.equal(canInviteToProject({ is_pm: false, is_superadmin: false }), false)
assert.equal(canInviteToProject(null), false)

assert.equal(parseInviteInput(' code-123 '), 'code-123')
assert.equal(parseInviteInput('https://work.example/?invite=web-code'), 'web-code')
assert.equal(parseInviteInput('https://work.example/?token=token-code'), 'token-code')
assert.equal(parseInviteInput('worktodo://invite/native-code'), 'native-code')
assert.equal(parseInviteInput('worktodo://invite?token=query-code'), 'query-code')
assert.throws(() => parseInviteInput('https://work.example/?view=tasks'), /有效的邀请码/)
assert.throws(() => parseInviteInput('javascript:alert(1)'), /有效的邀请码/)

const read = (file: string) => readFileSync(new URL(`../${file}`, import.meta.url), 'utf8')
const outlet = read('src/mobile/navigation/MobileRouteOutlet.tsx')
const projects = read('src/mobile/features/projects/MobileProjectScreens.tsx')
const messages = read('src/mobile/features/messages/MobileMessageScreens.tsx')
const app = read('src/App.tsx')
const auth = read('src/components/LoginGate.tsx')

assert.equal(isValidScreenForTab('work', 'company-create'), false, '单公司部署不能注册创建公司路由')
assert.equal(normalizeMobileRoute({ screen: 'company-create' }).screen, 'project-switch', '旧公司创建入口应回到项目列表')
assert.ok(!outlet.includes("activeRoute.screen === 'company-create'"), '不能渲染公司创建入口')
assert.ok(projects.includes('onJoinProjectClick') && projects.includes('使用邀请加入项目'), '项目列表提供手动加入入口')
assert.match(outlet, /onJoinProjectClick=\{\(\) => push\(\{ screen: 'invite-accept'/, '手动加入入口接到邀请页')
assert.match(outlet, /onOpenExtractChat=\{\(\) => setIsExtractChatOpen\(true\)\}/, '消息入口打开已有提取任务弹层')
assert.ok(messages.includes('onOpenExtractChat') && messages.includes('从聊天提取任务'), '消息列表公开提取入口')
assert.ok(outlet.includes("id: 'extract-chat'"), '聊天提取弹层必须支持 APP 与浏览器返回')
assert.ok(!existsSync(new URL('../src/mobile/features/auth/MobileAuthScreens.tsx', import.meta.url)), '删除无运行时引用的旧认证页面')
assert.match(app, /if \(!authed\)[\s\S]*?<LoginGate/, '手机和桌面均走同一个正式认证组件')
assert.ok(auth.includes('forgot-password-link') && auth.includes('reset-password-form'), '正式认证页提供找回密码表单')

const storage = new Map<string, string>()
Object.assign(globalThis, { localStorage: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, value),
  removeItem: (key: string) => storage.delete(key),
} })
const requests: Array<{ url: string; method?: string; body: unknown }> = []
globalThis.fetch = async (input, init) => {
  requests.push({ url: String(input), method: init?.method, body: JSON.parse(String(init?.body)) })
  return new Response(JSON.stringify({ code: 200, data: { ok: true, cooldown_seconds: 60 } }), { status: 200 })
}
const { sendResetCode, resetPassword, getRegistrationConfig } = await import('../src/api/auth')
await sendResetCode('email', 'member@example.test')
await sendResetCode('sms', '13800138000')
await resetPassword({ channel: 'email', target: 'member@example.test', code: '123456', new_password: 'new-password' })
assert.deepEqual(requests, [
  { url: '/api/v1/auth/send-code', method: 'POST', body: { channel: 'email', target: 'member@example.test', purpose: 'reset_password' } },
  { url: '/api/v1/auth/send-code', method: 'POST', body: { channel: 'sms', target: '13800138000', purpose: 'reset_password' } },
  { url: '/api/v1/auth/reset-password', method: 'POST', body: { channel: 'email', target: 'member@example.test', code: '123456', new_password: 'new-password' } },
])
globalThis.fetch = async () => new Response(JSON.stringify({ code: 200, data: {
  mode: 'invite_only', phone_required: false, login_methods: { password: false, dingtalk: true, unsafe: 'secret' },
} }), { status: 200 })
const config = await getRegistrationConfig()
assert.deepEqual(config.login_methods, { password: false, dingtalk: true }, '匿名开关传给正式登录组件并过滤非布尔值')
assert.ok(auth.includes('passwordAllowed') && auth.includes('config.login_methods?.password'), '桌面手机密码与验证码统一遵循企业密码开关')
console.log('R3 手机邀请、聊天提取、单公司入口与共享找回密码回归通过')
