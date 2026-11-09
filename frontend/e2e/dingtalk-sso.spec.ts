import { expect, test, type Page } from '@playwright/test';

async function mount(page: Page, component: 'admin' | 'login', suffix = '') {
  const source = await (await page.request.get('/src/main.tsx')).text();
  const reactPath = source.match(/from "([^"\n]*\/react\.js\?[^"\n]+)"/)?.[1];
  const domPath = source.match(/from "([^"\n]*\/react-dom_client\.js\?[^"\n]+)"/)?.[1];
  if (!reactPath || !domPath) throw new Error('需要 Vite 开发服务器提供 React 模块');
  await page.route(url => url.pathname === '/', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
    <script type="module">import R from '/@react-refresh';R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
    <script type="module">import React from '${reactPath}';import ReactDOM from '${domPath}';import '/src/index.css';
    import {${component === 'admin' ? 'AdminOrgSsoSection' : 'LoginGate'}} from '${component === 'admin' ? '/src/components/admin/EnterpriseSettingsSections.tsx' : '/src/components/LoginGate.tsx'}';
    const props=${component === 'admin' ? '{isAdmin:true,companyId:31}' : '{registrationConfig:{mode:"invite_only",phone_required:false},onLoggedIn:()=>{document.body.dataset.loggedIn="yes"}}'};
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${component === 'admin' ? 'AdminOrgSsoSection' : 'LoginGate'},props));</script></body></html>`,
  }));
  await page.goto('/' + suffix);
}

test('钉钉配置真实保存、密钥不回显、按供应商同步并展示持久化统计', async ({ page }) => {
  const writes: unknown[] = [];
  let config: Record<string, unknown> | null = null;
  let report: Record<string, unknown> | null = null;
  await page.route('**/api/v1/**', async route => {
    const req = route.request(); const url = new URL(req.url());
    let data: unknown = {};
    if (url.pathname.endsWith('/integrations/dingtalk')) {
      config = req.postDataJSON(); writes.push(config);
      data = { provider: 'dingtalk', has_credentials: true, credentials: { corp_id: 'ding-corp', app_key: 'ding-key', agent_id: '100', app_secret: '********', app_secret_configured: true } };
    } else if (url.pathname.endsWith('/integrations')) {
      data = { items: config ? [{ provider: 'dingtalk', has_credentials: true, credentials: { corp_id: 'ding-corp', app_key: 'ding-key', agent_id: '100', app_secret_configured: true }, last_sync_report: report }] : [] };
    } else if (url.pathname.endsWith('/org-sync')) {
      expect(url.searchParams.get('provider')).toBe('dingtalk');
      report = { created: 4, updated: 2, failed: 0, users_unmatched: 1, status: 'completed', synced_at: '2026-11-09T08:00:00Z' };
      data = { status: 'completed', report };
    } else if (url.pathname.endsWith('/login-methods')) data = { password: true, dingtalk: false, oidc: false };
    await route.fulfill({ json: { code: 200, data } });
  });
  await mount(page, 'admin');
  await page.getByLabel('企业标识', { exact: true }).fill('ding-corp');
  await page.getByLabel('应用标识', { exact: true }).fill('ding-key');
  await page.getByLabel('应用编号', { exact: true }).fill('100');
  const secret = page.getByLabel('钉钉应用密钥', { exact: true });
  await expect(secret).toHaveAttribute('type', 'password');
  await expect(secret).toHaveAttribute('autocomplete', 'new-password');
  await secret.fill('fake-e2e-secret');
  await page.getByRole('button', { name: '保存钉钉配置', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('钉钉配置已保存');
  expect(writes).toEqual([{ provider: 'dingtalk', credentials: { corp_id: 'ding-corp', app_key: 'ding-key', app_secret: 'fake-e2e-secret', agent_id: '100' } }]);
  await expect(secret).toHaveValue('');
  await page.getByRole('button', { name: '钉钉立即同步', exact: true }).click();
  await expect(page.getByText('新增 4 · 更新 2 · 失败 0', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('企业标识', { exact: true })).toHaveValue('ding-corp');
  await expect(secret).toHaveValue('');
  await expect(page.getByText('新增 4 · 更新 2 · 失败 0', { exact: true })).toBeVisible();
  for (const name of ['企业微信', '飞书', '联合身份认证']) {
    await expect(page.getByRole('button', { name: new RegExp(name + '：下一期支持') })).toBeDisabled();
  }
});

test('通用单点登录保存失败不显示成功，已保存密钥留空时不覆盖', async ({ page }) => {
  const writes: Record<string, unknown>[] = [];
  await page.route('**/api/v1/**', async route => {
    const req = route.request();
    if (req.method() === 'PUT') {
      writes.push(req.postDataJSON());
      await route.fulfill({ status: 422, json: { code: 42200, message: '发行方地址无效' } }); return;
    }
    await route.fulfill({ json: { code: 200, data: { items: [{ provider: 'oidc', has_credentials: true,
      config: { issuer: 'https://idp.test' }, credentials: { client_id: 'client', client_secret_configured: true } }] } } });
  });
  await mount(page, 'admin');
  await expect(page.getByLabel('身份发行方地址', { exact: true })).toHaveValue('https://idp.test');
  await expect(page.getByLabel('单点登录客户端密钥', { exact: true })).toHaveValue('');
  await page.getByRole('button', { name: '保存通用单点登录', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('发行方地址无效');
  expect(writes).toEqual([{ provider: 'oidc', config: { issuer: 'https://idp.test' }, credentials: { client_id: 'client' } }]);
  await expect(page.getByText('通用单点登录配置已保存', { exact: true })).toHaveCount(0);
});

for (const mobile of [false, true]) {
  test(`${mobile ? 'APP共享移动布局' : '桌面'}只显示已配置入口并完成票据登录`, async ({ page }) => {
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 900 });
    const tickets: unknown[] = [];
    await page.route('**/api/v1/sso/options*', route => route.fulfill({ json: { code: 200, data: { items: [{ provider: 'dingtalk', company_id: 31, company_name: '测试企业' }] } } }));
    await page.route('**/api/v1/sso/complete', async route => {
      tickets.push(route.request().postDataJSON());
      await route.fulfill({ json: { code: 200, data: { access_token: 'sso-access', refresh_token: 'sso-refresh' } } });
    });
    await mount(page, 'login');
    await expect(page.getByRole('button', { name: '钉钉扫码登录', exact: true })).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBeTruthy();
    await mount(page, 'login', '?mobile=1#sso_ticket=one-time-ticket-value');
    await expect(page.locator('body')).toHaveAttribute('data-logged-in', 'yes');
    expect(tickets).toEqual([{ ticket: 'one-time-ticket-value' }]);
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBe('sso-access');
    expect(await page.evaluate(() => localStorage.getItem('refresh_token'))).toBe('sso-refresh');
    await expect(page).toHaveURL(url => url.hash === '' && url.searchParams.get('mobile') === '1');
  });
}

test('未配置钉钉时登录页不显示扫码入口', async ({ page }) => {
  await page.route('**/api/v1/sso/options*', route => route.fulfill({ json: { code: 200, data: { items: [] } } }));
  await mount(page, 'login');
  await expect(page.getByText('仅限受邀注册，请向管理员索取邀请链接')).toBeVisible();
  await expect(page.getByRole('button', { name: '钉钉扫码登录', exact: true })).toHaveCount(0);
});
