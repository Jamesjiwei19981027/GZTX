import { expect, test } from '@playwright/test';

/**
 * T11 移动端设置中心与管理员配置 E2E 验证
 * 覆盖设计 ID:
 * 53 (我的), 54 (个人资料), 55 (账号安全), 56 (外观与语言), 57 (通知与免打扰),
 * 58 (任务默认值), 62 (隐私与帮助), 63 (通知记录，仅从通知页进入)。
 * 59-61、90-94 的企业配置已挪到电脑端“设置 → 企业管理”，这里只断言手机端不再有入口。
 */

test('Mobile Settings & Admin Integration: Retained Personal Screens Reachability, Role Access & Security', async ({ page }) => {
  const apiCalls: string[] = [];

  page.on('pageerror', (err) => console.log(`settings-pageerror: ${err.message}`));

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    apiCalls.push(`${request.method()} ${path}`);

    let data: unknown = {};

    if (path === '/users/me' && request.method() === 'GET') {
      data = {
        id: 7,
        username: 'e2e_admin',
        nickname: '管理员小张',
        email: 'admin@worktodo.com',
        phone: '13800000001',
        email_verified: true,
        phone_verified: true,
        avatar_url: '',
      };
    } else if (path === '/users/me/verification' && request.method() === 'GET') {
      data = {
        email: 'admin@worktodo.com',
        phone: '13800000001',
        email_verified: true,
        phone_verified: true,
        is_verified: true,
      };
    } else if (path === '/users/me/billing') {
      data = {
        company_id: 1,
        company_name: '协同创新科技',
        plan_code: '企业专业版 · 多端协同',
        status: 'active',
        managed_by: '平台运维部',
      };
    } else if (path === '/users/me/privacy') {
      data = {
        stored_data: { user: true, tasks: true },
        retention: '180 天 (按企业合规归档)',
        export_endpoint: '/api/v1/users/me/export',
        delete_endpoint: '/api/v1/users/me/delete',
      };
    } else if (path === '/notifications/smtp-config') {
      data = {
        smtp_host: 'smtp.mailgun.org',
        smtp_port: 465,
        smtp_user: 'postmaster@worktodo.com',
        smtp_from: 'noreply@worktodo.com',
        has_password: true,
      };
    } else if (path === '/notifications/llm-config') {
      data = {
        provider: 'openai',
        base_url: 'https://api.openai.com/v1',
        model: 'gpt-4o',
        enabled: true,
        configured: true,
        has_api_key: true,
      };
    } else if (path === '/notifications/vapid-public-key') {
      data = { publicKey: 'BCxK938d_mock_vapid_key_fingerprint' };
    } else if (path === '/notify/records') {
      data = {
        items: [
          { channel: 'email', status: 'success', task_title: '项目周报生成', created_at: new Date().toISOString() },
          { channel: 'webpush', status: 'failed', error: 'Push subscription expired', task_title: '任务逾期提醒', created_at: new Date().toISOString() },
        ],
      };
    } else if (path === '/notify/test-send') {
      data = { ok: true };
    } else if (path.startsWith('/companies/1/integrations')) {
      data = {
        items: [
          { provider: 'wecom', enabled: true, status: 'active', last_sync_at: '2026-10-19T08:00:00Z' },
          { provider: 'dingtalk', enabled: false, status: 'unconfigured' },
          { provider: 'feishu', enabled: false, status: 'unconfigured' },
        ],
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data }),
    });
  });

  // 设置移动视口 390x844 (iPhone 14 基准)
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

        const mockUser = { id: '7', name: '管理员小张', role: 'admin', avatar: '', email: 'admin@worktodo.com' };
        const mockProject = { id: '1', name: '责任树联合调试', description: 'desc', color: '#0058be', active: true };
        const mockMembers = [];
        const mockSettings = {
          themeMode: 'light',
          accentColor: 'blue',
          language: 'zh',
          notifications: { email: true, push: true, desktop: true, wechat: false, quietHoursStart: '22:00', quietHoursEnd: '08:00', weekendMute: true },
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
              projectMembers: mockMembers,
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

  // 1. 验证 53 (我的主入口)
  await expect(page.locator('text=我的').first()).toBeVisible({ timeout: 10000 });
  await expect(page.locator('text=管理员小张')).toBeVisible();
  await expect(page.locator('text=企业 ID: 1')).toBeVisible();

  // 2. 点击进入 54 (个人资料)
  await page.click('text=个人资料');
  await expect(page.locator('text=工作邮箱')).toBeVisible();
  await expect(page.locator('text=admin@worktodo.com').first()).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 3. 点击进入 55 (账号安全)
  await page.click('text=账号安全');
  await expect(page.locator('text=当前原密码')).toBeVisible();
  await expect(page.locator('text=注销此账号')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 4. 点击进入 56 (外观)
  await page.click('text=外观');
  await expect(page.locator('text=浅色模式')).toBeVisible();
  await expect(page.locator('text=深色模式').first()).toBeVisible();
  await expect(page.locator('text=系统动态字体 (Dynamic Type)')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 5. 点击进入 57 (通知与免打扰)
  await page.click('text=通知与免打扰');
  await expect(page.locator('text=邮件通知')).toBeVisible();
  await expect(page.locator('text=免打扰模式 (DND)')).toBeVisible();
  await expect(page.locator('text=测试邮件发送')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 6. 点击进入 58 (任务默认值)
  await page.click('text=任务默认值');
  await expect(page.locator('text=默认优先级')).toBeVisible();
  await expect(page.locator('text=中优先级')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 7. 手机端只留个人设置：企业配置（通知渠道、AI 服务、组织与登录、模型密钥、语音识别、单点登录）
  //    已挪到电脑端“设置 → 企业管理”，手机“我的”页不再有这些入口，只给管理员一条电脑端操作提示
  await expect(page.locator('text=企业配置请在电脑端「设置 → 企业管理」中操作').first()).toBeVisible();
  for (const removed of ['通知渠道配置', 'AI 模型与语音配置', '组织与登录集成', '模型密钥配置', '语音识别配置 (ASR)', '单点登录配置 (SSO)', '企业集成与管理']) {
    await expect(page.getByText(removed, { exact: true })).toHaveCount(0);
  }

  // 10. 点击进入 62 (隐私与帮助)
  await page.click('text=隐私与帮助');
  await expect(page.locator('text=数据安全与隐私合规')).toBeVisible();
  // 验证桌面快捷键帮助展开
  await page.click('text=桌面键盘快捷键清单');
  await expect(page.locator('text=全局智能搜索')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 11. “我的”页不再直接列出通知发送记录，只能从“通知与免打扰”页里进入
  await expect(page.getByText('通知发送记录', { exact: true })).toHaveCount(0);
  await page.click('text=通知与免打扰');
  await page.click('text=前往查看历史通知发送记录');
  await expect(page.locator('text=全部 (2)')).toBeVisible();
  await expect(page.locator('text=项目周报生成')).toBeVisible();
  await expect(page.locator('text=Push subscription expired')).toBeVisible();
  await page.click('button[aria-label="返回"]');
  await page.click('button[aria-label="返回"]');

  // 12. 第三方服务绑定、推送证书状态在手机“我的”页没有入口
  for (const removed of ['第三方服务绑定', '推送证书状态']) {
    await expect(page.getByText(removed, { exact: true })).toHaveCount(0);
  }

  console.log('✓ All retained T11 screens verified successfully in Playwright E2E test!');
});
