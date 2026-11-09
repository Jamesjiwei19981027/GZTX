import { expect, test } from '@playwright/test';

/**
 * T09 管理者收件箱、项目对照汇总与总领导项目总览 E2E 验证
 * 覆盖设计 ID 40、41、42、43、95、99、100
 */
test('Mobile manager report flow: Inbox, contrast, rollup, leadership overview & review', async ({ page }) => {
  const calls: string[] = [];
  let reportRead = false;
  let summaryGenerated = false;
  let summaryPublished = false;
  const summary = {
    id: 301, project_id: 1, status: 'submitted',
    summary_text: '项目周报：各端核心功能与汇报流转联调完毕',
    report_count: 1, source_count: 0,
  };
  const publishedSummary = { ...summary, status: 'published', published_at: '2026-10-19T10:30:00Z', published_by: 9 };
  const browserErrors: string[] = [];

  page.on('pageerror', err => browserErrors.push(err.message));
  await page.setViewportSize({ width: 390, height: 844 });

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    calls.push(`${request.method()} ${path}`);

    let data: unknown = {};

    if (path === '/projects/1/tree' && request.method() === 'GET') {
      data = {
        nodes: [
          {
            id: 1,
            title: '负责人',
            node_type_key: 'person',
            user_ids: [9],
            assignees: [{ user_id: 9, role_key: 'primary', display_name: '王宁' }],
            children: [
              {
                id: 2,
                title: '产品设计',
                node_type_key: 'person',
                parent_id: 1,
                user_ids: [7],
                assignees: [{ user_id: 7, role_key: 'primary', display_name: '林悦' }],
                children: [],
              },
            ],
          },
        ],
      };
    } else if (path === '/projects/1/report-agents/bindings' && request.method() === 'GET') {
      data = {
        items: [
          { id: 101, user_id: 9, role: 'project', project_id: 1, is_active: true },
          { id: 102, user_id: 7, role: 'member', project_id: 1, is_active: true },
        ],
      };
    } else if (path === '/projects/1/report-agents/bindings' && request.method() === 'POST') {
      data = {
        items: [
          { id: 101, user_id: 9, role: 'project', project_id: 1, is_active: true },
          { id: 102, user_id: 7, role: 'member', project_id: 1, is_active: true },
        ],
      };
    } else if (path === '/projects/1/agent-reports' && request.method() === 'GET') {
      data = {
        items: [
          {
            id: 201,
            binding_id: 102,
            author_user_id: 7,
            parent_user_id: 9,
            status: 'submitted',
            summary_text: '完成工作台与任务详情原型',
            submitted_at: '2026-10-19T09:00:00Z',
            read: reportRead,
            sources: [],
          },
        ],
      };
    } else if (path === '/reports/inbox') {
      data = {
        items: [
          {
            id: 201,
            project_id: 1,
            author_user_id: 7,
            parent_user_id: 9,
            status: 'submitted',
            summary_text: '完成工作台与任务详情原型',
            submitted_at: '2026-10-19T09:00:00Z',
            read: reportRead,
            read_at: reportRead ? '2026-10-19T09:30:00Z' : null,
          },
        ],
      };
    } else if (path === '/reports/inbox/201/read') {
      reportRead = true;
      data = { id: 201, read: true };
    } else if (path === '/projects/1/agent-reports/aggregate') {
      summaryGenerated = true;
      data = {
        id: 301,
        project_id: 1,
        status: 'submitted',
        summary_text: '项目周报：各端核心功能与汇报流转联调完毕',
        payload_json: {
          conflicts: [
            {
              type: 'task_status_mismatch',
              task_id: 11,
              report_ids: [201],
              statuses: ['In Progress', 'Done'],
              severity: 'warning',
            },
          ],
        },
      };
    } else if (path === '/projects/1/report-summaries' && request.method() === 'GET') {
      data = {
        items: summaryGenerated ? [summaryPublished ? publishedSummary : summary] : [],
        latest_published: summaryPublished ? publishedSummary : null,
        can_publish: true,
      };
    } else if (path === '/projects/1/report-summaries/301/publish' && request.method() === 'POST') {
      summaryPublished = true;
      data = publishedSummary;
    } else if (path === '/companies/1/leadership-reports/latest') {
      data = {
        id: 401,
        company_id: 1,
        leader_user_id: 9,
        status: 'submitted',
        summary_text: '跨项目总览：责任树与人轴权限调试正常',
        created_at: '2026-10-19T10:00:00Z',
      };
    } else if (path === '/companies/1/leadership-reports/aggregate') {
      data = {
        id: 402,
        company_id: 1,
        leader_user_id: 9,
        status: 'submitted',
        summary_text: '总领导汇总：最新组织跨项目周报聚合完成',
        created_at: '2026-10-19T10:30:00Z',
      };
    } else if (path === '/reports/201') {
      data = {
        id: 201,
        project_id: 1,
        author_user_id: 7,
        parent_user_id: 9,
        status: 'submitted',
        summary_text: '完成工作台与任务详情原型',
        submitted_at: '2026-10-19T09:00:00Z',
        read: true,
        sources: [],
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data }),
    });
  });

  // 渲染移动容器测试入口 (以项目管理者身份登入)
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

        const mockManager = { id: '9', name: '王宁', role: 'PM', avatar: 'W', email: 'wang@work.com' };
        const mockProject = { id: '1', name: '责任树联合调试', description: 'desc', color: '#0058be', active: true };
        const mockMembers = [
          { id: '7', name: '林悦', role: '产品设计', avatar: 'L' },
          { id: '9', name: '王宁', role: '项目管理者', avatar: 'W' },
        ];
        const mockSettings = { themeMode: 'light', accentColor: 'blue', language: 'zh', notifications: {}, taskDefaults: { priority: 'Medium', category: 'Work' } };

        function App() {
          return React.createElement(
            MobileNavigationProvider,
            { initialTab: 'ai' },
            React.createElement(MobileRouteOutlet, {
              user: mockManager,
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

  // 1. 管理者可见下属汇报区
  await expect(page.getByText('下属汇报')).toBeVisible();
  await expect(page.getByText('林悦')).toBeVisible();

  // 2. 点击下属汇报项，自动触发 markReportRead 并进入详情
  await page.getByText('林悦').click();
  await expect(page.getByText('汇报详情与版本')).toBeVisible();
  expect(calls).toContain('PUT /reports/inbox/201/read');

  // 返回汇报主页
  await page.getByRole('button', { name: '返回' }).click();

  // 3. 点击 "项目汇总与发布" 进入项目汇总
  await page.getByRole('button', { name: '项目汇总与发布' }).click();
  await expect(page.getByText('待管理者确认')).toBeVisible();
  await expect(page.getByText('项目周报')).toBeVisible();
  const publish = page.getByRole('button', { name: '确认发布项目摘要', exact: true });
  await expect(publish).toBeDisabled();

  // 点击 "生成 / 更新项目汇总"
  await page.getByRole('button', { name: '生成 / 更新项目汇总' }).click();
  await expect(page.getByText('项目周报：各端核心功能与汇报流转联调完毕')).toBeVisible();

  // 生成后按服务端待发布版本确认发布，再离开并回读已发布版本。
  await expect(publish).toBeEnabled();
  await publish.click();
  await expect(page.getByText('已发布，项目成员和上级可以在汇报页看到这一版', { exact: true })).toBeVisible();
  await expect(page.getByTestId('mobile-published-summary')).toContainText('已发布版本 #301');
  await expect(publish).toBeDisabled();
  await page.getByRole('button', { name: '返回', exact: true }).click();
  await page.getByRole('button', { name: '项目汇总与发布', exact: true }).click();
  await expect(page.getByTestId('mobile-published-summary')).toContainText(summary.summary_text);
  await expect(publish).toBeDisabled();
  expect(calls.filter(call => call === 'POST /projects/1/report-summaries/301/publish')).toHaveLength(1);
  expect(calls.filter(call => call === 'GET /projects/1/report-summaries')).toHaveLength(3);
  expect(calls).toContain('POST /projects/1/agent-reports/aggregate');
  expect(browserErrors).toEqual([]);
});
