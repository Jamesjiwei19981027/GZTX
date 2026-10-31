/** Real Android touches + real API, using only disposable Wiki entries. */
import { chromium, expect, type Locator } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'

const endpoint = 'http://127.0.0.1:9222'
const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true })
const page = browser.contexts()[0].pages()[0]
const run = promisify(execFile)
const adb = 'C:/Users/11580/AppData/Local/Android/Sdk/platform-tools/adb.exe'
const out = 'android-acceptance/test-results/personal-knowledge'
const created: number[] = []
const checks: string[] = []
const errors: string[] = []
page.on('pageerror', error => errors.push(error.message))
page.setDefaultTimeout(20000)
await mkdir(out, { recursive: true })
async function coordinates(box: { x: number; y: number }) {
  const targets = await (await fetch(endpoint + '/json/list')).json() as Array<{ url: string; description: string }>
  const view = JSON.parse(targets.find(target => target.url === page.url())!.description)
  const ratio = await page.evaluate(() => devicePixelRatio)
  return [String(Math.round(view.screenX + box.x * ratio)), String(Math.round(view.screenY + box.y * ratio))]
}
async function tap(locator: Locator) {
  const ime = (await run(adb, ['-s', 'emulator-5554', 'shell', 'dumpsys', 'input_method'])).stdout
  if (/mInputShown=true/.test(ime)) {
    await run(adb, ['-s', 'emulator-5554', 'shell', 'input', 'keyevent', '111'])
  }
  await locator.scrollIntoViewIfNeeded()
  await locator.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await expect.poll(() => locator.evaluate(el => {
    const b = el.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
    return hit === el || (hit !== null && el.contains(hit))
  })).toBe(true)
  const b = (await locator.boundingBox())!
  await run(adb, ['-s', 'emulator-5554', 'shell', 'input', 'tap', ...await coordinates({ x: b.x + b.width / 2, y: b.y + b.height / 2 })])
}
const passed = (text: string) => { checks.push(text); console.log('PASS ' + text) }
try {
  await page.goto('http://127.0.0.1:5177/')
  await tap(page.getByRole('tab', { name: '我的', exact: true }))
  await tap(page.getByText('我的知识空间', { exact: true }))
  await expect(page.getByRole('heading', { name: '我的知识空间', exact: true })).toBeVisible()
  await page.getByLabel('知识空间项目').selectOption('1')
  await expect(page.getByRole('button', { name: '记一条', exact: true })).toBeEnabled()
  passed('APP 我的入口打开当前项目私人 Wiki，真实后端读取成功')
  const stamp = Date.now()
  const titles = [`安卓知识验收A-${stamp}`, `安卓知识验收B-${stamp}`]
  for (const title of titles) {
    await tap(page.getByRole('button', { name: '记一条', exact: true }))
    await page.getByLabel('正文', { exact: true }).fill(title + '\n安卓知识空间验收资料。')
    
    
    const saved = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/personal-knowledge/entries'))
    await tap(page.getByRole('button', { name: '保存笔记', exact: true }))
    const response = await saved
    expect(response.status()).toBe(200)
    created.push((await response.json()).data.id)
    await expect(page.getByRole('status')).toContainText('笔记已保存')
    await tap(page.getByRole('button', { name: '关闭', exact: true }))
  }
  passed('通过 APP 表单新建两条含正文标签的 Wiki，并保存到真实数据库')
  await page.getByText('更多', { exact: true }).click(); await page.getByRole('button', { name: '手动调整关联', exact: true }).click(); await page.getByLabel('关联起点', { exact: true }).selectOption(String(created[0]))
  await page.getByLabel('关联终点', { exact: true }).selectOption(String(created[1]))
  await page.getByLabel('关联说明', { exact: true }).fill('提供验收依据')
  await tap(page.getByRole('button', { name: '添加关联', exact: true }))
  await expect(page.getByRole('status')).toContainText('关联已保存')
  await tap(page.getByRole('button', { name: '关联图', exact: true }))
  const graph = page.getByLabel('知识关联图画布', { exact: true })
  await graph.scrollIntoViewIfNeeded()
  const node = graph.locator(`.react-flow__node[data-id="${created[0]}"]`)
  await expect(node).toBeVisible()
  const before = await node.getAttribute('style')
  const box = (await node.boundingBox())!
  const start = await coordinates({ x: box.x + box.width / 2, y: box.y + 25 })
  const end = await coordinates({ x: box.x + box.width / 2 + 55, y: box.y + 100 })
  const positionSaved = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/entries/${created[0]}`))
  await run(adb, ['-s', 'emulator-5554', 'shell', 'input', 'swipe', ...start, ...end, '1000'])
  expect((await positionSaved).status()).toBe(200)
  await expect.poll(() => node.getAttribute('style')).not.toBe(before)
  const stored = await page.evaluate(async id => {
    const r = await fetch('/api/v1/projects/1/personal-knowledge', { headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } })
    return (await r.json()).data.entries.find((e: { id: number }) => e.id === id).position
  }, created[0])
  expect(Number.isFinite(stored.x)).toBe(true)
  await expect(graph.locator('.react-flow__edge-path')).toHaveAttribute('d', /C/)
  passed('安卓真实触摸单独拖动卡片，曲线连接及位置持久化成功')
  await page.reload()
  await tap(page.getByRole('tab', { name: '我的', exact: true }))
  await tap(page.getByText('我的知识空间', { exact: true }))
  await page.getByLabel('知识空间项目').selectOption('1')
  await tap(page.getByRole('button', { name: '打开 ' + titles[0], exact: true }))
  await expect(page.getByLabel('正文', { exact: true })).toHaveValue('本条为可清理的安卓知识空间验收资料。')
  
  passed('重新加载 APP 后条目正文、标签与关联仍存在')
  await page.screenshot({ path: out + '/wiki.png' })
  await page.goto('http://127.0.0.1:5177/?view=knowledge')
  await expect(page.getByRole('heading', { name: '我的知识空间', exact: true })).toBeVisible()
  await tap(page.getByRole('tab', { name: '我的', exact: true }))
  await expect(page.getByText('个人设置', { exact: true })).toBeVisible()
  passed('APP 知识空间直达链接与返回我的导航正常')
  expect(errors).toEqual([])
  await writeFile(out + '/result.json', JSON.stringify({ status: 'passed', checks, position: stored, errors, realAndroid: true, mockedApi: false }, null, 2))
} finally {
  await page.evaluate(async ids => {
    for (const id of ids) {
      const response = await fetch(`/api/v1/projects/1/personal-knowledge/entries/${id}`, { method: 'DELETE', headers: { Authorization: `Bearer ${localStorage.getItem('access_token')}` } })
      if (!response.ok) throw new Error('Disposable entry cleanup failed: ' + id)
    }
  }, created)
  await browser.close()
}
