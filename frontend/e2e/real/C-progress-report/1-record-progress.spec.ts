import { expect, test } from '@playwright/test';
import { api, openAs, tokensFor, waitNotif, ADMIN, M1, M2, PID, state, collectErrors } from './helpers';

test.describe.configure({ mode: 'serial' });
const TS = Date.now();

async function openModal(page: any) {
  await page.getByRole('button', { name: '记录进展' }).first().click();
  await expect(page.getByRole('dialog', { name: '记录进展' })).toBeVisible();
  await expect(page.getByLabel('选择所属项目')).toBeVisible();
}

test('1.1 记录进展弹窗：仪表盘入口 → 默认汇报草稿 → 确认 → 汇报草稿落库', async ({ page }) => {
  const errs = collectErrors(page);
  await openAs(page, M1);
  await openModal(page);
  await page.getByLabel('选择所属项目').selectOption(String(PID));
  const text = `C-进展草稿${TS}：今天完成了接口联调`;
  await page.getByLabel('进展与事实内容').fill(text);
  const sug = page.waitForResponse(r => r.url().includes('/record-progress/suggest'));
  await page.getByTestId('next-step-button').click();
  const sr = await sug;
  expect(sr.status()).toBe(200);
  const sj = (await sr.json()).data;
  console.log('suggest =', JSON.stringify(sj));
  expect(sj.target).toBe('report_draft');
  expect(sj.source).toBe('rule');
  await expect(page.getByTestId('record-progress-suggestion-card')).toContainText('汇报草稿');
  const chat = page.waitForResponse(r => r.url().includes(`/projects/${PID}/agent-reports/note-draft`) && r.request().method() === 'POST');
  await page.getByTestId('confirm-save-button').click();
  const cr = await chat;
  expect(cr.status()).toBe(200);
  const saved = (await cr.json()).data;
  expect(saved.id).toBeGreaterThan(0);
  expect(saved.summary_text).toContain(text);
  const member = (await tokensFor(M1)).access;
  const read = await api('GET', `/reports/my?project_id=${PID}`, undefined, member);
  expect(read.status).toBe(200);
  expect(JSON.stringify(read.j.data)).toContain(text);
  await expect(page.getByTestId('record-progress-toast')).toContainText('已存为汇报草稿');
  await expect(page.getByTestId('record-progress-draft-saved')).toBeVisible();
  await page.getByTestId('record-progress-view-reports').click();
  await expect(page.getByRole('dialog', { name: '记录进展' })).toBeHidden({ timeout: 5000 });
  await expect(page.getByRole('heading', { name: 'AI 汇报与助手' })).toBeVisible();
  await page.locator('select').first().selectOption(String(PID));
  await expect(page.getByLabel('我的 AI 汇报正文')).toHaveValue(new RegExp(`C-进展草稿${TS}`));
  expect(errs.filter(e => !/favicon|ResizeObserver/.test(e))).toEqual([]);
});

test('1.2 记录进展：空内容不可下一步 + 返回修改 + 关闭按钮', async ({ page }) => {
  await openAs(page, M1);
  await openModal(page);
  await expect(page.getByTestId('next-step-button')).toBeDisabled();
  await page.getByLabel('进展与事实内容').fill('C-临时内容');
  await page.getByTestId('next-step-button').click();
  await expect(page.getByTestId('record-progress-suggestion-card')).toBeVisible();
  await page.getByRole('button', { name: '返回修改' }).click();
  await expect(page.getByTestId('next-step-button')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('dialog', { name: '记录进展' })).toBeHidden();
});

test('1.3 记录进展：改选“个人知识” → 个人知识条目真实落库', async ({ page }) => {
  await openAs(page, M1);
  await openModal(page);
  const text = `C-个人笔记${TS}\n学习心得正文`;
  await page.getByLabel('进展与事实内容').fill(text);
  await page.getByTestId('next-step-button').click();
  await page.getByTestId('target-option-knowledge').click();
  const post = page.waitForResponse(r => /knowledge/.test(r.url()) && r.request().method() === 'POST');
  await page.getByTestId('confirm-save-button').click();
  const r = await post;
  console.log('knowledge POST', r.url(), r.status());
  expect(r.status()).toBe(200);
  await expect(page.getByTestId('record-progress-toast')).toContainText('已存为个人知识');
  const t = await tokensFor(M1);
  const k = await api('GET', `/projects/${PID}/personal-knowledge`, undefined, t.access);
  console.log('knowledge list', k.status, JSON.stringify(k.j).slice(0, 300));
  expect(JSON.stringify(k.j)).toContain(`C-个人笔记${TS}`);
});

