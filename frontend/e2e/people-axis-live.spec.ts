import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

// Opt in against the dedicated, seeded joint-debug database; never mock API calls.
const projectId = process.env.AXIS_LIVE_PROJECT_ID
test.skip(!projectId, 'Set AXIS_LIVE_PROJECT_ID after seeding the isolated joint-debug backend')
const password = process.env.AXIS_LIVE_PASSWORD || 'axis-debug-2026'

async function boot(page: Page, request: APIRequestContext, username = 'axis_pm') {
  page.on('pageerror', error => { throw error })
  const response = await request.post('/api/v1/auth/login', { data: { username, password } })
  expect(response.ok()).toBeTruthy()
  const { data } = await response.json()
  await page.addInitScript(tokens => {
    localStorage.setItem('access_token', tokens.access_token)
    localStorage.setItem('refresh_token', tokens.refresh_token)
  }, data)
  await page.goto('/?view=people-axis')
  await page.locator('.axis-project-picker select').selectOption(projectId!)
  await expect(page.getByTestId('axis-chain-node-3').or(page.locator('.react-flow__node[data-id="3"]'))).toBeVisible()
  await expect(page.getByRole('status').filter({ hasText: '已同步' })).toBeVisible()
  return { Authorization: `Bearer ${data.access_token}` }
}

async function tree(request: APIRequestContext, headers: Record<string, string>) {
  const response = await request.get(`/api/v1/projects/${projectId}/tree`, { headers })
  expect(response.ok()).toBeTruthy()
  return (await response.json()).data.nodes as Array<{ id: number; parent_id: number | null; title: string; children: any[] }>
}

test('node permissions persist, govern real members and distinguish subordinate attachments', async ({ page, request, browser }) => {
  await page.setViewportSize({width:1420,height:960})
  const headers = await boot(page, request)
  let branchId: number | undefined
  const memberContext = await browser.newContext({viewport:{width:1420,height:960}})
  try {
    const created = await request.post(`/api/v1/projects/${projectId}/nodes`, {headers,data:{
      parent_id:7,node_type_key:'person',title:`权限联调${Date.now()}`,node_origin:'subordinate',
      assignees:[{user_id:2,role_key:'primary'}],
    }})
    expect(created.ok()).toBeTruthy()
    branchId = (await created.json()).data.id
    const item = await request.post(`/api/v1/projects/${projectId}/nodes`, {headers,data:{parent_id:branchId,node_type_key:'work_item',title:'权限联调材料事项'}})
    expect(item.ok()).toBeTruthy()
    const itemId = (await item.json()).data.id
    await page.reload()
    await page.locator('.axis-project-picker select').selectOption(projectId!)
    await page.getByRole('tab',{name:'责任链',exact:true}).click()
    const card = page.getByTestId(`axis-chain-node-${branchId}`)
    await expect(card).toContainText('下辖分支')
    await card.locator('xpath=..').getByRole('button',{name:'编辑人员',exact:true}).click()
    const edit = page.getByRole('dialog',{name:'编辑人员'})
    await edit.getByLabel('材料提交范围').selectOption('disabled')
    await edit.getByLabel('允许负责人新增下级').uncheck()
    await edit.getByLabel('允许负责人新增事项').uncheck()
    await page.screenshot({path:test.info().outputPath('node-permission-settings.png')})
    await edit.getByRole('button',{name:'保存修改',exact:true}).click()
    await expect(edit).toHaveCount(0)
    const member = await memberContext.newPage()
    const memberHeaders = await boot(member, request, 'axis_member')
    const memberCard = member.getByTestId(`axis-chain-node-${branchId}`)
    await memberCard.click()
    const detail = member.getByTestId('axis-inspector')
    await expect(detail.getByRole('button',{name:'添加事项',exact:true})).toHaveCount(0)
    await expect(detail.getByRole('button',{name:'新增下级',exact:true})).toHaveCount(0)
    await expect(detail.getByRole('button',{name:'提交材料',exact:true})).toHaveCount(0)
    await member.screenshot({path:test.info().outputPath('member-node-permissions.png')})
    expect((await request.post(`/api/v1/nodes/${itemId}/evidence`,{headers:memberHeaders,data:{summary_text:'禁止提交时应拒绝'}})).status()).toBe(403)
    expect((await request.patch(`/api/v1/nodes/${branchId}`,{headers:memberHeaders,data:{responsibility_permissions:{evidence_submit:'members'}}})).status()).toBe(403)
    await detail.getByRole('button',{name:'编辑人员',exact:true}).click()
    const memberEdit = member.getByRole('dialog',{name:'编辑人员'})
    await expect(memberEdit.getByLabel('材料提交范围')).toHaveCount(0)
    await memberEdit.getByLabel('项目岗位').fill('受限分支负责人')
    const saved = member.waitForResponse(r=>r.request().method()==='PATCH' && r.url().endsWith(`/nodes/${branchId}`))
    await memberEdit.getByRole('button',{name:'保存修改',exact:true}).click()
    expect((await saved).ok()).toBeTruthy()
    await expect(memberEdit).toHaveCount(0)
    const policyChanged = await request.patch(`/api/v1/nodes/${branchId}`,{headers,data:{responsibility_permissions:{evidence_submit:'responsible',allow_add_subordinates:true,allow_add_work_items:true}}})
    expect(policyChanged.ok()).toBeTruthy()
    await member.reload()
    await member.locator('.axis-project-picker select').selectOption(projectId!)
    await memberCard.click()
    await expect(detail.getByRole('button',{name:'提交材料',exact:true})).toBeVisible()
    expect((await request.post(`/api/v1/nodes/${itemId}/evidence`,{headers:memberHeaders,data:{summary_text:'分支负责人可以提交材料'}})).ok()).toBeTruthy()
    const readerLogin = await request.post('/api/v1/auth/login',{data:{username:'axis_reader',password}})
    const readerToken = (await readerLogin.json()).data.access_token
    expect((await request.post(`/api/v1/nodes/${itemId}/evidence`,{headers:{Authorization:`Bearer ${readerToken}`},data:{summary_text:'未负责此分支的成员应拒绝'}})).status()).toBe(403)
    await page.reload()
    await page.locator('.axis-project-picker select').selectOption(projectId!)
    await page.getByRole('tab',{name:'总览',exact:true}).click()
    for (const name of ['纵向','横向']) {
      await page.getByRole('button',{name,exact:true}).click()
      const node = page.locator(`.react-flow__node[data-id="${branchId}"]`)
      await expect(node.locator('[data-node-origin="subordinate"]')).toBeVisible()
      await expect(page.locator('g[data-attachment-kind="subordinate"]')).toHaveCount(1)
      await expect(page.getByRole('button',{name:'下辖挂载点 · 前端工程师',exact:true})).toBeVisible()
      await page.screenshot({path:test.info().outputPath(`subordinate-${name==='纵向'?'vertical':'horizontal'}.png`)})
    }
  } finally {
    await memberContext.close()
    if(branchId) expect((await request.delete(`/api/v1/nodes/${branchId}`,{headers})).ok()).toBeTruthy()
  }
})

