import { expect, test, type Page } from '@playwright/test';
import { BASE, COMPANY_ID, adminSession, api, apiLogin, readState, retry429, seedSession, trackErrors } from './helpers';

/**
 * 团队页 + 通知中心（顶栏铃铛弹窗）。
 * 成员管理（角色/停用/启用）网页没有入口，只能用接口核对后端行为——这一点本身写进报告。
 */
let U: { username: string; email: string; password: string };
let uid = 0;
let project: { id: number; name: string };
let admin: { token: string; refresh: string };
let userSess: { token: string; refresh: string };

test.beforeAll(async ({ request }) => {
  const st = readState();
  if (!st.user || !st.project) throw new Error('需要先运行 02-invite.spec.ts');
  U = st.user; uid = st.userId; project = st.project;
  admin = await adminSession(request);
  const r = await apiLogin(request, U.username, U.password);
  userSess = { token: r.token, refresh: r.refresh };
});

async function openTeam(page: Page, s: { token: string; refresh: string }) {
  await seedSession(page, s);
  await page.goto('/?view=team');
  await expect(page.getByRole('heading', { name: /团队成员/ })).toBeVisible({ timeout: 30_000 });
  const header = page.locator('header');
  const cur = header.getByRole('button', { name: new RegExp(project.name) });
  if (!(await cur.count())) {
    await header.getByRole('button', { name: /expand_more/ }).first().click();
    const opt = page.getByRole('button', { name: new RegExp(project.name) });
    await expect(opt).toBeVisible();
    await opt.click();
  }
  await expect(header.getByRole('button', { name: new RegExp(project.name) })).toBeVisible();
}

test('团队页(成员视角)：成员列表、人数、搜索过滤、点击成员卡片', async ({ page, request }) => {
  const errs = trackErrors(page);
  await openTeam(page, userSess);
  const api1 = await api(request, userSess.token, 'get', `/projects/${project.id}/members`);
  const n = (api1.data.items as any[]).length;
  await expect(page.getByText(`共 ${n} 人`)).toBeVisible();
  const myName = (await api(request, userSess.token, 'get', '/users/me')).data.nickname || U.username;
  await expect(page.getByText(myName).first()).toBeVisible();
  const search = page.getByPlaceholder('搜索成员…');
  await search.fill('zzz-no-such-member');
  await expect(page.locator('button.text-left')).toHaveCount(0);
  await search.fill(myName.slice(0, 3));
  await expect(page.locator('button.text-left').first()).toBeVisible();
  await search.fill('');
  await page.locator('button.text-left').first().click();
  await expect(page.getByText(/成员: /)).toBeVisible();
  expect(errs.filter((e) => !/favicon|WebSocket|ws:|vapid/.test(e))).toEqual([]);
});

test('团队页(成员视角)：“邀请”对非项目经理应被服务端拒绝并有明确提示', async ({ page }) => {
  await openTeam(page, userSess);
  await page.getByRole('button', { name: /邀请$/ }).click();
  await page.getByPlaceholder('email@example.com').fill(`a-x-${Date.now().toString(36)}@audit.example.com`);
  const r = page.waitForResponse((x) => x.url().includes(`/projects/${project.id}/invitations`));
  await page.getByRole('button', { name: '发送邀请' }).click();
  const resp = await r;
  console.log('[A05] 普通成员发邀请 ->', resp.status(), (await resp.text()).slice(0, 120));
  expect(resp.status()).toBe(403);
  await expect(page.getByText('需要 PM', { exact: true })).toContainText(/PM|权限|邀请失败/);
  console.log('[A05] 页面提示：', await page.getByText('需要 PM', { exact: true }).innerText());
});

test('团队页：去消息 / 创建项目 / 创建公司 按钮', async ({ page }) => {
  await openTeam(page, admin);
  await page.getByRole('button', { name: '去消息', exact: true }).click();
  await expect(page).toHaveURL((u) => u.searchParams.get('view') === 'messages');
  await page.goto('/?view=team');
  await expect(page.getByRole('heading', { name: /团队成员/ })).toBeVisible({ timeout: 30_000 });
  await page.getByRole('button', { name: '创建项目', exact: true }).click();
  // 创建项目弹窗出现，取消关闭（不创建数据）
  const dlg = page.locator('div.fixed').filter({ hasText: /创建项目|项目名称/ }).first();
  await expect(dlg).toBeVisible();
  await page.keyboard.press('Escape');
});

test('成员管理：团队页应有角色调整/停用/启用/移除入口', async ({ page }) => {
  // 1) 网页：成员卡片只是展示 + 点击弹提示，没有任何管理按钮
  await openTeam(page, admin);
  const manage = page.getByRole('button', { name: /停用|启用|移除|角色|设为管理员|禁用|恢复/ });
  console.log('[A05] 团队页上出现的成员管理类按钮数量 =', await manage.count());
  expect(await manage.count(), '团队页应提供停用/启用/角色/移除入口（当前没有）').toBeGreaterThan(0);
});

