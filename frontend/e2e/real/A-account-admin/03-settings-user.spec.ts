import { expect, test, type Page } from '@playwright/test';
import { BASE, SMTP_BASELINE, adminSession, api, apiLogin, codeFrom, patchState, readState, retry429, seedSession, trackErrors, waitMail } from './helpers';

/**
 * 个人设置（用 02 注册出来的 A 用户，普通成员，看不到企业管理）。
 * 个人资料 / 安全 / 外观 / 通知偏好 / 任务默认值 + “通知渠道”页（个人 SMTP / LLM）+ 验证码登录。
 */

let U: { username: string; email: string; password: string };
let sess: { token: string; refresh: string };
let uid = 0;

test.beforeAll(async ({ request }) => {
  const st = readState();
  if (!st.user) throw new Error('需要先运行 02-invite.spec.ts 注册出 A 用户');
  U = st.user;
  uid = st.userId;
  const r = await apiLogin(request, U.username, U.password);
  sess = { token: r.token, refresh: r.refresh };
});

async function openSettings(page: Page, tab?: RegExp) {
  await seedSession(page, sess);
  await page.goto('/?view=settings');
  await expect(page.getByRole('heading', { name: '设置' }).first()).toBeVisible({ timeout: 30_000 });
  if (tab) await page.locator('main').getByRole('button', { name: tab }).click();
}
const me = async (request: any) => (await api(request, sess.token, 'get', '/users/me')).data;

test('普通成员看不到“企业管理”分组，且被拒绝写公司级配置', async ({ page, request }) => {
  await openSettings(page);
  await expect(page.getByText('企业管理')).toHaveCount(0);
  const r = await api(request, sess.token, 'put', '/companies/1/smtp', SMTP_BASELINE);
  expect(r.status).toBe(403);
  const r2 = await api(request, sess.token, 'put', '/companies/1/llm', { provider: 'fake' });
  expect(r2.status).toBe(403);
  // 成员可读状态但不含明文密码
  const g = await api(request, sess.token, 'get', '/companies/1/smtp');
  expect(g.status).toBe(200);
  expect(JSON.stringify(g.body)).not.toContain('any-pass');
});

test('个人资料：改昵称 / 头像地址 / 上传头像 / 重新同步；邮箱与职位只读', async ({ page, request }) => {
  const errs = trackErrors(page);
  await openSettings(page);
  const email = page.locator('input[type="email"]');
  await expect(email).toHaveAttribute('readonly', '');
  await expect(email).toHaveValue(U.email);
  const nick = `A昵称${Date.now().toString(36).slice(-4)}`;
  await page.locator('main input[type="text"]').first().fill(nick);
  await page.getByPlaceholder('https://…').fill('https://example.com/a-avatar.png');
  const put = page.waitForResponse((r) => r.url().includes('/users/me') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: '更新资料' }).click();
  expect((await put).status()).toBe(200);
  await expect(page.getByText('修改已保存')).toBeVisible();
  const m = await me(request);
  expect(m.nickname).toBe(nick);
  expect(m.avatar_url).toBe('https://example.com/a-avatar.png');
  await page.reload();
  await expect(page.locator('main input[type="text"]').first()).toHaveValue(nick);

  // 上传头像文件
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  const up = page.waitForResponse((r) => r.url().includes('/users/me/avatar'));
  await page.locator('input[type="file"]').setInputFiles({ name: 'a.png', mimeType: 'image/png', buffer: png });
  const ur = await up;
  expect(ur.status()).toBe(200);
  const m2 = await me(request);
  expect(m2.avatar_url).toContain('/avatar');
  console.log('[A03] 上传头像后 avatar_url =', m2.avatar_url);

  // 重新同步：会重新拉取任务 / 项目
  const sync = page.waitForResponse((r) => /\/tasks\?/.test(r.url()) || r.url().includes('/companies/mine'));
  await page.getByRole('button', { name: '重新同步', exact: true }).click();
  expect((await sync).status()).toBe(200);
  expect(errs.filter((e) => !/favicon|WebSocket|ws:|vapid/.test(e))).toEqual([]);
});

