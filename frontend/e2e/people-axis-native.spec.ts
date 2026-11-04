import { test, expect, type Page } from '@playwright/test'

const task = (id: number, parent: number, title: string, percent: number, due_at = '2026-11-30T08:00:00Z') => ({
  id, parent_id: parent, node_type_key: 'work_item', title,
  progress_json: { percent }, due_at, children: [],
})
const owner = (id: number, name: string, role: string, children: unknown[]) => ({
  id, parent_id: null, node_type_key: 'person', title: role, sort_order: id,
  assignees: [{ user_id: id, role_key: 'primary', display_name: name }], children,
})
const tree = [
  owner(1, '赵晨', '产品负责人', [task(11, 1, '需求方案确认', 80, '2026-10-01T08:00:00Z')]),
  owner(2, '林悦', '设计负责人', [task(21, 2, '交互原型设计', 65), task(22, 2, '视觉规范整理', 100)]),
  owner(3, '陈宇', '研发负责人', [task(31, 3, '核心功能开发', 58),
    { ...owner(4, '刘洋', '前端工程师', []), parent_id: 3 }]),
]

async function openWorkspace(page: Page, editable = true, userId?: number, dense = false, failFirst = false, canSubmitEvidence = true, extension = false) {
  const currentTree = structuredClone(tree)
  if (extension) Object.assign(currentTree[2].children[1], {node_origin:'subordinate'})
  const findNode = (id: number, list: any[] = currentTree): any => {
    for (const node of list) { if (node.id === id) return node; const child = findNode(id, node.children || []); if (child) return child }
  }
  if (dense) for (let i = 0; i < 8; i++) currentTree[2].children.push({ ...owner(50 + i, `下级${i}`, '开发工程师', []), parent_id: 3 })
  page.on('pageerror', error => { throw error })
  let projectFailed = false
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '')
    let data: unknown = { items: [] }
    if (failFirst && !projectFailed && path === '/projects/1') { projectFailed = true; await route.fulfill({ status: 503, json: { code: 503, message: '暂时无法加载项目' } }); return }
    if (path === '/users/me') data = { id: userId ?? (editable ? 9 : 99), nickname: '当前用户' }
    else if (path.endsWith('/my-permissions')) data = {
      role: editable || path.includes('/projects/2/') ? 'pm' : 'member', is_pm: editable || path.includes('/projects/2/'), is_superadmin: false,
      can_edit_all: editable || path.includes('/projects/2/'), owned_node_ids: userId === 4 ? [4] : userId === 99 ? [21] : [], via_delegation: false, can_move: editable, can_delete: editable,
      can_submit_evidence: canSubmitEvidence, can_read_evidence: true,
    }
    else if (path === '/users/me/people-axis') data = { projects: [
      { project_id: 1, project_name: '产品体验升级', my_role: 'member', my_owned_node_ids: userId === 99 ? [21] : [], nodes: currentTree.flatMap(n => [{...n, children: []}, ...n.children]) },
      { project_id: 2, project_name: '第二项目', my_role: 'pm', nodes: [owner(102, '陈宇', '测试负责人', [])] },
    ] }
    else if (path.endsWith('/tree')) data = { project_id: 1, nodes: path.includes('/projects/2/') ? [owner(102, '陈宇', '测试负责人', [])] : currentTree }
    else if (/^\/nodes\/\d+\/move$/.test(path)) {
      const body = route.request().postDataJSON()
      const id = Number(path.split('/')[2])
      const index = currentTree.findIndex(n => n.id === id)
      if (index >= 0) {
        const moved = { ...currentTree.splice(index, 1)[0], parent_id: body.new_parent_id }
        const parent = currentTree.find(n => n.id === body.new_parent_id)
        if (parent) parent.children.push(moved)
        else currentTree.push(moved)
        data = moved
      }
    }
    else if (path.endsWith('/nodes') && route.request().method() === 'POST') {
      const body = route.request().postDataJSON()
      const created = { id: 99, children: [], ...body }
      const parent = findNode(body.parent_id)
      if (parent) parent.children.push(created)
      data = created
    }
    else if (/^\/nodes\/\d+\/layout$/.test(path)) {
      const body = route.request().postDataJSON()
      const node = findNode(Number(path.split('/')[2]))
      node.ui_offset = { x: body.offset_x, y: body.offset_y }
      data = { id: node.id, ui_offset: node.ui_offset }
    }
    else if (/^\/nodes\/\d+$/.test(path)) {
      const node = findNode(Number(path.split('/')[2]))
      if (route.request().method() === 'PATCH') {
        Object.assign(node, route.request().postDataJSON())
        node.assignees = (node.assignees || []).map((a: any) => ({ ...a, display_name: a.user_id === 9 ? '王宁' : '林悦' }))
      }
      data = node
    }
    else if (path.endsWith('/members')) data = { items: [
      { user_id: 9, display_name: '王宁', role: 'pm' },
      { user_id: 2, display_name: '林悦', role: 'member' },
    ] }
    else if (/^\/projects\/\d+$/.test(path)) data = {
      id: 1, company_id: 1, name: path.endsWith('/2') ? '第二项目' : '产品体验升级', pm_user_id: path.endsWith('/2') ? 4 : 9,
      final_owner_user_id: path.endsWith('/2') ? 4 : 9, final_owner: { user_id: 9, nickname: '王宁' },
    }
    await route.fulfill({ json: { code: 200, data } })
  })
  // Exercise the real view, API mappers and canvas, without unrelated app boot.
  await page.route(url => url.pathname === '/', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root"></div>
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
      import {PeopleAxisView} from '/src/components/views/PeopleAxisView.tsx';
      localStorage.setItem('access_token','test-token');
      const projects = [{id:'all',name:'全部项目',color:'#0058BE'}, {id:'1',name:'产品体验升级',color:'#0058BE'}, {id:'2',name:'第二项目',color:'#0058BE'}];
      function Workspace() {
        const [projectId, setProjectId] = React.useState('1');
        return React.createElement(PeopleAxisView,{lang:'zh',projectId,projects,onSelectProject:project=>setProjectId(project.id)});
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Workspace));
    </script></body></html>`,
  }))
  await page.goto('/')
}

async function expectCanvasFits(page: Page) {
  await expect.poll(() => page.locator('.axis-flow').evaluate(canvas => {
    const bounds = canvas.getBoundingClientRect()
    const controls = canvas.querySelector('.axis-canvas-controls')!.getBoundingClientRect()
    const nodes = [...canvas.querySelectorAll<HTMLElement>('.react-flow__node')].filter(node => node.getClientRects().length)
    return nodes.length > 0 && nodes.every(node => {
      const box = node.getBoundingClientRect()
      return box.left >= bounds.left + 16 && box.right <= bounds.right - 16 && box.top >= bounds.top + 20 && box.bottom <= controls.top - 16
    })
  })).toBeTruthy()
}

test('phone chain, horizontal/vertical overview and detail sheet share real node data', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page)
  await expect(page.getByRole('tab', { name: '责任链', exact: true })).toHaveAttribute('aria-selected', 'true')
  await expect(page.getByTestId('axis-chain-node-2')).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('phone-chain.png'), animations: 'disabled' })
  await page.getByTestId('axis-chain-node-2').click()
  const sheet = page.getByRole('dialog', { name: '节点详情' })
  await expect(sheet).toBeVisible()
  await expect(sheet.getByText('交互原型设计', { exact: true })).toBeVisible()
  await expect(sheet.getByRole('button', { name: '添加事项', exact: true })).toBeVisible()
  await page.screenshot({ path: test.info().outputPath('phone-detail.png'), animations: 'disabled' })
  await sheet.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('tab', { name: '总览', exact: true }).click()
  await expect(page.getByTestId('axis-overview')).toBeVisible()
  await expect(page.getByRole('button', { name: '纵向', exact: true })).toHaveAttribute('aria-pressed', 'true')
  const node = page.locator('.react-flow__node[data-id="2"]')
  const first = page.locator('.react-flow__node[data-id="1"]')
  await expect(node).toBeVisible()
  await expect.poll(async () => {
    const a = await first.boundingBox(), b = await node.boundingBox()
    return a && b ? b.x > a.x && Math.abs(b.y - a.y) < 3 : false
  }).toBeTruthy()
  await expectCanvasFits(page)
  await page.screenshot({ path: test.info().outputPath('phone-overview-vertical.png'), animations: 'disabled' })
  await page.getByRole('button', { name: '横向', exact: true }).click()
  await expect.poll(async () => {
    const a = await first.boundingBox(), b = await node.boundingBox()
    return a && b ? b.y > a.y && Math.abs(b.x - a.x) < 3 : false
  }).toBeTruthy()
  await expectCanvasFits(page)
  await page.screenshot({ path: test.info().outputPath('phone-overview-horizontal.png'), animations: 'disabled' })
  await node.click()
  await expect(page.getByTestId('axis-node-preview')).toContainText('林悦')
  await page.getByRole('button', { name: '查看详情', exact: true }).click()
  await expect(sheet.getByText('交互原型设计', { exact: true })).toBeVisible()
  await sheet.getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByRole('button', { name: '横向', exact: true })).toHaveAttribute('aria-pressed', 'true')
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
})

test('small touch overview selects a card without triggering its tiny management controls', async ({ page }) => {
  await page.setViewportSize({width:390,height:844})
  await openWorkspace(page,true,undefined,true)
  await page.getByRole('tab',{name:'总览',exact:true}).click()
  const node = page.locator('.react-flow__node[data-id="3"]')
  await node.click()
  await expect(page.getByTestId('axis-node-preview')).toContainText('陈宇')
  await expect(node.getByRole('button',{name:'编辑人员 · 陈宇',exact:true})).not.toBeVisible()
  await node.click()
  await expect(page.getByRole('dialog')).toHaveCount(0)
  await page.getByRole('button',{name:'定位',exact:true}).click()
  await expect(node.getByRole('button',{name:'新增下级 · 陈宇',exact:true})).toBeVisible()
})

test('read-only mobile users can browse but cannot edit nodes', async ({ page }) => {
  await page.setViewportSize({ width: 360, height: 740 })
  await openWorkspace(page, false)
  await page.getByTestId('axis-chain-node-2').click()
  const sheet = page.getByRole('dialog', { name: '节点详情' })
  await expect(sheet.getByRole('button', { name: '添加事项', exact: true })).toHaveCount(0)
  await expect(sheet.getByText('只读', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '添加责任人', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新增下级', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '编辑人员', exact: true })).toHaveCount(0)
  await sheet.getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('tab', { name: '总览', exact: true }).click()
  await expect(page.getByRole('button', { name: '调整位置', exact: true })).toHaveCount(0)
})

test('desktop uses a canvas and persistent inspector', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await openWorkspace(page)
  await expect(page.getByTestId('axis-overview')).toBeVisible()
  await page.locator('.react-flow__node[data-id="2"]').click()
  await expect(page.getByTestId('axis-inspector')).toContainText('林悦')
  await expect(page.getByTestId('axis-inspector').getByText('交互原型设计', { exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '横向', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await page.screenshot({ path: test.info().outputPath('desktop-inspector.png'), animations: 'disabled' })
})

test('desktop zoomed out to 50% shows compact cards with a large name', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await openWorkspace(page)
  await expect(page.getByTestId('axis-overview')).toBeVisible()
  const readout = page.locator('.axis-zoom-readout')
  const zoomOutBtn = page.getByRole('button', { name: '缩小', exact: true })
  const readZoom = async () => parseInt((await readout.textContent()) || '100', 10)
  for (let i = 0; i < 20 && (await readZoom()) > 50; i++) {
    await zoomOutBtn.click()
    await page.waitForTimeout(150)
  }
  expect(await readZoom()).toBeLessThan(60)
  const card = page.locator('.react-flow__node[data-id="1"] .axis-map-card')
  await expect(card).toHaveClass(/is-compact/)
  const fontSize = await card.locator('.axis-card-name strong').evaluate(el => parseFloat(getComputedStyle(el).fontSize))
  expect(fontSize).toBeGreaterThanOrEqual(24)
})

test('a member can submit evidence without personnel editing rights', async ({ page }) => {
  await page.setViewportSize({width:390,height:844})
  await openWorkspace(page, false)
  await page.getByTestId('axis-chain-node-2').click()
  const detail = page.getByRole('dialog',{name:'节点详情'})
  await expect(detail.getByTestId('axis-node-permissions')).toContainText('可提交材料')
  await expect(detail.getByRole('button',{name:'编辑人员',exact:true})).toHaveCount(0)
  await detail.locator('.axis-detail-item').first().getByRole('button',{name:'提交材料',exact:true}).click()
  const form = page.getByRole('dialog',{name:'提交材料'})
  await form.getByLabel('文字材料').fill('成员交付材料')
  const submitted = page.waitForRequest(r => r.method()==='POST' && r.url().endsWith('/nodes/21/evidence'))
  await form.getByRole('button',{name:'提交材料',exact:true}).click()
  expect((await submitted).postDataJSON().summary_text).toContain('成员交付材料')
})

test('tree editing alone does not imply evidence submission rights', async ({ page }) => {
  await page.setViewportSize({width:390,height:844})
  await openWorkspace(page,true,undefined,false,false,false)
  await page.getByTestId('axis-chain-node-2').click()
  const detail = page.getByRole('dialog',{name:'节点详情'})
  await expect(detail.getByRole('button',{name:'编辑人员',exact:true})).toBeVisible()
  await expect(detail.getByTestId('axis-node-permissions')).toContainText('不可提交材料')
  await expect(detail.getByRole('button',{name:'提交材料',exact:true})).toHaveCount(0)
})

test('creating an item from the phone sheet targets the selected owner', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page)
  await page.getByTestId('axis-chain-node-2').click()
  await page.getByRole('dialog', { name: '节点详情' }).getByRole('button', { name: '添加事项', exact: true }).click()
  const form = page.getByRole('dialog', { name: '添加事项' })
  await expect(form).toBeVisible()
  await form.locator('input').first().fill('移动端验收事项')
  const request = page.waitForRequest(req => req.method() === 'POST' && req.url().endsWith('/projects/1/nodes'))
  await form.locator('button[type="submit"]').click()
  expect((await request).postDataJSON()).toMatchObject({ parent_id: 2, node_type_key: 'work_item', title: '移动端验收事项' })
  await expect(form).not.toBeVisible()
  await page.getByTestId('axis-chain-node-2').click()
  await expect(page.getByRole('dialog', { name: '节点详情' }).getByText('移动端验收事项', { exact: true })).toBeVisible()
})

test('relationship action opens overview, can cancel and assigns the chosen parent', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page)
  const start = async () => {
    await page.getByTestId('axis-chain-node-2').click()
    await page.getByRole('dialog', { name: '节点详情' }).getByRole('button', { name: '管理责任关系', exact: true }).click()
    await expect(page.getByRole('tab', { name: '总览', exact: true })).toHaveAttribute('aria-selected', 'true')
    await expect(page.getByRole('dialog', { name: '节点详情' })).toHaveCount(0)
    await expect(page.getByText('点击人员设为直属上级', { exact: true })).toBeVisible()
    await expectCanvasFits(page)
  }
  await start()
  await page.getByRole('button', { name: '取消连线', exact: true }).click()
  await expect(page.getByText('点击人员设为直属上级', { exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: '责任链', exact: true }).click()
  await start()
  // Leaving overview cancels relationship mode; a chain card must open details.
  await page.getByRole('tab', { name: '责任链', exact: true }).click()
  await page.getByTestId('axis-chain-node-2').click()
  await expect(page.getByRole('dialog', { name: '节点详情' })).toBeVisible()
  await page.getByRole('dialog', { name: '节点详情' }).getByRole('button', { name: '管理责任关系', exact: true }).click()
  await expectCanvasFits(page)
  const request = page.waitForRequest(req => req.method() === 'POST' && req.url().endsWith('/nodes/2/move'))
  await page.locator('.react-flow__node[data-id="3"]').click()
  expect((await request).postDataJSON()).toMatchObject({ new_parent_id: 3 })
  await expect(page.getByText('点击人员设为直属上级', { exact: true })).toHaveCount(0)
  await page.getByRole('tab', { name: '责任链', exact: true }).click()
  const parent = page.getByTestId('axis-chain-node-3').locator('xpath=../..')
  await expect(parent.getByTestId('axis-chain-node-2')).toBeVisible()
})

test.describe('touch phone', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } })
  test('touch adjustment saves a node position and keeps its reporting line', async ({ page }) => {
    await openWorkspace(page)
    await page.getByRole('tab', { name: '总览', exact: true }).tap()
    const node = page.locator('.react-flow__node[data-id="4"]')
    await node.tap()
    await page.getByRole('button',{name:'定位',exact:true}).tap()
    await expect(page.locator('.axis-zoom-readout')).toHaveText('85%')
    const moving = page.getByRole('button', { name: '调整位置', exact: true })
    await expect(moving).toHaveAttribute('aria-pressed', 'false')
    await moving.tap()
    await expect(moving).toHaveAttribute('aria-pressed', 'true')
    const box = (await node.locator('.axis-person-label').boundingBox())!
    const cdp = await page.context().newCDPSession(page)
    const saved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith('/nodes/4/layout'), { timeout: 7000 })
    const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] })
    for (let i = 1; i <= 12; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{x:start.x - i * 3,y:start.y - i * 4}] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    expect((await saved).ok()).toBeTruthy()
    const position = () => node.evaluate(el => { const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform); return {x:m.m41,y:m.m42} })
    const after = await position()
    await page.screenshot({path:test.info().outputPath('mobile-adjustment.png')})
    await expect(page.locator('.axis-zoom-readout')).toHaveText('85%')
    await page.reload()
    await page.getByRole('tab', { name: '总览', exact: true }).tap()
    await expect.poll(position).toEqual(after)
    await expect(page.locator('.react-flow__edge[data-id="branch-4"]')).toHaveCount(1)
  })
  test('touch navigation, collapse and project switching work in dark mode', async ({ page }) => {
    await openWorkspace(page)
    await page.evaluate(() => document.documentElement.classList.add('dark'))
    // Android WebView's button default differs from desktop Chromium.
    await page.addStyleTag({ content: '@layer base { button { align-items: flex-start; } }' })
    const dimensions = await page.getByTestId('axis-chain-node-2').evaluate(el => ({ card: el.clientWidth, heading: el.querySelector('.axis-person-heading')!.clientWidth }))
    expect(dimensions.heading).toBeGreaterThan(dimensions.card - 35)
    await page.getByTestId('axis-chain-node-4').scrollIntoViewIfNeeded()
    await expect(page.getByTestId('axis-chain-node-4')).toBeVisible()
    await page.getByRole('button', { name: '收起下级', exact: true }).tap()
    await expect(page.getByTestId('axis-chain-node-4')).toHaveCount(0)
    await page.getByRole('tab', { name: '总览', exact: true }).tap()
    await expectCanvasFits(page)
    await page.locator('.react-flow__node[data-id="2"]').tap()
    await expect(page.getByTestId('axis-node-preview')).toContainText('林悦')
    await page.getByRole('button', { name: '查看详情', exact: true }).tap()
    await expect(page.getByRole('dialog', { name: '节点详情' })).toBeVisible()
    await page.getByRole('button', { name: '关闭', exact: true }).tap()
    await page.getByRole('combobox', { name: '选择项目' }).selectOption('all')
    await expect(page.getByRole('combobox', { name: '选择项目' })).toHaveValue('all')
    await expect(page.getByRole('button', { name: '添加责任人', exact: true })).toHaveCount(0)
    await page.getByRole('combobox', { name: '选择项目' }).selectOption('1')
    await expect(page.locator('.react-flow__node[data-id="2"]')).toBeVisible()
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy()
  })
})

for (const width of [1420, 1099]) {
  test(`hierarchy keeps peers aligned and reports into project lead at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 884 })
    await openWorkspace(page)
    for (const direction of ['横向', '纵向']) {
      await page.getByRole('button', { name: direction, exact: true }).click()
      await expectCanvasFits(page)
      const boxes = await Promise.all(['1', '2', '3', '4'].map(id => page.locator(`.react-flow__node[data-id="${id}"]`).boundingBox()))
      const [r1, r2, parent, child] = boxes.map(box => box!)
      if (direction === '横向') {
        expect(Math.abs(r1.x - r2.x)).toBeLessThan(3)
        expect(child.x).toBeGreaterThan(parent.x + parent.width)
      } else {
        expect(Math.abs(r1.y - r2.y)).toBeLessThan(3)
        expect(child.y).toBeGreaterThan(parent.y + parent.height)
      }
      await expect(page.locator('.react-flow__node[data-id="1"] .axis-terminal-badge')).toBeVisible()
      await expect(page.locator('.react-flow__node[data-id="3"]')).toContainText('陈宇')
      await expect(page.locator('.react-flow__node[data-id="4"]')).toContainText('刘洋')
      await expect(page.locator('.react-flow__edge[data-id="branch-4"]')).toHaveCount(1)
      await page.screenshot({ path: test.info().outputPath(`hierarchy-${direction}.png`) })
    }
  })
}

