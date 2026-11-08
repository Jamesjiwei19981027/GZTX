import { expect, test, type Page } from '@playwright/test';
import { companyId, invitedProject, mockWorkspaceApi, workspaceUser } from './helpers/workspace-api';

const password = 'invite-password-123';
const email = 'member@example.test';
const backendError = '邀请已失效，请联系管理员重新获取邀请链接';

/** 独立加载正式手机认证组件，覆盖 MobileAuthScreens 自己的配置分支和表单处理器。
 * 完整 App 的项目跳转另有桌面 / ?mobile=1 两条用例，不在 harness 内模拟跳转。
 */
async function mountMobileAuth(page: Page, invite = false) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route(url => url.pathname === '/', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
      <body><div id="root"></div>
      <script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
      <script type="module">
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import '/src/index.css';import '/src/mobile/mobile.css';
        import {MobileAuthScreens} from '/src/mobile/features/auth/MobileAuthScreens.tsx';
        function Harness(){const [result,setResult]=React.useState(null);return React.createElement(React.Fragment,null,
          React.createElement(MobileAuthScreens,{onLoggedIn:setResult}),
          result?React.createElement('output',{'aria-label':'登录结果'},JSON.stringify(result)):null);}
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Harness));
      </script><style>html,body,#root{height:100%;margin:0}</style></body></html>`,
  }));
  await page.goto(invite ? '/?mobile=1&invite=abc' : '/?mobile=1');
}

async function fillDesktopRegistration(page: Page) {
  await expect(page.getByRole('heading', { name: '创建账户', exact: true })).toBeVisible();
  await page.getByLabel('用户名', { exact: true }).fill('invited_member');
  await page.getByLabel('邮箱 *', { exact: true }).fill(email);
  await page.getByLabel('邮箱验证码 *', { exact: true }).fill('123456');
  await page.getByLabel('密码 *', { exact: true }).fill(password);
  await page.getByLabel('确认密码 *', { exact: true }).fill(password);
}

async function fillMobileRegistration(page: Page) {
  await expect(page.getByRole('heading', { name: '注册新账号', exact: true })).toBeVisible();
  await page.getByPlaceholder('请输入用户名', { exact: true }).fill('invited_member');
  await page.getByPlaceholder('name@company.com', { exact: true }).fill(email);
  await page.getByPlaceholder('输入 6 位验证码', { exact: true }).fill('123456');
  await page.getByPlaceholder('至少 6 位密码', { exact: true }).fill(password);
  await page.getByPlaceholder('再次输入密码', { exact: true }).fill(password);
}

async function mockRegistration(page: Page, reject = false) {
  const requests = { codes: [] as Record<string, unknown>[], registrations: [] as Record<string, unknown>[] };
  await page.route('**/api/v1/auth/send-code', async route => {
    expect(route.request().method()).toBe('POST');
    requests.codes.push(route.request().postDataJSON());
    await route.fulfill({ json: { code: 200, data: { ok: true, cooldown_seconds: 60 } } });
  });
  await page.route('**/api/v1/auth/register', async route => {
    expect(route.request().method()).toBe('POST');
    requests.registrations.push(route.request().postDataJSON());
    if (reject) {
      await route.fulfill({ status: 403, json: { code: 403, message: backendError } });
      return;
    }
    await route.fulfill({ json: { code: 200, data: {
      access_token: 'e2e-invited-access', refresh_token: 'e2e-invited-refresh',
      user: workspaceUser, project_id: invitedProject.id,
    } } });
  });
  return requests;
}

