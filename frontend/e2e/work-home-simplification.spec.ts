import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Shanghai' });

async function openHome(page: Page, mobile: boolean, personal = false) {
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: mobile ? 844 : 1000 });
  await page.clock.install({ time: new Date('2026-10-21T12:00:00+08:00') });
  await page.addInitScript(() => localStorage.setItem('access_token', 'work-home-fixture'));
  let tasks = [
    { id: 101, title: '今日日程', status: 0, priority: 1, project_id: personal ? null : 1, due_date: '2026-10-21T01:30:00Z', checklist: [{ id: 'check-1', title: '既有清单条目', completed: false }] },
    { id: 102, title: '逾期任务', status: 0, priority: 1, project_id: 1, due_date: '2026-10-20T01:30:00Z' },
    { id: 103, title: '未来任务', status: 1, priority: 1, project_id: 1, due_date: '2026-10-25T01:30:00Z' },
    { id: 104, title: '已完成任务', status: 2, priority: 1, project_id: 1, due_date: '2026-10-21T02:30:00Z' },
  ];
  const updates: any[] = [];
  await page.route('**/api/v1/**', async route => {
    const { pathname: path } = new URL(route.request().url());
    let data: unknown = { items: [] };
    if (path.endsWith('/users/me')) data = { id: 7, username: 'test', nickname: '测试用户', role: 'member', email_verified: true, phone_verified: true };
    else if (path.endsWith('/verification')) data = { is_verified: true, email_verified: true, phone_verified: true };
    else if (path.endsWith('/companies/mine')) data = { items: [{ id: 1, name: '测试组织', my_membership: { role: 'member' } }] };
    else if (path.endsWith('/projects')) data = { items: [{ id: 1, name: '测试项目', company_id: 1 }, { id: 2, name: '另一个项目', company_id: 1 }] };
    else if (path.endsWith('/categories') || path.endsWith('/tags')) data = [];
    else if (path.endsWith('/ui-prefs')) data = { ui: { language: 'zh' } };
    else if (path.endsWith('/tree')) data = { nodes: [] };
    else if (path.endsWith('/tasks/stats/trend')) data = { period: new URL(route.request().url()).searchParams.get('period'), series: [{ date: '2026-10-20', created: 2, completed: 1 }, { date: '2026-10-21', created: 1, completed: 3 }] };
    else if (path.endsWith('/tasks/stats')) data = { total: 3, pending: 1, in_progress: 1, completed: 1, overdue: 1 };
    else if (path.endsWith('/schedule-history')) data = { items: [{ id: 1, old_due_date: '2026-10-20T01:30:00Z', new_due_date: '2026-10-21T01:30:00Z', created_at: '2026-10-21T02:30:00Z' }] };
    else if (path.endsWith('/tasks') && route.request().method() === 'GET') data = { items: tasks, total: tasks.length };
    else if (path.endsWith('/tasks') && route.request().method() === 'POST') {
      const created = { id: 105, priority: 1, status: 0, project_id: null, ...route.request().postDataJSON() };
      tasks.push(created); data = created;
    }
    else if (path.endsWith('/tasks/101') && route.request().method() === 'PUT') {
      const body = route.request().postDataJSON();
      updates.push(body);
      tasks = tasks.map(task => task.id === 101 ? { ...task, ...body } : task);
      data = tasks.find(task => task.id === 101);
    }
    await route.fulfill({ json: { code: 200, data } });
  });
  await page.goto('/');
  await expect(page.getByRole('region', { name: '首页日程日历' })).toBeVisible();
  return { updates };
}