test('straight mode snaps subordinate card within 16px to parent horizontal axis and persists', async ({ page }) => {
  await page.setViewportSize({ width: 1420, height: 884 })
  await openWorkspace(page)
  // Ensure in overview and horizontal orientation
  await page.getByRole('button', { name: '横向', exact: true }).click()
  // Switch to straight line mode
  await page.getByRole('button', { name: '直线', exact: true }).click()
  await expect(page.getByRole('button', { name: '直线', exact: true })).toHaveAttribute('aria-pressed', 'true')

  const parentNode = page.locator('.react-flow__node[data-id="3"]')
  const childNode = page.locator('.react-flow__node[data-id="4"]')
  await expect(parentNode).toBeVisible()
  await expect(childNode).toBeVisible()

  const parentBox = (await parentNode.boundingBox())!
  const childBox = (await childNode.boundingBox())!

  // Drag child card to be near parent's horizontal centerline with 10px offset (delta < 16px)
  const startX = childBox.x + childBox.width / 2
  const startY = childBox.y + childBox.height / 2
  const targetY = parentBox.y + 10 + childBox.height / 2

  await page.mouse.move(startX, startY)
  await page.mouse.down()
  await page.mouse.move(startX, targetY, { steps: 15 })
  await page.mouse.move(startX, targetY + 1)
  await expect(page.locator('.axis-snap-guide')).toBeVisible()
  await page.mouse.up()

  // Verify snapped position (y aligns with parent.y)
  await expect.poll(async () => {
    const p = await parentNode.boundingBox()
    const c = await childNode.boundingBox()
    return p && c ? Math.abs(c.y - p.y) < 2 : false
  }).toBeTruthy()

  // Reload to verify persisted alignment
  await page.reload()
  await page.getByRole('button', { name: '横向', exact: true }).click()
  await expect.poll(async () => {
    const p = await page.locator('.react-flow__node[data-id="3"]').boundingBox()
    const c = await page.locator('.react-flow__node[data-id="4"]').boundingBox()
    return p && c ? Math.abs(c.y - p.y) < 2 : false
  }).toBeTruthy()
})

