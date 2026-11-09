import { expect, test } from '@playwright/test'
import { companyId, invitedProject, mockWorkspaceApi, useWorkspaceSession } from './helpers/workspace-api'

for (const mobile of [false, true]) {
  test(`${mobile ? '手机' : '桌面'}企业关闭密码时隐藏密码与验证码，仅展示可用钉钉入口`, async ({ page }) => {
    await mockWorkspaceApi(page)
    await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
    await page.route('**/auth/registration-config', route => route.fulfill({ json: { code: 200, data: {
      mode: 'invite_only', phone_required: false, login_methods: { password: false, dingtalk: true },
    } } }))
    await page.route('**/sso/options', route => route.fulfill({ json: { code: 200, data: { items: [
      { provider: 'dingtalk', company_id: companyId, company_name: '验收企业' },
    ] } } }))
    await page.goto(mobile ? '/?mobile=1' : '/')
    await expect(page.getByText('请使用企业已启用的登录入口', { exact: true })).toBeVisible()
    await expect(page.getByLabel('账号', { exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '验证码登录', exact: true })).toHaveCount(0)
    await expect(page.getByRole('button', { name: '钉钉扫码登录', exact: true })).toBeVisible()
    await page.route('**/sso/options', route => route.fulfill({ json: { code: 200, data: { items: [] } } }))
    await page.reload()
    await expect(page.getByText('请使用企业已启用的登录入口', { exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: '钉钉扫码登录', exact: true })).toHaveCount(0)
  })
}