for (const mobile of [false, true]) {
  const platform = mobile ? '手机认证页' : '电脑端登录页';

  test(`${platform}：开放注册时提供可用的注册入口`, async ({ page }) => {
    await mockWorkspaceApi(page, { registrationConfig: { mode: 'open', phone_required: false } });
    if (mobile) await mountMobileAuth(page);
    else {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto('/');
    }
    await page.getByRole('button', { name: mobile ? '立即注册新账号' : '注册', exact: true }).click();
    await expect(page.getByRole('heading', { name: mobile ? '注册新账号' : '创建账户', exact: true })).toBeVisible();
  });

  test(`${platform}：邀请制且没有 token 时隐藏注册入口并提示仅限受邀注册`, async ({ page }) => {
    await mockWorkspaceApi(page, { registrationConfig: { mode: 'invite_only', phone_required: false } });
    if (mobile) await mountMobileAuth(page);
    else {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto('/');
    }
    // 等后端配置反映到 UI 后再做否定断言，避免命中配置尚未加载的初始态。
    await expect(page.getByText('仅限受邀注册，请向管理员索取邀请链接', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: mobile ? '立即注册新账号' : '注册', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: mobile ? '立即注册' : '注册并登录', exact: true })).toHaveCount(0);
    await expect(page.getByRole('heading', { name: mobile ? '注册新账号' : '创建账户', exact: true })).toHaveCount(0);
  });

  test(`${platform}：注册接口返回 403 时展示后端文案并保留用户输入`, async ({ page }) => {
    await mockWorkspaceApi(page, { registrationConfig: { mode: 'invite_only', phone_required: false } });
    const requests = await mockRegistration(page, true);
    if (mobile) {
      await mountMobileAuth(page, true);
      await fillMobileRegistration(page);
    } else {
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto('/?invite=abc');
      await fillDesktopRegistration(page);
    }
    await page.getByRole('button', { name: mobile ? '立即注册' : '注册并登录', exact: true }).click();
    await expect(page.getByText(backendError, { exact: true })).toBeVisible();
    expect(requests.registrations).toHaveLength(1);
    expect(requests.registrations[0]).toMatchObject({ invite_token: 'abc', username: 'invited_member' });
    await expect(mobile ? page.getByPlaceholder('请输入用户名', { exact: true }) : page.getByLabel('用户名', { exact: true })).toHaveValue('invited_member');
    await expect(page.getByRole('button', { name: mobile ? '立即注册' : '注册并登录', exact: true })).toBeEnabled();
    await expect(page).toHaveURL(url => url.searchParams.get('invite') === 'abc');
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull();
  });
}

for (const mobile of [false, true]) {
  test(`${mobile ? 'APP 共享手机壳' : '电脑端'}：受邀注册传递 token，完成后进入返回的项目并移除 invite`, async ({ page }) => {
    await mockWorkspaceApi(page, { phoneVerified: false, registrationConfig: { mode: 'invite_only', phone_required: false } });
    const requests = await mockRegistration(page);
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    // 从实际 App 入口进入；当前 App 在登录前共用 LoginGate，登录后按 mobile=1 切换手机壳。
    await page.goto(mobile ? '/?mobile=1&invite=abc' : '/?invite=abc');
    await fillDesktopRegistration(page);
    await page.getByRole('button', { name: '获取验证码', exact: true }).click();
    await expect(page.getByText('验证码已发送', { exact: true })).toBeVisible();
    expect(requests.codes).toEqual([{ channel: 'email', target: email, purpose: 'register', invite_token: 'abc' }]);
    await page.getByRole('button', { name: '注册并登录', exact: true }).click();
    await expect(page).toHaveURL(url => !url.searchParams.has('invite') && url.searchParams.get('view') === 'team');
    expect(requests.registrations).toEqual([expect.objectContaining({
      username: 'invited_member', email, email_code: '123456', password, invite_token: 'abc',
    })]);
    if (mobile) {
      await expect(page.getByRole('tab', { name: '我的', exact: true })).toBeVisible();
      // 通过真实工作台的当前项目按钮验证项目选择，不只断言注册回调或项目列表中存在项目。
      await page.getByRole('tab', { name: '工作', exact: true }).click();
      await expect(page.getByRole('button', { name: '项目列表', exact: true })).toHaveText(invitedProject.name);
    } else {
      await expect(page.getByRole('heading', { name: /团队成员/ })).toBeVisible();
      await expect(page.locator('header').getByRole('button', { name: new RegExp(invitedProject.name) })).toBeVisible();
    }
    expect(await page.evaluate(() => sessionStorage.getItem('pending_invite_token'))).toBeNull();
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBe('e2e-invited-access');
    await expect(page.getByRole('heading', { name: /验证手机号|协作功能需要补验手机/ })).toHaveCount(0);
  });
}