test('member role, reporting path and project-specific responsibility survive switching', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page, false, 4)
  await expect(page.getByTestId('axis-my-role')).toContainText('前端工程师')
  await expect(page.getByRole('button', { name: '我的职责', exact: true })).toHaveAttribute('aria-pressed', 'true')
  await expect(page.getByTestId('axis-chain-node-4')).toContainText('我负责')
  await expect(page.getByTestId('axis-chain-node-3')).toContainText('上级链路')
  await expect(page.getByTestId('axis-chain-node-1')).toHaveCount(0)
  await page.getByRole('button', { name: '项目全貌', exact: true }).click()
  await expect(page.getByTestId('axis-chain-node-1')).toBeVisible()
  await page.getByRole('combobox', { name: '选择项目' }).selectOption('all')
  await expect(page.getByTestId('axis-project-1')).toContainText('前端工程师')
  await expect(page.getByTestId('axis-project-2')).toContainText('项目 PM')
  await expect(page.locator('.react-flow')).toHaveCount(0)
  await page.getByTestId('axis-project-2').click()
  await expect(page.getByTestId('axis-my-role')).toContainText('项目 PM')
  await expect(page.getByTestId('axis-chain-node-102')).toBeVisible()
  await expect(page.getByTestId('axis-chain-node-4')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '项目全貌', exact: true })).toHaveAttribute('aria-pressed', 'true')
})

