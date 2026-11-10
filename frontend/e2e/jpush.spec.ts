import { test, expect } from '@playwright/test';

for (const width of [1280, 390]) {
  test(`手机推送开关与偏好保存 ${width}`, async ({ page }) => {
    page.on('pageerror', error => console.log('harness error:', error.message));
    page.on('console', message => { if (message.type() === 'error') console.log('harness console:', message.text()); });
    await page.setViewportSize({ width, height: 900 });
    let enabled = false;
    const updates: unknown[] = [];
    await page.route('**/api/v1/push/status', route => route.fulfill({ json: { enabled } }));
    await page.route('**/api/v1/users/me', async route => {
      updates.push(route.request().postDataJSON());
      await route.fulfill({ json: { code: 200, data: { id: 1 } } });
    });
    await page.route('**/jpush-harness', route => route.fulfill({ contentType: 'text/html', body: `
      <html><head><meta name="viewport" content="width=device-width, initial-scale=1">
      <script type="module">import R from '/@react-refresh'; R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
      </head><body><div id="root"></div>
      <script type="module" src="/e2e/jpush-harness.tsx"></script></body></html>` }));
    await page.goto('/jpush-harness');
    await expect(page.getByRole('checkbox', { name: '手机推送' })).toHaveCount(0);
    enabled = true;
    await page.reload();
    const toggle = page.getByRole('checkbox', { name: '手机推送' });
    await expect(toggle).toBeChecked();
    await toggle.uncheck();
    await expect(toggle).not.toBeChecked();
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0]).toEqual({ notify_pref: { channels: { push: { enabled: false } } } });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}
