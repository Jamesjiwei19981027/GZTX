import { expect, test } from '@playwright/test';
import { BASE, COMPANY_ID, RUN, adminSession, api, codeFrom, patchState, readState, retry429, seedSession, trackErrors, waitMail } from './helpers';

/**
 * 邀请制注册全链路（真后端、不打桩）：
 * 超管在团队页发邀请 → 拿链接 → 新用户打开链接 → 邮箱验证码（mailpit）→ 注册 → 自动进入被邀请项目。
 * 注意：email-validator 会拒绝 .test 域名，所以收件邮箱统一用 audit.example.com。
 */
test.describe.configure({ mode: 'serial' });

const projectName = `A-项目-${RUN}`;
const inviteeEmail = `a-inv-${RUN}@audit.example.com`;
const otherEmail = `a-other-${RUN}@audit.example.com`;
const username = `A_user_${RUN}`;
const password = 'A-pass-123456';
let inviteLink = '';
let projectId = 0;

test('准备：超管用接口建一个 A- 项目', async ({ request }) => {
  const admin = await adminSession(request);
  const r = await api(request, admin.token, 'post', '/projects', { company_id: COMPANY_ID, name: projectName });
  expect(r.status).toBe(200);
  projectId = r.data.id;
  expect(r.data.name).toBe(projectName);
  patchState({ project: { id: projectId, name: projectName } });
});

test('团队页：超管选中项目后发邀请，拿到邀请链接（取消 / 复制链接按钮可用）', async ({ page, request }) => {
  const errs = trackErrors(page);
  const admin = await adminSession(request);
  await seedSession(page, admin);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/?view=team');
  await expect(page.getByRole('heading', { name: /团队成员/ })).toBeVisible({ timeout: 30_000 });
  // 选择项目
  await page.locator('header').getByRole('button', { name: /expand_more/ }).first().click();
  const opt = page.getByRole('button', { name: new RegExp(projectName) });
  await expect(opt).toBeVisible();
  await opt.click();
  await expect(page.locator('header').getByRole('button', { name: new RegExp(projectName) })).toBeVisible();
  // 成员列表：项目创建者（auditadmin）在列表中
  await expect(page.getByText('auditadmin').first()).toBeVisible();
  await expect(page.getByText(/共 \d+ 人/)).toBeVisible();

  // 取消按钮
  await page.getByRole('button', { name: /邀请$/ }).click();
  await expect(page.getByRole('heading', { name: '邀请项目成员' })).toBeVisible();
  await page.getByRole('button', { name: '取消' }).click();
  await expect(page.getByRole('heading', { name: '邀请项目成员' })).toHaveCount(0);

  // 正式发邀请
  await page.getByRole('button', { name: /邀请$/ }).click();
  await page.getByPlaceholder('email@example.com').fill(inviteeEmail);
  const resp = page.waitForResponse((r) => r.url().includes(`/projects/${projectId}/invitations`) && r.request().method() === 'POST');
  await page.getByRole('button', { name: '发送邀请' }).click();
  expect((await resp).status()).toBe(200);
  await expect(page.getByText('邀请链接', { exact: true })).toBeVisible();
  inviteLink = (await page.locator('div.break-all p').innerText()).trim();
  expect(inviteLink).toMatch(/\/\?invite=/);
  await expect(page.getByText(/已发送邀请邮件.*链接也可复制转发/)).toBeVisible();
  await page.getByRole('button', { name: '复制链接' }).click();
  const clip = await page.evaluate(() => navigator.clipboard.readText()).catch(() => '');
  console.log('[A02] 复制链接后剪贴板是否等于链接：', clip === inviteLink);
  expect(clip).toBe(inviteLink);
  patchState({ inviteLink });
  expect(errs.filter((e) => !/favicon|WebSocket|ws:/.test(e))).toEqual([]);
});

test('邀请邮件到达被邀请人，正文包含本次邀请令牌', async ({ request }) => {
  const mail = await waitMail(request, inviteeEmail, { subject: /邀请/ });
  expect(`${mail.detail.Text} ${mail.detail.HTML}`).toContain(new URL(inviteLink).searchParams.get('invite'));
  console.log('[A02] 邀请邮件到达 mailpit，主题：', mail.summary.Subject);
});

test('令牌与邮箱不匹配：页面发码被拒，且接口层 register 也拒绝', async ({ browser, request }) => {
  const link = readState().inviteLink as string;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(link);
  await expect(page.getByRole('heading', { name: '创建账户' })).toBeVisible();
  await page.getByLabel('邮箱 *', { exact: true }).fill(otherEmail);
  const resp = page.waitForResponse((r) => r.url().includes('/auth/send-code'));
  await page.getByRole('button', { name: '获取验证码' }).click();
  const status = (await resp).status();
  if (status === 429) test.info().annotations.push({ type: '提示', description: '撞到共享限流 429，该段仅作接口层校验' });
  else {
    expect(status).toBe(403);
    const msg = await page.locator('p.text-error').innerText();
    console.log('[A02] 令牌与邮箱不匹配的页面提示：', msg);
    expect(msg).toMatch(/邀请|受邀/);
  }
  await ctx.close();
  const token = new URL(link).searchParams.get('invite')!;
  const reg = await retry429(() => request.post(`${BASE}/api/v1/auth/register`, {
    data: { username: `A_mis_${RUN}`, password, email: otherEmail, email_code: '123456', invite_token: token },
  }));
  expect(reg.status()).toBe(403);
});