test.describe('dense touch hierarchy', () => {
  test.use({ isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 } })
  test('selecting a manager at overview scale never collapses its descendants', async ({ page }) => {
    await openWorkspace(page, true, undefined, true)
    await page.getByTestId('axis-chain-node-2').tap()
    await page.getByRole('dialog', { name: '节点详情' }).getByRole('button', { name: '管理责任关系', exact: true }).tap()
    await expectCanvasFits(page)
    const moved = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/nodes/2/move'), { timeout: 7000 })
    await page.locator('.react-flow__node[data-id="3"]').tap()
    expect((await moved).ok()).toBeTruthy()
    await expect(page.getByText('点击人员设为直属上级', { exact: true })).toHaveCount(0)
  })
})

test('task-only assignments use the same role in project directory and chain', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page, false, 99)
  await expect(page.getByTestId('axis-my-role')).toHaveText('设计负责人')
  await expect(page.getByTestId('axis-chain-node-2')).toContainText('我负责')
  await page.getByRole('combobox', { name: '选择项目' }).selectOption('all')
  await expect(page.getByTestId('axis-project-1')).toContainText('我的岗位 · 设计负责人')
})

test('retry restores project metadata as well as its tree', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page, true, undefined, false, true)
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.locator('.axis-chain-final')).toContainText('王宁')
  await expect(page.getByTestId('axis-chain-node-2')).toBeVisible()
  await expect(page.getByRole('button', { name: '重新加载', exact: true })).toHaveCount(0)
})