test('APP schedule editor consumes system back at root and keeps underlying calendar route', async ({ page }) => {
  const renderErrors: string[] = [];
  page.on('console', message => { if (message.type() === 'error' && message.text().includes('Cannot update a component')) renderErrors.push(message.text()); });
  await openHome(page, true);
  await page.getByRole('region', { name: '首页日程日历' }).getByRole('button', { name: /09:30.*今日日程/ }).click();
  await expect(page.getByRole('dialog', { name: '编辑任务', exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).__dispatchNativeBack());
  await expect(page.getByRole('dialog', { name: '编辑任务', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__MOBILE_NAV__.activeRoute.screen)).toBe('work-root');
  await page.goto('/?view=calendar');
  await page.getByText('今日日程', { exact: true }).click();
  await expect(page.getByRole('dialog', { name: '编辑任务', exact: true })).toBeVisible();
  await page.evaluate(() => (window as any).__dispatchNativeBack());
  await expect(page.getByRole('dialog', { name: '编辑任务', exact: true })).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__MOBILE_NAV__.activeRoute.screen)).toBe('work-calendar');
  expect(renderErrors).toEqual([]);
});

test('APP removal of an existing checklist item also protects unsaved edits on back', async ({ page }) => {
  await openHome(page, true);
  await page.getByRole('region', { name: '首页日程日历' }).getByRole('button', { name: /09:30.*今日日程/ }).click();
  await page.getByRole('button', { name: '删除清单项', exact: true }).click();
  await page.evaluate(() => (window as any).__dispatchNativeBack());
  await expect(page.getByRole('heading', { name: '放弃未保存的修改？', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '编辑任务', exact: true })).toBeVisible();
  await expect(page.getByText('既有清单条目', { exact: true })).toHaveCount(0);
});

