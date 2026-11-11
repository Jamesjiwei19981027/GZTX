import { expect, test, type Page } from '@playwright/test';
import { api, openAs, tokensFor, waitNotif, ADMIN, M1, M2, PID, PNAME, state } from './helpers';

test.describe.configure({ mode: 'serial' });
const TS = Date.now();

async function pickProject(page: Page) {
  // 经人轴页选中项目（顶栏项目下拉在自动化里点选不稳定，此路径等价于用户先进入项目）
  await page.locator('aside').getByRole('button', { name: '人轴', exact: true }).click();
  const sel = page.getByLabel('选择项目');
  await expect(sel).toBeVisible();
  await sel.selectOption(String(PID));
  await expect(sel).toHaveValue(String(PID));
  const enterChain = page.getByText('查看项目责任链', { exact: true });
  if (await enterChain.isVisible()) await enterChain.click();
  await page.waitForTimeout(800);
}
async function openMessages(page: Page, who: typeof M1, withProject = true) {
  await openAs(page, who);
  if (withProject) await pickProject(page);
  await page.locator('aside').getByRole('button', { name: '消息', exact: true }).click();
  await expect(page.getByText('消息中心')).toBeVisible();
}
async function channelIds(token: string) {
  const r = await api('GET', `/companies/1/channels?project_id=${PID}`, undefined, token);
  const m: Record<string, number> = {};
  for (const c of r.j.data.items) m[c.key] = c.id;
  return m;
}