test('project directory can retry after a failed aggregate request', async ({ page }) => {
  await openWorkspace(page)
  let calls = 0
  await page.route('**/api/v1/users/me/people-axis', async route => {
    calls++
    if (calls === 1) await route.fulfill({status:503,json:{code:503,message:'项目目录加载失败'}})
    else await route.fulfill({json:{code:200,data:{projects:[{project_id:1, project_name:'恢复的项目', my_role:'pm', nodes:[]}]}}})
  })
  await page.getByRole('combobox', { name: '选择项目' }).selectOption('all')
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByTestId('axis-project-1')).toContainText('恢复的项目')
  expect(calls).toBe(2)
})

test('late refresh from a previous project cannot replace the current chain', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page)
  await expect(page.getByTestId('axis-chain-node-2')).toBeVisible()
  let release!: () => void
  const gate = new Promise<void>(resolve => { release = resolve })
  let entered!: () => void
  const started = new Promise<void>(resolve => { entered = resolve })
  await page.route('**/api/v1/projects/1/tree?*', async route => {
    entered()
    await gate
    await route.fulfill({ json: { code: 200, data: { project_id: 1, nodes: tree } } })
  })
  try {
    await page.getByTestId('axis-chain-node-2').click()
    await page.getByRole('dialog', { name: '节点详情' }).getByRole('button', { name: '添加事项', exact: true }).click()
    const form = page.getByRole('dialog', { name: '添加事项' })
    await form.locator('input').first().fill('切项目前提交的事项')
    await form.locator('button[type="submit"]').click()
    await started
    await page.getByRole('combobox', { name: '选择项目' }).selectOption('2')
    await expect(page.getByTestId('axis-chain-node-102')).toBeVisible()
    const response = page.waitForResponse(r => new URL(r.url()).pathname.endsWith('/projects/1/tree'))
    release()
    await response
    await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
    await expect(page.getByTestId('axis-chain-node-102')).toBeVisible()
    await expect(page.getByTestId('axis-chain-node-2')).toHaveCount(0)
  } finally { release() }
})