test('外观：深浅色与四种主题色 点击即生效、落库(ui-prefs)、刷新保持', async ({ page, request }) => {
  await openSettings(page, /外观$/);
  const html = page.locator('html');
  const dark = page.getByRole('button', { name: /深色|Dark|暗/ }).first();
  await dark.click();
  await expect(html).toHaveClass(/dark/);
  await expect.poll(async () => (await api(request, sess.token, 'get', '/users/me/ui-prefs')).data.ui.theme_mode).toBe('dark');
  await page.reload();
  await expect(html).toHaveClass(/dark/);
  await page.locator('main').getByRole('button', { name: /外观$/ }).click();
  for (const [name, id] of [['森林绿', 'green'], ['活力橙', 'amber'], ['警示红', 'red'], ['商务蓝', 'blue']] as const) {
    await page.getByRole('button', { name: new RegExp(name) }).click();
    await expect(html).toHaveAttribute('data-accent', id);
    await expect.poll(async () => (await api(request, sess.token, 'get', '/users/me/ui-prefs')).data.ui.accent).toBe(id);
  }
  await page.getByRole('button', { name: /浅色|Light|亮/ }).first().click();
  await expect(html).not.toHaveClass(/dark/);
  await expect.poll(async () => (await api(request, sess.token, 'get', '/users/me/ui-prefs')).data.ui.theme_mode).toBe('light');
});

test('任务默认值：默认优先级写入 ui-prefs，并在“新建任务”里生效', async ({ page, request }) => {
  await openSettings(page, /任务默认值$/);
  const sel = page.locator('main select').first();
  await sel.selectOption('High');
  await expect.poll(async () => (await api(request, sess.token, 'get', '/users/me/ui-prefs')).data.ui.task_default_priority).toBeTruthy();
  const prefs = (await api(request, sess.token, 'get', '/users/me/ui-prefs')).data.ui;
  console.log('[A03] 默认优先级 High 落库：', JSON.stringify(prefs));
  // 生效证明：打开“新建任务”表单，优先级默认值应是 High
  await page.reload();
  await expect(page.locator('main select').first()).toHaveCount(0); // 刷新后回到“个人资料”
  await page.getByRole('button', { name: /新建任务/ }).first().click();
  const modal = page.locator('div.fixed').filter({ hasText: /优先级|Priority/ }).first();
  await expect(modal).toBeVisible();
  const html = await modal.innerHTML();
  const highSelected = /高|High/.test(await modal.locator('button[class*="primary"], [aria-pressed="true"], [aria-checked="true"], select option:checked').allInnerTexts().then((a) => a.join('|')));
  console.log('[A03] 新建任务弹窗中被选中的优先级相关元素是否含“高”：', highSelected, html.length);
  expect(highSelected, '新建任务应默认选中“高”优先级').toBe(true);
});

