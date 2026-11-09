import { expect, test } from '@playwright/test'
import { invitedProject, mockWorkspaceApi, useWorkspaceSession } from './helpers/workspace-api'

for (const leave of ['back', 'tab', 'back-and-reopen'] as const) {
  test(`邀请详情响应迟到时保留用户的新导航：${leave}`, async ({ page }) => {
    await mockWorkspaceApi(page)
    await useWorkspaceSession(page)
    await page.setViewportSize({ width: 390, height: 844 })
    let release!: () => void
    const waiting = new Promise<void>(resolve => { release = resolve })
    let detailStarted = false
    await page.route('**/projects/invitations/*/accept', route => route.fulfill({ json: { code: 200, data: { project_id: invitedProject.id, role: 'member' } } }))
    await page.route(`**/api/v1/projects/${invitedProject.id}`, async route => {
      detailStarted = true
      await waiting
      await route.fulfill({ json: { code: 200, data: invitedProject } })
    })
    await page.goto('/?mobile=1')
    await page.getByRole('button', { name: '项目列表', exact: true }).click()
    await page.getByRole('button', { name: '使用邀请加入项目', exact: true }).click()
    await page.getByRole('textbox', { name: '邀请码', exact: true }).fill('delayed-invite')
    await page.getByRole('button', { name: '接受并进入项目', exact: true }).click()
    await expect.poll(() => detailStarted).toBe(true)
    if (leave === 'tab') {
      await page.getByRole('tab', { name: '消息', exact: true }).click()
    } else {
      await page.getByRole('button', { name: '取消', exact: true }).click()
      if (leave === 'back-and-reopen') {
        await page.getByRole('button', { name: '使用邀请加入项目', exact: true }).click()
      }
    }
    const expected = leave === 'tab' ? 'messages-root' : leave === 'back-and-reopen' ? 'invite-accept' : 'project-switch'
    await expect.poll(() => page.evaluate(() => (window as any).__MOBILE_NAV__?.activeRoute.screen)).toBe(expected)
    const detailResponse = page.waitForResponse(response => new URL(response.url()).pathname === `/api/v1/projects/${invitedProject.id}`)
    release()
    await (await detailResponse).finished()
    await page.evaluate(() => new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))
    await expect.poll(() => page.evaluate(() => (window as any).__MOBILE_NAV__?.activeRoute.screen)).toBe(expected)
    await expect(page.getByRole('heading', { name: invitedProject.name, exact: true, level: 1 })).toHaveCount(0)
  })
}