test('a manager can add a third-level person directly from any chain node', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page)
  const branch = page.getByTestId('axis-chain-node-4').locator('xpath=../..')
  await branch.getByRole('button', { name: '新增下级', exact: true }).click()
  const form = page.getByRole('dialog', { name: '添加责任人' })
  await expect(form.getByRole('combobox', { name: '直属上级' })).toHaveValue('4')
  await form.getByPlaceholder('例如: 实时协同网关责任专家...').fill('客户端负责人')
  const created = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/projects/1/nodes'))
  await form.locator('button[type="submit"]').click()
  expect((await created).postDataJSON().parent_id).toBe(4)
  await expect(page.getByTestId('axis-chain-node-99')).toContainText('三级负责人')
  await expect(page.getByTestId('axis-chain-node-99')).toContainText('客户端负责人')
  await expect(page.getByTestId('axis-chain-node-99')).toHaveAttribute('data-node-origin','subordinate')
  await expect(page.getByTestId('axis-chain-node-99')).toContainText('下级自建')
  await page.getByRole('tab', { name: '总览', exact: true }).click()
  await expect(page.locator('.react-flow__node[data-id="99"]')).toBeVisible()
  await expect(page.locator('.react-flow__edge[data-id="branch-99"]')).toHaveCount(1)
  await expect(page.locator('.react-flow__edge[data-id="branch-99"] [data-attachment-kind="subordinate"]')).toHaveCount(1)
  await expect(page.locator('.react-flow__node[data-id="4"]')).toBeVisible()
})

test('person editing exposes persisted material and subordinate permissions', async ({page}) => {
  await page.setViewportSize({width:390,height:844})
  await openWorkspace(page)
  const card = page.getByTestId('axis-chain-node-2')
  await card.locator('xpath=..').getByRole('button',{name:'编辑人员',exact:true}).click()
  const edit = page.getByRole('dialog',{name:'编辑人员'})
  await edit.getByLabel('材料提交范围').selectOption('disabled')
  await edit.getByLabel('允许负责人新增下级',{exact:true}).uncheck()
  const saved = page.waitForRequest(r=>r.method()==='PATCH' && r.url().endsWith('/nodes/2'))
  await edit.getByRole('button',{name:'保存修改',exact:true}).click()
  expect((await saved).postDataJSON().responsibility_permissions).toEqual({evidence_submit:'disabled',allow_add_subordinates:false,allow_add_work_items:true})
  await expect(edit).toHaveCount(0)
  await card.locator('xpath=..').getByRole('button',{name:'编辑人员',exact:true}).click()
  await expect(edit.getByLabel('材料提交范围')).toHaveValue('disabled')
  await expect(edit.getByLabel('允许负责人新增下级',{exact:true})).not.toBeChecked()
})

test('editing a person keeps their subordinates and work items', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await openWorkspace(page)
  await page.getByTestId('axis-chain-node-2').locator('xpath=../..').getByRole('button', { name: '编辑人员', exact: true }).click()
  const form = page.getByRole('dialog', { name: '编辑人员' })
  await expect(form.getByLabel('项目岗位')).toHaveValue('设计负责人')
  await form.getByLabel('关联成员').selectOption('9')
  await form.getByLabel('项目岗位').fill('体验总负责人')
  const saved = page.waitForRequest(r => r.method() === 'PATCH' && r.url().endsWith('/nodes/2'))
  await form.getByRole('button', { name: '保存修改', exact: true }).click()
  expect((await saved).postDataJSON().assignees).toEqual([{user_id:9,role_key:'primary'}])
  await expect(form).toHaveCount(0)
  await expect(page.getByTestId('axis-chain-node-2')).toContainText('王宁')
  await expect(page.getByTestId('axis-chain-node-2')).toContainText('体验总负责人')
  await page.getByTestId('axis-chain-node-2').click()
  await expect(page.getByRole('dialog', { name: '节点详情' })).toContainText('交互原型设计')
})

test('desktop node positions can be dragged, saved and restored', async ({ page }) => {
  await page.setViewportSize({ width: 1420, height: 960 })
  await openWorkspace(page)
  await expectCanvasFits(page)
  const node = page.locator('.react-flow__node[data-id="4"]')
  const position = () => node.evaluate(el => { const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform); return { x:m.m41, y:m.m42 } })
  const before = await position()
  const box = (await node.boundingBox())!
  const saved = page.waitForRequest(r => r.method() === 'PUT' && r.url().endsWith('/nodes/4/layout'), { timeout: 7000 })
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 + 65, box.y + box.height / 2 - 45, { steps:12 })
  await page.mouse.up()
  const body = (await saved).postDataJSON()
  expect(Math.abs(body.offset_x)).toBeGreaterThan(20)
  const after = await position()
  expect(after.x).not.toBe(before.x)
  await page.reload()
  await expect(node).toBeVisible()
  await expect.poll(position).toEqual(after)
})

for (const orientation of ['纵向','横向']) for (const extension of [false,true]) {
  test(`smooth ${extension ? 'subordinate' : 'project'} curves track both endpoints while dragging ${orientation}`, async ({page}) => {
    await page.setViewportSize({width:1420,height:1100})
    await openWorkspace(page,true,undefined,false,false,true,extension)
    await page.getByRole('button',{name:orientation,exact:true}).click()
    await expectCanvasFits(page)
    const source = page.locator('.react-flow__node[data-id="3"]')
    const target = page.locator('.react-flow__node[data-id="4"]')
    const edge = page.locator('.react-flow__edge[data-id="branch-4"] path.react-flow__edge-path')
    await expect(edge).toHaveAttribute('d',/^M .+ C .+/)
    for (const dragged of [target,source]) {
    const pathBefore = await edge.getAttribute('d')
    const box = (await dragged.locator('.axis-person-label').boundingBox())!
    await page.mouse.move(box.x+box.width/2,box.y+box.height/2)
    await page.mouse.down()
    try {
      await page.mouse.move(box.x+box.width/2+65,box.y+box.height/2-45,{steps:8})
      await expect(edge).not.toHaveAttribute('d',pathBefore!)
      const points = await edge.evaluate(path => {
        const curve = path as SVGPathElement, matrix = curve.getScreenCTM()!
        const start = curve.getPointAtLength(0).matrixTransform(matrix)
        const end = curve.getPointAtLength(curve.getTotalLength()).matrixTransform(matrix)
        return {start:{x:start.x,y:start.y},end:{x:end.x,y:end.y}}
      })
      const targetBox = (await target.boundingBox())!
      expect(Math.min(Math.abs(points.end.x-targetBox.x),Math.abs(points.end.x-targetBox.x-targetBox.width),Math.abs(points.end.y-targetBox.y),Math.abs(points.end.y-targetBox.y-targetBox.height))).toBeLessThan(2)
      const sourceBox = (await source.boundingBox())!
      expect(Math.min(Math.abs(points.start.x-sourceBox.x),Math.abs(points.start.x-sourceBox.x-sourceBox.width),Math.abs(points.start.y-sourceBox.y),Math.abs(points.start.y-sourceBox.y-sourceBox.height))).toBeLessThan(2)
    } finally { await page.mouse.up() }
    }
    await page.locator('.axis-flow').screenshot({path:test.info().outputPath('curved-connections.png')})
  })
}