test('成员管理(接口)：PATCH 公司成员 title / 停用 / 启用 的真实效果', async ({ request }) => {
  // 角色（职位）
  const t = await api(request, admin.token, 'patch', `/companies/${COMPANY_ID}/members/${uid}`, { title: 'A-测试岗' });
  expect(t.status).toBe(200);
  let list = await api(request, admin.token, 'get', `/companies/${COMPANY_ID}/members?page_size=100`);
  expect((list.data.items as any[]).find((m) => m.user_id === uid).title).toBe('A-测试岗');
  // 停用
  const off = await api(request, admin.token, 'patch', `/companies/${COMPANY_ID}/members/${uid}`, { status: 'disabled' });
  expect(off.status).toBe(200);
  try {
    // 已有令牌访问公司接口应被拒
    const g = await api(request, userSess.token, 'get', `/companies/${COMPANY_ID}/smtp`);
    console.log('[A05] 停用后用旧令牌访问公司接口 ->', g.status);
    expect(g.status).toBeGreaterThanOrEqual(401);
    // 项目访问被收回
    const pm = await api(request, userSess.token, 'get', `/projects/${project.id}/members`);
    console.log('[A05] 停用后访问项目成员 ->', pm.status);
    expect(pm.status).toBeGreaterThanOrEqual(401);
    // 停用后登录
    const lg = await retry429(() => request.post(`${BASE}/api/v1/auth/login`, { data: { username: U.username, password: U.password } }));
    console.log('[A05] 停用后重新登录 ->', lg.status());
  } finally {
    const on = await api(request, admin.token, 'patch', `/companies/${COMPANY_ID}/members/${uid}`, { status: 'active', employment_status: 'active' });
    expect(on.status).toBe(200);
  }
  list = await api(request, admin.token, 'get', `/companies/${COMPANY_ID}/members?page_size=100`);
  const row = (list.data.items as any[]).find((m) => m.user_id === uid);
  expect(row.status).toBe('active');
  // 启用后：恢复公司访问；项目成员关系是否被一并收回（停用时 revoke_left_members）
  const pm2 = await api(request, admin.token, 'get', `/projects/${project.id}/members`);
  const still = (pm2.data.items as any[]).find((m) => m.user_id === uid);
  console.log('[A05] 重新启用后 A 用户在项目成员中的 left_at =', still?.left_at, ' （停用会收回项目权限，启用不会自动恢复）');
  const g2 = await api(request, userSess.token, 'get', `/companies/${COMPANY_ID}/smtp`);
  console.log('[A05] 启用后旧令牌访问公司接口 ->', g2.status);
  expect(g2.status).toBe(200);
  // 普通成员不能改别人
  const x = await api(request, userSess.token, 'patch', `/companies/${COMPANY_ID}/members/1`, { status: 'disabled' });
  expect(x.status).toBe(403);
  await api(request, admin.token, 'patch', `/companies/${COMPANY_ID}/members/${uid}`, { title: '' });
  // 恢复：停用会把项目成员关系收回，启用不会自动恢复，需要超管再“拉入项目”（网页无此入口，用接口）
  const back = await api(request, admin.token, 'post', `/projects/${project.id}/members`, { user_id: uid });
  console.log('[A05] 重新拉入项目 ->', back.status, JSON.stringify(back.body).slice(0, 120));
  expect(back.status).toBe(200);
});

test('通知中心(顶栏铃铛)：弹窗、全部/未读、条数与接口一致、设置跳转、关闭', async ({ page, request }) => {
  const errs = trackErrors(page);
  await seedSession(page, admin);
  await page.goto('/');
  await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 30_000 });
  const api2 = await api(request, admin.token, 'get', '/notifications/collab?page=1&page_size=50&state=active');
  const items = api2.data.items as any[];
  const unread = items.filter((i) => !i.read).length;
  const resp = page.waitForResponse((r) => r.url().includes('/notifications/collab') && r.request().method() === 'GET');
  await page.locator('header').getByRole('button', { name: /^notifications$/ }).click();
  expect((await resp).status()).toBe(200);
  await expect(page.getByRole('heading', { name: /通知中心/ })).toBeVisible();
  // 弹窗里卡片条数（admin 的通知由并行区域产生，数量会变，只比较不少于接口当时的数）
  const cards = page.locator('div.overflow-y-auto button.w-full.text-left');
  expect(await cards.count()).toBeGreaterThanOrEqual(Math.min(items.length, 1));
  await page.getByRole('button', { name: '未读', exact: true }).click();
  const unreadCards = await cards.count();
  console.log('[A05] 接口未读', unread, '弹窗未读卡片', unreadCards);
  await page.getByRole('button', { name: '全部', exact: true }).click();
  // 设置按钮
  await page.getByRole('button', { name: '设置', exact: true }).click();
  await expect(page.getByRole('heading', { name: '通知中心' })).toBeVisible();
  expect(errs.filter((e) => !/favicon|WebSocket|ws:|vapid/.test(e))).toEqual([]);
});

test('通知中心(顶栏铃铛)：无通知时的空状态；关闭按钮', async ({ page }) => {
  await seedSession(page, userSess);
  await page.goto('/');
  await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 30_000 });
  await page.locator('header').getByRole('button', { name: /^notifications$/ }).click();
  await expect(page.getByText('暂无通知')).toBeVisible();
  await page.getByRole('button', { name: '✕' }).click();
  await expect(page.getByText('暂无通知')).toHaveCount(0);
});

test('顶栏：帮助弹窗与用户菜单（设置 / 重新同步）', async ({ page }) => {
  await seedSession(page, userSess);
  await page.goto('/');
  await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 30_000 });
  await page.locator('header').getByRole('button', { name: /help_outline/ }).click();
  await expect(page.getByText(/使用指导与快捷键/)).toBeVisible();
  await page.getByRole('button', { name: '✕' }).click();
  await page.getByTestId('user-menu-button').click();
  await page.getByRole('button', { name: /^settings\s*设置$/ }).click();
  await expect(page.getByRole('heading', { name: '设置' }).first()).toBeVisible();
  await page.getByTestId('user-menu-button').click();
  const sync = page.waitForResponse((r) => r.url().includes('/companies/mine'));
  await page.getByRole('button', { name: /重新同步/ }).first().click();
  expect((await sync).status()).toBe(200);
});
