import { expect, test } from '@playwright/test';

/**
 * T11 移动端设置中心与管理员配置 E2E 验证
 * 覆盖设计 ID:
 * 53 (我的), 54 (个人资料), 55 (账号安全), 56 (外观与语言), 57 (通知与免打扰),
 * 58 (任务默认值), 59 (通知渠道), 60 (AI 模型), 61 (组织与登录), 62 (套餐帮助),
 * 63 (通知记录), 90 (第三方绑定), 91 (推送证书), 92 (模型密钥), 93 (ASR), 94 (SSO)
 */

test('Mobile Settings & Admin Integration: 16 Screens Reachability, Role Access & Security', async ({ page }) => {
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

  // 7. 点击进入 59 (通知渠道配置)
  await page.click('text=通知渠道配置');
  await expect(page.locator('text=SMTP 邮件发送服务')).toBeVisible();
  await expect(page.locator('input[placeholder="smtp.example.com"]')).toHaveValue('smtp.mailgun.org');
  await expect(page.locator('text=保存 SMTP 配置')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 8. 点击进入 60 (AI 模型配置)
  await page.click('text=AI 模型与语音配置');
  await expect(page.locator('text=企业统一智能体与大模型')).toBeVisible();
  await expect(page.locator('text=OpenAI').first()).toBeVisible();
  await expect(page.locator('text=连通性测试')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 9. 点击进入 61 (组织与登录集成)
  await page.click('text=组织与登录集成');
  await expect(page.locator('text=全量组织架构同步')).toBeVisible();
  await expect(page.locator('text=企业微信 (WeCom)')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 10. 点击进入 62 (隐私与帮助)
  await page.click('text=隐私与帮助');
  await expect(page.locator('text=数据安全与隐私合规')).toBeVisible();
  // 验证桌面快捷键帮助展开
  await page.click('text=桌面键盘快捷键清单');
  await expect(page.locator('text=全局智能搜索')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 11. 点击进入 63 (通知发送记录)
  await page.click('text=通知发送记录');
  await expect(page.locator('text=全部 (2)')).toBeVisible();
  await expect(page.locator('text=项目周报生成')).toBeVisible();
  await expect(page.locator('text=Push subscription expired')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 12. 点击进入 90 (第三方服务绑定)
  await page.click('text=第三方服务绑定');
  await expect(page.locator('text=微信公众服务号')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 13. 点击进入 91 (推送证书状态)
  await page.click('text=推送证书状态');
  await expect(page.locator('text=Apple Push Notification service')).toBeVisible();
  await expect(page.locator('text=Firebase Cloud Messaging')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 14. 点击进入 92 (模型密钥配置)
  await page.click('text=模型密钥配置');
  await expect(page.locator('text=多厂商模型密钥管理')).toBeVisible();
  // 配置状态来自接口真实返回（此处接口给出已配置），不再写死“已保存”
  await expect(page.getByText('当前配置状态')).toBeVisible();
  await expect(page.getByText('已配置', { exact: true })).toBeVisible();
  await expect(page.getByText('(已保存)')).toHaveCount(0);
  await page.click('button[aria-label="返回"]');

  // 15. 点击进入 93 (语音识别配置 ASR)
  await page.click('text=语音识别配置 (ASR)');
  await expect(page.locator('text=ASR 转写引擎')).toBeVisible();
  await expect(page.getByText('小程序优先使用 16000 Hz 单声道；Web 与 APP 由设备选择录音编码。')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  // 16. 点击进入 94 (单点登录配置 SSO)
  await page.click('text=单点登录配置 (SSO)');
  await expect(page.locator('text=OIDC / OAuth 2.0')).toBeVisible();
  await expect(page.locator('text=SAML 2.0 企业联合')).toBeVisible();
  await page.click('button[aria-label="返回"]');

  console.log('✓ All 16 T11 screens verified successfully in Playwright E2E test!');
});