test('reset waits for an in-flight drag save so the old position cannot overwrite it', async ({ page }) => {
  await page.setViewportSize({width:1420,height:960})
  await openWorkspace(page)
  await expectCanvasFits(page)
  const node = page.locator('.react-flow__node[data-id="4"]')
  const position = () => node.evaluate(el => {const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform); return {x:m.m41,y:m.m42}})
  const before = await position()
  let release!: () => void
  const gate = new Promise<void>(resolve => {release = resolve})
  let calls = 0
  await page.route('**/api/v1/nodes/4/layout', async route => {
    calls++
    if (calls === 1) await gate
    await route.fallback()
  })
  try {
    const box = (await node.boundingBox())!
    await page.mouse.move(box.x + box.width/2, box.y + box.height/2)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width/2 - 45, box.y + box.height/2 - 40, {steps:12})
    await page.mouse.up()
    await expect.poll(() => calls).toBe(1)
    await page.getByRole('button', {name:'重置布局',exact:true}).click()
    await expect.poll(position).toEqual(before)
    expect(calls, 'reset must stay queued until the earlier save completes').toBe(1)
    release()
    await expect.poll(() => calls).toBe(2)
    await page.reload()
    await expect(node).toBeVisible()
    await expect.poll(position).toEqual(before)
  } finally {release()}
})

test('two failed drag saves restore the last persisted position', async ({page}) => {
  await page.setViewportSize({width:1420,height:960})
  await openWorkspace(page)
  await expectCanvasFits(page)
  const node = page.locator('.react-flow__node[data-id="4"]')
  const position = () => node.evaluate(el => {const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform); return {x:m.m41,y:m.m42}})
  const before = await position()
  let release!: () => void
  const gate = new Promise<void>(resolve => {release=resolve})
  let calls = 0
  await page.route('**/api/v1/nodes/4/layout', async route => {
    calls++
    if (calls === 1) await gate
    await route.fulfill({status:503,json:{code:503,message:'模拟位置保存失败'}})
  })
  try {
    for (let i=0;i<2;i++) {
      const box = (await node.boundingBox())!
      await page.mouse.move(box.x+box.width/2,box.y+box.height/2)
      await page.mouse.down()
      await page.mouse.move(box.x+box.width/2-40,box.y+box.height/2-30,{steps:12})
      await page.mouse.up()
    }
    release()
    await expect.poll(() => calls).toBe(2)
    await expect(page.getByText('模拟位置保存失败',{exact:true})).toBeVisible()
    await expect.poll(position).toEqual(before)
  } finally {release()}
})

test('desktop hover reveals add-child button and opens creation dialog', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await openWorkspace(page)
  const zoomInBtn = page.getByRole('button', { name: '放大' })
  for (let i = 0; i < 4; i++) {
    await zoomInBtn.click()
  }
  const node = page.locator('.react-flow__node[data-id="2"]')
  await expect(node).toBeVisible()
  await node.hover()
  const addBtn = node.getByRole('button', { name: '新增下级 · 林悦' })
  await expect(addBtn).toBeVisible()
  await addBtn.click()
  const dialog = page.getByRole('dialog', { name: '添加责任人' })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('combobox', { name: '直属上级' })).toHaveValue('2')
})

async function dragCardTwoOntoThree(page: Page) {
  const sourceNode = page.locator('.react-flow__node[data-id="2"]')
  const targetNode = page.locator('.react-flow__node[data-id="3"]')
  const srcBox = (await sourceNode.boundingBox())!
  const tgtBox = (await targetNode.boundingBox())!
  await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + tgtBox.height / 2, { steps: 10 })
  await page.waitForTimeout(400)
  const tip = targetNode.locator('.axis-drop-bubble')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('松手设为')
  await page.mouse.up()
}

