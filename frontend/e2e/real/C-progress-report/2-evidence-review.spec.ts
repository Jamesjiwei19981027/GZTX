import { expect, test } from '@playwright/test';
import { api, openAs, tokensFor, waitNotif, ADMIN, M1, M2, PID, state } from './helpers';

test.describe.configure({ mode: 'serial' });
const TS = Date.now();
const NODE = state.m1.workItemId as number;

async function gotoMyNodeEvidenceTab(page: any, who: typeof M1) {
  await openAs(page, who);
  await page.locator('aside').getByRole('button', { name: '人轴', exact: true }).click();
  await page.getByText('查看项目责任链').click();
  await page.getByText('查看全部 →').first().click();
  await page.getByRole('tab', { name: '材料' }).click();
}

let pkgA = 0, pkgB = 0, pkgC = 0;

test('2.1 成员在人轴“提交材料”对话框提交 → 待负责人确认（只给建议，不直接改进度）', async ({ page }) => {
  await openAs(page, M1);
  await page.locator('aside').getByRole('button', { name: '人轴', exact: true }).click();
  await page.getByText('查看项目责任链').click();
  await page.getByText('查看全部 →').first().click();
  await page.getByRole('button', { name: '提交材料' }).first().click();
  const desc = `C-轴内材料${TS}：完成压测，TPS 达标`;
  const dlg = page.getByRole('dialog').last();
  await dlg.locator('textarea').first().fill(desc);
  const sub = page.waitForResponse(r => /\/nodes\/\d+\/evidence$/.test(r.url()) && r.request().method() === 'POST');
  await dlg.locator('button[type=submit]').click();
  const sr = await sub;
  expect(sr.status()).toBe(200);
  const d = (await sr.json()).data;
  pkgA = d.package_id;
  console.log('A submit', JSON.stringify(d));
  expect(d.status).toBe('pending_review');
  const t = (await tokensFor(M1)).access;
  const recs = await api('GET', `/nodes/${NODE}/progress/records`, undefined, t);
  expect(recs.j.data.items.filter((x: any) => x.evidence_package_id === pkgA)).toHaveLength(0);
});

test('2.2 成员视角：待确认的材料在人轴“材料”页应显示“待负责人确认”', async ({ page }) => {
  await gotoMyNodeEvidenceTab(page, M1);
  const row = page.locator('.axis-evidence-row', { hasText: `C-轴内材料${TS}` });
  await expect(row).toBeVisible();
  const txt = await row.innerText();
  console.log('材料行文本 =', txt.replace(/\n/g, ' | '));
  await page.screenshot({ path: 'e2e/real/C-progress-report/shot-evtab.png' });
  await expect(row.locator('.axis-status')).toHaveText('待负责人确认');
});

test('2.3 PM 采纳：接口 200，进展记录出现，成员收到“已采纳”通知，重复确认 409', async () => {
  const adm = (await tokensFor(ADMIN)).access, m1 = (await tokensFor(M1)).access;
  const g0 = await api('GET', `/evidence/${pkgA}`, undefined, adm);
  expect(g0.j.data.can_review).toBe(true);
  const r = await api('POST', `/evidence/${pkgA}/review`, { decision: 'adopted', reason: 'C-压测数据可信' }, adm);
  console.log('adopt', r.status, r.j.data?.status);
  expect(r.status).toBe(200);
  expect(r.j.data.status).toBe('adopted');
  const recs = await api('GET', `/nodes/${NODE}/progress/records`, undefined, m1);
  const hit = recs.j.data.items.find((x: any) => x.evidence_package_id === pkgA);
  console.log('progress record', JSON.stringify(hit));
  expect(hit).toBeTruthy();
  expect(hit.reason).toBe('C-压测数据可信');
  const w = await waitNotif(m1, (x: any) => x.template_key === 'evidence.adopted' && x.payload?.package_id === pkgA);
  console.log('adopted notif for member, waited', w.waited, w.hit?.body_text);
  expect(w.hit).toBeTruthy();
  const again = await api('POST', `/evidence/${pkgA}/review`, { decision: 'rejected', reason: 'x' }, adm);
  expect(again.status).toBe(409);
  // 采纳后：节点进度 / 项目知识
  const node = await api('GET', `/nodes/${NODE}`, undefined, m1);
  console.log('node progress', JSON.stringify(node.j.data.progress_json ?? node.j.data.progress));
  const wiki = await api('GET', `/projects/${PID}/wiki`, undefined, adm);
  console.log('wiki after adopt', wiki.status, JSON.stringify(wiki.j).slice(0, 400));
});