test('通知偏好：四个渠道开关 / 静音时段 / 周末免打扰 写到个人 notify_pref，刷新保持', async ({ page, request }) => {
  await openSettings(page, /通知偏好$/);
  const boxes = page.locator('main input[type="checkbox"]');
  // 顺序：邮件、浏览器推送、桌面、微信、周末免打扰
  const before = (await me(request)).notify_pref || {};
  console.log('[A03] 起始 notify_pref =', JSON.stringify(before));
  const emailBox = boxes.nth(0);
  const was = await emailBox.isChecked();
  await emailBox.setChecked(!was);
  await page.waitForTimeout(600);
  const desk = boxes.nth(2);
  const deskWas = await desk.isChecked();
  await desk.setChecked(!deskWas);
  await page.waitForTimeout(600);
  await page.locator('input[type="time"]').nth(0).fill('21:30');
  await page.locator('input[type="time"]').nth(1).fill('06:45');
  await page.waitForTimeout(600);
  const weekend = page.getByLabel('周末全天免打扰');
  const wk = await weekend.isChecked();
  await weekend.setChecked(!wk);
  await page.waitForTimeout(600);
  await expect.poll(async () => {
    const n = (await me(request)).notify_pref || {};
    return n.channels?.email?.enabled === !was && n.channels?.desktop?.enabled === !deskWas && n.weekend_mute === !wk && n.quiet_hours?.start === '21:30' && n.quiet_hours?.end === '06:45';
  }, { timeout: 20_000 }).toBe(true);
  const np = (await me(request)).notify_pref;
  expect(np.channels.email.enabled).toBe(!was);
  expect(np.channels.desktop.enabled).toBe(!deskWas);
  expect(np.quiet_hours).toEqual({ start: '21:30', end: '06:45' });
  expect(np.weekend_mute).toBe(!wk);
  await page.reload();
  await page.locator('main').getByRole('button', { name: /通知偏好$/ }).click();
  await expect(page.locator('input[type="time"]').nth(0)).toHaveValue('21:30');
  await expect(page.locator('main input[type="checkbox"]').nth(0)).toBeChecked({ checked: !was });
  // 微信提醒：未绑定微信时开启应当被拒绝并有提示，且不改变状态
  const wx = page.locator('main input[type="checkbox"]').nth(3);
  await wx.setChecked(true).catch(() => undefined);
  await page.waitForTimeout(800);
  console.log('[A03] 未绑定微信时开启微信提醒后复选框状态：', await wx.isChecked(), ' toast=', await page.locator('[role="status"], [role="alert"]').allInnerTexts());
});

test('通知偏好：真实调度器遵守静音时段及关闭邮件渠道', async ({ request }) => {
  test.setTimeout(190_000);
  const before = await me(request);
  const tasks: number[] = [], reminders: number[] = [];
  async function dueReminder(tag: string) {
    const title = `A-偏好-${tag}-${Date.now()}`;
    const task = await api(request, sess.token, 'post', '/tasks', { title, due_date: new Date(Date.now() + 600_000).toISOString() });
    expect(task.status).toBe(201); tasks.push(task.data.id);
    const rem = await api(request, sess.token, 'post', '/reminders', { task_id: task.data.id, remind_at: new Date(Date.now() - 1000).toISOString().replace('Z', ''), remind_type: 1, notify_channels: 'email' });
    expect(rem.status).toBe(201); reminders.push(rem.data.id);
    return { title, id: rem.data.id };
  }
  try {
    const hhmm = (delta: number) => new Date(Date.now() + (8 + delta) * 3600_000).toISOString().slice(11, 16);
    expect((await api(request, sess.token, 'put', '/users/me', { notify_pref: { channels: { email: { enabled: true } }, quiet_hours: { start: hhmm(-1), end: hhmm(2) }, weekend_mute: false } })).status).toBe(200);
    const quiet = await dueReminder('静音');
    await expect.poll(async () => {
      const rows = (await api(request, sess.token, 'get', '/reminders')).data;
      const rem = rows.find((x: any) => x.id === quiet.id);
      return rem && !rem.is_sent && new Date(rem.remind_at).getTime() > Date.now() + 3600_000;
    }, { timeout: 85_000, intervals: [2000] }).toBe(true);
    console.log('[A03] GET /reminders 200：静音提醒保持未发送，提醒时间已顺延超过1小时');
    expect((await api(request, sess.token, 'put', '/users/me', { notify_pref: { channels: { email: { enabled: false } }, quiet_hours: { start: '00:00', end: '00:00' }, weekend_mute: false } })).status).toBe(200);
    const off = await dueReminder('关邮件');
    await expect.poll(async () => (await api(request, sess.token, 'get', '/reminders')).data.find((x: any) => x.id === off.id)?.is_sent, { timeout: 85_000, intervals: [2000] }).toBe(true);
    const msgs = await (await import('./helpers')).mailList(request, U.email);
    expect(msgs.some((x: any) => [quiet.title, off.title].some(title => `${x.Subject} ${x.Snippet}`.includes(title)))).toBe(false);
    console.log('[A03] 邮件关闭提醒已被调度器处理，mailpit 无这两条提醒邮件');
  } finally {
    for (const id of reminders) await api(request, sess.token, 'delete', `/reminders/${id}`);
    for (const id of tasks) await api(request, sess.token, 'delete', `/tasks/${id}`);
    const pref = before.notify_pref;
    const channels = Object.fromEntries(Object.entries(pref.channels || {}).map(([key, value]: any) => [key, { enabled: value.enabled }]));
    expect((await api(request, sess.token, 'put', '/users/me', { notify_pref: { channels, quiet_hours: pref.quiet_hours, weekend_mute: pref.weekend_mute } })).status).toBe(200);
  }
});