test('drag card over target with 400ms dwell shows drop tip and confirms reparent', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await openWorkspace(page)
  await expect(page.locator('.react-flow__node[data-id="2"]')).toBeVisible()
  await expect(page.locator('.react-flow__node[data-id="3"]')).toBeVisible()

  let moveSent = false
  page.on('request', r => { if (r.method() === 'POST' && r.url().endsWith('/nodes/2/move')) moveSent = true })

  await dragCardTwoOntoThree(page)
  const confirmDialog = page.getByTestId('reparent-confirm-dialog')
  await expect(confirmDialog).toBeVisible()
  await expect(confirmDialog).toContainText('林悦')
  await expect(confirmDialog).toContainText('陈宇')

  // 确定、取消两个按钮的中心点必须落在按钮自身上（不能被画布元素盖住）
  for (const id of ['reparent-confirm-yes', 'reparent-confirm-no']) {
    const topmost = await page.getByTestId(id).evaluate(el => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!hit && (hit === el || el.contains(hit))
    })
    expect(topmost, `${id} 被其他元素遮挡`).toBe(true)
  }

  // 确认框内部网格取点，每个点命中的元素都必须在确认框内（画布工具条、卡片不能盖在上面）
  const covered = await confirmDialog.evaluate(el => {
    const panel = el.firstElementChild as HTMLElement
    const r = panel.getBoundingClientRect()
    const bad: string[] = []
    for (let i = 1; i < 8; i++) for (let j = 1; j < 6; j++) {
      const x = r.left + (r.width * i) / 8, y = r.top + (r.height * j) / 6
      const hit = document.elementFromPoint(x, y)
      if (!hit || !el.contains(hit)) bad.push(`${Math.round(x)},${Math.round(y)}:${(hit as HTMLElement | null)?.className}`)
    }
    return bad
  })
  expect(covered, '确认框被画布元素遮挡').toEqual([])

  // 确认框面板必须不透明（背景透明会让下面的卡片、工具条透出来，看起来像盖在上面）
  const panelBg = await confirmDialog.evaluate(el => getComputedStyle(el.firstElementChild as HTMLElement).backgroundColor)
  expect(panelBg, '确认框面板背景透明').not.toBe('rgba(0, 0, 0, 0)')

  // 点取消：确认框消失，且没有发出 move 请求
  await page.getByTestId('reparent-confirm-no').click()
  await expect(confirmDialog).toHaveCount(0)
  await page.waitForTimeout(300)
  expect(moveSent).toBeFalsy()

  // 再拖一次，点确定：发出 move 请求
  const moveRequest = page.waitForRequest(r => r.method() === 'POST' && r.url().endsWith('/nodes/2/move'))
  await dragCardTwoOntoThree(page)
  await expect(confirmDialog).toBeVisible()
  await page.getByTestId('reparent-confirm-yes').click()
  const req = await moveRequest
  expect(req.postDataJSON()).toMatchObject({ new_parent_id: 3 })
})

test('card more menu is topmost over other cards', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await openWorkspace(page)
  const zoomInBtn = page.getByRole('button', { name: '放大' })
  for (let i = 0; i < 4; i++) await zoomInBtn.click()
  const node = page.locator('.react-flow__node[data-id="2"]')
  await expect(node).toBeVisible()
  await node.hover()
  await node.getByTestId('card-more-menu-btn').click()
  const menu = node.locator('.axis-card-menu')
  await expect(menu).toBeVisible()
  const count = await menu.locator('button').count()
  expect(count).toBeGreaterThan(0)
  for (let i = 0; i < count; i++) {
    const topmost = await menu.locator('button').nth(i).evaluate(el => {
      const r = el.getBoundingClientRect()
      const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
      return !!hit && (hit === el || el.contains(hit))
    })
    expect(topmost, `菜单第 ${i + 1} 项被遮挡`).toBe(true)
  }
})

test('fast drag across another card to blank space saves layout without move', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await openWorkspace(page)
  const sourceNode = page.locator('.react-flow__node[data-id="2"]')
  const targetNode = page.locator('.react-flow__node[data-id="3"]')
  const srcBox = (await sourceNode.boundingBox())!
  const tgtBox = (await targetNode.boundingBox())!

  let moveCalled = false
  await page.route('**/nodes/2/move', async route => {
    moveCalled = true
    await route.fallback()
  })
  const layoutRequest = page.waitForRequest(r => r.method() === 'PUT' && r.url().endsWith('/nodes/2/layout'))

  await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + tgtBox.height / 2, { steps: 3 })
  await page.waitForTimeout(50)
  await page.mouse.move(tgtBox.x + tgtBox.width + 150, tgtBox.y + tgtBox.height + 150, { steps: 5 })
  await page.mouse.up()

  await layoutRequest
  expect(moveCalled).toBeFalsy()
  await expect(page.getByTestId('reparent-confirm-dialog')).toHaveCount(0)
})

test('dragging card over its descendant shows invalid drop tip and toast on drop', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await openWorkspace(page)
  const sourceNode = page.locator('.react-flow__node[data-id="3"]')
  const targetNode = page.locator('.react-flow__node[data-id="4"]')
  const srcBox = (await sourceNode.boundingBox())!
  const tgtBox = (await targetNode.boundingBox())!

  await page.mouse.move(srcBox.x + srcBox.width / 2, srcBox.y + srcBox.height / 2)
  await page.mouse.down()
  await page.mouse.move(tgtBox.x + tgtBox.width / 2, tgtBox.y + tgtBox.height / 2, { steps: 10 })
  await page.waitForTimeout(400)

  const tip = targetNode.locator('.axis-drop-bubble')
  await expect(tip).toBeVisible()
  await expect(tip).toContainText('不能挂到自己的下属下面')
  await page.mouse.up()

  await expect(page.getByText('不能挂到自己的下属下面')).toBeVisible()
  await expect(page.getByTestId('reparent-confirm-dialog')).toHaveCount(0)
})

test('zoom out below 0.6 switches to compact mode showing overdue chip and hiding task rows', async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await openWorkspace(page)
  const node = page.locator('.react-flow__node[data-id="1"]')
  await expect(page.getByTestId('axis-overview')).toBeVisible()

  const zoomInBtn = page.getByRole('button', { name: '放大' })
  for (let i = 0; i < 4; i++) {
    await zoomInBtn.click()
  }
  await expect(node.locator('.axis-card-tasks-panel')).toBeVisible()

  const zoomOutBtn = page.getByRole('button', { name: '缩小' })
  for (let i = 0; i < 6; i++) {
    await zoomOutBtn.click()
  }

  await expect(node.locator('.axis-card-tasks-panel')).toHaveCount(0)
  const compactStatus = node.locator('.axis-compact-status')
  await expect(compactStatus).toBeVisible()
  await expect(compactStatus).toContainText('逾期')
})