test('被邀请人：打开链接 → 表单校验 → 邮箱验证码 → 注册成功 → 自动进入被邀请项目', async ({ browser, request }) => {
  const link = readState().inviteLink as string;
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const errs = trackErrors(page);
  await page.goto(link);
  await expect(page.getByRole('heading', { name: '创建账户' })).toBeVisible();
  // 链接带令牌：不出现“仅限受邀”提示，且没有登录/注册切换（直接是注册态）
  await expect(page.getByTestId('invite-only-notice')).toHaveCount(0);

  await page.getByLabel('用户名', { exact: true }).fill(username);
  await page.getByLabel('邮箱 *', { exact: true }).fill(inviteeEmail);

  // 未填邮箱先点获取验证码 -> 前端提示（用另一页验证空邮箱）
  // 客户端校验：密码不一致
  await page.getByLabel('密码 *', { exact: true }).fill(password);
  await page.getByLabel('确认密码 *', { exact: true }).fill(password + 'x');
  await page.getByLabel('邮箱验证码 *', { exact: true }).fill('123456');
  await page.getByRole('button', { name: '注册并登录' }).click();
  await expect(page.getByText('两次密码不一致')).toBeVisible();
  await page.getByLabel('确认密码 *', { exact: true }).fill(password);

  // 发验证码（带重试：共享限流）
  const since = Date.now();
  for (let i = 0; i < 6; i++) {
    const resp = page.waitForResponse((r) => r.url().includes('/auth/send-code'));
    await page.getByRole('button', { name: '获取验证码' }).click();
    const st = (await resp).status();
    if (st !== 429) { expect(st).toBe(200); break; }
    await page.waitForTimeout(9000);
  }
  await expect(page.getByText('验证码已发送')).toBeVisible();
  await expect(page.getByRole('button', { name: /^\d+s$/ })).toBeDisabled();
  const mail = await waitMail(request, inviteeEmail, { sinceMs: since, subject: /验证码/ });
  const code = codeFrom(mail.detail);

  // 错误验证码被拒、输入保留
  await page.getByLabel('邮箱验证码 *', { exact: true }).fill(code === '000000' ? '111111' : '000000');
  for (let i = 0; i < 6; i++) {
    const resp = page.waitForResponse((r) => r.url().includes('/auth/register'));
    await page.getByRole('button', { name: '注册并登录' }).click();
    const st = (await resp).status();
    if (st !== 429) { expect(st).toBeGreaterThanOrEqual(400); break; }
    await page.waitForTimeout(9000);
  }
  await expect(page.locator('p.text-error')).toBeVisible();
  console.log('[A02] 错误验证码提示：', await page.locator('p.text-error').innerText());
  await expect(page.getByLabel('用户名', { exact: true })).toHaveValue(username);

  // 正确验证码
  await page.getByLabel('邮箱验证码 *', { exact: true }).fill(code);
  for (let i = 0; i < 6; i++) {
    const resp = page.waitForResponse((r) => r.url().includes('/auth/register'));
    await page.getByRole('button', { name: '注册并登录' }).click();
    const st = (await resp).status();
    if (st !== 429) { expect(st).toBe(201); break; }
    await page.waitForTimeout(9000);
  }
  await expect(page).toHaveURL((u) => !u.searchParams.has('invite') && u.searchParams.get('view') === 'team', { timeout: 30_000 });
  await expect(page.locator('header').getByRole('button', { name: new RegExp(projectName) })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByRole('heading', { name: /团队成员/ })).toBeVisible();
  await expect(page.getByText(username).first()).toBeVisible();
  expect(await page.evaluate(() => sessionStorage.getItem('pending_invite_token'))).toBeNull();
  const tok = await page.evaluate(() => ({ t: localStorage.getItem('access_token'), r: localStorage.getItem('refresh_token') }));
  expect(tok.t).toBeTruthy();
  patchState({ user: { username, email: inviteeEmail, password }, userSession: { token: tok.t, refresh: tok.r, at: Date.now() } });
  expect(errs.filter((e) => !/favicon|WebSocket|ws:|status of 4\d\d/.test(e))).toEqual([]);

  // 数据落地：项目成员、公司成员
  const admin = await adminSession(request);
  const pm = await api(request, admin.token, 'get', `/projects/${projectId || readState().project.id}/members`);
  const names = (pm.data.items as any[]).map((m) => m.username);
  expect(names).toContain(username);
  const cm = await api(request, admin.token, 'get', `/companies/${COMPANY_ID}/members?page_size=100`);
  const row = (cm.data.items as any[]).find((m) => m.username === username);
  expect(row, '新用户应成为公司成员').toBeTruthy();
  expect(row.status).toBe('active');
  expect(row.is_super_admin).toBe(false);
  patchState({ userId: row.user_id });
  await ctx.close();
});

test('注册后：欢迎邮件到达 mailpit；同一邀请令牌不能再给别的邮箱用', async ({ request }) => {
  const welcome = await waitMail(request, inviteeEmail, { subject: /welcome|欢迎/i, timeoutMs: 15_000 }).catch(() => null);
  console.log('[A02] 欢迎邮件主题：', welcome?.summary?.Subject);
  expect(welcome, '注册后应收到欢迎邮件').toBeTruthy();
  const token = new URL(readState().inviteLink).searchParams.get('invite')!;
  const r = await retry429(() => request.post(`${BASE}/api/v1/auth/send-code`, { data: { channel: 'email', target: otherEmail, purpose: 'register', invite_token: token } }));
  expect(r.status()).toBe(403);
  // 同一邮箱再次发码：应提示已注册（用过的邀请不应再通行）
  const r2 = await retry429(() => request.post(`${BASE}/api/v1/auth/send-code`, { data: { channel: 'email', target: inviteeEmail, purpose: 'register', invite_token: token } }));
  expect([403, 409]).toContain(r2.status());
});