test('APP back protects unsaved schedule edits and keeps the form when continuing', async ({ page }) => {
  await openHome(page, true);
  await page.getByRole('region', { name: '首页日程日历' }).getByRole('button', { name: /09:30.*今日日程/ }).click();
  await page.getByLabel('截止时刻', { exact: true }).fill('11:30');
  await page.evaluate(() => (window as any).__dispatchNativeBack());
  await expect(page.getByRole('heading', { name: '放弃未保存的修改？', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '继续编辑', exact: true }).click();
  await expect(page.getByLabel('截止时刻', { exact: true })).toHaveValue('11:30');
  await page.evaluate(() => (window as any).__dispatchNativeBack());
  await page.getByRole('button', { name: '放弃修改', exact: true }).click();
  await expect(page.getByRole('dialog', { name: '编辑任务', exact: true })).toHaveCount(0);
  await expect(page.getByRole('region', { name: '首页日程日历' }).getByRole('button', { name: /09:30.*今日日程/ })).toBeVisible();
});

test('APP editing a personal schedule inside a project preserves its personal scope', async ({ page }) => {
  await openHome(page, true, true);
  await page.getByRole('button', { name: '项目列表', exact: true }).click();
  await page.getByText('测试项目', { exact: true }).click();
  await page.getByRole('region', { name: '首页日程日历' }).getByRole('button', { name: /09:30.*今日日程/ }).click();
  await page.getByLabel('截止时刻', { exact: true }).fill('10:30');
  await page.getByRole('button', { name: '确认更新任务', exact: true }).click();
  await page.getByRole('button', { name: '项目列表', exact: true }).click();
  await page.getByText('另一个项目', { exact: true }).click();
  await expect(page.getByRole('region', { name: '首页日程日历' }).getByRole('button', { name: /10:30.*今日日程/ })).toBeVisible();
});

test('APP newly created task immediately appears in shared task workspace', async ({ page }) => {
  await openHome(page, true);
  await page.getByRole('button', { name: '新建任务', exact: true }).click();
  await page.getByPlaceholder('例如：准备项目月度交付汇报材料').fill('快速新增同步');
  await page.getByRole('button', { name: '创建任务', exact: true }).click();
  await page.getByRole('dialog', { name: '任务详情', exact: true }).getByRole('button', { name: '关闭', exact: true }).click();
  await page.getByRole('region', { name: '待办汇总' }).getByRole('button', { name: /待办事项/ }).click();
  await page.getByRole('tablist', { name: '任务视图' }).getByRole('tab', { name: '任务列表', exact: true }).click();
  await expect(page.getByText('快速新增同步', { exact: true })).toBeVisible();
});

for (const mobile of [true, false]) {
  const device = mobile ? 'APP shared UI' : 'desktop Web';
  test(`${device}: home summary opens board; list and recycle bin live within task workspace`, async ({ page }) => {
    await openHome(page, mobile);
    const metrics = mobile ? page.getByRole('region', { name: '待办汇总' }) : page.getByTestId('today-focus');
    await metrics.getByRole('button', { name: /待办事项/ }).click();
    const views = page.getByRole('tablist', { name: '任务视图', exact: true });
    await expect(views.getByRole('tab', { name: '任务看板', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('任务范围', { exact: true })).toHaveValue('pending');
    await views.getByRole('tab', { name: '任务列表', exact: true }).click();
    await expect(views.getByRole('tab', { name: '任务列表', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByText('今日日程', { exact: true })).toBeVisible();
    await expect(page.getByText('已完成任务', { exact: true })).toHaveCount(0);
    await page.getByLabel('任务更多操作', { exact: true }).click();
    await page.getByRole('button', { name: '回收站', exact: true }).click();
    await expect(page.getByRole('heading', { name: /回收站/ }).first()).toBeVisible();
    await page.getByRole('button', { name: mobile ? '返回' : '返回任务管理', exact: true }).first().click();
    await expect(views.getByRole('tab', { name: '任务列表', exact: true })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByLabel('任务范围', { exact: true })).toHaveValue('pending');
  });

  test(`${device}: clicking calendar task time edits and saves date/time immediately into home schedule`, async ({ page }) => {
    const { updates } = await openHome(page, mobile);
    const calendar = page.getByRole('region', { name: '首页日程日历' });
    await calendar.getByRole('button', { name: /09:30.*今日日程/ }).click();
    await expect(page.getByLabel('截止日期', { exact: true })).toHaveValue('2026-10-21');
    await page.getByLabel('截止日期', { exact: true }).fill('2026-10-22');
    await page.getByLabel('截止时刻', { exact: true }).fill('14:45');
    await page.getByRole('button', { name: mobile ? '确认更新任务' : '保存日程', exact: true }).click();
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0].due_date).toBe('2026-10-22T06:45:00.000Z');
    if (!mobile) await page.getByRole('button', { name: '关闭任务详情', exact: true }).click();
    await expect(calendar.getByText('今日日程', { exact: true })).toHaveCount(0);
    await calendar.getByRole('button', { name: '2026-10-22', exact: true }).click();
    await expect(calendar.getByRole('button', { name: /14:45.*今日日程/ })).toBeVisible();
  });

  test(`${device}: home hides duplicate tool links and selected empty day pre-fills new schedule`, async ({ page }) => {
    await openHome(page, mobile);
    if (mobile) for (const name of ['我的任务列表', '任务看板', '日程日历', '回收站']) {
      await expect(page.getByRole('button', { name: new RegExp('^' + name) })).toHaveCount(0);
    }
    const calendar = page.getByRole('region', { name: '首页日程日历' });
    await calendar.getByRole('button', { name: '2026-10-23', exact: true }).click();
    await calendar.getByRole('button', { name: '添加当天日程', exact: true }).click();
    await expect(page.locator('input[type=date]').last()).toHaveValue('2026-10-23');
  });

  test(`${device}: due-today and overdue metrics open the corresponding board scope`, async ({ page }) => {
    await openHome(page, mobile);
    const metrics = mobile ? page.getByRole('region', { name: '待办汇总' }) : page.getByTestId('today-focus');
    await metrics.getByRole('button', { name: /今日到期|今天到期/ }).click();
    await expect(page.getByLabel('任务范围', { exact: true })).toHaveValue('today');
    await page.getByRole('tablist', { name: '任务视图', exact: true }).getByRole('tab', { name: '任务列表', exact: true }).click();
    await expect(page.getByText('今日日程', { exact: true })).toBeVisible();
    await expect(page.getByText('逾期任务', { exact: true })).toHaveCount(0);
    await page.getByLabel('任务范围', { exact: true }).selectOption('overdue');
    await expect(page.getByText('逾期任务', { exact: true })).toBeVisible();
    await expect(page.getByText('今日日程', { exact: true })).toHaveCount(0);
  });

  test(`${device}: removing date and time clears the server schedule instead of only hiding it locally`, async ({ page }) => {
    const { updates } = await openHome(page, mobile);
    await page.getByRole('region', { name: '首页日程日历' }).getByRole('button', { name: /09:30.*今日日程/ }).click();
    await page.getByLabel('截止日期', { exact: true }).fill('');
    await page.getByLabel('截止时刻', { exact: true }).fill('');
    await page.getByRole('button', { name: mobile ? '确认更新任务' : '保存日程', exact: true }).click();
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0].due_date).toBeNull();
  });

  test(`${device}: failed schedule save retains date and time and permits retry`, async ({ page }) => {
    const { updates } = await openHome(page, mobile);
    await page.getByRole('region', { name: '首页日程日历' }).getByRole('button', { name: /09:30.*今日日程/ }).click();
    await page.getByLabel('截止日期', { exact: true }).fill('2026-10-22');
    await page.getByLabel('截止时刻', { exact: true }).fill('16:30');
    await page.route('**/api/v1/tasks/101', route => route.fulfill({ status: 503, json: { code: 503, message: '测试网络错误' } }), { times: 1 });
    const save = page.getByRole('button', { name: mobile ? '确认更新任务' : '保存日程', exact: true });
    await save.click();
    await expect(page.getByText(/测试网络错误|日程保存失败/).first()).toBeVisible();
    await expect(page.getByLabel('截止日期', { exact: true })).toHaveValue('2026-10-22');
    await expect(page.getByLabel('截止时刻', { exact: true })).toHaveValue('16:30');
    await save.click();
    await expect.poll(() => updates.length).toBe(1);
    expect(updates[0].due_date).toBe('2026-10-22T08:30:00.000Z');
  });
}

for (const mobile of [false, true]) {
  const device = mobile ? 'APP' : 'Web';
  test(`${device}: focused follow-ups appear first and open the task`, async ({ page }) => {
    await openHome(page, mobile);
    const focus = page.getByRole('region', { name: '重点待办与跟进', exact: true });
    const ai = page.getByRole('region', { name: 'AI 汇报与助手', exact: true });
    await expect(focus).toBeVisible();
    expect(await focus.evaluate((element, other) => !!(element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await ai.elementHandle())).toBe(true);
    await focus.getByText('今日日程', { exact: true }).click();
    if (mobile) await expect(page.getByRole('dialog', { name: '任务详情', exact: true })).toBeVisible();
    else await expect(page.getByRole('button', { name: '关闭任务详情', exact: true })).toBeVisible();
  });
  test(`${device}: AI and scoped trend lead the calendar without duplicate record entries`, async ({ page }) => {
    const requests: string[] = [];
    page.on('request', request => requests.push(request.url()));
    await openHome(page, mobile);
    const ai = page.getByRole('region', { name: 'AI 汇报与助手', exact: true });
    const metrics = mobile ? page.getByRole('region', { name: '待办汇总' }) : page.getByTestId('today-focus');
    const trend = page.getByRole('region', { name: '任务趋势', exact: true });
    await expect(ai.getByRole('button', { name: '记录进展', exact: true })).toBeVisible();
    await expect(ai.getByRole('button', { name: '查看汇报', exact: true })).toBeVisible();
    expect(await ai.evaluate((element, other) => !!(element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await metrics.elementHandle())).toBe(true);
    expect(await metrics.evaluate((element, other) => !!(element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await trend.elementHandle())).toBe(true);
    await expect(page.getByText('快速记录一个待办事项…', { exact: true })).toHaveCount(0);
    if (mobile) await expect(page.getByRole('button', { name: '快速添加', exact: true })).toHaveCount(0);
    await trend.getByRole('button', { name: '本月', exact: true }).click();
    await expect.poll(() => requests.filter(url => url.includes('/tasks/stats/trend?') && url.includes('period=month')).length).toBeGreaterThan(0);
  });

  test(`${device}: date single click selects and double click creates once including past adjacent month`, async ({ page }) => {
    await openHome(page, mobile);
    const calendar = page.getByRole('region', { name: '首页日程日历' });
    await calendar.getByRole('button', { name: '2026-10-20', exact: true }).click();
    await expect(page.locator('[role=dialog]')).toHaveCount(0);
    await calendar.getByRole('button', { name: '2026-09-30', exact: true }).dblclick();
    await expect(page.locator('input[type=date]').last()).toHaveValue('2026-09-30');
    await expect(page.getByRole('dialog')).toHaveCount(1);
  });
}

test('all-project legacy QuickAdd creates a personal task instead of choosing the first project', async ({ page }) => {
  await openHome(page, false);
  await page.keyboard.press('Alt+n');
  const dialog = page.getByRole('dialog', { name: '快速添加', exact: true });
  await dialog.locator('textarea').fill('全部范围的个人任务');
  const saved = page.waitForRequest(r => r.url().endsWith('/api/v1/tasks') && r.method() === 'POST');
  await dialog.locator('button[type=submit]').click();
  const payload = (await saved).postDataJSON();
  expect(payload.project_id).toBeNull();
  expect(payload.origin).toBe('personal');
});

test('APP trend follows selected project, keeps quarter and clears previous scope on error', async ({ page }) => {
  const requests: string[] = [];
  page.on('request', request => { if (request.url().includes('/tasks/stats')) requests.push(request.url()); });
  await openHome(page, true);
  await page.getByRole('button', { name: '项目列表', exact: true }).click();
  await page.getByText('测试项目', { exact: true }).click();
  const trend = page.getByRole('region', { name: '任务趋势', exact: true });
  await expect.poll(() => requests.some(url => url.includes('project_id=1') && url.includes('timezone_offset=480'))).toBe(true);
  await trend.getByRole('button', { name: '展开统计详情' }).click();
  await trend.getByRole('button', { name: '本季度', exact: true }).click();
  await expect.poll(() => requests.filter(url => url.includes('period=quarter') && url.includes('project_id=1')).length).toBe(2);
  await expect(trend.getByRole('img')).toHaveAccessibleName(/新增3，完成4/);
  await page.route('**/api/v1/tasks/stats**', route => route.fulfill({ status: 503, json: { message: '暂不可用' } }));
  await trend.getByRole('button', { name: '本月', exact: true }).click();
  await expect(trend.getByRole('alert')).toContainText('趋势加载失败');
  await expect(trend.getByRole('img')).toHaveCount(0);
});

for (const mobile of [false, true]) test(`${mobile ? 'APP' : 'Web'}: schedule history displays original date separately from editor`, async ({ page }) => {
  await openHome(page, mobile);
  await page.getByRole('region', { name: '首页日程日历' }).getByRole('button', { name: /09:30.*今日日程/ }).click();
  await page.getByRole('button', { name: '查看日程修改记录', exact: true }).click();
  await expect(page.getByText('首次记录时间：', { exact: false })).toBeVisible();
  await expect(page.getByText('日程调整不会改写已提交的汇报。', { exact: true })).toBeVisible();
  await expect(page.getByLabel('截止日期', { exact: true })).toHaveValue('2026-10-21');
});
