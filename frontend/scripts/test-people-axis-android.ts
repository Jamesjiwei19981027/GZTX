/** Run against a debug Android WebView forwarded with adb, using the joint-debug fixture. */
import { chromium, expect, type Locator } from '@playwright/test'
import { mkdir } from 'node:fs/promises'

const endpoint = process.env.AXIS_ANDROID_CDP
const projectId = process.env.AXIS_LIVE_PROJECT_ID
if (!endpoint || !projectId) throw new Error('Set AXIS_ANDROID_CDP and AXIS_LIVE_PROJECT_ID for the isolated joint-debug environment')
const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true })
try {
  const page = browser.contexts()[0]?.pages()[0]
  if (!page) throw new Error('No Android WebView page found')
  const origin = new URL(page.url()).origin
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const cdp = await page.context().newCDPSession(page)
  const tap = async (locator: Locator) => {
    await expect(locator).toBeVisible()
    await locator.scrollIntoViewIfNeeded()
    const box = await locator.boundingBox()
    if (!box) throw new Error('Touch target has no bounds')
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: box.x + box.width / 2, y: box.y + box.height / 2 }] })
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
  }
  await page.goto(`${origin}/?view=people-axis`)
  if (await page.getByPlaceholder('用户名 / 邮箱 / 手机号').count()) {
    await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill('axis_pm')
    await page.locator('input[type="password"]').fill(process.env.AXIS_LIVE_PASSWORD || 'axis-debug-2026')
    await tap(page.locator('form button[type="submit"]'))
    await expect(page.getByRole('heading', { name: '欢迎回来' })).toHaveCount(0)
  }
  const username = await page.evaluate(async () => {
    const response = await fetch('/api/v1/users/me', { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } })
    return (await response.json()).data?.username
  })
  expect(username, 'Use the dedicated axis_pm joint-debug account').toBe('axis_pm')
  await tap(page.getByRole('tab', { name: '人轴', exact: true }))
  await page.locator('.axis-project-picker select, .mobile-axis-project-picker select').selectOption(projectId)
  const card = page.getByTestId('axis-chain-node-3')
  await expect(card).toContainText('林悦')
  const dimensions = await card.evaluate(el => ({ card: el.clientWidth, heading: el.querySelector('.axis-person-heading')!.clientWidth }))
  expect(dimensions.heading, 'WebView card contents should stretch across the card').toBeGreaterThan(dimensions.card - 35)
  await mkdir('android-acceptance/test-results/axis', { recursive: true })
  await page.screenshot({ path: 'android-acceptance/test-results/axis/chain.png' })
  await tap(card)
  const detail = page.getByRole('dialog', { name: '节点详情' })
  await expect(detail).toContainText('交互原型设计')
  await tap(detail.getByRole('button', { name: '添加事项', exact: true }))
  const form = page.getByRole('dialog', { name: '添加事项' })
  const title = `Android 联调事项${Date.now()}`
  await form.locator('input').first().fill(title)
  const submitted = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(`/projects/${projectId}/nodes`))
  await tap(form.locator('button[type="submit"]'))
  const result = await (await submitted).json()
  expect(result.code).toBe(200)
  expect(result.data.parent_id).toBe(3)
  await expect(form).toHaveCount(0)
  await tap(card)
  await expect(detail.getByText(title, { exact: true })).toBeVisible()
  await page.screenshot({ path: 'android-acceptance/test-results/axis/detail.png' })
  await tap(detail.getByRole('button', { name: '关闭', exact: true }))
  await tap(page.getByRole('tab', { name: '总览', exact: true }))
  for (const name of ['纵向', '横向']) {
    await tap(page.getByRole('button', { name, exact: true }))
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await expect.poll(() => page.locator('.react-flow__node[data-id="3"]').evaluate(el => el.getBoundingClientRect().width > 0)).toBeTruthy()
    await page.screenshot({ path: `android-acceptance/test-results/axis/overview-${name === '纵向' ? 'vertical' : 'horizontal'}.png` })
  }
  const readZoom = async () => Number((await page.locator('.axis-zoom-readout').innerText()).replace('%', ''))
  const beforeZoom = await readZoom()
  await tap(page.getByRole('button', { name: '放大', exact: true }))
  await expect.poll(readZoom).toBeGreaterThan(beforeZoom)
  await tap(page.getByRole('button', { name: '适配全部节点', exact: true }))
  await tap(page.locator('.react-flow__node[data-id="3"]'))
  await expect(page.getByTestId('axis-node-preview')).toContainText('林悦')
  await tap(page.getByRole('button', { name: '查看详情', exact: true }))
  await expect(detail.getByText(title, { exact: true })).toBeVisible()
  await tap(detail.getByRole('button', { name: '关闭', exact: true }))
  await tap(page.getByRole('button', { name: '查看详情', exact: true }))
  await tap(detail.getByRole('button', { name: '管理责任关系', exact: true }))
  const moved = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/nodes/3/move'))
  await tap(page.locator('.react-flow__node[data-id="5"]'))
  expect((await (await moved).json()).code).toBe(200)
  await expect(page.getByText('点击人员设为直属上级', { exact: true })).toHaveCount(0)
  await tap(page.getByRole('button', { name: '查看详情', exact: true }))
  await tap(detail.getByRole('button', { name: '管理责任关系', exact: true }))
  const restored = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/nodes/3/move'))
  await tap(page.getByRole('button', { name: '移至主干', exact: true }))
  const restoreBody = await (await restored).json()
  expect(restoreBody.code).toBe(200)
  expect(restoreBody.data.parent_id).toBeNull()
  await expect(page.getByText('点击人员设为直属上级', { exact: true })).toHaveCount(0)
  // Exercise the restored management actions in the real Android WebView.
  let personId: number | undefined
  try {
    await tap(page.getByRole('tab', { name: '责任链', exact: true }))
    await tap(page.getByTestId('axis-chain-node-7').locator('xpath=..').getByRole('button', {name:'新增下级',exact:true}))
    const addPerson = page.getByRole('dialog', {name:'添加责任人'})
    await expect(addPerson.getByRole('combobox', {name:'直属上级'})).toHaveValue('7')
    await tap(addPerson.getByRole('button', {name:'手动填写',exact:true}))
    await addPerson.getByPlaceholder('如: 史蒂夫·乔布斯').fill(`Android 下级${Date.now()}`)
    await addPerson.getByPlaceholder('如: 华为技术支持组').fill('移动研发部')
    await addPerson.getByPlaceholder('例如: 实时协同网关责任专家...').fill('移动端负责人')
    const createdPerson = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(`/projects/${projectId}/nodes`))
    await tap(addPerson.locator('button[type="submit"]'))
    const createdData = (await (await createdPerson).json()).data
    personId = createdData.id
    expect(createdData.parent_id).toBe(7)
    expect(createdData.node_origin).toBe('subordinate')
    await expect(addPerson).toHaveCount(0)
    const personCard = page.getByTestId(`axis-chain-node-${personId}`)
    await expect(personCard).toContainText('三级负责人')
    await expect(personCard).toContainText('下辖分支')
    await tap(personCard.locator('xpath=..').getByRole('button', {name:'编辑人员',exact:true}))
    const edit = page.getByRole('dialog', {name:'编辑人员'})
    await expect(edit.getByLabel('所属部门')).toHaveValue('移动研发部')
    await edit.getByLabel('项目岗位').fill('Android 交付负责人')
    await edit.getByLabel('材料提交范围').selectOption('responsible')
    await edit.getByLabel('允许负责人新增下级').uncheck()
    await edit.getByLabel('允许负责人新增事项').uncheck()
    await edit.locator('.axis-permission-fields').scrollIntoViewIfNeeded()
    await page.screenshot({path:'android-acceptance/test-results/axis/node-permission-settings.png',animations:'disabled'})
    await tap(edit.getByRole('button', {name:'保存修改',exact:true}))
    await expect(edit).toHaveCount(0)
    await expect(personCard).toContainText('Android 交付负责人')
    await personCard.scrollIntoViewIfNeeded()
    await page.screenshot({path:'android-acceptance/test-results/axis/management-chain.png'})
    await tap(personCard.locator('xpath=..').getByRole('button', {name:'编辑人员',exact:true}))
    await expect(edit.getByLabel('材料提交范围')).toHaveValue('responsible')
    await expect(edit.getByLabel('允许负责人新增下级')).not.toBeChecked()
    await expect(edit.getByLabel('允许负责人新增事项')).not.toBeChecked()
    await tap(edit.getByRole('button',{name:'关闭',exact:true}))
    await tap(page.getByRole('tab', {name:'总览',exact:true}))
    for (const direction of ['纵向','横向']) {
      await tap(page.getByRole('button',{name:direction,exact:true}))
      const branch = page.locator(`.react-flow__node[data-id="${personId}"]`)
      await expect(branch.locator('[data-node-origin="subordinate"]')).toBeVisible()
      await expect(page.locator(`.react-flow__node[data-id="7"] .axis-subordinate-port`)).toBeVisible()
      expect(await page.locator('g[data-attachment-kind="subordinate"]').count()).toBeGreaterThan(0)
    }
    const personNode = page.locator(`.react-flow__node[data-id="${personId}"]`)
    await tap(personNode)
    await tap(page.getByRole('button',{name:'定位',exact:true}))
    await expect.poll(readZoom).toBeGreaterThanOrEqual(85)
    const moving = page.getByRole('button', {name:'调整位置',exact:true})
    await tap(moving)
    await expect(moving).toHaveAttribute('aria-pressed','true')
    const position = () => personNode.evaluate(el => {const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform); return {x:m.m41,y:m.m42}})
    await page.screenshot({path:'android-acceptance/test-results/axis/subordinate-port-closeup.png',animations:'disabled'})
    // The overview controls can overlap the card center above the preview sheet.
    // Drag its visible name area, as a person would on the small WebView.
    const box = (await personNode.locator('.axis-person-label').boundingBox())!
    const start = {x:box.x+box.width/2,y:box.y+box.height/2}
    const layoutSaved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith(`/nodes/${personId}/layout`), {timeout:7000})
    await cdp.send('Input.dispatchTouchEvent', {type:'touchStart',touchPoints:[start]})
    for (let i=1;i<=12;i++) await cdp.send('Input.dispatchTouchEvent', {type:'touchMove',touchPoints:[{x:start.x-i*3,y:start.y-i*4}]})
    await cdp.send('Input.dispatchTouchEvent', {type:'touchEnd',touchPoints:[]})
    expect((await layoutSaved).status()).toBe(200)
    const after = await position()
    await page.screenshot({path:'android-acceptance/test-results/axis/management-drag.png'})
    await expect(page.locator('.axis-zoom-readout')).toHaveText('85%')
    await page.reload()
  await tap(page.getByRole('tab', { name: '人轴', exact: true }))
    await page.locator('.axis-project-picker select, .mobile-axis-project-picker select').selectOption(projectId)
    await tap(page.getByRole('tab', {name:'总览',exact:true}))
    await tap(page.getByRole('button', {name:'横向',exact:true}))
    await expect(personNode).toContainText('Android 交付负责人')
    await expect.poll(position).toEqual(after)
    const data = await page.evaluate(async id => {
      const response = await fetch(`/api/v1/nodes/${id}`, {headers:{Authorization:`Bearer ${localStorage.getItem('access_token')}`}})
      return (await response.json()).data
    }, personId)
    expect(data.parent_id).toBe(7)
    expect(data.description).toContain('移动研发部')
    expect(data.node_origin).toBe('subordinate')
    expect(data.responsibility_permissions).toEqual({evidence_submit:'responsible',allow_add_subordinates:false,allow_add_work_items:false})
    expect(Math.abs(data.ui_offset.x)+Math.abs(data.ui_offset.y)).toBeGreaterThan(30)
    await page.screenshot({path:'android-acceptance/test-results/axis/management-reloaded.png'})
  } finally {
    if (personId) {
      const status = await page.evaluate(async id => (await fetch(`/api/v1/nodes/${id}`, {method:'DELETE',headers:{Authorization:`Bearer ${localStorage.getItem('access_token')}`}})).status, personId)
      expect(status).toBe(200)
      await page.reload()
    }
  }
  expect(errors).toEqual([])
  console.log(JSON.stringify({ status: 'passed', platform: 'Android WebView', projectId, createdItemId: result.data.id, cardWidths: dimensions, checks: ['login', 'card stretching', 'touch detail', 'create item', 'vertical/horizontal overview', 'zoom/fit', 'preview', 'reparent/restore', 'add third-level person', 'edit person and department', 'configure and reopen node permissions', 'distinct subordinate ports in both orientations', 'touch drag', 'reload persistence'], viewport: await page.evaluate(() => ({ width: innerWidth, height: innerHeight, dpr: devicePixelRatio })) }))
} finally {
  await browser.close()
}
