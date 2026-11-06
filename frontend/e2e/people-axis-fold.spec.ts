import { test, expect, type Page } from '@playwright/test'

test.use({ timezoneId: 'Asia/Shanghai' })

const makeTree = () => [
  {
    id: 1,
    parent_id: null,
    node_type_key: 'person',
    title: '产品负责人',
    sort_order: 1,
    assignees: [{ user_id: 1, role_key: 'primary', display_name: '赵晨' }],
    children: [
      {
        id: 11,
        parent_id: 1,
        node_type_key: 'work_item',
        title: '产品规划',
        due_at: '2026-11-30T08:00:00Z',
        progress_json: { percent: 100, status: 'done' },
        children: [],
      },
      {
        id: 2,
        parent_id: 1,
        node_type_key: 'person',
        title: '设计负责人',
        sort_order: 2,
        node_origin: 'subordinate',
        assignees: [{ user_id: 2, role_key: 'primary', display_name: '林悦' }],
        children: [
          {
            id: 21,
            parent_id: 2,
            node_type_key: 'work_item',
            title: '交互原型设计',
            due_at: '2026-11-30T08:00:00Z',
            progress_json: { percent: 50, status: 'in_progress' },
            children: [],
          },
          {
            id: 22,
            parent_id: 2,
            node_type_key: 'work_item',
            title: '设计规范已逾期',
            due_at: '2020-01-01T08:00:00Z',
            progress_json: { percent: 0, status: 'pending' },
            children: [],
          },
          {
            id: 3,
            parent_id: 2,
            node_type_key: 'person',
            title: '前端工程师',
            sort_order: 3,
            node_origin: 'subordinate',
            assignees: [{ user_id: 3, role_key: 'primary', display_name: '陈宇' }],
            children: [],
          },
        ],
      },
    ],
  },
]

async function setupDesktopMock(page: Page, initialPulled: string[] = []) {
  const currentTree = makeTree()
  page.on('pageerror', error => { throw error })

  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data: unknown = { items: [] }
    if (path === '/users/me') {
      data = { id: 9, nickname: '王宁' }
    } else if (path.endsWith('/my-permissions')) {
      data = {
        role: 'pm',
        is_pm: true,
        is_superadmin: false,
        can_edit_all: true,
        owned_node_ids: [1, 2, 3],
        via_delegation: false,
        can_move: true,
        can_delete: true,
        can_submit_evidence: true,
        can_read_evidence: true,
      }
    } else if (path === '/users/me/people-axis') {
      data = {
        projects: [
          {
            project_id: 1,
            project_name: '产品体验升级',
            my_role: 'pm',
            my_owned_node_ids: [1, 2, 3],
            nodes: currentTree,
          },
        ],
      }
    } else if (path.endsWith('/tree')) {
      data = { project_id: 1, nodes: currentTree }
    } else if (path.endsWith('/members')) {
      data = {
        items: [
          { user_id: 9, display_name: '王宁', role: 'pm' },
          { user_id: 1, display_name: '赵晨', role: 'member' },
          { user_id: 2, display_name: '林悦', role: 'member' },
          { user_id: 3, display_name: '陈宇', role: 'member' },
        ],
      }
    } else if (/^\/projects\/\d+$/.test(path)) {
      data = {
        id: 1,
        company_id: 1,
        name: '产品体验升级',
        pm_user_id: 9,
        final_owner_user_id: 1,
        final_owner: { user_id: 1, nickname: '赵晨' },
      }
    }
    await route.fulfill({ json: { code: 200, data } })
  })

  await page.route(url => url.pathname === '/', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html lang="zh" style="width:100%;height:100%"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;width:100%;height:100%"><div id="root" style="width:100%;height:100%"></div>
    <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css';
      import '/node_modules/@fontsource-variable/inter/index.css';
      import '/node_modules/@fontsource-variable/noto-sans-sc/index.css';
      import { PeopleAxisView } from '/src/components/views/PeopleAxisView.tsx';
      localStorage.setItem('access_token', 'test-token');
      ${initialPulled.length > 0 ? `localStorage.setItem('axis-pulled:9:1', JSON.stringify(${JSON.stringify(initialPulled)}));` : "localStorage.removeItem('axis-pulled:9:1');"}
      const projects = [{ id: 'all', name: '全部项目', color: '#0058BE' }, { id: '1', name: '产品体验升级', color: '#0058BE' }];
      function Workspace() {
        const [projectId, setProjectId] = React.useState('1');
        return React.createElement(PeopleAxisView, { lang: 'zh', projectId, projects, onSelectProject: project => setProjectId(project.id) });
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Workspace));
    </script></body></html>`,
  }))
  await page.goto('/')
}

async function setupMobileMock(page: Page, initialPulled: string[] = []) {
  const currentTree = makeTree()
  page.on('pageerror', error => { throw error })

  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data: unknown = { items: [] }
    if (path === '/users/me') {
      data = { id: 9, nickname: '王宁' }
    } else if (path.endsWith('/my-permissions')) {
      data = {
        role: 'pm',
        is_pm: true,
        is_superadmin: false,
        can_edit_all: true,
        owned_node_ids: [1, 2, 3],
        via_delegation: false,
        can_move: true,
        can_delete: true,
        can_submit_evidence: true,
        can_read_evidence: true,
      }
    } else if (path.endsWith('/tree')) {
      data = { project_id: 1, nodes: currentTree }
    } else if (path.endsWith('/members')) {
      data = {
        items: [
          { user_id: 9, display_name: '王宁', role: 'pm' },
          { user_id: 1, display_name: '赵晨', role: 'member' },
          { user_id: 2, display_name: '林悦', role: 'member' },
        ],
      }
    } else if (/^\/projects\/\d+$/.test(path)) {
      data = {
        id: 1,
        company_id: 1,
        name: '产品体验升级',
        pm_user_id: 9,
        final_owner_user_id: 1,
        final_owner: { user_id: 1, nickname: '赵晨' },
      }
    }
    await route.fulfill({ json: { code: 200, data } })
  })

  await page.route(url => url.pathname === '/', route => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html lang="zh" style="width:100%;height:100%"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;width:100%;height:100%"><div id="root" style="width:100%;height:100%"></div>
    <script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => (type) => type;
      window.__vite_plugin_react_preamble_installed__ = true;
    </script><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css';
      import '/node_modules/@fontsource-variable/inter/index.css';
      import '/node_modules/@fontsource-variable/noto-sans-sc/index.css';
      import { MobileAxisScreens } from '/src/mobile/features/people-axis/MobileAxisScreens.tsx';
      localStorage.setItem('access_token', 'test-token');
      localStorage.setItem('axis_canvas_hint_seen', 'true');
      ${initialPulled.length > 0 ? `localStorage.setItem('axis-pulled:9:1', JSON.stringify(${JSON.stringify(initialPulled)}));` : "localStorage.removeItem('axis-pulled:9:1');"}
      const project = { id: 1, name: '产品体验升级', color: '#0058BE' };
      const user = { id: '9', name: '王宁', role: 'pm' };
      function App() {
        return React.createElement(MobileAxisScreens, {
          projectId: 1,
          currentProject: project,
          projects: [project],
          currentUser: user,
          companyId: 1,
        });
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
    </script></body></html>`,
  }))
  await page.goto('/')
}

