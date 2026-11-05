import { test, expect } from '@playwright/test';
import type { APIRequestContext } from '@playwright/test';

const E2E_USER = process.env.E2E_USER || 'e2e_user';
const E2E_PASSWORD = process.env.E2E_PASSWORD || 'e2e-password-123';

type Tokens = { access_token: string; refresh_token?: string };

async function apiLogin(request: APIRequestContext): Promise<Tokens> {
  const res = await request.post('/api/v1/auth/login', {
    data: { username: E2E_USER, password: E2E_PASSWORD },
  });
  expect(res.ok(), `登录接口 HTTP ${res.status()}`).toBeTruthy();
  const body = await res.json();
  expect(body.code).toBe(200);
  return body.data as Tokens;
}

test.describe('统一断点 1024 验证', () => {
  test('走真实 App 入口，宽度 1023 显示手机外壳，1024 显示电脑外壳；窗口从 1024 缩到 1023 能切换', async ({ page, request }) => {
    const tokens = await apiLogin(request);
    await page.addInitScript(
      ([access, refresh]) => {
        localStorage.setItem('access_token', access);
        if (refresh) localStorage.setItem('refresh_token', refresh);
      },
      [tokens.access_token, tokens.refresh_token ?? ''] as const,
    );

    // 1. 初始视口宽度 1024（电脑外壳分界点）
    await page.setViewportSize({ width: 1024, height: 800 });
    const categoriesLoaded = page.waitForResponse((res) =>
      res.url().includes('/api/v1/categories'),
    );
    await page.goto('/');
    await categoriesLoaded;

    // 断言宽度 1024 下显示电脑外壳（aside 存在且可见），无手机外壳
    const desktopSidebar = page.locator('aside');
    await expect(desktopSidebar).toBeVisible();
    await expect(page.locator('.mobile-shell')).toHaveCount(0);

    // 2. 窗口从 1024 缩小到 1023
    await page.setViewportSize({ width: 1023, height: 800 });

    // 断言自适应切换到手机外壳
    await expect(page.locator('.mobile-shell')).toBeVisible();
    await expect(page.locator('aside')).toHaveCount(0);
    await expect(page.locator('nav[aria-label="主要页面导航"]')).toBeVisible();

    // 3. 窗口从 1023 放大回 1024
    await page.setViewportSize({ width: 1024, height: 800 });

    // 断言切回电脑外壳
    await expect(desktopSidebar).toBeVisible();
    await expect(page.locator('.mobile-shell')).toHaveCount(0);

    // 4. 新页面直接在 1023 宽度加载
    const mobilePage = await page.context().newPage();
    await mobilePage.setViewportSize({ width: 1023, height: 800 });
    const mobileCategories = mobilePage.waitForResponse((res) =>
      res.url().includes('/api/v1/categories'),
    );
    await mobilePage.goto('/');
    await mobileCategories;
    await expect(mobilePage.locator('.mobile-shell')).toBeVisible();
    await expect(mobilePage.locator('aside')).toHaveCount(0);
    await mobilePage.close();
  });
});
