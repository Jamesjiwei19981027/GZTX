import { test, expect, type Page } from '@playwright/test'

async function mountAxis(page: Page, mobile: boolean, editable = true, delay: 'delete' | 'restore' | 'edit' | null = null) {
  const item = { id: 11, parent_id: 1, node_type_key: 'work_item', title: '交付方案', due_at: '2026-11-01T23:59:59', assignees: [{ user_id: 9, role_key: 'primary' }], progress_json: { percent: 20 }, children: [] }
  const later = { ...item, id: 12, title: '验收方案', due_at: '2026-11-03T23:59:59' }
  let deleted = false
  const writes: { method: string; path: string; body: unknown }[] = []
  let release: () => void = () => {}
  const held = new Promise<void>(resolve => { release = resolve })
  await page.route('**/api/v1/**', async route => {
    const request = route.request(), method = request.method()
    const path = new URL(request.url()).pathname.replace('/api/v1', '')
    let data: unknown = { items: [] }
    if (method === 'PATCH' && path === '/nodes/11') {
      const body = request.postDataJSON()
      writes.push({ method, path, body })
      if (delay === 'edit') await held
      Object.assign(item, body)
      data = item
    } else if (method === 'DELETE' && path === '/nodes/11') {
      if (delay === 'delete') await held
      deleted = true; writes.push({ method, path, body: null }); data = { id: 11, is_deleted: true }
    } else if (method === 'POST' && path === '/nodes/11/restore') {
      if (delay === 'restore') await held
      deleted = false; writes.push({ method, path, body: null }); data = item
    } else if (path === '/users/me') data = { id: 9, nickname: '王宁' }
    else if (path.endsWith('/my-permissions')) data = path.includes('/projects/2/') ? { is_pm: false, is_superadmin: false, can_edit_all: false, can_delete: false, owned_node_ids: [], node_permissions: { '2': { can_edit_person: false }, '21': { can_edit_person: false } } } : { is_pm: editable, is_superadmin: false, can_edit_all: editable, can_delete: editable, can_move: editable, owned_node_ids: [], can_read_evidence: true, node_permissions: { '1': { can_edit_person: editable }, '11': { can_edit_person: editable, can_manage_assignees: editable } } }
    else if (path.endsWith('/members')) data = { items: [{ user_id: 9, display_name: '王宁', role: 'pm' }, { user_id: 10, display_name: '林悦', role: 'member' }] }
    else if (/^\/projects\/\d+$/.test(path)) data = { id: 1, name: '人轴测试', pm_user_id: 9, company_id: 1 }
    else if (path.endsWith('/tree')) data = path.includes('/projects/2/')
      ? { project_id: 2, nodes: [{ id: 2, parent_id: null, node_type_key: 'person', title: '项目乙负责人', assignees: [{ user_id: 9, role_key: 'primary', display_name: '项目乙负责人' }], children: [{ ...later, id: 21, parent_id: 2, title: '项目乙事项' }] }] }
      : { project_id: 1, nodes: [{ id: 1, parent_id: null, node_type_key: 'person', title: '王宁', sort_order: 0, assignees: [{ user_id: 9, role_key: 'primary', display_name: '王宁' }], children: [...(deleted ? [] : [item]), later] }] }
    await route.fulfill({ json: { code: 200, data } })
  })
  await page.route(url => url.pathname === '/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html style="width:100%;height:100%"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0;width:100%;height:100%"><div id="root" style="width:100%;height:100%"></div>
    <script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
    <script type="module" src="/e2e/helpers/axis-matters-harness.tsx"></script></body></html>` }))
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  await page.goto(`/?mobile=${mobile}`)
  await expect(page.locator('#root'), errors.join('\n')).not.toBeEmpty({ timeout: 15000 })
  return { writes, errors, release }
}

test('手机事项编辑名称日期负责人，删除取消、确认和撤销均使用共享接口', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { writes, errors } = await mountAxis(page, true)
  await page.getByText('王宁 · 我', { exact: true }).click()
  await page.getByTestId('axis-matter-edit-11').click()
  await page.getByLabel('事项名称', { exact: true }).fill('新的交付方案')
  await page.getByLabel('截止日期', { exact: true }).fill('2026-12-10')
  await page.getByLabel('负责人', { exact: true }).selectOption('10')
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await expect(page.getByTestId('matter-edit-form')).toHaveCount(0)
  expect(writes[0]).toEqual({ method: 'PATCH', path: '/nodes/11', body: { title: '新的交付方案', due_at: '2026-12-10T23:59:59', assignees: [{ user_id: 10, role_key: 'primary' }] } })
  await page.getByText('王宁 · 我', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: '王宁 · 责任详情' }).getByText('新的交付方案', { exact: true })).toBeVisible()
  await page.getByTestId('axis-matter-delete-11').click()
  await page.getByRole('button', { name: '取消', exact: true }).click()
  expect(writes.filter(write => write.method === 'DELETE')).toHaveLength(0)
  await page.getByText('王宁 · 我', { exact: true }).click()
  await page.getByTestId('axis-matter-delete-11').click()
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await expect(page.getByTestId('mobile-matter-undo')).toBeVisible()
  await page.getByRole('button', { name: '撤销', exact: true }).click()
  await expect(page.getByTestId('mobile-matter-undo')).toHaveCount(0)
  await page.getByText('王宁 · 我', { exact: true }).click()
  await expect(page.getByTestId('axis-matter-edit-11')).toBeVisible()
  expect(writes.map(write => `${write.method} ${write.path}`)).toEqual(['PATCH /nodes/11', 'DELETE /nodes/11', 'POST /nodes/11/restore'])
  expect(errors).toEqual([])
})

for (const delay of ['delete', 'restore', 'edit'] as const) test(`手机人轴${delay}延迟完成不覆盖切换后的项目数据、权限或撤销入口`, async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { release, errors } = await mountAxis(page, true, true, delay)
  await page.getByText('王宁 · 我', { exact: true }).click()
  if (delay === 'edit') {
    await page.getByTestId('axis-matter-edit-11').click()
    await page.getByLabel('事项名称', { exact: true }).fill('项目甲迟到的编辑')
    const pending = page.waitForRequest(request => request.method() === 'PATCH' && request.url().endsWith('/nodes/11'))
    await page.getByRole('button', { name: '保存', exact: true }).click()
    await pending
  } else {
    await page.getByTestId('axis-matter-delete-11').click()
    const pending = page.waitForRequest(request => request.method() === 'DELETE' && request.url().endsWith('/nodes/11'))
    await page.getByRole('button', { name: '确认删除', exact: true }).click()
    await pending
    if (delay === 'restore') {
      await expect(page.getByTestId('mobile-matter-undo')).toBeVisible()
      const restoring = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/nodes/11/restore'))
      await page.getByRole('button', { name: '撤销', exact: true }).click()
      await restoring
    }
  }
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('axis-harness-project', { detail: '2' })))
  await expect(page.getByText('项目乙负责人 · 我', { exact: true })).toBeVisible()
  const finished = page.waitForResponse(response => response.request().method() === (delay === 'delete' ? 'DELETE' : delay === 'restore' ? 'POST' : 'PATCH') && response.url().endsWith(delay === 'restore' ? '/nodes/11/restore' : '/nodes/11'))
  release()
  await finished
  await page.waitForTimeout(200)
  await expect(page.getByText('项目乙负责人 · 我', { exact: true })).toBeVisible()
  await expect(page.getByTestId('mobile-matter-undo')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '新增主轴人员' })).toHaveCount(0)
  await page.getByText('项目乙负责人 · 我', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: '项目乙负责人 · 责任详情' }).getByText('项目乙事项', { exact: true })).toBeVisible()
  await expect(page.getByTestId('axis-matter-edit-21')).toHaveCount(0)
  await expect(page.getByTestId('axis-matter-delete-21')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('手机A到B再回A后，第一次A的编辑完成不能关闭新世代编辑表单', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  const { release } = await mountAxis(page, true, true, 'edit')
  await page.getByText('王宁 · 我', { exact: true }).click()
  await page.getByTestId('axis-matter-edit-11').click()
  await page.getByLabel('事项名称', { exact: true }).fill('第一次A的迟到编辑')
  const pending = page.waitForRequest(request => request.method() === 'PATCH' && request.url().endsWith('/nodes/11'))
  await page.getByRole('button', { name: '保存', exact: true }).click()
  await pending
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('axis-harness-project', { detail: '2' })))
  await expect(page.getByText('项目乙负责人 · 我', { exact: true })).toBeVisible()
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('axis-harness-project', { detail: '1' })))
  await page.getByText('王宁 · 我', { exact: true }).click()
  await page.getByTestId('axis-matter-edit-12').click()
  await page.getByLabel('事项名称', { exact: true }).fill('当前世代未保存输入')
  const finished = page.waitForResponse(response => response.request().method() === 'PATCH' && response.url().endsWith('/nodes/11'))
  release(); await finished
  await expect(page.getByTestId('matter-edit-form')).toBeVisible()
  await expect(page.getByLabel('事项名称', { exact: true })).toHaveValue('当前世代未保存输入')
  await expect(page.getByText('事项已更新', { exact: true })).toHaveCount(0)
})

for (const delay of ['delete', 'restore'] as const) test(`桌面${delay}延迟完成不在新项目显示旧事项撤销与提示`, async ({ page }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  const { release, errors } = await mountAxis(page, false, true, delay)
  await page.locator('.axis-map-card').first().click()
  await page.getByTestId('axis-matter-delete-11').click()
  const deleting = page.waitForRequest(request => request.method() === 'DELETE' && request.url().endsWith('/nodes/11'))
  await page.getByRole('button', { name: '确认删除', exact: true }).click()
  await deleting
  if (delay === 'restore') {
    const restoring = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/nodes/11/restore'))
    await page.getByRole('button', { name: '撤销', exact: true }).click()
    await restoring
  }
  await page.evaluate(() => window.dispatchEvent(new CustomEvent('axis-harness-project', { detail: '2' })))
  await expect(page.locator('.axis-map-card').filter({ hasText: '项目乙负责人' })).toBeVisible()
  const finished = page.waitForResponse(response => response.request().method() === (delay === 'delete' ? 'DELETE' : 'POST') && response.url().endsWith(delay === 'delete' ? '/nodes/11' : '/nodes/11/restore'))
  release(); await finished
  await page.waitForTimeout(200)
  await expect(page.getByTestId('matter-undo-bar')).toHaveCount(0)
  await expect(page.getByText('已撤销删除', { exact: true })).toHaveCount(0)
  await expect(page.locator('.axis-map-card').filter({ hasText: '项目乙负责人' })).toBeVisible()
  expect(errors).toEqual([])
})

test('只读成员手机事项没有编辑和删除入口', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await mountAxis(page, true, false)
  await page.getByText('王宁 · 我', { exact: true }).click()
  await expect(page.getByRole('dialog', { name: '王宁 · 责任详情' }).getByText('交付方案', { exact: true })).toBeVisible()
  await expect(page.getByTestId('axis-matter-edit-11')).toHaveCount(0)
  await expect(page.getByTestId('axis-matter-delete-11')).toHaveCount(0)
})

for (const mobile of [false, true]) test(`${mobile ? '手机' : '桌面'}树序时间序切换与横纵日期锚点`, async ({ page }) => {
  await page.setViewportSize({ width: mobile ? 390 : 1440, height: mobile ? 844 : 960 })
  const { errors } = await mountAxis(page, mobile)
  if (mobile) {
    await page.getByRole('button', { name: '项目全貌', exact: true }).click()
    await page.getByLabel('人轴排序').selectOption('time')
  } else await page.getByRole('button', { name: '时间序', exact: true }).click()
  await expect(page.getByTestId('axis-timeline-matter-11')).toBeVisible()
  await expect(page.getByTestId('axis-timeline-matter-12')).toBeVisible()
  if (mobile) {
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390)
    const orderBox = await page.getByLabel('人轴排序').boundingBox()
    expect(orderBox!.x).toBeGreaterThanOrEqual(0)
    expect(orderBox!.x + orderBox!.width).toBeLessThanOrEqual(390)
  }
  const early = Number(await page.getByTestId('axis-timeline-anchor-11').getAttribute('data-along'))
  const late = Number(await page.getByTestId('axis-timeline-anchor-12').getAttribute('data-along'))
  expect(late).toBeGreaterThan(early)
  const readTrunk = () => page.getByTestId('axis-timeline-trunk').evaluate(line => ({ x1: line.getAttribute('x1'), x2: line.getAttribute('x2'), y1: line.getAttribute('y1'), y2: line.getAttribute('y2') }))
  await page.getByRole('button', { name: '横向', exact: true }).click()
  await expect.poll(async () => { const line = await readTrunk(); return line.y1 === line.y2 && line.x1 !== line.x2 }).toBe(true)
  await expect.poll(() => page.locator('.react-flow__node[data-id="timeline-11"]').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41)).toBe(early - 110)
  await expect.poll(() => page.locator('.react-flow__node[data-id="timeline-12"]').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m41)).toBe(late - 110)
  await page.getByRole('button', { name: '纵向', exact: true }).click()
  await expect.poll(async () => { const line = await readTrunk(); return line.x1 === line.x2 && line.y1 !== line.y2 }).toBe(true)
  await expect.poll(() => page.locator('.react-flow__node[data-id="timeline-11"]').evaluate(node => new DOMMatrixReadOnly(getComputedStyle(node).transform).m42)).toBe(early - 44)
  await page.screenshot({ path: `.tools/axis-${mobile ? 'mobile' : 'desktop'}-timeline.png` })
  if (mobile) await page.getByLabel('人轴排序').selectOption('tree')
  else await page.getByRole('button', { name: '树序', exact: true }).click()
  await expect(page.getByTestId('axis-timeline-matter-11')).toHaveCount(0)
  expect(await page.evaluate(() => localStorage.getItem('people_axis_order_mode'))).toBe('tree')
  expect(errors).toEqual([])
})