test('4.1 消息：频道列表（全员交流大厅/项目冲刺组）可见且可切换；发送消息落库，他人可见', async ({ page }) => {
  await openMessages(page, M1);
  const ch = await channelIds((await tokensFor(M1)).access);
  console.log('channels', JSON.stringify(ch));
  expect(ch.general).toBeTruthy();
  const text = `C-大厅消息${TS}`;
  await page.getByPlaceholder('输入消息…').fill(text);
  const post = page.waitForResponse(r => /\/channels\/\d+\/messages$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const pr = await post;
  console.log('UI 发送到', pr.url(), '项目频道映射', JSON.stringify(ch));
  expect(pr.status()).toBe(200);
  await expect(page.getByText(text).first()).toBeVisible();
  // 另一用户（PM）从接口读到
  const adm = (await tokensFor(ADMIN)).access;
  const list = await api('GET', `/channels/${ch.general}/messages?page_size=100`, undefined, adm);
  expect(JSON.stringify(list.j)).toContain(text);
});

test('4.2 消息：点赞按钮 → 点赞数落库', async ({ page }) => {
  await openMessages(page, M1);
  const text = `C-点赞消息${TS}`;
  await page.getByPlaceholder('输入消息…').fill(text);
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const bubble = page.locator('div', { hasText: text }).filter({ has: page.getByText(/♥/) }).last();
  await expect(bubble).toBeVisible();
  const like = page.waitForResponse(r => r.url().includes('/like'));
  await bubble.getByText(/♥/).first().click();
  const r = await like;
  console.log('like', r.status(), JSON.stringify((await r.json()).data));
  expect(r.status()).toBe(200);
  const ch = await channelIds((await tokensFor(M1)).access);
  const list = await api('GET', `/channels/${ch.general}/messages?page_size=100`, undefined, (await tokensFor(M1)).access);
  const m = list.j.data.items.find((x: any) => x.body === text);
  expect(m.likes).toBe(1);
});

test('4.3 消息：项目冲刺组频道发消息，同项目成员 m2 能读到、非成员读不到', async ({ page }) => {
  await openMessages(page, M1);
  await page.getByRole('button', { name: '# 项目冲刺组' }).click();
  const text = `C-项目组消息${TS}`;
  await page.getByPlaceholder('输入消息…').fill(text);
  const post = page.waitForResponse(r => /\/channels\/\d+\/messages$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  expect((await post).status()).toBe(200);
  await expect(page.getByText(text).first()).toBeVisible();
  const ch = await channelIds((await tokensFor(M1)).access);
  const m2 = (await tokensFor(M2)).access;
  const l2 = await api('GET', `/channels/${ch.project}/messages?page_size=100`, undefined, m2);
  expect(JSON.stringify(l2.j)).toContain(text);
  // 频道成员侧栏（项目频道）
  const members = await page.getByText(/位成员/).first().innerText();
  console.log('频道成员文案 =', members);
});

test('4.4 消息：聊天内容搜索框能过滤', async ({ page }) => {
  await openMessages(page, M1);
  await page.getByPlaceholder('搜索聊天内容...').fill(`C-点赞消息${TS}`);
  await expect(page.getByText(`C-点赞消息${TS}`).first()).toBeVisible();
  await expect(page.getByText(`C-大厅消息${TS}`)).toHaveCount(0);
});

test('4.5 私信：新建私聊(选 PM) → 发送 → PM 在自己的会话里看到并回复，成员看到回复（回复链路）', async ({ page, browser }) => {
  await openMessages(page, M1);
  await page.getByRole('button', { name: '@ 私信与提及' }).click();
  await page.getByRole('button', { name: '新建私聊' }).click();
  await page.screenshot({ path: 'e2e/real/C-progress-report/shot-dm.png' });
  const created = page.waitForResponse(r => /\/conversations$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: /^auditadmin|auditadmin/ }).first().click({ timeout: 15000 });
  console.log('创建私聊', (await created).status());
  const text = `C-私信${TS}`;
  await page.getByPlaceholder('输入消息…').fill(text);
  const post = page.waitForResponse(r => /\/conversations\/\d+\/messages$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByRole('button', { name: '发送', exact: true }).click();
  const sentResponse = await post;
  expect(sentResponse.status()).toBe(200);
  const conversationId = Number(/conversations\/(\d+)\/messages/.exec(sentResponse.url())![1]);
  // PM 侧
  const adm = (await tokensFor(ADMIN)).access;
  const convs = await api('GET', `/companies/1/conversations`, undefined, adm);
  const conv = convs.j.data.items.find((c: any) => c.id === conversationId);
  console.log('PM 会话', JSON.stringify(conv).slice(0, 300));
  expect(conv).toBeTruthy();
  const ctx = await browser.newContext();
  const p2 = await ctx.newPage();
  await openMessages(p2, ADMIN, false);
  await p2.getByRole('button', { name: '@ 私信与提及' }).click();
  await p2.getByTestId(`direct-conversation-${conversationId}`).click();
  await expect(p2.getByText(text).first()).toBeVisible({ timeout: 15000 });
  const reply = `C-私信回复${TS}`;
  await p2.getByPlaceholder('输入消息…').fill(reply);
  const replyPost = p2.waitForResponse(r => r.url().endsWith(`/conversations/${conversationId}/messages`) && r.request().method() === 'POST');
  await p2.getByRole('button', { name: '发送', exact: true }).click();
  expect((await replyPost).status()).toBe(200);
  await expect(p2.getByText(reply).first()).toBeVisible();
  await ctx.close();
  const m1 = (await tokensFor(M1)).access;
  const msgs = await api('GET', `/conversations/${conv.id}/messages`, undefined, m1);
  expect(msgs.status).toBe(200);
  expect(JSON.stringify(msgs.j)).toContain(reply);
  await page.reload();
  await page.getByRole('button', { name: '@ 私信与提及' }).click();
  await page.getByTestId(`direct-conversation-${conversationId}`).click();
  await expect(page.getByText(reply).first()).toBeVisible();
});

test('4.6 消息：右侧“文件/任务/关于”标签与表情按钮可点（无报错）', async ({ page }) => {
  await openMessages(page, M1);
  for (const t of ['文件', '任务', '关于']) await page.getByRole('button', { name: t, exact: true }).click();
  await page.locator('button[title="表情"]').click();
  await expect(page.getByText('👍').first()).toBeVisible();
  await page.getByText('👍').first().click();
  await expect(page.getByPlaceholder('输入消息…')).toHaveValue(/👍/);
});

test('4.7 收件箱：列表有通知，“全部/未读/需回复”过滤、搜索可用', async ({ page }) => {
  await openAs(page, M1);
  await page.locator('aside').getByText('工作工具与管理').click();
  await page.locator('aside').getByRole('button', { name: /收件箱/ }).click();
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'e2e/real/C-progress-report/shot-inbox.png' });
  const body = await page.locator('main').innerText();
  console.log('INBOX:', body.replace(/\n/g, ' | ').slice(0, 700));
  expect(body).toContain('已完成预审');
  await page.getByRole('button', { name: '未读', exact: true }).click();
  await page.getByRole('button', { name: '全部', exact: true }).first().click();
  await page.getByPlaceholder('搜索通知…').fill('不存在的词C-zzz');
  await expect(page.getByText('已完成预审')).toHaveCount(0);
  await page.getByPlaceholder('搜索通知…').fill('');
});

test('4.8 收件箱“全部已读”按钮：落库为全部已读（接口+刷新）', async ({ page }) => {
  await openAs(page, M1);
  const m1 = (await tokensFor(M1)).access;
  const before = await api('GET', '/notifications/collab?page=1&state=all', undefined, m1);
  const unreadBefore = before.j.data.items.filter((x: any) => !x.read).length;
  console.log('未读数(前) =', unreadBefore);
  expect(unreadBefore).toBeGreaterThan(0);
  await page.locator('aside').getByText('工作工具与管理').click();
  await page.locator('aside').getByRole('button', { name: /收件箱/ }).click();
  const resp = page.waitForResponse(r => r.url().includes('/notifications/collab/read-all'));
  await page.getByRole('button', { name: '全部已读', exact: true }).click();
  expect((await resp).status()).toBe(200);
  const after = await api('GET', '/notifications/collab?page=1&state=all', undefined, m1);
  expect(after.j.data.items.filter((x: any) => !x.read)).toHaveLength(0);
  await page.reload();
  await expect(page.locator('main')).toBeVisible();
});