test('手机认证组件：带邀请直接显示注册，邮件与短信发送及注册都携带 invite_token', async ({ page }) => {
  await mockWorkspaceApi(page, { registrationConfig: { mode: 'invite_only', phone_required: false } });
  const requests = await mockRegistration(page);
  await mountMobileAuth(page, true);
  await fillMobileRegistration(page);
  // 邮箱、手机号各自有同名发送按钮，用输入框所在行限定作用域。
  await page.getByPlaceholder('name@company.com', { exact: true }).locator('..').locator('..')
    .getByRole('button', { name: '发验证码', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('验证码已发送');
  await page.getByPlaceholder('手机号', { exact: true }).fill('13800138000');
  await page.getByPlaceholder('手机号', { exact: true }).locator('..').locator('..')
    .getByRole('button', { name: '发验证码', exact: true }).click();
  await expect.poll(() => requests.codes).toEqual([
    { channel: 'email', target: email, purpose: 'register', invite_token: 'abc' },
    { channel: 'sms', target: '13800138000', purpose: 'register', invite_token: 'abc' },
  ]);
  await page.getByPlaceholder('输入短信验证码', { exact: true }).fill('654321');
  await page.getByRole('button', { name: '立即注册', exact: true }).click();
  await expect(page.getByLabel('登录结果', { exact: true })).toContainText('"project_id":73');
  expect(requests.registrations).toEqual([expect.objectContaining({
    invite_token: 'abc', email_code: '123456', phone: '13800138000', phone_code: '654321',
  })]);
  await expect(page).toHaveURL(url => url.searchParams.get('mobile') === '1' && !url.searchParams.has('invite'));
  expect(await page.evaluate(() => sessionStorage.getItem('pending_invite_token'))).toBeNull();
});

for (const mobile of [false, true]) {
  test(`${mobile ? '手机端' : '电脑端'}：phone_required=false，未验证手机的用户登录后仍可创建协作项目`, async ({ page }) => {
    await mockWorkspaceApi(page, { phoneVerified: false, registrationConfig: { mode: 'open', phone_required: false } });
    const creates: Record<string, unknown>[] = [];
    await page.route('**/api/v1/auth/login', route => route.fulfill({ json: { code: 200, data: {
      access_token: 'e2e-login-access', user: workspaceUser,
    } } }));
    await page.route('**/api/v1/projects', async route => {
      if (route.request().method() !== 'POST') return route.fallback();
      creates.push(route.request().postDataJSON());
      await route.fulfill({ json: { code: 200, data: { id: 91, company_id: companyId, name: '无手机验证协作项目', status: 'active' } } });
    });
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 });
    await page.goto(mobile ? '/?mobile=1' : '/?view=team');
    await page.getByLabel('账号', { exact: true }).fill('invited_member');
    await page.getByLabel('密码', { exact: true }).fill(password);
    const workspaceLoaded = page.waitForResponse(response => {
      const url = new URL(response.url());
      return url.pathname === '/api/v1/projects' && url.searchParams.get('company_id') === String(companyId)
        && response.request().method() === 'GET';
    });
    await page.locator('form').getByRole('button', { name: '登录', exact: true }).click();
    await workspaceLoaded;
    await expect(page.getByText('正在从后端同步…', { exact: true })).toHaveCount(0);
    if (mobile) {
      await page.getByRole('button', { name: '项目列表', exact: true }).click();
      await page.getByRole('button', { name: '新建项目', exact: true }).click();
      await page.getByLabel('项目名称', { exact: true }).fill('无手机验证协作项目');
      await page.getByRole('button', { name: '立即创建项目', exact: true }).click();
      await expect(page.getByRole('heading', { name: '新建项目', exact: true })).toHaveCount(0);
      await expect(page.getByRole('heading', { name: '切换工作区与项目', exact: true })).toBeVisible();
      await page.getByRole('button', { name: '关闭', exact: true }).click();
      await expect(page.getByRole('button', { name: '项目列表', exact: true })).toHaveText('无手机验证协作项目');
    } else {
      await page.getByRole('button', { name: '创建项目', exact: true }).click();
      await page.getByLabel('项目名称', { exact: true }).fill('无手机验证协作项目');
      await page.getByRole('button', { name: '创建', exact: true }).click();
      await expect(page.getByText('项目已创建', { exact: true })).toBeVisible();
    }
    expect(creates).toEqual([{ name: '无手机验证协作项目', company_id: companyId }]);
    await expect(page.getByRole('heading', { name: /验证手机号|协作功能需要补验手机/ })).toHaveCount(0);
    await expect(page.getByRole('alertdialog', { name: '手机号码尚未验证', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '去绑定手机', exact: true })).toHaveCount(0);
  });
}