test('手机项目列表可手动接受邀请，失败保留输入，成功进入被邀请项目', async ({ page }) => {
  await mockWorkspaceApi(page)
  await useWorkspaceSession(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const accepts: string[] = []
  await page.route('**/projects/invitations/*/accept', async route => {
    accepts.push(new URL(route.request().url()).pathname)
    expect(route.request().method()).toBe('POST')
    if (route.request().url().includes('/invalid/')) return route.fulfill({ status: 410, json: { code: 410, message: '邀请已失效' } })
    await route.fulfill({ json: { code: 200, data: { project_id: invitedProject.id, role: 'member' } } })
  })
  await page.goto('/?mobile=1')
  await page.getByRole('button', { name: '项目列表', exact: true }).click()
  await expect(page.getByRole('button', { name: /创建公司|新建公司/ })).toHaveCount(0)
  await page.getByRole('button', { name: '使用邀请加入项目', exact: true }).click()
  await expect(page.getByRole('heading', { name: '接受项目协同邀请', exact: true })).toBeVisible()
  const token = page.getByRole('textbox', { name: '邀请码', exact: true })
  await token.fill('invalid')
  await page.getByRole('button', { name: '接受并进入项目', exact: true }).click()
  await expect(page.getByText('该邀请链接已失效或已被使用', { exact: true })).toBeVisible()
  await expect(token).toHaveValue('invalid')
  await token.fill('https://work.example/?invite=valid-invite')
  await page.getByRole('button', { name: '接受并进入项目', exact: true }).click()
  await expect.poll(() => page.evaluate(() => (window as any).__MOBILE_NAV__?.activeRoute)).toMatchObject({ screen: 'project-overview', params: { projectId: String(invitedProject.id) } })
  await expect(page.getByRole('heading', { name: invitedProject.name, exact: true, level: 1 })).toBeVisible()
  expect(accepts).toEqual(['/api/v1/projects/invitations/invalid/accept', '/api/v1/projects/invitations/valid-invite/accept'])
  await page.getByRole('button', { name: '返回', exact: true }).click()
  await expect(page.getByRole('heading', { name: '切换工作区与项目', exact: true })).toBeVisible()
})

test('消息列表可打开聊天提取并调用真实接口边界，失败保留文本，浏览器返回关闭弹层', async ({ page }) => {
  await mockWorkspaceApi(page)
  await useWorkspaceSession(page)
  await page.setViewportSize({ width: 390, height: 844 })
  const extractions: unknown[] = []
  await page.route('**/tasks/extract-from-chat', async route => {
    extractions.push(route.request().postDataJSON())
    await route.fulfill({ status: 503, json: { code: 503, message: '模型尚未配置' } })
  })
  await page.goto('/?mobile=1&view=messages')
  await page.getByRole('button', { name: '从聊天提取任务', exact: true }).click()
  const sheet = page.getByRole('dialog', { name: '从聊天提取任务', exact: true })
  await expect(sheet).toBeVisible()
  await sheet.getByRole('textbox').fill('请周五前完成测试报告')
  await sheet.getByRole('button', { name: '开始智能提取任务', exact: true }).click()
  await expect(sheet.getByText('提取失败: 模型尚未配置', { exact: true })).toBeVisible()
  await expect(sheet.getByRole('textbox')).toHaveValue('请周五前完成测试报告')
  expect(extractions).toEqual([{ chat_text: '请周五前完成测试报告', company_id: companyId, project_id: null }])
  await expect.poll(() => page.evaluate(() => (window as any).__MOBILE_NAV__?.overlay?.id)).toBe('extract-chat')
  await page.goBack()
  await expect(sheet).toHaveCount(0)
  await expect(page.getByRole('button', { name: '从聊天提取任务', exact: true })).toBeVisible()
})

for (const mobile of [false, true]) {
  for (const target of ['member@example.test', '13800138000']) {
    test(`${mobile ? '手机共享登录' : '桌面登录'}通过${target.includes('@') ? '邮箱' : '短信'}验证码重置密码并回到登录`, async ({ page }) => {
      await mockWorkspaceApi(page, { registrationConfig: { mode: 'invite_only', phone_required: false } })
      await page.setViewportSize(mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 })
      const codes: unknown[] = []
      const resets: unknown[] = []
      await page.route('**/auth/send-code', async route => {
        codes.push(route.request().postDataJSON())
        await route.fulfill({ json: { code: 200, data: { ok: true, cooldown_seconds: 60 } } })
      })
      await page.route('**/auth/reset-password', async route => {
        expect(route.request().method()).toBe('POST')
        resets.push(route.request().postDataJSON())
        if (resets.length === 1) return route.fulfill({ status: 400, json: { code: 400, message: '验证码无效或已过期' } })
        await route.fulfill({ json: { code: 200, data: null } })
      })
      await page.goto(mobile ? '/?mobile=1' : '/')
      await page.getByTestId('forgot-password-link').click()
      const form = page.getByTestId('reset-password-form')
      await form.getByRole('textbox').first().fill(target)
      await form.getByRole('button', { name: '获取验证码', exact: true }).click()
      await expect(page.getByText('如果该账号存在，验证码已发送，请查收', { exact: true })).toBeVisible()
      await form.locator('input[maxlength="6"]').fill('123456')
      await form.getByLabel('新密码', { exact: true }).fill('new-password-123')
      await form.getByLabel('确认新密码', { exact: true }).fill('different-password')
      await form.getByRole('button', { name: '重置密码', exact: true }).click()
      await expect(page.getByText('两次输入的密码不一致', { exact: true })).toBeVisible()
      expect(resets).toEqual([])
      await form.getByLabel('确认新密码', { exact: true }).fill('new-password-123')
      await form.getByRole('button', { name: '重置密码', exact: true }).click()
      await expect(page.getByText('验证码无效或已过期', { exact: true })).toBeVisible()
      await expect(form.getByRole('textbox').first()).toHaveValue(target)
      await form.getByRole('button', { name: '重置密码', exact: true }).click()
      await expect(page.getByText('密码已重置，请使用新密码登录', { exact: true })).toBeVisible()
      await expect(page.getByLabel('账号', { exact: true })).toHaveValue(target)
      const channel = target.includes('@') ? 'email' : 'sms'
      expect(codes).toEqual([{ channel, target, purpose: 'reset_password' }])
      expect(resets).toEqual([1, 2].map(() => ({ channel, target, code: '123456', new_password: 'new-password-123' })))
      expect(await page.evaluate(() => localStorage.getItem('access_token'))).toBeNull()
    })
  }
}
