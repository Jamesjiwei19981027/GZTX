import { test, expect } from '@playwright/test'
import { api, apiLogin, mailCode, readState, stamp, writeState, COMPANY } from './_h'

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })

test.describe.configure({ mode: 'serial' })

test('D01 超管建项目 + 邀请；手机网页受邀注册并进入项目', async ({ page, request }) => {
  const s = stamp()
  const { h } = await apiLogin(request)
  const proj = await api(request, h, 'post', '/projects', { name: `D-手机项目-${s}`, company_id: COMPANY })
  expect(proj.status, JSON.stringify(proj.body)).toBe(200)
  const projectId = proj.data.id
  const email = `D-m${s}@audit-d.example.com`.toLowerCase()
  const username = `D_m${s}`
  const password = 'Dtest-pass-123'
  const inv = await api(request, h, 'post', `/projects/${projectId}/invitations`, { email })
  expect(inv.status, JSON.stringify(inv.body)).toBe(200)
  writeState({ projectId, projectName: proj.data.name, member: { email, username, password }, inviteToken: inv.data.token })

  // 手机端打开邀请链接
  const consoleErrors: string[] = []
  const serverErrors: string[] = []
  page.on('response', r => { if (r.status() >= 500) serverErrors.push(`${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`) })
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()) })
  page.on('pageerror', e => consoleErrors.push('pageerror:' + e.message))
  page.on('response', async r => { if (r.url().includes('/auth/')) console.log('RESP', r.request().method(), r.url(), r.status()) })
  await page.goto(`/?invite=${encodeURIComponent(inv.data.token)}`)
  await expect(page.getByRole('heading', { name: '创建账户' })).toBeVisible()
  await page.screenshot({ path: 'e2e/real/D-mobile-web/shots/d01-register.png' })

  await page.getByLabel('用户名', { exact: true }).fill(username)
  await page.getByLabel('邮箱 *', { exact: true }).fill(email)
  const t0 = Date.now() - 2000
  // 网关对 /api/v1/auth/ 限 20 次/分钟（多区域共用同一 IP），遇到 429 退避重试
  let sendStatus = 0
  for (let i = 0; i < 8; i++) {
    const sendResp = page.waitForResponse(r => r.url().includes('/auth/send-code'))
    await page.getByRole('button', { name: '获取验证码' }).click()
    sendStatus = (await sendResp).status()
    if (sendStatus !== 429) break
    await page.waitForTimeout(8000)
  }
  expect(sendStatus).toBe(200)
  const code = await mailCode(request, email, t0)
  await page.getByLabel('邮箱验证码 *', { exact: true }).fill(code)
  await page.getByLabel('密码 *', { exact: true }).fill(password)
  await page.getByLabel('确认密码 *', { exact: true }).fill(password)
  const regResp = page.waitForResponse(r => r.url().includes('/auth/register'))
  await page.getByRole('button', { name: '注册并登录' }).click()
  const rr = await regResp
  expect(rr.status(), await rr.text()).toBe(201)
  const rj = await rr.json()
  expect(rj.data.project_id).toBe(projectId)
  // 进入工作台：底部导航出现
  await expect(page.getByRole('tab', { name: '工作' })).toBeVisible({ timeout: 20000 })
  await expect(page.getByRole('heading', { name: proj.data.name, exact: true, level: 1 })).toBeVisible({ timeout: 30000 })
  console.log('SERVER ERRORS', serverErrors)
  expect(serverErrors, '注册落地过程不应有服务端500').toEqual([])
  await page.screenshot({ path: 'e2e/real/D-mobile-web/shots/d01-after-register.png' })
  console.log('console errors after register:', consoleErrors)
  // 数据落地：成员在项目成员里
  const mem = await api(request, h, 'get', `/projects/${projectId}/members`)
  console.log('members', JSON.stringify(mem.data).slice(0, 400))
  const names = JSON.stringify(mem.data)
  expect(names).toContain(username)
  // 页面是否显示项目名
  const body = await page.locator('body').innerText()
  console.log('BODY AFTER REGISTER:\n', body.slice(0, 800))
})
