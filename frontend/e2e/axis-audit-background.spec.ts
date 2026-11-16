import { test, expect } from '@playwright/test'
import { build } from 'esbuild'
import { readFile } from 'node:fs/promises'
import type { AuditRun } from '../src/api/shell'

// 真实挂载共享组件，接口在浏览器边界拦截；不需要启动业务服务。
test('后台审计在桌面和手机共享页恢复、完成并隔离旧项目响应', async ({ page }) => {
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { AuditPanel } from './src/features/audits/AuditPanel'; const root=createRoot(document.getElementById('root')); window.showProject=(id)=>root.render(id ? <AuditPanel projectId={id} projectName={'项目 '+id}/> : null); window.showProject(3);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' },
  })
  const css = await readFile('src/features/audits/audits.css', 'utf8')
  const running: AuditRun = { id: 8, project_id: 3, scope: 'self', mode: 'rule', status: 'running', generated_at: '2026-11-16T08:00:00Z', restricted: false, mode_message: '规则检查已完成', overall_risk: 'medium', nodes: [{ node_id: 2, title: '设计负责人', risk_level: 'medium', summary: '规则材料待核验', findings: [], suggested_actions: [] }] }
  const finished: AuditRun = { ...running, status: 'done', mode: 'ai', mode_message: 'AI 审计已完成', nodes: [{ ...running.nodes[0], summary: 'AI 已核验交付材料' }] }
  let detailCount = 0
  let submitted = 0
  let releaseOld: (() => Promise<void>) | undefined
  await page.route('https://audit.test/**', async route => {
    const url = new URL(route.request().url())
    if (url.pathname === '/') return route.fulfill({ contentType: 'text/html', body: `<style>body{margin:0}${css}</style><div id="root"></div><script>localStorage.setItem('access_token','audit-test-owner');${bundle.outputFiles[0].text}</script>` })
    const detail = /\/audits\/(\d+)$/.exec(url.pathname)
    if (detail) detailCount++
    const data = url.pathname.endsWith('audit-options') ? { can_manage: false, scopes: [{ scope: 'self', label: '本人信息' }], people: [] }
      : route.request().method() === 'POST' ? { ...running, id: 8 + ++submitted }
      : detail ? { ...finished, id: Number(detail[1]) }
      // 首次 AI 在 POST 返回后、列表刷新前已完成，详情仍须补取并替换。
      : { items: url.pathname.includes('/3/') ? [...Array.from({ length: submitted }, (_, i) => ({ ...(i === 0 ? finished : running), id: 9 + i })), detailCount ? finished : running] : [], has_more: false }
    const fulfill = () => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 200, data }) })
    if (detail && detailCount === 3) { releaseOld = fulfill; return }
    await fulfill()
  })
  await page.clock.install()
  await page.goto('https://audit.test/')
  await expect(page.locator('.audit-history')).toContainText('进行中')
  await page.clock.runFor(5000)
  await expect(page.locator('.audit-history')).toContainText('已完成')
  expect(detailCount).toBe(1)

  await page.getByRole('button', { name: '开始审计' }).click()
  await expect(page.getByLabel('审计详情')).toContainText('AI 正在审计，通常需要 1～3 分钟，可以离开此页，完成后在历史里查看')
  await expect(page.getByRole('button', { name: '开始审计' })).toBeEnabled()
  await page.setViewportSize({ width: 390, height: 844 })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.clock.runFor(5000)
  await expect.poll(() => detailCount).toBe(2)
  await expect(page.getByLabel('审计详情')).toContainText('AI 已核验交付材料')
  await expect(page.getByLabel('审计详情')).not.toContainText('AI 正在审计')
  await page.getByRole('button', { name: '开始审计' }).click()
  await expect(page.getByLabel('审计详情')).toContainText('AI 正在审计')
  await page.clock.runFor(5000)
  await expect.poll(() => !!releaseOld).toBe(true)
  await page.evaluate(() => (window as unknown as { showProject: (id: number) => void }).showProject(4))
  await expect(page.getByText('暂无审计记录')).toBeVisible()
  await releaseOld!()
  await expect(page.getByLabel('审计详情')).toHaveCount(0)
  await page.clock.runFor(10000)
  expect(detailCount).toBe(3)
  await page.evaluate(() => (window as unknown as { showProject: (id: number) => void }).showProject(3))
  await expect(page.locator('.audit-history')).toContainText('进行中')
  await page.evaluate(() => (window as unknown as { showProject: (id: number) => void }).showProject(0))
  await page.clock.runFor(10000)
  expect(detailCount).toBe(3)
})

