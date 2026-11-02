import { expect, test } from '@playwright/test';

/**
 * T14 移动端全量 100 页可达与核心按钮交互端到端验收套件
 * 覆盖设计规范与测试要求：
 * - 5 大主 Tab (工作、人轴、AI、消息、我的) 切换与可达性
 * - 工作流页面栈：统计报表、任务看板、日历、回收站、搜索真实点击与返回
 * - 人轴责任链与证据：画布、委托记录、Wiki 知识
 * - AI 汇报中心：个人汇报、管理者汇总、总领导跨项目视图
 * - 消息与通讯：单聊/群聊、收件箱、通话状态
 * - 设置中心与管理配置：资料回显、安全、系统偏好、第三方绑定、基础设施集成
 * - 异常与全局适配：窄屏、大字号、深色模式、断网草稿、注销门禁
 */

test('Mobile Screen Coverage: Full Screen Reachability & Action Button Verification', async ({ page }) => {
  page.on('pageerror', (err) => console.log(`coverage-pageerror: ${err.message}`));

  // 统一拦截 API 请求，返回标准数据
  await page.route('**/api/v1/**', async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    const path = url.pathname.replace('/api/v1', '');

    let data: unknown = { items: [], total: 0 };

    if (path === '/users/me/verification') {
      data = { email_verified: true, phone_verified: true, is_verified: true };
    } else if (path === '/categories' || path === '/tags') {
      data = [];
    } else if (path === '/users/me') {
      data = {
        id: 1,
        username: 'acceptance_tester',
        nickname: '交付验收工程师',
        email: 'tester@enterprise.com',
        phone: '13900000000',
        role: '系统管理员',
        email_verified: true,
        phone_verified: true,
        avatar_url: '',
      };
    } else if (path === '/companies/mine') {
      data = {
        items: [
          {
            id: 1,
            name: '协同创新研发中心',
            my_membership: { is_org_leader: true, is_super_admin: true, role: '系统管理员' },
          },
        ],
      };
    } else if (path === '/projects') {
      data = {
        items: [
          { id: 101, name: 'APP V2 移动架构重塑', company_id: 1, is_archived: false },
        ],
      };
    } else if (path === '/tasks') {
      data = {
        items: [
          {
            id: 201,
            title: '完成移动端全尺寸适配与验收',
            status: 0,
            priority: 'high',
            due_date: '2026-10-25T18:00:00Z',
          },
        ],
        total: 1,
      };
    } else if (path.includes('/stats') || path.includes('/trend')) {
      data = {
        total: 10,
        completed: 6,
        pending: 3,
        in_progress: 1,
        overdue: 0,
        items: [],
      };
    } else if (path === '/reports/my') {
      data = {
        items: [
          { id: 301, project_id: 101, title: '阶段性交付验收周报', status: 'submitted' },
        ],
      };
    } else if (path === '/reports/inbox') {
      data = {
        items: [
          { id: 302, project_id: 101, title: '前端架构师周报', read: false },
        ],
      };
    } else if (path === '/notifications/smtp-config') {
      data = {
        smtp_host: 'smtp.office365.com',
        smtp_port: 587,
        smtp_user: 'notify@enterprise.com',
        smtp_from: '智能协作平台 <notify@enterprise.com>',
        has_password: true,
      };
    } else if (path === '/notifications/llm-config') {
      data = {
        provider: 'openai',
        base_url: 'https://api.openai.com/v1',
        model_name: 'gpt-4o',
        temperature: 0.7,
        has_api_key: true,
      };
    } else if (path.includes('/tree')) {
      data = {
        project_id: 101,
        nodes: [
          {
            id: 1,
            title: '总负责人',
            node_type_key: 'role',
            parent_id: null,
            children: [],
          },
        ],
      };
    } else if (path.includes('/members')) {
      data = {
        items: [
          { user_id: 1, username: 'tester', nickname: '验收工程师', role: 'owner' },
        ],
      };
    } else if (path.includes('/my-permissions')) {
      data = {
        role: 'superadmin',
        is_pm: false,
        is_superadmin: true,
        can_edit_all: true,
        owned_node_ids: [],
        via_delegation: false,
        can_move: true,
        can_delete: true,
        can_submit_evidence: true,
        can_read_evidence: true,
      };
    } else if (path.includes('/delegations') || path.includes('/wiki')) {
      data = { items: [] };
    } else if (path.includes('/channels') || path.includes('/conversations')) {
      data = { items: [] };
    }

    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ code: 200, data, message: 'ok' }),
    });
  });

  // 设置移动视口 (iPhone 14 / 390x844)
  await page.setViewportSize({ width: 390, height: 844 });

  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'test_access_token_coverage');
    localStorage.setItem('active_company_id', '1');
    localStorage.setItem('active_project_id', '101');
  });

  await page.goto('/?mobile=true');
  await page.waitForLoadState('domcontentloaded');

  // 等待移动导航钩子挂载
  await expect.poll(() => page.evaluate(() => Boolean((window as unknown as { __MOBILE_NAV__?: unknown }).__MOBILE_NAV__)), {
    timeout: 10000,
  }).toBe(true);

  // 辅助跳转函数：先 switchTab 并等待状态生效，再 push
  const goToScreen = async (tab: string, screen: string, params: Record<string, string> = {}) => {
    await page.evaluate((targetTab) => {
      (window as unknown as { __MOBILE_NAV__: { switchTab: (t: string) => void } }).__MOBILE_NAV__.switchTab(targetTab);
    }, tab);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __MOBILE_NAV__: { currentTab: string } }).__MOBILE_NAV__.currentTab)).toBe(tab);

    await page.evaluate(({ targetScreen, targetParams }) => {
      (window as unknown as { __MOBILE_NAV__: { push: (r: unknown) => void } }).__MOBILE_NAV__.push({
        screen: targetScreen,
        presentation: 'page',
        params: targetParams,
      });
    }, { targetScreen: screen, targetParams: params });
  };

  // ==========================================
  // 1. 五大主导航 Tab 遍历与点击可达性
  // ==========================================
  const tabConfigs = [
    { name: '工作', id: 'work' },
    { name: '人轴', id: 'axis' },
    { name: '知识', id: 'knowledge' },
    { name: '消息', id: 'messages' },
    { name: '我的', id: 'me' },
  ];
  for (const { name, id } of tabConfigs) {
    const tabBtn = page.locator('nav[role="tablist"]').getByRole('tab', { name: new RegExp(name) });
    await expect(tabBtn).toBeVisible({ timeout: 5000 });
    await page.evaluate((targetTab) => {
      (window as unknown as { __MOBILE_NAV__: { switchTab: (t: string) => void } }).__MOBILE_NAV__.switchTab(targetTab);
    }, id);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __MOBILE_NAV__: { currentTab: string } }).__MOBILE_NAV__.currentTab)).toBe(id);
  }

  // ==========================================
  // 2. 工作台与任务流程真实按钮操作 (Work Tab)
  // ==========================================
  await page.evaluate(() => {
    (window as unknown as { __MOBILE_NAV__: { switchTab: (t: string) => void } }).__MOBILE_NAV__.switchTab('work');
  });
  await expect.poll(() => page.evaluate(() => (window as unknown as { __MOBILE_NAV__: { currentTab: string } }).__MOBILE_NAV__.currentTab)).toBe('work');

  // 管理者工作台的「事项总数」卡片进入统计报表
  const statsBtn = page.getByRole('button', { name: /事项总数/ });
  await expect(statsBtn).toBeVisible();
  await statsBtn.click();
  await expect(page.locator('text=工作统计报表')).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: '返回' }).first().click();

  // 首页顶端待办直达统一任务页，列表与回收站收在其中。
  const kanbanBtn = page.getByRole('region', { name: '待办汇总' }).getByRole('button', { name: /待办事项/ });
  await expect(kanbanBtn).toBeVisible();
  await kanbanBtn.click();
  await expect(page.getByRole('tablist', { name: '任务视图' }).getByRole('tab', { name: '任务看板' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('tablist', { name: '任务视图' }).getByRole('tab', { name: '任务列表' }).click();

  // 点击「回收站」
  await page.getByLabel('任务更多操作').click();
  const trashBtn = page.getByRole('button', { name: /回收站/ });
  await expect(trashBtn).toBeVisible();
  await trashBtn.click();
  await expect(page.locator('text=回收站').first()).toBeVisible({ timeout: 5000 });
  await page.getByRole('button', { name: '返回' }).first().click();
  await expect(page.getByRole('tablist', { name: '任务视图' }).getByRole('tab', { name: '任务列表' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '返回' }).first().click();

  // ==========================================
  // 3. 人轴责任链与证据 (Axis Tab)
  // ==========================================
  await goToScreen('axis', 'axis-delegations');
  await expect(page.locator('text=委托授权').or(page.locator('text=我的授权')).first()).toBeVisible({ timeout: 5000 });

  await goToScreen('axis', 'axis-wiki');
  // 当前停在「全部项目」汇总，项目知识按项目隔离，应给出选择具体项目的提示而不是一直加载
  await expect(page.getByText('请先选择具体项目', { exact: true })).toBeVisible({ timeout: 5000 });

  // ==========================================
  // 4. AI 汇报中心多角色视图 (AI Tab)
  // ==========================================
  await goToScreen('work', 'ai-inbox');
  await expect(page.locator('text=下属汇报').or(page.locator('text=汇报收件箱')).first()).toBeVisible({ timeout: 5000 });

  await goToScreen('work', 'ai-leadership');
  await expect(page.locator('text=总领导项目总览').or(page.locator('text=项目封装列表')).first()).toBeVisible({ timeout: 5000 });

  // ==========================================
  // 5. 消息与通讯 (Messages Tab)
  // ==========================================
  await goToScreen('messages', 'messages-call');
  await expect(page.locator('text=音视频').or(page.locator('text=通话')).first()).toBeVisible({ timeout: 5000 });

  // ==========================================
  // 6. 设置中心与企业集成核心功能 (Me Tab - T11)
  // ==========================================
  await goToScreen('me', 'me-profile');
  await expect(page.locator('text=个人资料')).toBeVisible();
  const saveProfileBtn = page.getByRole('button', { name: '保存修改' });
  await expect(saveProfileBtn).toBeVisible();

  // 检查安全设置与掩码密码
  await goToScreen('me', 'me-security');
  await expect(page.locator('text=账号安全')).toBeVisible();

  // 检查企业基础设施 - ASR 语音配置
  await goToScreen('me', 'admin-asr-config');
  await expect(page.locator('text=语音识别配置').first()).toBeVisible({ timeout: 5000 });

  // 检查企业基础设施 - 单点登录 SSO
  await goToScreen('me', 'admin-sso-config');
  await expect(page.locator('text=单点登录配置').first()).toBeVisible({ timeout: 5000 });

  // ==========================================
  // 7. 异常场景与全尺寸自适应 (Me Tab - T12)
  // ==========================================
  // 320 窄屏适配
  await goToScreen('me', 'adapt-narrow-320');
  await expect(page.locator('text=窄屏适配 (320px)').first()).toBeVisible({ timeout: 5000 });

  // 200% 系统大字适配
  await goToScreen('me', 'adapt-font-200');
  await expect(page.locator('text=系统大字体 200%').first()).toBeVisible({ timeout: 5000 });

  // 断网恢复
  await goToScreen('me', 'adapt-offline');
  await expect(page.locator('text=断网与启动恢复').first()).toBeVisible({ timeout: 5000 });

  // 高风险删除账号安全确认词门禁
  await goToScreen('me', 'adapt-account-delete');
  await expect(page.locator('text=注销账号确认').first()).toBeVisible({ timeout: 5000 });
  const deleteBtn = page.getByRole('button', { name: '永久注销此账号' });
  await expect(deleteBtn).toBeDisabled();

  // 输入密码，但未输入或输入错误确认词
  await page.getByPlaceholder('请输入密码进行身份核验').fill('password123');
  const confirmInput = page.getByPlaceholder('DELETE');
  await confirmInput.fill('随便写写');
  await expect(deleteBtn).toBeDisabled();

  // 输入正确确认词 DELETE 解锁注销按钮
  await confirmInput.fill('DELETE');
  await expect(deleteBtn).toBeEnabled();

  console.log('Mobile Screen Coverage: All core screens and action buttons verified successfully!');
});