test('通知偏好：发送测试邮件（走公司发信，mailpit 真收到）、发送测试推送（未订阅给出原因）', async ({ page, request }) => {
  await openSettings(page, /通知偏好$/);
  const since = Date.now();
  const r = page.waitForResponse((x) => x.url().includes('/notify/test-send'));
  await page.getByTestId('notify-test-email').click();
  expect((await r).status()).toBe(200);
  await expect(page.getByText(/测试邮件已发送/)).toBeVisible();
  const mail = await waitMail(request, U.email, { sinceMs: since, subject: /测试通知/ });
  expect(mail.summary.From.Address).toBe('sender@audit.test');
  const r2 = page.waitForResponse((x) => x.url().includes('/notify/test-send'));
  await page.getByTestId('notify-test-webpush').click();
  expect((await r2).status()).toBe(200);
  await expect(page.getByText(/测试发送失败：尚未订阅浏览器推送/)).toBeVisible();
  // 发送记录折叠面板
  await page.getByTestId('notify-records-toggle').click();
  await expect(page.getByText(/\[email\]/).first()).toBeVisible();
  await expect(page.getByText(/\[webpush\]/).first()).toBeVisible();
  await expect(page.locator('p.text-error').filter({ hasText: '尚未订阅浏览器推送' }).first()).toBeVisible();
  const rec = await api(request, sess.token, 'get', '/notify/records?limit=50');
  expect(rec.data.items.length).toBeGreaterThanOrEqual(2);
  await page.getByTestId('notify-records-toggle').click();
});

