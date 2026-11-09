import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

// apiRequest 需要 localStorage；先打桩再加载
const store = new Map<string, string>()
;(globalThis as any).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
}

const { apiRequest, ApiError, RATE_LIMIT_MESSAGE } = await import('../src/api/client')
const { inviteDeliveryNotice } = await import('../src/api/shell')
const { withBoundTarget } = await import('../src/api/auth')
const { shouldHideOuterTopBar, screenOwnsHeader } = await import('../src/mobile/navigation/mobileChrome')
const { normalizeMobileRoute } = await import('../src/mobile/navigation/mobileRoutes')
const { canManageProject } = await import('../src/mobile/features/projects/projectPermissions')
const paging = await import('../src/utils/messagePaging')
const { inboxSourceLabel } = await import('../src/utils/inboxText')

const src = (rel: string) => readFileSync(new URL('../src/' + rel, import.meta.url), 'utf8').replace(/\r\n/g, '\n')

console.log('--- 第二轮：手机网页与显示类修复 ---')

// A-15：429 显示中文提示（响应体不是 JSON 也一样）
;(globalThis as any).fetch = async () => new Response('Too Many Requests', { status: 429 })
await assert.rejects(
  () => apiRequest('/x'),
  (e: unknown) => e instanceof ApiError && e.code === 429 && e.message === '操作太频繁，请稍后再试',
)
assert.equal(RATE_LIMIT_MESSAGE, '操作太频繁，请稍后再试')
;(globalThis as any).fetch = async () =>
  new Response(JSON.stringify({ detail: 'slow down' }), { status: 429, headers: { 'Content-Type': 'application/json' } })
await assert.rejects(() => apiRequest('/x'), (e: unknown) => e instanceof ApiError && e.message === RATE_LIMIT_MESSAGE)

// B-03：界面写明是否已发邮件
assert.match(inviteDeliveryNotice({ email_status: 'sent' }, 'a@b.com'), /已发送邀请邮件/)
assert.match(inviteDeliveryNotice({ email_status: 'not_configured' }), /未配置发信.*手动转发/)
assert.match(inviteDeliveryNotice({ email_status: 'failed' }), /发送失败.*手动转发/)
assert.match(inviteDeliveryNotice({}), /手动转发/)

// D-7：只有 PM / 超管能看到项目设置与邀请
assert.equal(canManageProject({ is_pm: true, is_superadmin: false }), true)
assert.equal(canManageProject({ is_pm: false, is_superadmin: true }), true)
assert.equal(canManageProject({ is_pm: false, is_superadmin: false }), false)
assert.equal(canManageProject(null), false)
const projectScreens = src('mobile/features/projects/MobileProjectScreens.tsx')
assert.ok(projectScreens.includes('{canManage && onNavigateToSettings'), '齿轮要按权限显示')
assert.ok(projectScreens.includes('{canInvite && onNavigateToInvite'), '邀请按钮要按服务端邀请能力显示')

// D-9：自带顶栏的页面外层不再画顶栏
for (const screen of ['project-invite', 'project-settings', 'work-calendar', 'project-create', 'invite-accept', 'work-search']) {
  assert.equal(screenOwnsHeader(screen), true, screen)
  assert.equal(shouldHideOuterTopBar('work', screen), true, screen)
}
assert.equal(shouldHideOuterTopBar('work', 'work-tasks'), false)
assert.equal(shouldHideOuterTopBar('work', 'work-root'), false)

// D-8：人轴里“记录进展”留在人轴栈，返回回到人轴
assert.equal(normalizeMobileRoute({ screen: 'record-progress' }, 'axis').tab, 'axis')
assert.equal(normalizeMobileRoute({ screen: 'record-progress' }, 'knowledge').tab, 'knowledge')
assert.equal(normalizeMobileRoute({ screen: 'record-progress' }, 'work').tab, 'work')
assert.equal(normalizeMobileRoute({ screen: 'work-search' }, 'axis').tab, 'work')
assert.equal(normalizeMobileRoute({ tab: 'work', screen: 'record-progress' }, 'axis').tab, 'work')

// D-10：顶栏搜索打开手机版搜索页
const outlet = src('mobile/navigation/MobileRouteOutlet.tsx')
assert.ok(/screen: 'work-search'/.test(outlet.slice(outlet.indexOf('renderRightActions'))), '顶栏搜索要进 work-search')
assert.ok(!/onClick=\{props\.onOpenSearch\}/.test(outlet), '顶栏搜索不能再走桌面搜索浮层')

// D-5 / WR-27：手机新建任务读取默认优先级
const taskScreens = src('mobile/features/tasks/MobileTaskScreens.tsx')
assert.ok(taskScreens.includes('setPriority(defaultPriority)'))
assert.ok(outlet.includes('defaultPriority={props.settings.taskDefaults?.priority}'))

