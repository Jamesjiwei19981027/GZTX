import { expect, test, type Page } from '@playwright/test';
import { api, openAs, tokensFor, waitNotif, ADMIN, M1, M2, PID, state } from './helpers';

test.describe.configure({ mode: 'serial' });
const TS = Date.now();

async function openReports(page: Page, who: typeof M1) {
  await openAs(page, who);
  await page.getByRole('button', { name: /查看汇报/ }).click();
  await expect(page.getByRole('heading', { name: 'AI 汇报与助手' })).toBeVisible();
  const sel = page.locator('select').first();
  await sel.selectOption(String(PID));
  await expect(page.getByTestId('project-ai-report-center')).toContainText('C-进展汇报项目');
}

test('3.0 汇报页：本周/本月度/本季度筛选按钮 → 统计接口带对应 period 且 200', async ({ page }) => {
  await openReports(page, M1);
  for (const [label, period] of [['本周', 'week'], ['本季度', 'quarter'], ['本月度', 'month']] as const) {
    const resp = page.waitForResponse(r => /task-(stats|trend)|tasks\/(stats|trend)|stats|trend/.test(r.url()) && r.url().includes(`period=${period}`));
    await page.getByRole('button', { name: label, exact: true }).click();
    const r = await resp;
    console.log(label, r.url().replace(/^.*\/api\/v1/, ''), r.status());
    expect(r.status()).toBe(200);
  }
});

test('3.1 汇报页：导出 CSV 包含当前项目、时间范围和统计数据', async ({ page }) => {
  await openReports(page, M1);
  await expect(page.getByTestId('report-export')).toBeVisible();
  const download = page.waitForEvent('download');
  await page.getByTestId('report-export').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/报表_.*本月度.*\.csv$/);
  const stream = await file.createReadStream();
  let csv = '';
  for await (const chunk of stream!) csv += chunk.toString('utf8');
  expect(csv).toContain('C-进展汇报项目');
  expect(csv).toContain('本月度');
  expect(csv).toMatch(/总任务|任务总数/);
  expect(csv).toContain('完成');
  console.log('导出 CSV：', file.suggestedFilename(), '含项目、范围及任务统计');
});

test('3.2 “同步人轴智能体”：PM 同步全员；成员只能建自己的', async ({ page }) => {
  await openReports(page, ADMIN);
  const resp = page.waitForResponse(r => r.url().includes('/report-agents/bindings') && r.request().method() === 'POST');
  await page.getByRole('button', { name: '同步人轴智能体' }).click();
  expect((await resp).status()).toBe(200);
  await expect(page.getByText(/个智能体/).first()).toBeVisible();
  const adm = (await tokensFor(ADMIN)).access;
  const b = await api('GET', `/projects/${PID}/report-agents/bindings`, undefined, adm);
  const roles = b.j.data.items.map((x: any) => `${x.role}:${x.user_id}`).sort();
  console.log('bindings', roles.join(','));
  expect(roles).toEqual(expect.arrayContaining([`member:${state.m1.id}`, `member:${state.m2.id}`, 'project:1']));
  const m1 = (await tokensFor(M1)).access;
  const deny = await api('POST', `/projects/${PID}/report-agents/bindings`, {}, m1);
  console.log('成员同步智能体', deny.status, JSON.stringify(deny.j.data.items.map((x: any) => x.user_id)));
  expect(deny.status).toBe(200);
  expect(deny.j.data.items.map((x: any) => x.user_id)).toEqual([state.m1.id]); // 成员只会得到自己的智能体，不能代建他人
});

test('3.3 成员“生成 AI 草稿”（公司 AI=fake）：页面给出明确提示而不是静默/假内容', async ({ page }) => {
  await openReports(page, M1);
  const resp = page.waitForResponse(r => r.url().includes('/reports/generate'));
  await page.getByRole('button', { name: '生成 AI 草稿' }).click();
  const r = await resp;
  const body = await r.json().catch(() => ({}));
  console.log('generate', r.status(), JSON.stringify(body).slice(0, 200));
  // fake AI：后端拒绝生成（422），页面应有错误提示
  expect(r.status()).toBe(422);
  await expect(page.getByText(/未配置可用的 AI 模型|生成个人 AI 汇报草稿失败/).first()).toBeVisible();
});