let pkgId = 0;
test('1.4 记录进展：选事项+附件 → 建议证据材料 → 确认 → 材料状态为待负责人确认，只给建议', async ({ page }) => {
  await openAs(page, M1);
  await openModal(page);
  await page.getByLabel('选择所属项目').selectOption(String(PID));
  await page.getByLabel('选择关联事项').selectOption(String(state.m1.workItemId));
  await page.getByLabel('进展与事实内容').fill(`C-材料${TS}：联调报告，见附件`);
  const up = page.waitForResponse(r => r.url().includes('/evidence/files'));
  await page.locator('input[type=file]').setInputFiles({ name: `C-report-${TS}.txt`, mimeType: 'text/plain', buffer: Buffer.from('C-联调报告正文：接口全部通过，无阻塞') });
  expect((await up).status()).toBe(200);
  await expect(page.getByText(`C-report-${TS}.txt`)).toBeVisible();
  const sug = page.waitForResponse(r => r.url().includes('/record-progress/suggest'));
  await page.getByTestId('next-step-button').click();
  const sj = (await (await sug).json()).data;
  console.log('suggest(evidence) =', JSON.stringify(sj));
  expect(sj.target).toBe('evidence');
  const sub = page.waitForResponse(r => /\/nodes\/\d+\/evidence$/.test(r.url()) && r.request().method() === 'POST');
  await page.getByTestId('confirm-save-button').click();
  const sr = await sub;
  expect(sr.status()).toBe(200);
  const d = (await sr.json()).data;
  pkgId = d.package_id;
  console.log('evidence submit', JSON.stringify(d));
  expect(d.status).toBe('pending_review');
  const t = await tokensFor(M1);
  const g = await api('GET', `/evidence/${pkgId}`, undefined, t.access);
  expect(g.j.data.status).toBe('pending_review');
  expect(g.j.data.can_review).toBe(false);
  expect(g.j.data.files.length).toBe(1);
  // 只给建议：节点正式进度记录里不应有这份材料的记录
  const recs = await api('GET', `/nodes/${state.m1.workItemId}/progress/records`, undefined, t.access);
  expect(JSON.stringify(recs.j.data.items.filter((x: any) => x.evidence_package_id === pkgId))).toBe('[]');
});

test('1.5 证据：非负责人（提交人自己/同项目他人）确认被拒', async () => {
  const m1 = (await tokensFor(M1)).access, m2 = (await tokensFor(M2)).access;
  expect(pkgId).toBeGreaterThan(0);
  const r1 = await api('POST', `/evidence/${pkgId}/review`, { decision: 'adopted' }, m1);
  const r2 = await api('POST', `/evidence/${pkgId}/review`, { decision: 'rejected', reason: 'x' }, m2);
  console.log('m1 review', r1.status, 'm2 review', r2.status);
  expect(r1.status).toBe(403);
  expect(r2.status).toBe(403);
  const g = await api('GET', `/evidence/${pkgId}`, undefined, m1);
  expect(g.j.data.status).toBe('pending_review');
});

test('1.6 PM 收到“待确认”通知（通知中心 + 接口），点击后跳转', async ({ page }) => {
  test.setTimeout(150000);
  await openAs(page, ADMIN);
  const adm = (await tokensFor(ADMIN)).access;
  const w = await waitNotif(adm, (x: any) => x.payload?.package_id === pkgId && x.template_key === 'evidence.awaiting_review');
  console.log('pm notif waited(ms)=', w.waited, JSON.stringify(w.hit && [w.hit.id, w.hit.body_text, w.hit.read]));
  expect(w.hit).toBeTruthy();
  await page.locator('header').getByRole('button', { name: 'notifications', exact: true }).click();
  await expect(page.getByText('通知中心')).toBeVisible();
  const item = page.getByText('有材料「C-工作项-m1」待你确认采纳。').first();
  await expect(item).toBeVisible();
  const modalText = await page.locator('div.fixed').last().innerText();
  console.log('MODAL TEXT:', modalText.slice(0, 400));
  await page.screenshot({ path: 'e2e/real/C-progress-report/shot-notif.png' });
  const marked = page.waitForResponse(r => r.url().endsWith(`/notifications/collab/${w.hit.id}/read`) && r.request().method() === 'PUT');
  await item.click();
  expect((await marked).status()).toBe(200);
  await page.waitForTimeout(800);
  const stillOpen = await page.getByText('通知中心').isVisible();
  console.log('点击后通知中心仍打开 =', stillOpen);
  expect(stillOpen, '点击“待确认”通知应跳转到对应材料位置').toBe(false);
  await expect(page).toHaveURL(u => u.searchParams.get('view') === 'people-axis');
  await expect(page.getByLabel('选择项目')).toHaveValue(String(PID));
});
