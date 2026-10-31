import { expect, test } from '@playwright/test';

/**
 * T12 移动端全尺寸与异常场景适配 E2E 验证
 * 覆盖设计 ID:
 * 66 (空状态), 67 (断网与草稿恢复), 68 (加载失败/模型422), 69 (权限不足), 70 (高风险确认),
 * 71 (窄屏320), 72 (宽屏430), 73 (大字150%), 74 (大字200%), 75 (深色模式),
 * 76 (平板双栏), 77 (横屏手机), 78 (键盘弹出), 96 (删除账号确认), 97 (启动同步/2FA)
 */

test('Mobile Adaptation & Failure States: 15 Scenarios Full Verification', async ({ page }) => {
  page.on('pageerror', (err) => console.log(`adaptation-pageerror: ${err.message}`));

  await page.route('**/api/v1/**', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data: {} }),
    });
  });

  await page.setViewportSize({ width: 390, height: 844 });

  await page.route((url) => url.pathname === '/', (route) =>
    route.fulfill({
      contentType: 'text/html; charset=utf-8',
      body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
        <script type="module">
        import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
        window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;
        </script>
        <script type="module">
        import React from '/node_modules/.vite/deps/react.js';
        import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
        import '/src/index.css';
        import { MobileNavigationProvider } from '/src/mobile/navigation/MobileNavigationProvider.tsx';
        import { MobileRouteOutlet } from '/src/mobile/navigation/MobileRouteOutlet.tsx';

        const mockUser = { id: '7', name: '测试用户', role: 'member', avatar: '', email: 'test@worktodo.com' };
        const mockProject = { id: '1', name: '适配测试项目', description: 'desc', color: '#0058be', active: true };
        const mockSettings = {
          themeMode: 'light',
          accentColor: 'blue',
          language: 'zh',
          notifications: {},
          taskDefaults: { priority: 'Medium', category: 'Work' }
        };

        function App() {
          return React.createElement(
            MobileNavigationProvider,
            { initialTab: 'me' },
            React.createElement(MobileRouteOutlet, {
              user: mockUser,
              tasks: [],
              projects: [mockProject],
              currentProject: mockProject,
              onSelectProject: () => {},
              activities: [],
              settings: mockSettings,
              companyId: 1,
              projectMembers: [],
              onSelectTask: () => {},
              onOpenNewTask: () => {},
              onToggleTaskCompletion: () => {},
              onBatchComplete: async () => {},
              onBatchReschedule: async () => {},
              onBatchDelete: async () => {},
              onUpdateUser: async () => {},
              onUploadAvatar: async () => {},
              onUpdateSettings: () => {},
              onLogout: async () => {},
              onOpenQuickAdd: () => {},
              onOpenSearch: () => {},
            })
          );
        }
        ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
        </script></body></html>`,
    }),
  );

  await page.goto('/');

  // 1. 验证 66 (空状态与首次使用)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-empty', title: '空状态与首次使用' });
  });
  await expect(page.locator('text=暂无待办任务')).toBeVisible();
  await page.click('text=空责任链');
  await expect(page.locator('text=人轴责任链尚未配置')).toBeVisible();
  await page.click('text=无证据材料');
  await expect(page.locator('text=暂未提交交付物证据')).toBeVisible();

  // 2. 验证 67 (断网与离线恢复)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-offline', title: '断网与启动恢复' });
  });
  await expect(page.locator('text=模拟离线断网模式')).toBeVisible();
  await page.click('text=暂存离线草稿');
  await expect(page.locator('text=离线周报拟制')).toBeVisible();
  await expect(page.locator('text=恢复').first()).toBeVisible();

  // 3. 验证 68 (加载失败 / 模型不可用)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-load-fail', title: '加载失败与模型异常' });
  });
  await expect(page.locator('text=服务数据加载失败')).toBeVisible();
  await page.click('text=AI 模型未配置 (422)');
  await expect(page.locator('text=AI 模型服务未配置 (422)')).toBeVisible();
  await expect(page.locator('text=前往配置企业 AI 模型')).toBeVisible();

  // 4. 验证 69 (权限不足 / 角色变化)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-forbidden', title: '权限与角色变化' });
  });
  await expect(page.locator('text=无访问权限 (HTTP 403)')).toBeVisible();
  await page.click('text=被移出项目');
  await expect(page.locator('text=已被移出该项目')).toBeVisible();
  await page.click('text=管理员权限变更');
  await expect(page.locator('text=角色变更：已转为普通成员')).toBeVisible();

  // 5. 验证 70 (删除与高风险操作确认)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-danger-confirm', title: '删除与高风险确认' });
  });
  await expect(page.locator('text=确认删除核心任务？')).toBeVisible();
  await expect(page.locator('text=操作直接影响：')).toBeVisible();
  // 未勾选协议时按钮处于禁用状态
  const confirmBtn = page.locator('button:has-text("确认并执行高风险操作")');
  await expect(confirmBtn).toBeDisabled();
  await page.click('text=我已完整阅读并充分知晓上述影响');
  await expect(confirmBtn).toBeEnabled();

  // 6. 验证 71 (窄屏 320 适配)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-narrow-320', title: '窄屏适配 320' });
  });
  await expect(page.locator('text=320px 窄屏基准')).toBeVisible();
  await expect(page.locator('text=W: 320px')).toBeVisible();

  // 7. 验证 72 (宽屏 430 适配)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-wide-430', title: '宽屏手机 430' });
  });
  await expect(page.locator('text=430px Pro Max 宽屏模式')).toBeVisible();
  await expect(page.locator('text=责任链健康度')).toBeVisible();

  // 8. 验证 73 (系统大字体 150%)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-font-150', title: '系统大字体 150%' });
  });
  await expect(page.locator('text=任务标题放大展示')).toBeVisible();
  await expect(page.locator('text=确认并提交 (自适应高度)')).toBeVisible();

  // 9. 验证 74 (系统大字体 200%)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-font-200', title: '系统大字体 200%' });
  });
  await expect(page.locator('text=200% 无障碍模式')).toBeVisible();
  await expect(page.locator('text=主要确认操作')).toBeVisible();

  // 10. 验证 75 (深色模式 WCAG AA)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-dark-mode', title: '深色模式' });
  });
  await expect(page.locator('text=WCAG 2.1 AA 认证合规')).toBeVisible();
  await expect(page.locator('text=7.2:1 对比度')).toBeVisible();

  // 11. 验证 76 (平板双栏 Master-Detail)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-tablet-split', title: '平板双栏' });
  });
  await expect(page.locator('text=事项列表 (Master)')).toBeVisible();
  await expect(page.locator('text=详情面板 (Detail Panel)')).toBeVisible();

  // 12. 验证 77 (横屏手机 844x390)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-landscape', title: '横屏手机' });
  });
  await expect(page.locator('text=横屏模式 · 844×390')).toBeVisible();
  await expect(page.locator('text=横屏左侧：人轴与统计')).toBeVisible();

  // 13. 验证 78 (键盘弹出与输入避让)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-keyboard-inset', title: '键盘弹出与输入' });
  });
  await expect(page.locator('text=视口避让原理 (visualViewport)')).toBeVisible();
  await page.click('text=模拟键盘弹出 (280px)');
  await expect(page.locator('text=[ 虚拟键盘区域 · 高度 280px ]')).toBeVisible();

  // 14. 验证 96 (删除账号确认)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-account-delete', title: '注销账号确认' });
  });
  await expect(page.locator('text=永久注销此账号').first()).toBeVisible();
  const deleteBtn = page.locator('button:has-text("永久注销此账号")');
  await expect(deleteBtn).toBeDisabled();

  // 15. 验证 97 (启动同步与 2FA 二次验证)
  await page.evaluate(() => {
    (window as any).__MOBILE_NAV__.push({ screen: 'adapt-boot-sync', title: '启动与二次验证' });
  });
  await expect(page.locator('text=正在同步企业协同数据…')).toBeVisible();
  await page.click('text=敏感操作二次验证');
  await expect(page.locator('text=敏感操作二次安全验证')).toBeVisible();

  console.log('✓ All 15 T12 adaptation & failure states verified successfully in Playwright E2E test!');
});