let reportId = 0;
test('3.4 成员写汇报并提交：落库为 submitted，上级=直属领导(PM)，列表可见', async ({ page }) => {
  const m1 = (await tokensFor(M1)).access;
  const initial = `C-待提交草稿${TS}`;
  const draft = await api('POST', `/projects/${PID}/agent-reports/note-draft`, { text: initial }, m1);
  expect(draft.status).toBe(200);
  await openReports(page, M1);
  await expect(page.getByLabel('我的 AI 汇报正文')).toHaveValue(new RegExp(initial));
  const text = `C-成员一汇报${TS}：本周完成联调，风险：无`;
  await page.getByLabel('我的 AI 汇报正文').fill(text);
  const resp = page.waitForResponse(r => r.url().endsWith(`/reports/${draft.j.data.id}/submit`) && r.request().method() === 'POST');
  await page.getByRole('button', { name: '提交给直属领导', exact: true }).click();
  const r = await resp;
  expect(r.status()).toBe(200);
  const d = (await r.json()).data;
  reportId = d.id;
  console.log('submitted report', JSON.stringify(d));
  expect(d.status).toBe('submitted');
  expect(d.parent_user_id).toBe(state.admin.id);
  // 页面列表出现该汇报
  await expect(page.getByText(text).first()).toBeVisible();
  const mine = await api('GET', `/reports/my?project_id=${PID}`, undefined, m1);
  expect(JSON.stringify(mine.j)).toContain(`C-成员一汇报${TS}`);
  const detail = await api('GET', `/reports/${reportId}`, undefined, m1);
  console.log('detail', detail.status, detail.j.data?.status);
  expect(detail.status).toBe(200);
  // 非本人无法提交他人汇报
  const m2 = (await tokensFor(M2)).access;
  const steal = await api('POST', `/reports/${reportId}/submit`, { summary: 'x' }, m2);
  expect(steal.status).toBe(403);
});

test('3.5 PM 的“下属汇报”：收件箱有该汇报、收到提醒通知；点击汇报标记已读', async ({ page }) => {
  test.setTimeout(150000);
  const adm = (await tokensFor(ADMIN)).access;
  const inbox = await api('GET', '/reports/inbox', undefined, adm);
  const item = inbox.j.data.items.find((x: any) => x.id === reportId);
  console.log('inbox item', item ? `read=${item.read}` : 'MISSING');
  expect(item).toBeTruthy();
  expect(item.read).toBe(false);
  const w = await waitNotif(adm, (x: any) => x.payload?.report_id === reportId && x.template_key === 'agent.report.submitted');
  console.log('PM 汇报提醒通知', w.waited, w.hit && `${w.hit.template_key} | ${w.hit.body_text}`);
  expect(w.hit, '直属领导应收到汇报提交的站内提醒').toBeTruthy();
  await openReports(page, ADMIN);
  const card = page.locator(`text=C-成员一汇报${TS}`).first();
  await expect(card).toBeVisible();
  const mark = page.waitForResponse(r => r.url().includes(`/reports/inbox/${reportId}/read`));
  await card.click();
  expect((await mark).status()).toBe(200);
  const inbox2 = await api('GET', '/reports/inbox', undefined, adm);
  expect(inbox2.j.data.items.find((x: any) => x.id === reportId).read).toBe(true);
});

