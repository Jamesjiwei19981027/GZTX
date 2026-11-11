import { test, expect } from '@playwright/test'
import { api, apiLogin, bootPage, readState, SHOT } from './_h'

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })

async function login(page: any, request: any) {
  const st = readState()
  const m = await apiLogin(request, st.member.username, st.member.password)
  await bootPage(page, m.tokens)
  await page.getByRole('tab', { name: '工作' }).waitFor()
  await page.waitForTimeout(1500)
  page.setDefaultTimeout(10000)
  return { st, m }
}
async function pickProject(page: any, name: string) {
  await page.getByRole('button', { name: '项目列表' }).click()
  await page.waitForTimeout(700)
  await page.getByText(name).first().click()
  await page.waitForTimeout(1000)
}

test('D70-1 成员：项目详情隐藏管理入口，邀请接口明确拒绝', async ({ page, request }) => {
  const { st, m } = await login(page, request)
  const direct = await api(request, m.h, 'post', `/projects/${st.projectId}/invitations`, { email: 'd-nope@audit.example.com' })
  console.log('MEMBER INVITE API', direct.status, JSON.stringify(direct.body).slice(0, 120))
  expect(direct.status).toBe(403)
  await pickProject(page, st.projectName)
  await page.getByRole('button', { name: '查看项目详情' }).first().click()
  await expect(page.getByText('邀请新成员加入')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '项目设置' })).toHaveCount(0)
  await expect(page.getByText(st.projectName).first()).toBeVisible()

})

test('D70-2 消息：在频道发一条消息 → 落库（接口可查到）', async ({ page, request }) => {
  const { m } = await login(page, request)
  await page.getByRole('tab', { name: '消息' }).click()
  await page.waitForTimeout(1000)
  await page.getByText('项目冲刺组').first().click()
  await page.waitForTimeout(800)
  const text = `D-消息-${Date.now().toString(36)}`
  const box = page.locator('textarea, input[type="text"]').last()
  await box.fill(text)
  const resp = page.waitForResponse(r => r.request().method() === 'POST' && /messages/.test(r.url()))
  await page.getByRole('button', { name: '发送' }).click()
  const r = await resp
  console.log('SEND MSG', r.status(), r.url().replace(/^.*\/api\/v1/, ''))
  expect(r.status()).toBeLessThan(300)
  await expect(page.getByText(text).first()).toBeVisible()
  const messages = await api(request, m.h, 'get', new URL(r.url()).pathname.replace('/api/v1', ''))
  expect(messages.status).toBe(200)
  expect(JSON.stringify(messages.data)).toContain(text)
  await page.screenshot({ path: SHOT + 'd70-2-chat.png' })
})

test('D70-3 记录进展（选中项目）：保存成功后在我的汇报中读到草稿', async ({ page, request }) => {
  const { st, m } = await login(page, request)
  await pickProject(page, st.projectName)
  await page.getByRole('button', { name: '记录进展' }).first().click()
  const text = `D-进展-${Date.now().toString(36)}`
  await page.getByLabel('进展与事实内容').fill(text)
  await page.getByRole('button', { name: /下一步/ }).click()
  await page.waitForTimeout(2500)
  await page.screenshot({ path: SHOT + 'd70-3-confirm.png' })
  console.log('CONFIRM BTNS', JSON.stringify((await page.locator('button:visible').allInnerTexts()).map(s => s.replace(/\s+/g, ' '))))
  const save = page.getByRole('button', { name: /确认存为/ }).last()
  const resp = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith(`/projects/${st.projectId}/agent-reports/note-draft`))
  await save.click()
  const r = await resp
  console.log('SAVE PROGRESS', r.status(), r.url().replace(/^.*\/api\/v1/, ''))
  await expect(page.getByTestId('record-progress-toast')).toBeVisible()
  console.log('TOAST', await page.getByTestId('record-progress-toast').innerText())
  await page.waitForTimeout(2000)
  await page.screenshot({ path: SHOT + 'd70-3-saved.png' })
  expect(r.status()).toBeLessThan(300)
  const drafts = await api(request, m.h, 'get', `/reports/my?project_id=${st.projectId}`)
  expect(drafts.status).toBe(200)
  expect(JSON.stringify(drafts.data)).toContain(text)
  await page.getByTestId('record-progress-view-reports').click()
  await expect(page.getByRole('heading', { name: '写汇报', exact: true })).toBeVisible()
  await expect(page.getByLabel('已完成汇报内容')).toHaveValue(new RegExp(text))
})