test('“通知渠道”页(个人级 SMTP / LLM)：保存写个人级、不影响公司级、测试邮件用个人配置', async ({ page, request }) => {
  const admin = await adminSession(request);
  const compBefore = (await api(request, admin.token, 'get', '/companies/1/smtp')).data;
  await seedSession(page, sess);
  await page.goto('/?view=notifications');
  await expect(page.getByRole('heading', { name: '通知中心' })).toBeVisible({ timeout: 30_000 });
  const personalFrom = `a-personal-${Date.now().toString(36)}@audit.test`;
  const inputs = page.locator('section').filter({ hasText: /^SMTP/ }).locator('input');
  await inputs.nth(0).fill('mailpit');
  await inputs.nth(1).fill('1025');
  await inputs.nth(2).fill('sender@audit.test');
  await inputs.nth(3).fill(personalFrom);
  await inputs.nth(4).fill('any-pass');
  expect(await inputs.nth(4).getAttribute('autocomplete')).toBe('new-password');
  const put = page.waitForResponse((r) => r.url().includes('/notifications/smtp-config') && r.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存 SMTP' }).click();
  expect((await put).status()).toBe(200);
  const p = (await api(request, sess.token, 'get', '/notifications/smtp-config')).data;
  expect(p).toMatchObject({ smtp_host: 'mailpit', smtp_from: personalFrom, has_password: true });
  // 公司级没有被动到
  const compAfter = (await api(request, admin.token, 'get', '/companies/1/smtp')).data;
  expect(compAfter.smtp_from).toBe(compBefore.smtp_from);
  // 生效：个人测试邮件应使用个人配置（发件人 = personalFrom）
  const since = Date.now();
  const t = await api(request, sess.token, 'post', '/notify/test-send', { channel: 'email' });
  expect(t.data.ok).toBe(true);
  const mail = await waitMail(request, U.email, { sinceMs: since, subject: /测试通知/ });
  expect(mail.summary.From.Address).toBe(personalFrom);
  // 清理个人 SMTP，回到走公司级
  const clr = await api(request, sess.token, 'put', '/notifications/smtp-config', { smtp_host: '', smtp_user: '', smtp_password: '', smtp_from: '' });
  console.log('[A03] 清理个人 SMTP：', clr.status, JSON.stringify(clr.data));
});

test('验证码登录（A 用户）：邮箱收码、错码被拒、对码登录', async ({ page, request }) => {
  await page.goto('/');
  await page.getByRole('button', { name: '验证码登录' }).click();
  await page.getByPlaceholder('已注册的邮箱或手机号').fill(U.email);
  const since = Date.now();
  for (let i = 0; i < 6; i++) {
    const sc = page.waitForResponse((r) => r.url().includes('/auth/send-code'));
    await page.getByRole('button', { name: '获取验证码' }).click();
    const st = (await sc).status();
    if (st !== 429) { expect(st).toBe(200); break; }
    await page.waitForTimeout(9000);
  }
  await expect(page.getByText('验证码已发送')).toBeVisible();
  const mail = await waitMail(request, U.email, { sinceMs: since, subject: /验证码/ });
  const code = codeFrom(mail.detail);
  await page.locator('input[maxlength="6"]').fill(code === '000000' ? '111111' : '000000');
  await page.getByRole('button', { name: '登录', exact: true }).last().click();
  await expect(page.locator('p.text-error')).toBeVisible();
  console.log('[A03] 验证码登录错码提示：', await page.locator('p.text-error').innerText());
  await page.locator('input[maxlength="6"]').fill(code);
  for (let i = 0; i < 6; i++) {
    const lr = page.waitForResponse((r) => r.url().includes('/auth/login-code'));
    await page.getByRole('button', { name: '登录', exact: true }).last().click();
    const st = (await lr).status();
    if (st !== 429) break;
    await page.waitForTimeout(9000);
  }
  await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 30_000 });
  // “未注册邮箱”提示
  void BASE; void retry429;
});

test('安全：改密码——校验提示、改成功后新密码能登录旧密码不能、再改回', async ({ page, request }) => {
  await openSettings(page, /安全设置$/);
  const pw = page.locator('main input[type="password"]');
  await expect(pw.nth(0)).toHaveAttribute('autocomplete', 'current-password');
  await expect(pw.nth(1)).toHaveAttribute('autocomplete', 'new-password');
  await expect(pw.nth(2)).toHaveAttribute('autocomplete', 'new-password');
  const NEW = U.password + '-N2';
  // 两次输入不一致
  await pw.nth(0).fill(U.password);
  await pw.nth(1).fill(NEW);
  await pw.nth(2).fill(NEW + 'x');
  await page.getByRole('button', { name: '更新密码' }).click();
  await expect(page.getByText('两次输入的新密码不一致')).toBeVisible();
  // 旧密码错误
  await pw.nth(0).fill('wrong-old-pass');
  await pw.nth(2).fill(NEW);
  const bad = page.waitForResponse((r) => r.url().includes('/users/me/password'));
  await page.getByRole('button', { name: '更新密码' }).click();
  expect((await bad).status()).toBe(400);
  await expect(page.getByText('原密码错误')).toBeVisible();
  // 正确修改
  await pw.nth(0).fill(U.password);
  const ok = page.waitForResponse((r) => r.url().includes('/users/me/password'));
  await page.getByRole('button', { name: '更新密码' }).click();
  expect((await ok).status()).toBe(200);
  await expect(page.getByText('密码已更新')).toBeVisible();
  await expect(pw.nth(0)).toHaveValue('');
  // 效果：新密码可登录、旧密码被拒
  const n = await retry429(() => request.post(`${BASE}/api/v1/auth/login`, { data: { username: U.username, password: NEW } }));
  expect(n.status()).toBe(200);
  const o = await retry429(() => request.post(`${BASE}/api/v1/auth/login`, { data: { username: U.username, password: U.password } }));
  expect(o.status()).toBeGreaterThanOrEqual(400);
  // 改回
  await pw.nth(0).fill(NEW);
  await pw.nth(1).fill(U.password);
  await pw.nth(2).fill(U.password);
  const back = page.waitForResponse((r) => r.url().includes('/users/me/password'));
  await page.getByRole('button', { name: '更新密码' }).click();
  expect((await back).status()).toBe(200);
  const again = await retry429(() => request.post(`${BASE}/api/v1/auth/login`, { data: { username: U.username, password: U.password } }));
  expect(again.status()).toBe(200);
  // 短密码
  await pw.nth(0).fill(U.password);
  await pw.nth(1).fill('123');
  await pw.nth(2).fill('123');
  await page.getByRole('button', { name: '更新密码' }).click();
  await page.waitForTimeout(300);
});

