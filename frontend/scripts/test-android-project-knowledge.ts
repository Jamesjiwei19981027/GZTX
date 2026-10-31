/** Real Android WebView project knowledge smoke: shared page, permission UI and honest model failure. */
import { chromium, expect, type Locator } from '@playwright/test'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { mkdir, writeFile } from 'node:fs/promises'

const endpoint = 'http://127.0.0.1:9222'
const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true })
const page = browser.contexts()[0].pages()[0]
const run = promisify(execFile)
const adb = 'C:/Users/11580/AppData/Local/Android/Sdk/platform-tools/adb.exe'
const out = 'android-acceptance/test-results/project-knowledge'
const checks: string[] = []
page.setDefaultTimeout(20000)
await mkdir(out, { recursive: true })
async function tap(locator: Locator) {
  const ime = (await run(adb, ['-s', 'emulator-5554', 'shell', 'dumpsys', 'input_method'])).stdout
  if (/mInputShown=true/.test(ime)) await run(adb, ['-s', 'emulator-5554', 'shell', 'input', 'keyevent', '111'])
  await locator.scrollIntoViewIfNeeded()
  await locator.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'instant' }))
  await expect.poll(() => locator.evaluate(el => {
    const b = el.getBoundingClientRect(), hit = document.elementFromPoint(b.x + b.width / 2, b.y + b.height / 2)
    return hit === el || (hit !== null && el.contains(hit))
  })).toBe(true)
  const b = (await locator.boundingBox())!
  const targets = await (await fetch(endpoint + '/json/list')).json() as Array<{ url: string; description: string }>
  const view = JSON.parse(targets.find(target => target.url === page.url())!.description)
  const ratio = await page.evaluate(() => devicePixelRatio)
  await run(adb, ['-s', 'emulator-5554', 'shell', 'input', 'tap', String(Math.round(view.screenX + (b.x + b.width / 2) * ratio)), String(Math.round(view.screenY + (b.y + b.height / 2) * ratio))])
}
const passed = (text: string) => { checks.push(text); console.log('PASS ' + text) }
try {
  await page.goto('http://127.0.0.1:5177/')
  await tap(page.getByRole('tab', { name: '我的', exact: true }))
  await tap(page.getByText('我的知识空间', { exact: true }))
  await expect(page.getByRole('heading', { name: '我的知识空间', exact: true })).toBeVisible()
  await page.getByLabel('知识空间项目').selectOption('1')
  await tap(page.getByRole('tab', { name: '项目知识', exact: true }))
  await expect(page.getByRole('heading', { name: '项目知识', exact: true })).toBeVisible()
  await expect(page.getByText('[知识空间验收] 项目共享验收说明', { exact: true })).toBeVisible()
  passed('APP 真实触摸打开项目共享知识并读取项目来源页')
  await tap(page.getByRole('checkbox', { name: '选择 [知识空间验收] 项目共享验收说明', exact: true }))
  await expect(page.getByRole('button', { name: '让我的 AI 总结', exact: true })).toBeEnabled()
  const response = page.waitForResponse(r => r.request().method() === 'POST' && r.url().endsWith('/knowledge-space/summaries'))
  await tap(page.getByRole('button', { name: '让我的 AI 总结', exact: true }))
  expect((await response).status()).toBe(409)
  await expect(page.getByRole('alert')).toContainText('模型')
  await expect(page.getByRole('heading', { name: '总结草稿', exact: true })).toHaveCount(0)
  passed('授权项目经理可触发总结；未配置真实模型时 APP 显示可重试的真实错误，不创建假草稿')
  await page.screenshot({ path: out + '/android-project-knowledge.png' })
  await writeFile(out + '/result.json', JSON.stringify({ status: 'passed', checks, mockedApi: false, realAndroid: true }, null, 2))
} finally {
  await browser.close()
}
