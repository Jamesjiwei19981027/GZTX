import { test, expect } from '@playwright/test'
import { api, apiLogin, bootPage, readState, SHOT } from './_h'

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })

async function login(page: any, request: any, admin = false) {
  const st = readState()
  const m = admin ? await apiLogin(request) : await apiLogin(request, st.member.username, st.member.password)
  const errors: string[] = []
  page.on('pageerror', (e: Error) => errors.push(e.message))
  await bootPage(page, m.tokens)
  await page.getByRole('tab', { name: '工作' }).waitFor()
  await page.waitForTimeout(1500)
  return { st, m, errors }
}
async function pickProject(page: any, name: string) {
  await page.getByRole('button', { name: '项目列表' }).click()
  await page.waitForTimeout(800)
  await page.getByText(name).first().click()
  await page.waitForTimeout(1200)
}
const buttons = async (page: any) => (await page.locator('button:visible').allInnerTexts()).map((s: string) => s.replace(/\s+/g, ' ').trim()).filter(Boolean)

for (const role of ['member', 'admin'] as const) {
  test(`D50-1 项目详情页入口（${role}）：成员不应看到“项目设置/邀请新成员”，超管应能看到`, async ({ page, request }) => {
    const { st } = await login(page, request, role === 'admin')
    await pickProject(page, st.projectName)
    await page.getByRole('button', { name: '查看项目详情' }).first().click()
    await page.waitForTimeout(1500)
    await page.screenshot({ path: SHOT + `d50-1-overview-${role}.png` })
    const bs = await buttons(page)
    const labels = await page.locator('[aria-label]:visible').evaluateAll((els: Element[]) => els.map(e => e.getAttribute('aria-label')))
    console.log(role, 'OVERVIEW BUTTONS', JSON.stringify(bs), 'ARIA', JSON.stringify(labels))
    const hasSettings = labels.includes('项目设置')
    const hasInvite = bs.some(b => b.includes('邀请新成员'))
    if (role === 'admin') { expect(hasSettings && hasInvite).toBe(true) }
    else {
      expect(hasSettings || hasInvite, '成员不应看到管理类入口').toBe(false)
    }
  })
}

test('D50-2 成员项目详情隐藏邀请入口，直调邀请被服务端拒绝', async ({ page, request }) => {
  const { st, m } = await login(page, request)
  await pickProject(page, st.projectName)
  await page.getByRole('button', { name: '查看项目详情' }).first().click()
  await expect(page.getByText('邀请新成员加入')).toHaveCount(0)
  const inv = await api(request, m.h, 'post', `/projects/${st.projectId}/invitations`, { email: `d-denied-${Date.now()}@audit.example.com` })
  expect(inv.status).toBe(403)
  expect(inv.body.message).toMatch(/需要 PM|权限/)
})

test('D50-3 超管：汇报入口（选项目后）能看到“我的汇报”与“下属汇报”', async ({ page, request }) => {
  const { st } = await login(page, request, true)
  await pickProject(page, st.projectName)
  await page.getByRole('button', { name: '查看汇报' }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: SHOT + 'd50-3-hub-admin.png' })
  const txt = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log('HUB ADMIN', txt.slice(0, 700))
  expect(txt).toContain('我的汇报')
  expect(txt).toContain('下属汇报')
})

test('D50-4 成员：汇报入口（选项目后）有“我的汇报”、无“下属汇报”；写汇报按钮可点', async ({ page, request }) => {
  const { st } = await login(page, request)
  await pickProject(page, st.projectName)
  await page.getByRole('button', { name: '查看汇报' }).click()
  await page.waitForTimeout(2000)
  await page.screenshot({ path: SHOT + 'd50-4-hub-member.png' })
  const txt = (await page.locator('body').innerText()).replace(/\s+/g, ' ')
  console.log('HUB MEMBER', txt.slice(0, 700))
  expect(txt).toContain('我的汇报')
  expect(txt).not.toContain('下属汇报')
  await page.getByRole('button', { name: /写汇报|继续编辑/ }).click()
  await page.waitForTimeout(1500)
  await page.screenshot({ path: SHOT + 'd50-4-report-editor.png' })
  console.log('EDITOR', JSON.stringify(await buttons(page)))
})

test('D50-5 人轴 > 事项 > 记录进展 > 返回：应回到人轴而不是工作台', async ({ page, request }) => {
  const { st } = await login(page, request)
  await pickProject(page, st.projectName)
  await page.getByRole('tab', { name: '人轴' }).click()
  await page.waitForTimeout(1500)
  await page.getByText('D-事项一').first().click()
  await page.waitForTimeout(1200)
  await expect(page.getByText('记录进展').first()).toBeVisible()
  await page.getByRole('button', { name: '返回' }).first().click()
  await page.waitForTimeout(1000)
  await page.screenshot({ path: SHOT + 'd50-5-axis-back.png' })
  await expect(page.getByRole('tab', { name: '人轴' })).toHaveAttribute('aria-selected', 'true')
})