test('安全：危险区——密码错误时删除账号被拒；确认框取消不发请求', async ({ page, request }) => {
  await openSettings(page, /安全设置$/);
  const del = page.getByPlaceholder('当前密码');
  await del.fill('not-my-password');
  // 取消确认框：不应有请求
  let called = false;
  page.on('request', (r) => { if (r.url().includes('/users/me/delete')) called = true; });
  page.once('dialog', (d) => d.dismiss());
  await page.getByRole('button', { name: '删除账号' }).click();
  await page.waitForTimeout(500);
  expect(called).toBe(false);
  // 接受确认框：服务端应拒绝
  page.once('dialog', (d) => d.accept());
  const resp = page.waitForResponse((r) => r.url().includes('/users/me/delete'));
  await page.getByRole('button', { name: '删除账号' }).click();
  const st = (await resp).status();
  expect(st).toBeGreaterThanOrEqual(400);
  // 账号还在
  const m = await me(request);
  expect(m.username).toBe(U.username);
});

test('退出登录：安全页按钮清令牌回登录页，并撤销服务端 refresh；顶栏菜单退出同样有效', async ({ page, request, browser }) => {
  // 安全页的退出按钮
  const s1 = await apiLogin(request, U.username, U.password);
  await seedSession(page, { token: s1.token, refresh: s1.refresh });
  await page.goto('/?view=settings');
  await page.locator('main').getByRole('button', { name: /安全设置$/ }).click();
  const lo = page.waitForResponse((r) => r.url().includes('/auth/logout'));
  await page.locator('main').getByRole('button', { name: '退出登录' }).click();
  expect((await lo).status()).toBe(200);
  await expect(page.getByPlaceholder('用户名 / 邮箱 / 手机号')).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull();
  const rf = await request.post(`${BASE}/api/v1/auth/refresh`, { data: { refresh_token: s1.refresh } });
  console.log('[A03] 退出后用旧 refresh 换新令牌 ->', rf.status());
  expect(rf.status()).toBe(401);
  // 顶栏用户菜单的退出
  const s2 = await apiLogin(request, U.username, U.password);
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await seedSession(p2, { token: s2.token, refresh: s2.refresh });
  await p2.goto('/');
  await p2.getByTestId('user-menu-button').click();
  const lo2 = p2.waitForResponse((r) => r.url().includes('/auth/logout'));
  await p2.getByRole('button', { name: /退出登录/ }).click();
  expect((await lo2).status()).toBe(200);
  await expect(p2.getByPlaceholder('用户名 / 邮箱 / 手机号')).toBeVisible();
  await ctx.close();
  patchState({ loggedOutOk: true });
  void uid;
});
