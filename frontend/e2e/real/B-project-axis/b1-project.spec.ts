import { test, expect } from '@playwright/test'
import { apiLogin, bootPage, api, sharedMember, stamp, allProjects } from './_h'

test.use({ actionTimeout: 15_000, viewport: { width: 1440, height: 900 } })
test.setTimeout(120_000)

test('B1 项目：新建(团队页)、切换(顶栏+人轴)、成员邀请邮件、后端归档/指定PM', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push('pageerror ' + e.message))
  page.on('console', m => { if (m.type() === 'error' && !/favicon|429/.test(m.text())) errors.push('console ' + m.text()) })
  const { tokens, h } = await apiLogin(request)
  const t = stamp()
  const name = `B-项目UI${t}`
  // 另备一个项目用于切换
  const other = await api(request, h, 'post', '/projects', { name: `B-项目另一个${t}`, company_id: 1 })
  expect(other.status).toBe(200)

  await bootPage(page, tokens, '/?view=team')
  await page.getByRole('button', { name: '创建项目' }).click()
  await page.getByPlaceholder(/Q3 交付/).fill(name)
  const created = page.waitForResponse(r => r.url().endsWith('/api/v1/projects') && r.request().method() === 'POST')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  const resp = await created
  expect(resp.status()).toBe(200)
  const proj = (await resp.json()).data
  // 落地：接口列表里有，公司=1，PM=创建人
  const list = await allProjects(request, h)
  const row = list.find((p: any) => p.id === proj.id)
  expect(row?.name).toBe(name); expect(row.company_id).toBe(1); expect(row.pm_user_id).toBe(1)
  // 创建后自动成为当前项目（顶栏显示）
  await expect(page.locator('header, nav').getByText(name).first()).toBeVisible()
  await expect(page.getByText('项目已创建')).toBeVisible()

  // 顶栏项目切换
  await page.locator('button:has(.material-symbols-outlined:text("expand_more"))').first().click()
  await page.getByRole('button', { name: new RegExp(`B-项目另一个${t}`) }).click()
  await expect(page.locator('header, nav').getByText(`B-项目另一个${t}`).first()).toBeVisible()
  // 团队页成员列表跟随项目：另一个项目只有 PM 自己
  await expect(page.getByText('auditadmin').first()).toBeVisible()

  // 邀请成员（团队页 邀请 → 邮件）
  const inviteMail = `b-inv-${t}@audit.example.com`
  await page.getByRole('button', { name: /邀请$/ }).click()
  await page.locator('input[type=email]').fill(inviteMail)
  const inv = page.waitForResponse(r => /\/projects\/\d+\/invitations/.test(r.url()) && r.request().method() === 'POST')
  await page.locator('form button[type=submit]').click()
  expect((await inv).status()).toBe(200)
  await expect(page.getByText(/worktodo:\/\/|invit|邀请/i).first()).toBeVisible()
  // 生效：邮件进 mailpit
  let got = 0
  for (let i = 0; i < 12 && !got; i++) {
    const j = await (await request.get('http://127.0.0.1:8025/api/v1/search?query=' + encodeURIComponent('to:' + inviteMail))).json()
    got = j.messages?.length || 0
    if (!got) await page.waitForTimeout(500)
  }
  test.info().annotations.push({ type: '邀请邮件进mailpit', description: String(got) })
  expect(got, '邀请邮件应真实到达 mailpit').toBeGreaterThan(0)
  // 邮件必须真实送达捕获服务。

  // 人轴页内项目选择器切换
  await page.goto('/?view=people-axis')
  await page.locator('.axis-project-picker select, select[aria-label="选择项目"]').first().selectOption({ label: name })
  await expect(page.getByText(name).first()).toBeVisible()

  // 项目管理接口与 PM 权限；网页设置的行为由 B1b 验证。
  const m = await sharedMember(request, h, proj.id)
  const asg = await api(request, h, 'post', `/projects/${proj.id}/pm`, { user_id: m.id })
  test.info().annotations.push({ type: '指定PM接口', description: String(asg.status) })
  expect(asg.status).toBe(200)
  const after = await api(request, h, 'get', `/projects/${proj.id}`)
  expect(after.data.pm_user_id).toBe(m.id)
  // 非 PM（超管仍可）；普通成员不能再指定 PM
  const own = await api(request, (await apiLogin(request, m.username, 'Bmember-Pass-2026x')).h, 'post', `/projects/${proj.id}/pm`, { user_id: 1 })
  expect(own.status, '新 PM 可改回').toBe(200)
  expect((await api(request, h, 'get', `/projects/${proj.id}`)).data.pm_user_id).toBe(1)
  // 归档
  const arch = await api(request, h, 'post', `/projects/${proj.id}/archive`)
  expect(arch.status).toBe(200)
  expect(arch.data.status).toBe('archived')
  expect(errors, errors.join('\n')).toEqual([])
})

test('B1b 项目设置：改名、归档只读、取消归档均真实落库', async ({ page, request }) => {
  const { tokens, h } = await apiLogin(request)
  const name = `B-项目设置${stamp()}`
  const pr = await api(request, h, 'post', '/projects', { name, company_id: 1 })
  expect(pr.status, JSON.stringify(pr.body)).toBe(200)
  const pid = pr.data.id
  await bootPage(page, tokens, '/?view=people-axis')
  await page.locator('.axis-project-picker select').first().selectOption({ label: name })
  await page.getByTestId('axis-project-settings').click()
  const dlg = page.getByRole('dialog', { name: '项目设置' })
  await expect(dlg).toBeVisible()
  await dlg.getByLabel('项目名称').fill(name + '-改名')
  const save = page.waitForResponse(r => r.url().endsWith(`/projects/${pid}`) && r.request().method() === 'PATCH')
  await dlg.getByRole('button', { name: '保存项目信息' }).click()
  expect((await save).status()).toBe(200)
  expect((await api(request, h, 'get', `/projects/${pid}`)).data.name).toBe(name + '-改名')
  await dlg.getByRole('button', { name: '关闭', exact: true }).click()
  await page.reload()
  await page.locator('.axis-project-picker select').first().selectOption({ label: name + '-改名' })
  await page.getByTestId('axis-project-settings').click()
  await expect(dlg.getByLabel('项目名称')).toHaveValue(name + '-改名')
  await dlg.getByRole('button', { name: '归档此项目' }).click()
  const arch = page.waitForResponse(r => r.url().endsWith(`/projects/${pid}/archive`))
  await dlg.getByRole('button', { name: '确认归档' }).click()
  expect((await arch).status()).toBe(200)
  expect((await api(request, h, 'get', `/projects/${pid}`)).data.status).toBe('archived')
  await expect(dlg.getByLabel('项目名称')).toBeDisabled()
  const denied = await api(request, h, 'post', `/projects/${pid}/nodes`, { node_type_key: 'person', title: 'B-归档禁止写入' })
  expect(denied.status).toBe(409)
  expect(denied.body.message).toMatch(/归档|只读/)
  const unarch = page.waitForResponse(r => r.url().endsWith(`/projects/${pid}/unarchive`))
  await dlg.getByRole('button', { name: '取消归档', exact: true }).click()
  expect((await unarch).status()).toBe(200)
  await expect(dlg.getByLabel('项目名称')).toBeEnabled()
  expect((await api(request, h, 'get', `/projects/${pid}`)).data.status).toBe('active')
})