test('2.4 PM 驳回（带原因）：成员收到含原因的通知；材料状态=rejected；非 PM 不能驳回', async () => {
  const adm = (await tokensFor(ADMIN)).access, m1 = (await tokensFor(M1)).access, m2 = (await tokensFor(M2)).access;
  const s = await api('POST', `/nodes/${NODE}/evidence`, { summary_text: `C-驳回材料${TS}：截图缺失`, evidence_kind: 'text' }, m1);
  expect(s.status).toBe(200);
  pkgB = s.j.data.package_id;
  expect(s.j.data.status).toBe('pending_review');
  const bad = await api('POST', `/evidence/${pkgB}/review`, { decision: 'rejected', reason: '越权' }, m2);
  expect(bad.status).toBe(403);
  const r = await api('POST', `/evidence/${pkgB}/review`, { decision: 'rejected', reason: 'C-缺少测试截图' }, adm);
  expect(r.status).toBe(200);
  expect(r.j.data.status).toBe('rejected');
  const w = await waitNotif(m1, (x: any) => x.template_key === 'evidence.rejected' && x.payload?.package_id === pkgB);
  console.log('rejected notif', w.hit?.body_text);
  expect(w.hit).toBeTruthy();
  expect(w.hit.body_text).toContain('C-缺少测试截图');
  const recs = await api('GET', `/nodes/${NODE}/progress/records`, undefined, m1);
  expect(recs.j.data.items.filter((x: any) => x.evidence_package_id === pkgB)).toHaveLength(0);
});

test('2.5 PM 驳回但不写原因：成员看到的原因不应是“材料有效”之类的误导文案', async () => {
  const adm = (await tokensFor(ADMIN)).access, m1 = (await tokensFor(M1)).access;
  const s = await api('POST', `/nodes/${NODE}/evidence`, { summary_text: `C-无原因驳回${TS}`, evidence_kind: 'text' }, m1);
  pkgC = s.j.data.package_id;
  const r = await api('POST', `/evidence/${pkgC}/review`, { decision: 'rejected' }, adm);
  expect(r.status).toBe(200);
  const w = await waitNotif(m1, (x: any) => x.template_key === 'evidence.rejected' && x.payload?.package_id === pkgC);
  console.log('no-reason rejected notif =', w.hit?.body_text);
  expect(w.hit.body_text).not.toContain('材料有效');
});

test('2.6 成员视角：被驳回的材料在人轴“材料”页应显示“已驳回”并能看到原因', async ({ page }) => {
  await gotoMyNodeEvidenceTab(page, M1);
  const row = page.locator('.axis-evidence-row', { hasText: `C-驳回材料${TS}` });
  await expect(row).toBeVisible();
  console.log('驳回行文本 =', (await row.innerText()).replace(/\n/g, ' | '));
  await expect(row.locator('.axis-status')).toHaveText('已驳回');
  await expect(row, '驳回原因应能在材料行看到').toContainText('C-缺少测试截图');
});

test('2.7 桌面网页端：PM 可在材料行采纳/驳回，读取端即时生效', async ({ page }) => {
  const adm = (await tokensFor(ADMIN)).access, m1 = (await tokensFor(M1)).access;
  const pending = await api('POST', `/nodes/${NODE}/evidence`, { summary_text: `C-PM界面审核${TS}`, evidence_kind: 'text' }, m1);
  expect(pending.status).toBe(200);
  const pkg = pending.j.data.package_id;
  await openAs(page, ADMIN);
  await page.locator('aside').getByRole('button', { name: '人轴', exact: true }).click();
  await page.getByLabel('选择项目').selectOption(String(PID));
  await page.getByRole('tab', { name: '责任链' }).click();
  await page.getByTestId(`axis-chain-node-${state.m1.personNodeId}`).click();
  await page.getByRole('tab', { name: '材料', exact: true }).click();
  const row = page.getByTestId(`axis-evidence-${pkg}`);
  await expect(row).toContainText('待负责人确认');
  await expect(row.getByRole('button', { name: '采纳', exact: true })).toBeVisible();
  await row.getByRole('button', { name: '驳回', exact: true }).click();
  await row.getByLabel('驳回原因').fill('C-PM界面驳回原因');
  const review = page.waitForResponse(r => r.url().endsWith(`/evidence/${pkg}/review`) && r.request().method() === 'POST');
  await row.getByRole('button', { name: '确认驳回' }).click();
  expect((await review).status()).toBe(200);
  await expect(row).toContainText('已驳回');
  await expect(row).toContainText('C-PM界面驳回原因');
  const read = await api('GET', `/evidence/${pkg}`, undefined, m1);
  expect(read.status).toBe(200);
  expect(read.j.data.status).toBe('rejected');
  expect(read.j.data.reject_reason).toBe('C-PM界面驳回原因');
});
