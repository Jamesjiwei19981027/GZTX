import { expect, test } from '@playwright/test';
import { BASE, creds, retry429, trackErrors, uiLogin } from './helpers';

test.describe('登录页（真后端）', () => {
  test('邀请制：无邀请令牌时只有“登录”，没有注册入口，并提示仅限受邀', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByTestId('invite-only-notice')).toBeVisible();
    await expect(page.getByRole('button', { name: '注册', exact: true })).toHaveCount(0);
    await expect(page.getByRole('button', { name: '注册并登录' })).toHaveCount(0);
    // 配置来自真接口
    const cfg = await (await page.request.get(`${BASE}/api/v1/auth/registration-config`)).json();
    expect(cfg.data.mode).toBe('invite_only');
  });

  test('登录失败：错误密码显示后端提示，且不会写入令牌', async ({ page }) => {
    const errs = trackErrors(page);
    await page.goto('/');
    await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill(creds().user);
    await page.locator('input[type="password"]').first().fill('definitely-wrong-pass');
    const resp = page.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '登录', exact: true }).last().click();
    expect((await resp).status()).toBeGreaterThanOrEqual(400);
    await expect(page.locator('p.text-error')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull();
    // 提示文案应是人话而非 "HTTP 401"
    const txt = await page.locator('p.text-error').innerText();
    expect(txt).not.toMatch(/^HTTP \d+$/);
    console.log('[A01] 错误密码提示：', txt);
    void errs;
  });

  test('登录失败：不存在的账号', async ({ page }) => {
    await page.goto('/');
    await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill('A_no_such_user_zzz');
    await page.locator('input[type="password"]').first().fill('whatever123');
    await page.getByRole('button', { name: '登录', exact: true }).last().click();
    await expect(page.locator('p.text-error')).toBeVisible();
  });

  test('登录页必填校验：空表单点登录不发请求', async ({ page }) => {
    await page.goto('/');
    let called = false;
    page.on('request', (r) => { if (r.url().includes('/auth/login')) called = true; });
    await page.getByRole('button', { name: '登录', exact: true }).last().click();
    await page.waitForTimeout(500);
    expect(called).toBe(false);
  });

  test('密码登录成功：进入工作台，令牌写入，刷新后仍保持登录', async ({ page }) => {
    const c = creds();
    await uiLogin(page, c.user, c.password);
    expect(await page.evaluate(() => !!localStorage.getItem('access_token'))).toBe(true);
    await page.reload();
    await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 30_000 });
  });

  test('用邮箱 + 密码也能登录（账号框支持邮箱）', async ({ page }) => {
    const c = creds();
    await uiLogin(page, c.email, c.password);
  });

  test('登录页忘记密码入口：打开重置表单并可返回登录', async ({ page }) => {
    await page.goto('/');
    const forgot = page.getByText(/忘记密码|找回密码|重置密码|Forgot/i);
    // 找回入口必须可见，并能打开真实的重置表单。
    expect(await forgot.count(), '登录页没有忘记密码/找回密码入口').toBeGreaterThan(0);
    await page.getByTestId('forgot-password-link').click();
    await expect(page.getByRole('heading', { name: '重置密码' })).toBeVisible();
    await expect(page.getByRole('button', { name: '获取验证码' })).toBeVisible();
    await page.getByRole('button', { name: /返回登录/ }).click();
    await expect(page.getByTestId('forgot-password-link')).toBeVisible();
  });

  test('密码重置接口存在：拒绝无效验证码并返回明确错误', async ({ request }) => {
    const r = await request.post(`${BASE}/api/v1/auth/reset-password`, {
      data: { channel: 'email', target: 'a-reset-no-user@audit.example.com', code: '000000', new_password: 'A-reset-invalid-123' },
    });
    expect(r.status()).toBe(422);
    const body = await r.json();
    expect(body.message || body.detail).toMatch(/验证码错误或已过期/);
    console.log('[A01] 密码重置：', r.status(), body.message || body.detail);
  });

  test('无邀请令牌：接口层拒绝发验证码与注册（403）', async ({ request }) => {
    const s = await retry429(() => request.post(`${BASE}/api/v1/auth/send-code`, { data: { channel: 'email', target: 'a-noinvite@audit.example.com', purpose: 'register' } }));
    expect(s.status()).toBe(403);
    const r = await retry429(() => request.post(`${BASE}/api/v1/auth/register`, {
      data: { username: 'A_noinvite', password: 'pw123456', email: 'a-noinvite@audit.example.com', email_code: '123456' },
    }));
    expect(r.status()).toBe(403);
    console.log('[A01] 无邀请注册提示：', (await r.json()).detail);
  });

  test('伪造邀请令牌：打开 ?invite=xxx 显示注册表单，但发码被拒且提示明确', async ({ page }) => {
    await page.goto('/?invite=bogus-token-123');
    await expect(page.getByRole('heading', { name: '创建账户' })).toBeVisible();
    await page.getByLabel('邮箱 *', { exact: true }).fill('a-bogus@audit.example.com');
    await page.getByRole('button', { name: '获取验证码' }).click();
    await expect(page.locator('p.text-error')).toBeVisible();
    console.log('[A01] 伪造令牌发码提示：', await page.locator('p.text-error').innerText());
  });

  test('受保护接口无令牌访问被拒（401）', async ({ request }) => {
    const r = await request.get(`${BASE}/api/v1/companies/1/smtp`);
    expect([401, 403]).toContain(r.status());
  });
});