// D-12：保存失败提示紧贴保存按钮
const errIdx = taskScreens.indexOf('data-testid="task-edit-error"')
const btnIdx = taskScreens.indexOf("{busy ? '正在保存…' : isEditing")
assert.ok(errIdx > 0 && btnIdx > errIdx && btnIdx - errIdx < 1200, '错误提示应在保存按钮上方')

// D-13：受邀注册后落到被邀请项目
assert.ok(outlet.includes("screen: 'project-overview'") && outlet.includes('inviteLandingProjectId'))
const app = src('App.tsx')
assert.ok((app.match(/setInviteLandingProjectId\(/g) || []).length >= 4)

// WR-05：保存资料不再把旧头像写回去
const settingsScreens = src('mobile/features/settings/MobileSettingsScreens.tsx')
assert.ok(settingsScreens.includes('setAvatarUrl(user.avatar'))
assert.ok(settingsScreens.includes('await onUpdateUser({ name: nickname.trim() });'))
assert.ok(!settingsScreens.includes('avatar: avatarUrl'))

// WR-25：绑定成功立即显示地址
const bound = withBoundTarget(
  { email_verified: true, phone_verified: false, is_verified: false, email: '', phone: '' },
  'email',
  'me@x.com',
)
assert.equal(bound.email, 'me@x.com')
assert.equal(bound.phone, '')
assert.equal(
  withBoundTarget({ email_verified: true, phone_verified: true, is_verified: true, email: 'srv@x.com' }, 'email', 'me@x.com').email,
  'srv@x.com',
)

// WR-46 / WR-50：分页合并
const msg = (id: number) => ({ id })
assert.deepEqual(paging.mergeMessagesById([msg(1), msg(2)], [msg(2), msg(3)]).map((m) => m.id), [1, 2, 3])
// 轮询只刷新最新一页，已加载的更早消息保留
const prev = [msg(1), msg(2), msg(101), msg(102)]
assert.deepEqual(paging.replaceLatestPage(prev, [msg(101), msg(102), msg(103)]).map((m) => m.id), [1, 2, 101, 102, 103])
assert.equal(paging.hasMoreOlderMessages(100), true)
assert.equal(paging.hasMoreOlderMessages(37), false)
assert.equal(paging.hasMoreByTotal(50, 120), true)
assert.equal(paging.hasMoreByTotal(120, 120), false)
assert.deepEqual(paging.appendPageById([msg(9), msg(8)], [msg(8), msg(7)]).map((m) => m.id), [9, 8, 7])
const chat = src('mobile/features/messages/MobileMessageScreens.tsx')
assert.ok(chat.includes('data-testid="chat-load-older"') && chat.includes('listChannelMessages(id, page)'))
assert.ok(src('mobile/features/messages/MobileInboxScreens.tsx').includes('data-testid="inbox-load-more"'))
assert.ok(src('components/modals/NotificationsModal.tsx').includes('hasMoreByTotal(notifications.length, total)'))
assert.ok(src('components/views/InboxView.tsx').includes('hasMoreByTotal(inboxItems.length, inboxTotal)'))
assert.ok(src('components/views/MessagesView.tsx').includes('data-testid="messages-load-older"'))

// WR-47：附件显示在气泡里，下载带登录凭证（fetch + Authorization → blob）
const atts = paging.normalizeAttachments([
  { file_id: 7, original_name: '报告.pdf', size_bytes: 2048 },
  { name: '链接', url: 'https://a.b' },
])
assert.deepEqual(atts.map((a) => [a.fileId, a.name, a.sizeBytes]), [[7, '报告.pdf', 2048], [undefined, '链接', undefined]])
assert.equal(paging.formatFileSize(2048), '2.0 KB')
assert.ok(chat.includes('data-testid="chat-attachment"') && chat.includes('downloadCollabFile(att.fileId)'))
assert.ok(/downloadCollabFile[\s\S]{0,400}Authorization/.test(src('api/shell.ts')))

// C-8：收件箱没有英文文案 / 原始键名
const inbox = src('components/views/InboxView.tsx')
for (const word of ['External mail', 'Sync now', 'Syncing…', '>Archive<', '>Delete<', 'unknown sender', '(no subject)', 'Collab feed', 'Mark all read', 'No notifications', 'Search notifications']) {
  assert.ok(!inbox.includes(word), '收件箱不应再有英文：' + word)
}
assert.equal(inboxSourceLabel('collab'), '协作通知')
assert.equal(inboxSourceLabel('report_submitted'), '汇报通知')
assert.equal(inboxSourceLabel('task_assigned'), '任务通知')

console.log('OK')