test.describe('人轴「下属默认折叠」功能测试', () => {
  test('默认折叠：未上轴直属下属以折叠行展示在领导卡片下方', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 })
    await setupDesktopMock(page)

    // 根卡片（赵晨）作为完整卡片渲染
    const rootNode = page.locator('.react-flow__node[data-id="1"]')
    await expect(rootNode).toBeVisible()
    await expect(rootNode.locator('.axis-card-name strong')).toHaveText('赵晨')

    // 下属（林悦）未上轴，默认呈现为折叠行
    const foldedRow = page.getByTestId('axis-folded-row-2')
    await expect(foldedRow).toBeVisible()
    await expect(foldedRow.locator('.axis-folded-name')).toHaveText('林悦')
    await expect(foldedRow.locator('.axis-folded-role')).toHaveText('设计负责人')
    await expect(foldedRow.locator('.axis-folded-count')).toHaveText('任务 2')
    await expect(foldedRow.locator('.axis-folded-over')).toHaveText('逾期 1')

    // 未上轴的折叠人员不生成连线
    const edges = page.locator('.react-flow__edge-path')
    await expect(edges).toHaveCount(0)
  })

  test('展开与重新折叠：点折叠行就地展开卡片，点折叠恢复原样', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 })
    await setupDesktopMock(page)

    const foldedRow = page.getByTestId('axis-folded-row-2')
    await expect(foldedRow).toBeVisible()

    // 1. 点击折叠行：就地展开成下属卡片
    await foldedRow.click()
    const expandedCard = page.locator('.react-flow__node[data-id="2"] .axis-map-card.is-folded-member')
    await expect(expandedCard).toBeVisible()
    // 展开卡片有“下属”标签
    await expect(expandedCard.locator('.axis-card-tag.subordinate')).toHaveText('下属')
    // 提供“折叠”和“拉到人轴”操作
    const foldBtn = page.getByTestId('axis-fold-2')
    const pullBtn = page.getByTestId('axis-pull-2')
    await expect(foldBtn).toBeVisible()
    await expect(pullBtn).toBeVisible()

    // 2. 点击“折叠”：卡片收起，恢复为折叠行
    await foldBtn.click()
    await expect(page.getByTestId('axis-folded-row-2')).toBeVisible()
    await expect(page.locator('.react-flow__node[data-id="2"] .axis-map-card')).toHaveCount(0)
  })

  test('拉到人轴：展开卡片点拉到人轴成为完整卡片并生成连线', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 })
    await setupDesktopMock(page)

    // 展开并拉到人轴
    await page.getByTestId('axis-folded-row-2').click()
    await page.getByTestId('axis-pull-2').click()

    // 成为完整上轴卡片，不再有 is-folded-member
    const axisCard = page.locator('.react-flow__node[data-id="2"] .axis-map-card:not(.is-folded-member)')
    await expect(axisCard).toBeVisible()

    // 与领导之间出现连线
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(1)

    // 非根上轴人员卡片上显示“收回”按钮
    await expect(page.getByTestId('axis-return-2')).toBeVisible()

    // 林悦自己的下属（陈宇）默认折叠在林悦下方
    await expect(page.getByTestId('axis-folded-row-3')).toBeVisible()
  })

  test('刷新后保留：拉到人轴后刷新页面，状态从 localStorage 恢复', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 })
    await setupDesktopMock(page)

    await page.getByTestId('axis-folded-row-2').click()
    await page.getByTestId('axis-pull-2').click()
    await expect(page.getByTestId('axis-return-2')).toBeVisible()

    // 检查 localStorage 存入了拉出 id
    const stored = await page.evaluate(() => localStorage.getItem('axis-pulled:9:1'))
    expect(stored).toContain('2')

    // 刷新页面后依然是完整上轴卡片
    await page.reload()
    await expect(page.locator('.react-flow__node[data-id="2"] .axis-map-card:not(.is-folded-member)')).toBeVisible()
    await expect(page.getByTestId('axis-return-2')).toBeVisible()
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(1)
  })

  test('收回：上轴人员点收回连同其下属移出拉出集合重新折叠', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 })
    // 初始化时 2 和 3 都已拉出
    await setupDesktopMock(page, ['2', '3'])

    await expect(page.locator('.react-flow__node[data-id="2"] .axis-map-card:not(.is-folded-member)')).toBeVisible()
    await expect(page.getByTestId('axis-return-2')).toBeVisible()

    // 点击收回林悦
    await page.getByTestId('axis-return-2').click()

    // 林悦变回折叠行
    await expect(page.getByTestId('axis-folded-row-2')).toBeVisible()
    // 连线消失
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(0)

    // localStorage 中移除了 2 和其下属 3
    const stored = await page.evaluate(() => localStorage.getItem('axis-pulled:9:1'))
    expect(stored).not.toContain('2')
    expect(stored).not.toContain('3')
  })

  test('全部拉到人轴：工具条更多菜单一键拉出所有人员', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 })
    await setupDesktopMock(page)

    // 默认只有根卡片
    await expect(page.getByTestId('axis-folded-row-2')).toBeVisible()

    // 打开画布设置弹窗
    await page.getByRole('button', { name: '画布设置' }).click()
    // 点击全部拉到人轴
    const pullAllBtn = page.getByTestId('axis-pull-all')
    await expect(pullAllBtn).toBeVisible()
    await pullAllBtn.click()

    // 所有折叠行消失，全部呈现为卡片
    await expect(page.getByTestId('axis-folded-row-2')).toHaveCount(0)
    await expect(page.getByTestId('axis-folded-row-3')).toHaveCount(0)
    await expect(page.locator('.react-flow__node[data-id="2"] .axis-map-card:not(.is-folded-member)')).toBeVisible()
    await expect(page.locator('.react-flow__node[data-id="3"] .axis-map-card:not(.is-folded-member)')).toBeVisible()
    // 1->2 与 2->3 两条连线
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(2)
  })

  test('恢复默认折叠：工具条更多菜单一键清空拉出集合并恢复折叠', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 960 })
    await setupDesktopMock(page, ['2', '3'])

    // 当前全拉出
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(2)

    // 打开画布设置弹窗
    await page.getByRole('button', { name: '画布设置' }).click()
    const resetFoldBtn = page.getByTestId('axis-reset-fold')
    await expect(resetFoldBtn).toBeVisible()
    await resetFoldBtn.click()

    // 恢复为默认折叠，折叠行出现
    await expect(page.getByTestId('axis-folded-row-2')).toBeVisible()
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(0)
  })

  test('手机宽度下点按：390px 下折叠行高度不小于 44px 且点击展开与拉出响应灵敏', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 })
    await setupMobileMock(page)

    // 切换到“项目全貌”
    await page.getByRole('button', { name: '项目全貌', exact: true }).click()

    const foldedRow = page.getByTestId('axis-folded-row-2')
    await expect(foldedRow).toBeVisible()

    // 验证点击区域高度不小于 44px（移动端触控标准）
    const box = await foldedRow.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.height).toBeGreaterThanOrEqual(44)

    // 点击折叠行就地展开
    await foldedRow.click()
    const foldBtn = page.getByTestId('axis-fold-2')
    const pullBtn = page.getByTestId('axis-pull-2')
    await expect(foldBtn).toBeVisible()
    await expect(pullBtn).toBeVisible()

    // 点击拉到人轴
    await pullBtn.click()
    await expect(page.locator('.react-flow__edge-path')).toHaveCount(1)
  })
})
