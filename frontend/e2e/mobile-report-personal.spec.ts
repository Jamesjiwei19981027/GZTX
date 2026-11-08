import { expect, test } from '@playwright/test';

/**
 * T08 个人项目 AI 汇报链路 E2E 验证
 * 覆盖设计 ID 35、36、37、38、39
 */
test('Mobile personal report flow: AI chat, draft editor, submit & delivery status', async ({ page }) => {
  const calls: string[] = [];
  let submitted = false;

  page.on('pageerror', (err) => console.log(`personal-report pageerror: ${err.message}`));

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    const path = url.pathname.replace('/api/v1', '');
    calls.push(`${request.method()} ${path}`);

    let data: unknown = {};

    if (path === '/projects/1/report-agents/bindings' && request.method() === 'GET') {
      data = {
        items: [
          { id: 101, user_id: 7, role: 'member', project_id: 1, is_active: true },
          { id: 102, user_id: 9, role: 'project', project_id: 1, is_active: true },
        ],
      };
    } else if (path === '/projects/1/agent-reports' && request.method() === 'GET') {
      data = {
        items: submitted
          ? [
              {
                id: 202,
                binding_id: 101,
                author_user_id: 7,
                parent_user_id: 9,
                status: 'submitted',
                summary_text: '已提交的产品进展汇报',
                submitted_at: '2026-10-19T10:00:00Z',
                read: false,
                sources: [{ id: 1, source_type: 'task', excerpt: '移动端交互验收' }],
              },
            ]
          : [],
      };
    } else if (path === '/reports/my') {
      data = {
        items: submitted
          ? [
              {
                id: 202,
                project_id: 1,
                author_user_id: 7,
                parent_user_id: 9,
                status: 'submitted',
                summary_text: '已提交的产品进展汇报',
                submitted_at: '2026-10-19T10:00:00Z',
                read: false,
                sources: [{ id: 1, source_type: 'task', excerpt: '移动端交互验收' }],
              },
            ]
          : [],
      };
    } else if (path === '/reports/inbox') {
      data = { items: [] };
    } else if (path === '/agents/chat') {
      data = {
        session_id: 501,
        reply: '已记录您的项目进展：完成员工端原型与交互说明。',
        channel: 'web',
        tool_submit_evidence_allowed: true,
      };
    } else if (path === '/reports/generate') {
      data = {
        id: 202,
        project_id: 1,
        status: 'draft',
        summary_text: '已完成员工工作台与交互原型\n\n进行中：管理者端评审待王宁确认',
        parent_user_id: 9,
        payload_json: {
          source_count: 2,
          task_snapshot: [{ id: 11, title: '移动端交互原型', status: 'In Progress' }],
          evidence_snapshot: [{ id: 22, summary: '评审材料.pdf', status: 'verified' }],
        },
        sources: [
          { id: 1, source_type: 'task', source_id: 11, excerpt: '移动端交互原型' },
          { id: 2, source_type: 'evidence', source_id: 22, excerpt: '评审材料.pdf' },
        ],
      };
    } else if (path === '/reports/202/submit' || path === '/reports/202') {
      submitted = true;
      data = {
        id: 202,
        project_id: 1,
        status: 'submitted',
        summary_text: '编辑并提交的产品进展汇报',
        submitted_at: '2026-10-19T10:15:00Z',
        parent_user_id: 9,
        read: false,
        read_at: null,
        sources: [{ id: 1, source_type: 'task', excerpt: '移动端交互原型' }],
      };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, message: 'ok', data }),
    });
  });

  // 渲染移动容器测试入口
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

        const mockUser = { id: '7', name: '林悦', role: 'Member', avatar: 'L', email: 'lin@work.com' };
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

  // 1. 验证汇报入口加载
  await expect(page.getByText('我的项目 AI')).toBeVisible();
  await expect(page.getByText('林悦的汇报助手')).toBeVisible();
  await expect(page.getByText('我的汇报')).toBeVisible();

  // 2. 点击 "告诉 AI 最新进展" 进入 ID 36：与我的 AI 对话
  await page.getByRole('button', { name: '告诉 AI 最新进展' }).click();
  await expect(page.getByText('与我的 AI 对话')).toBeVisible();

  // 发送对话消息
  const chatInput = page.getByPlaceholder('输入项目进展与工作事实…');
  await chatInput.fill('今天完成了员工端原型验收');
  await page.locator('button:has(svg)').last().click();

  // 收到 AI 确认消息
  await expect(page.getByText('已记录您的项目进展：完成员工端原型与交互说明。')).toBeVisible();

  // 3. 点击 "加入汇报草稿" 进入写汇报
  await page.getByRole('button', { name: '加入汇报草稿' }).click();
  await expect(page.getByRole('heading', { name: '写汇报' })).toBeVisible();
  await expect(page.getByText('草稿 · 仅自己可见')).toBeVisible();

  // 没有服务器草稿时，接收人由后端按人轴确定
  await expect(page.getByText('提交时由系统按人轴确定直属接收人')).toBeVisible();

  // 点击 "重新生成" 提取事实草稿
  await page.getByRole('button', { name: '重新生成' }).click();
  await expect(page.getByText('已成功基于当前项目任务与资料生成最新事实汇报草稿')).toBeVisible();
  // 重新生成返回 parent_user_id 后才显示直属领导王宁
  await expect(page.getByText('王宁', { exact: true })).toBeVisible();
  await expect(page.getByText('移动端交互原型')).toBeVisible();

  // 4. 点击 "确认提交" 进入 ID 38：送达与流转状态
  await page.getByRole('button', { name: '确认提交' }).click();
  await expect(page.getByRole('heading', { name: '汇报已提交' })).toBeVisible();

  // 验证时间线各节点状态（包括 G01 防御：状态暂不可确认）
  await expect(page.getByText('提交成功')).toBeVisible();
  await expect(page.getByText('已送达直属领导')).toBeVisible();
  await expect(page.getByText('送达领导智能体')).toBeVisible();
  await expect(page.getByText('状态暂不可确认')).toBeVisible();

  // 5. 点击 "查看汇报详情与来源" 进入 ID 39：汇报历史与详情
  await page.getByRole('button', { name: '查看汇报详情与来源' }).click();
  await expect(page.getByText('汇报详情与版本')).toBeVisible();
  await expect(page.getByText('已聚合到项目汇报').or(page.getByText('已正式提交'))).toBeVisible();

  expect(calls).toEqual(
    expect.arrayContaining([
      'POST /agents/chat',
      'POST /reports/generate',
      'POST /reports/202/submit',
      'GET /reports/my',
    ]),
  );
});
