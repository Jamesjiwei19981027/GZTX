import { expect, test } from '@playwright/test';

test('网页与手机共用核验表单保存真实意见，成员可读且只读', async ({ page }) => {
  const requests: unknown[] = [];
  const review = { decision: 'returned', comment: '请补充验收材料', reviewer_user_id: 4, reviewed_at: '2026-11-09T08:00:00Z' };
  await page.route('**/api/v1/reports/12/review', async route => {
    requests.push(route.request().postDataJSON());
    await route.fulfill({ json: { code: 200, data: { id: 12, can_review: true, review } } });
  });
  await page.route(url => url.pathname === '/', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div><script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module" src="/e2e/helpers/r3-review-harness.tsx"></script></body></html>` }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: '退回修改' }).click();
  await expect(page.getByRole('status')).toContainText('请填写');
  expect(requests).toHaveLength(0);
  await page.getByLabel('核验意见').fill(review.comment);
  await page.getByRole('button', { name: '退回修改' }).click();
  await expect(page.getByRole('status')).toHaveText('核验意见已保存并通知成员');
  expect(requests).toEqual([{ decision: 'returned', comment: review.comment }]);
  await page.evaluate(review => (window as any).renderReport(false, review), review);
  await expect(page.getByText(review.comment, { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '退回修改' })).toHaveCount(0);
});
