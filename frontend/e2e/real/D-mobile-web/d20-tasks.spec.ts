import { test, expect } from '@playwright/test'
import { api, apiLogin, bootPage, readState, SHOT, COMPANY } from './_h'

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })

async function loginMember(page: any, request: any) {
  const st = readState()
  const m = await apiLogin(request, st.member.username, st.member.password)
  const errors: string[] = []
  page.on('pageerror', (e: Error) => errors.push(e.message))
  await bootPage(page, m.tokens)
  await page.getByRole('tab', { name: '工作' }).waitFor()
  await page.waitForTimeout(1500)
  return { st, m, errors }
}
const taskStatus = async (request: any, h: any, title: string) => {
  const r = await api(request, h, 'get', '/tasks?page_size=100')
  const t = (r.data?.items || []).find((x: any) => x.title === title)
  return t
}

test('D20-1 手机端工作台：完成本次任务并可撤销，状态真实落库', async ({ page, request }) => {
  const { m, errors } = await loginMember(page, request)
  const title = `D-完成验证-${Date.now()}`
  const created = await api(request, m.h, 'post', '/tasks', { title, status: 0, due_date: '2020-01-01T00:00:00Z' })
  expect(created.status).toBe(201)
  const id = created.data.id
  try {
    await page.reload()
    const row = page.getByRole('button').filter({ has: page.getByText(title, { exact: true }) }).filter({ has: page.getByRole('button', { name: '完成任务', exact: true }) })
    await expect(row).toBeVisible()
    const done = page.waitForResponse(r => r.url().endsWith(`/tasks/${id}/complete`) && r.request().method() === 'PATCH')
    await row.getByRole('button', { name: '完成任务', exact: true }).click()
    expect((await done).status()).toBe(200)
    expect((await api(request, m.h, 'get', `/tasks/${id}`)).data.status).toBe(2)
    await expect(page.getByText('任务详情', { exact: true })).toHaveCount(0)
    await page.reload()
    const undo = page.waitForResponse(r => r.url().endsWith(`/tasks/${id}/uncomplete`) && r.request().method() === 'PATCH')
    await page.getByTestId(`workbench-uncomplete-${id}`).click()
    expect((await undo).status()).toBe(200)
    expect((await api(request, m.h, 'get', `/tasks/${id}`)).data.status).toBe(0)
    expect(errors).toEqual([])
  } finally { await api(request, m.h, 'delete', `/tasks/${id}`) }
})

test('D20-2 手机端新建任务：个人范围（全盘总览）→ 落库为个人任务', async ({ page, request }) => {
  const { m } = await loginMember(page, request)
  const title = `D-新建个人任务-${Date.now().toString(36)}`
  await page.getByRole('button', { name: '新建任务' }).click()
  await expect(page.getByText('任务所属范围：个人私有待办')).toBeVisible()
  await page.getByPlaceholder('例如：准备项目月度交付汇报材料').fill(title)
  await page.screenshot({ path: SHOT + 'd20-2-new-task.png' })
  const resp = page.waitForResponse(r => r.url().includes('/api/v1/tasks') && r.request().method() === 'POST')
  await page.getByRole('button', { name: /^(保存|创建|保存任务|创建任务)/ }).last().click()
  const r = await resp
  expect(r.status()).toBe(201 === r.status() ? 201 : 200)
  const t = await taskStatus(request, m.h, title)
  expect(t, '任务应已落库').toBeTruthy()
  expect(t.project_id ?? null).toBeNull()
})

test('D20-3 手机端新建任务：选中具体项目后新建（受邀成员、未验手机）', async ({ page, request }) => {
  const { st, m } = await loginMember(page, request)
  await page.getByRole('button', { name: '项目列表' }).click()
  await page.waitForTimeout(800)
  await page.screenshot({ path: SHOT + 'd20-3-projects.png' })
  await page.getByText(st.projectName).first().click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: SHOT + 'd20-3-after-pick.png' })
  // D-1：成员/超管都没验手机，而 PHONE_VERIFICATION_REQUIRED=false → 不应被“手机验证”拦住
  await page.getByRole('button', { name: '新建任务' }).click()
  await expect(page.getByText(`任务所属范围：项目【${st.projectName}】`)).toBeVisible()
  const title = `D-项目任务-${Date.now().toString(36)}`
  await page.getByPlaceholder('例如：准备项目月度交付汇报材料').fill(title)
  const resp = page.waitForResponse(r => r.url().includes('/api/v1/tasks') && r.request().method() === 'POST')
  await page.getByRole('button', { name: /^(保存|创建|保存任务|创建任务)/ }).last().click()
  const r = await resp
  await page.screenshot({ path: SHOT + 'd20-3-project-task-result.png' })
  console.log('PROJECT TASK CREATE STATUS', r.status(), (await r.text()).slice(0, 200))
  expect(r.status()).toBeLessThan(300)
  const t = await taskStatus(request, m.h, title)
  expect(t?.project_id).toBe(st.projectId)
})