test('3.6 PM“汇总项目汇报”与“生成项目汇报”', async ({ page }) => {
  await openReports(page, ADMIN);
  const agg = page.waitForResponse(r => /agent-reports\/aggregate$/.test(r.url()));
  await page.getByRole('button', { name: '汇总项目汇报' }).click();
  const ar = await agg;
  console.log('aggregate', ar.status(), JSON.stringify((await ar.json()).data).slice(0, 300));
  expect(ar.status()).toBe(200);
  await expect(page.getByText('项目智能体汇总').first()).toBeVisible();
  const run = page.waitForResponse(r => /\/reports\/run$/.test(r.url()));
  await page.getByRole('button', { name: '生成项目汇报' }).click();
  const rr = await run;
  console.log('run', rr.status(), JSON.stringify((await rr.json()).data).slice(0, 300));
  expect(rr.status()).toBe(200);
  await expect(page.getByText('最新项目汇报').first()).toBeVisible();
});

test('3.7 成员无权“生成项目汇报/汇总项目汇报”（接口 403）', async () => {
  const m1 = (await tokensFor(M1)).access;
  const a = await api('POST', `/projects/${PID}/reports/run`, { trigger: 'manual_confirm' }, m1);
  const b = await api('POST', `/projects/${PID}/agent-reports/aggregate`, {}, m1);
  console.log('member run', a.status, 'aggregate', b.status);
  expect(a.status).toBe(403);
  expect([403]).toContain(b.status);
});

test('3.8 汇报策略：PM 修改周期与截止时间，刷新保持，成员不可修改', async ({ page }) => {
  const adm = (await tokensFor(ADMIN)).access;
  const policies = await api('GET', `/projects/${PID}/report-policies`, undefined, adm);
  expect(policies.status).toBe(200);
  const before = policies.j.data.items.find((x: any) => x.enabled) || policies.j.data.items[0];
  expect(before).toBeTruthy();
  const fields = ['enabled', 'period', 'deadline_time', 'weekday', 'month_day', 'remind'];
  const restore = Object.fromEntries(fields.map(k => [k, before[k]]));
  try {
    await openAs(page, ADMIN);
    await page.locator('aside').getByRole('button', { name: '人轴', exact: true }).click();
    await page.getByLabel('选择项目').selectOption(String(PID));
    await page.getByTestId('axis-project-settings').click();
    const dlg = page.getByRole('dialog', { name: '项目设置' });
    await dlg.getByLabel('汇报周期').selectOption('monthly');
    await dlg.getByLabel('截止时间').fill('17:35');
    await dlg.getByLabel('每月截止日').selectOption('20');
    const save = page.waitForResponse(r => r.url().endsWith(`/projects/${PID}/report-policy`) && r.request().method() === 'PUT');
    await dlg.getByRole('button', { name: '保存汇报策略' }).click();
    expect((await save).status()).toBe(200);
    const read = await api('GET', `/projects/${PID}/report-policies`, undefined, adm);
    expect(read.j.data.items.find((x: any) => x.id === before.id)).toMatchObject({ period: 'monthly', deadline_time: '17:35', month_day: 20 });
    await dlg.getByRole('button', { name: '关闭', exact: true }).click();
    await page.reload();
    await page.getByLabel('选择项目').selectOption(String(PID));
    await page.getByTestId('axis-project-settings').click();
    await expect(dlg.getByLabel('汇报周期')).toHaveValue('monthly');
    await expect(dlg.getByLabel('截止时间')).toHaveValue('17:35');
    const m1 = (await tokensFor(M1)).access;
    expect((await api('PUT', `/projects/${PID}/report-policy`, { period: 'daily' }, m1)).status).toBe(403);
  } finally {
    expect((await api('PUT', `/projects/${PID}/report-policy`, restore, adm)).status).toBe(200);
  }
});

test('3.9 “汇总全部项目”总领导摘要按钮', async ({ page }) => {
  await openReports(page, ADMIN);
  const resp = page.waitForResponse(r => r.url().includes('/leadership-reports/aggregate'));
  await page.getByRole('button', { name: '汇总全部项目' }).click();
  const r = await resp;
  console.log('leadership aggregate', r.status(), JSON.stringify(await r.json()).slice(0, 300));
  expect([200, 403]).toContain(r.status());
});