for (const crossTab of [true, false]) for (const switchUser of [true, false]) test(`${crossTab ? '跨标签' : '同标签'}${switchUser ? '切换同项目用户清空审计并丢弃旧负责人详情' : '同用户 access token 续期保留审计并接收在途结果'}`, async ({ page, context }) => {
  const token = (sub: string, exp: number) => `header.${Buffer.from(JSON.stringify({ sub, exp })).toString('base64url')}.signature`
  const ownerToken = token('1', 100)
  const memberToken = token('2', 300)
  const bundle = await build({
    stdin: { contents: `import React from 'react'; import { createRoot } from 'react-dom/client'; import { AuditPanel } from './src/features/audits/AuditPanel'; import { setToken } from './src/api/client'; window.updateAuditToken=setToken; createRoot(document.getElementById('root')).render(<AuditPanel projectId={3}/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' },
  })
  const owner: AuditRun = { id: 8, project_id: 3, scope: 'project', mode: 'rule', status: 'running', generated_at: '2026-11-16T08:00:00Z', restricted: false, mode_message: '规则检查', overall_risk: 'medium', nodes: [{ node_id: 2, title: '仅负责人可见的完整审计', summary: '负责人规则结果', risk_level: 'medium', findings: [], suggested_actions: [] }] }
  const complete: AuditRun = { ...owner, mode: 'ai', status: 'done', nodes: [{ ...owner.nodes[0], summary: '负责人 AI 完整结果' }] }
  const member: AuditRun = { ...owner, id: 9, scope: 'self', status: 'done', restricted: true, nodes: [] }
  let detailCount = 0
  let optionsCount = 0
  let releaseOwner: (() => Promise<void>) | undefined
  await context.route('https://audit-session.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script>localStorage.setItem('access_token', ${JSON.stringify(ownerToken)});${bundle.outputFiles[0].text}</script>` })
    if (path === '/auth-tab') return route.fulfill({ contentType: 'text/html', body: '<p>登录标签</p>' })
    const isMember = route.request().headers().authorization === `Bearer ${memberToken}`
    const isLoggedOut = !route.request().headers().authorization
    if (isLoggedOut) return route.fulfill({ status: 401, contentType: 'application/json', body: JSON.stringify({ code: 401, message: '请重新登录' }) })
    const data = path.endsWith('audit-options') ? (++optionsCount, { can_manage: !isMember, scopes: [{ scope: 'self', label: '本人信息' }], people: [] })
      : path.endsWith('/audits/8') ? (++detailCount, detailCount === 1 ? owner : complete)
      : { items: [isMember ? member : owner], has_more: false }
    const fulfill = () => route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 200, data }) })
    if (path.endsWith('/audits/8') && detailCount === 2) { releaseOwner = fulfill; return }
    await fulfill()
  })
  await page.clock.install()
  await page.goto('https://audit-session.test/')
  await page.getByRole('button', { name: '查看审计记录 8' }).click()
  await expect(page.getByLabel('审计详情')).toContainText('仅负责人可见的完整审计')
  await page.clock.runFor(5000)
  await expect.poll(() => !!releaseOwner).toBe(true)
  const authTab = crossTab ? await context.newPage() : null
  if (authTab) await authTab.goto('https://audit-session.test/auth-tab')
  const changeToken = async (value: string | null) => {
    if (authTab) await authTab.evaluate(next => { if (next) localStorage.setItem('access_token', next); else localStorage.removeItem('access_token') }, value)
    else await page.evaluate(next => (window as unknown as { updateAuditToken: (value: string | null) => void }).updateAuditToken(next), value)
  }
  if (switchUser) {
    await changeToken(null)
    await expect(page.getByLabel('审计详情')).toHaveCount(0)
    await changeToken(memberToken)
    await expect(page.getByRole('button', { name: '查看审计记录 9' })).toBeVisible()
    await releaseOwner!()
    await expect(page.getByLabel('审计详情')).toHaveCount(0)
    await expect(page.locator('body')).not.toContainText('仅负责人可见的完整审计')
    await page.clock.runFor(20000)
    expect(detailCount).toBe(2)
  } else {
    await changeToken(token('1', 200))
    await expect(page.getByLabel('审计详情')).toContainText('负责人规则结果')
    await releaseOwner!()
    await expect(page.getByLabel('审计详情')).toContainText('负责人 AI 完整结果')
    expect(optionsCount).toBe(1)
  }
  await authTab?.close()
})

test('首次渲染与订阅之间换用户后使用新会话结束加载', async ({ page }) => {
  const token = (sub: string) => `header.${Buffer.from(JSON.stringify({ sub })).toString('base64url')}.signature`
  const ownerToken = token('1')
  const memberToken = token('2')
  const bundle = await build({
    stdin: { contents: `import React, { useLayoutEffect } from 'react'; import { createRoot } from 'react-dom/client'; import { AuditPanel } from './src/features/audits/AuditPanel'; import { setToken } from './src/api/client'; function Harness(){useLayoutEffect(()=>setToken(${JSON.stringify(memberToken)}),[]); return <AuditPanel projectId={3}/>}; createRoot(document.getElementById('root')).render(<Harness/>);`, resolveDir: process.cwd(), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', loader: { '.css': 'empty' }, define: { 'import.meta.env': '{}' },
  })
  await page.route('https://audit-mount.test/**', async route => {
    const path = new URL(route.request().url()).pathname
    if (path === '/') return route.fulfill({ contentType: 'text/html', body: `<div id="root"></div><script>localStorage.setItem('access_token',${JSON.stringify(ownerToken)});${bundle.outputFiles[0].text}</script>` })
    expect(route.request().headers().authorization).toBe(`Bearer ${memberToken}`)
    const data = path.endsWith('audit-options') ? { can_manage: false, scopes: [{ scope: 'self', label: '成员本人范围' }], people: [] } : { items: [], has_more: false }
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ code: 200, data }) })
  })
  await page.goto('https://audit-mount.test/')
  await expect(page.getByRole('combobox', { name: '审计范围' })).toContainText('成员本人范围')
  await expect(page.getByText('正在加载审计范围与历史…')).toHaveCount(0)
  await expect(page.getByRole('button', { name: '开始审计' })).toBeEnabled()
})