test('live desktop overview and inspector persist across both orientations', async ({ page, request }) => {
  await page.setViewportSize({ width: 1440, height: 960 })
  await boot(page, request)
  await page.locator('.react-flow__node[data-id="3"]').click()
  await expect(page.getByTestId('axis-inspector')).toContainText('林悦')
  await expect(page.getByTestId('axis-inspector')).toContainText('交互原型设计')
  for (const name of ['纵向', '横向']) {
    await page.getByRole('button', { name, exact: true }).click()
    await expect(page.getByRole('button', { name, exact: true })).toHaveAttribute('aria-pressed', 'true')
    await page.getByRole('button', { name: '适配全部节点' }).click()
    await expect(page.locator('.axis-map-card.is-terminal')).toBeVisible()
    await expect(page.locator('.axis-terminal-badge')).toBeVisible()
  }
  await page.screenshot({ path: test.info().outputPath('live-desktop-overview.png') })
})

test('manager adds deeper people, edits their role and persists a dragged position', async ({ page, request }) => {
  await page.setViewportSize({ width: 1420, height: 960 })
  const headers = await boot(page, request)
  await page.getByRole('tab', { name: '责任链', exact: true }).click()
  await page.getByTestId('axis-chain-node-7').locator('xpath=..').getByRole('button', { name: '新增下级', exact: true }).click()
  const form = page.getByRole('dialog', { name: '添加责任人' })
  await expect(form.getByRole('combobox', { name: '直属上级' })).toHaveValue('7')
  await form.getByRole('button', { name: '手动填写', exact: true }).click()
  await form.getByPlaceholder('如: 史蒂夫·乔布斯').fill(`管理联调人员${Date.now()}`)
  await form.getByPlaceholder('例如: 实时协同网关责任专家...').fill('客户端联调负责人')
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(`/projects/${projectId}/nodes`))
  await form.locator('button[type="submit"]').click()
  const created = (await (await response).json()).data
  expect(created.parent_id).toBe(7)
  const card = page.getByTestId(`axis-chain-node-${created.id}`)
  await expect(card).toContainText('三级负责人')
  await card.locator('xpath=..').getByRole('button', { name: '编辑人员', exact: true }).click()
  const edit = page.getByRole('dialog', { name: '编辑人员' })
  await expect(edit.getByLabel('项目岗位')).toHaveValue('客户端联调负责人')
  await edit.getByLabel('关联成员').selectOption('1')
  await edit.getByLabel('项目岗位').fill('客户端交付负责人')
  await edit.getByRole('button', { name: '保存修改', exact: true }).click()
  await expect(edit).toHaveCount(0)
  await expect(card).toContainText('王宁')
  await expect(card).toContainText('客户端交付负责人')
  await page.getByRole('tab', { name: '总览', exact: true }).click()
  const node = page.locator(`.react-flow__node[data-id="${created.id}"]`)
  await expect(node).toBeVisible()
  const position = () => node.evaluate(el => { const m = new DOMMatrixReadOnly((el as HTMLElement).style.transform); return {x:m.m41,y:m.m42} })
  const box = (await node.boundingBox())!
  const saved = page.waitForResponse(r => r.request().method() === 'PUT' && r.url().endsWith(`/nodes/${created.id}/layout`))
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down()
  await page.mouse.move(box.x + box.width / 2 - 38, box.y + box.height / 2 - 50, { steps: 12 })
  await page.mouse.up()
  expect((await saved).status()).toBe(200)
  const after = await position()
  const data = (await (await request.get(`/api/v1/nodes/${created.id}`, {headers})).json()).data
  expect(data.parent_id).toBe(7)
  expect(data.assignees[0].user_id).toBe(1)
  expect(data.description).toContain('客户端交付负责人')
  expect(Math.abs(data.ui_offset.x) + Math.abs(data.ui_offset.y)).toBeGreaterThan(30)
  await page.reload()
  await page.locator('.axis-project-picker select').selectOption(projectId!)
  await expect(node).toContainText('客户端交付负责人')
  await expect.poll(position).toEqual(after)
  expect((await request.delete(`/api/v1/nodes/${created.id}`, {headers})).status()).toBe(200)
})
