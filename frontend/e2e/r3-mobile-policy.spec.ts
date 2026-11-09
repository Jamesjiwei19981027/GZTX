import { expect, test } from '@playwright/test';

test('手机项目设置可读取保存汇报策略，归档与普通成员只读', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const writes: unknown[] = [];
  await page.route('**/api/v1/projects/42/report-polici*', route => route.fulfill({ json: { code: 200, data: { items: [{ id: 1, enabled: true, period: 'weekly', deadline_time: '16:30', weekday: 2, month_day: 20, remind: true }] } } }));
  await page.route('**/api/v1/projects/42/report-policy', async route => {
    writes.push(route.request().postDataJSON());
    await route.fulfill({ json: { code: 200, data: { id: 1, ...route.request().postDataJSON() } } });
  });
  await page.route(url => url.pathname === '/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
    <script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;</script>
    <script type="module" src="/e2e/helpers/r3-policy-harness.tsx"></script></body></html>` }));
  await page.goto('/');
  await expect(page.getByLabel('截止时间')).toHaveValue('16:30');
  await expect(page.getByLabel('每周截止日')).toHaveValue('2');
  await page.getByLabel('汇报周期').selectOption('monthly');
  await page.getByLabel('每月截止日').selectOption('28');
  await page.getByLabel('截止时间').fill('17:45');
  await page.getByLabel('截止前提醒未提交成员').uncheck();
  await page.getByRole('button', { name: '保存汇报策略' }).click();
  await expect(page.getByRole('status')).toHaveText('汇报策略已保存');
  expect(writes).toEqual([{ enabled: true, period: 'monthly', deadline_time: '17:45', weekday: 2, month_day: 28, remind: false }]);
  await page.evaluate(() => (window as any).renderPolicy(true, true));
  await expect(page.getByRole('button', { name: '保存汇报策略' })).toBeDisabled();
  await page.evaluate(() => (window as any).renderPolicy(false, false));
  await expect(page.getByLabel('汇报周期')).toBeDisabled();
  expect(writes).toHaveLength(1);
});
