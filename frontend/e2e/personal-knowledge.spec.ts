import { expect, test, type Page, type Route } from '@playwright/test'

type Entry = { id: number; title: string; body_text: string; tags: string[]; position: { x: number; y: number } | null; source_type: string; source_id: number | null; source_ref: Record<string, unknown>; updated_at: string | null }
type Link = { id: number; source_entry_id: number; target_entry_id: number; label: string }
const entry = (id: number, title: string, extra: Partial<Entry> = {}): Entry => ({ id, title, body_text: `${title}正文`, tags: ['交付'], position: { x: (id - 1) * 300, y: 80 }, source_type: 'manual', source_id: null, source_ref: {}, updated_at: null, ...extra })
const success = (route: Route, data: unknown) => route.fulfill({ json: { code: 200, data } })

async function mount(page: Page, project = '1', width = 1280) {
  await page.setViewportSize({ width, height: 950 })
  await page.route(url => url.pathname === '/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
  <script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
  <script type="module">import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js'; import '/src/index.css'; import {PersonalKnowledgeSpace} from '/src/components/PersonalKnowledgeSpace.tsx';
  const projects=[{id:'all',name:'全部项目',description:'',color:'blue',active:true},{id:'1',name:'产品升级',description:'',color:'blue',active:true},{id:'2',name:'客户交付',description:'',color:'green',active:true}];
  function App(){const [project,setProject]=React.useState(projects.find(p=>p.id==='${project}')); return React.createElement(PersonalKnowledgeSpace,{userId:'7',projects,currentProject:project,onSelectProject:setProject});}
  ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>` }))
  await page.goto('/')
}

async function backend(page: Page, count = 2) {
  let entries = [entry(1, '联调记录'), entry(2, '验收资料', { source_type: 'evidence_package', source_id: 9, source_ref: { package_id: 9, file_name: '验收说明.txt', quote: '客户确认进入验收' } })]
  entries.push(...Array.from({ length: count - 2 }, (_, i) => entry(i + 20, `note ${i + 20}`)))
  let links: Link[] = []
  let nextId = 3
  let imported = false
  const positions: { x: number; y: number }[] = []
  const writes: { method: string; path: string; body: any }[] = []
  let failSave = false
  await page.route('**/api/v1/projects/*/personal-knowledge**', async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const body = route.request().postDataJSON()
    if (method !== 'GET') writes.push({ method, path, body })
    if (method === 'GET') return success(route, { scope: { company_id: 3, project_id: Number(path.split('/')[4]), owner_user_id: 7 }, entries, links })
    if (path.endsWith('/assist')) return success(route, { analyzed: entries.length, suggestions: [{ source_entry_id: 1, target_entry_id: 2, label: '提供验收依据', reason: '两条笔记记录同一次验收。', source_quote: '联调记录正文', target_quote: '验收资料正文', source_fingerprint: 'a'.repeat(64), target_fingerprint: 'b'.repeat(64) }] })
    if (path.endsWith('/assist/apply')) {
      const created = body.suggestions.map((item: any) => ({ id: nextId++, source_entry_id: item.source_entry_id, target_entry_id: item.target_entry_id, label: item.label })); links.push(...created)
      return success(route, { links: created, created: created.length, skipped: 0 })
    }
    if (path.endsWith('/sync')) {
      if (imported) return success(route, { created: 0, skipped: 1 })
      imported = true; entries.push(entry(nextId++, '我的汇报', { source_type: 'agent_report', source_id: 22, source_ref: { report_id: 22 } }))
      return success(route, { created: 1, skipped: 0 })
    }
    if (path.endsWith('/entries') && method === 'POST') {
      const item = entry(nextId++, body.title, { ...body, position: null }); entries.push(item)
      return success(route, item)
    }
    if (path.includes('/entries/') && method === 'PATCH') {
      if (failSave) return route.fulfill({ status: 503, json: { code: 503, message: '暂时无法保存，请重试' } })
      const id = Number(path.split('/').at(-1)); const item = entries.find(e => e.id === id)!
      Object.assign(item, body); if (body.position) positions.push(body.position)
      return success(route, item)
    }
    if (path.includes('/entries/') && method === 'DELETE') {
      const id = Number(path.split('/').at(-1)); entries = entries.filter(e => e.id !== id); links = links.filter(l => l.source_entry_id !== id && l.target_entry_id !== id)
      return success(route, { id, is_deleted: true })
    }
    if (path.endsWith('/links') && method === 'POST') {
      const link = { id: nextId++, ...body }; links.push(link); return success(route, link)
    }
    if (path.includes('/links/') && method === 'DELETE') {
      const id = Number(path.split('/').at(-1)); links = links.filter(l => l.id !== id); return success(route, { id, is_deleted: true })
    }
    if (path.includes('/links/') && method === 'PATCH') {
      const link = links.find(l => l.id === Number(path.split('/').at(-1)))!; Object.assign(link, body); return success(route, link)
    }
    return route.fulfill({ status: 404, json: { message: 'Unhandled endpoint' } })
  })
  return { positions, writes, fail: (value: boolean) => { failSave = value } }
}

for (const width of [390, 1280]) test(`simple note opens above a long list and accepts text without a title at ${width}px`, async ({ page }) => {
  await backend(page, 24)
  await mount(page, '1', width)
  await expect(page.locator('.personal-knowledge')).not.toContainText(/wiki/i)
  const before = await page.evaluate(() => window.scrollY)
  await page.getByRole('button', { name: '记一条', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '记一条', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByRole('button', { name: '语音输入', exact: true })).toBeVisible()
  await expect(dialog.getByRole('button', { name: '选择音频转文字', exact: true })).toBeVisible()
  await expect(dialog.getByLabel('正文', { exact: true })).toBeInViewport()
  await expect(dialog.getByRole('button', { name: '保存笔记', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBe(before)
  await dialog.getByLabel('正文', { exact: true }).fill('记录这次验收的经验。')
  await dialog.getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开 记录这次验收的经验。', exact: true })).toBeVisible()
})

test('requires a concrete project before reading personal entries', async ({ page }) => {
  let reads = 0
  await page.route('**/api/v1/projects/*/personal-knowledge**', route => { reads++; return success(route, { scope: { company_id: 3, project_id: 1, owner_user_id: 7 }, entries: [], links: [] }) })
  await mount(page, 'all')
  await expect(page.getByText('选择项目后，就能记录、整理和查找自己的知识。')).toBeVisible()
  expect(reads).toBe(0)
  await page.getByLabel('知识空间项目').selectOption('1')
  await expect(page.getByText('记下第一条工作积累')).toBeVisible()
  expect(reads).toBe(1)
})

test('AI collects sources and proposes cited relationships; confirmation adds graph edges', async ({ page }) => {
  const api = await backend(page)
  await mount(page, '1', 390)
  await page.getByRole('button', { name: 'AI 整理', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: 'AI 发现的关联', exact: true })
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText('两条笔记记录同一次验收。', { exact: false })).toBeVisible()
  expect(api.writes.some(write => write.path.endsWith('/links') || write.path.endsWith('/assist/apply'))).toBe(false)
  await dialog.getByText('查看依据', { exact: true }).click()
  await expect(dialog.getByText('联调记录正文', { exact: true })).toBeVisible()
  await dialog.getByRole('button', { name: '确认关联（1）', exact: true }).click()
  await expect(dialog).toHaveCount(0)
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(1)
  expect(api.writes.filter(write => write.path.endsWith('/assist/apply'))).toHaveLength(1)
})

test('AI failure keeps imported notes visible and does not add relationships', async ({ page }) => {
  const api = await backend(page)
  await page.route('**/personal-knowledge/assist', route => route.fulfill({ status: 409, json: { message: '请先启用 AI' } }))
  await mount(page, '1', 390)
  await page.getByRole('button', { name: 'AI 整理', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('请先启用 AI')
  await expect(page.getByRole('button', { name: '打开 我的汇报', exact: true })).toBeVisible()
  expect(api.writes.some(write => write.path.endsWith('/assist/apply'))).toBe(false)
})

test('overlay keyboard preserves growing note input and save action; escape guards unsaved text', async ({ page }) => {
  await backend(page); await mount(page, '1', 390)
  await page.getByRole('button', { name: '记一条', exact: true }).click()
  const dialog = page.getByRole('dialog', { name: '记一条', exact: true })
  const input = dialog.getByLabel('正文', { exact: true })
  await input.fill('多行记录\n'.repeat(18))
  await page.evaluate(() => (window as any).__dispatchNativeRuntime({ v: 1, platform: 'android', surface: 'app', colorScheme: 'light', textSizes: { body: 16, caption: 12, navTitle: 18, displayTitle: 22 }, safeAreaOwner: 'native', reduceMotion: false, reduceTransparency: false, capabilities: { haptics: true, nativeBack: true }, keyboardInset: 310 }))
  await expect.poll(() => dialog.evaluate(el => el.getBoundingClientRect().bottom <= innerHeight - 310)).toBe(true)
  await expect(dialog.getByRole('button', { name: '保存笔记', exact: true })).toBeInViewport()
  await page.keyboard.press('Escape')
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '继续编辑', exact: true }).click()
  await expect(input).toHaveValue('多行记录\n'.repeat(18))
})

for (const width of [390, 1280]) test(`real Wiki CRUD preserves failed edits and source references at ${width}px`, async ({ page }) => {
  const api = await backend(page)
  await mount(page, '1', width)
  await page.getByRole('button', { name: '打开 验收资料', exact: true }).click()
  await page.getByText('查看来源', { exact: true }).click()
  await expect(page.getByText('验收说明.txt')).toBeVisible()
  await expect(page.getByText('客户确认进入验收')).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await page.getByRole('button', { name: '记一条', exact: true }).click()
  await page.getByLabel('标题', { exact: true }).fill('接口约定')
  await page.getByLabel('正文', { exact: true }).fill('验收前检查接口版本。')
  await page.getByText('标签与更多', { exact: true }).click()
  await page.getByLabel('标签', { exact: true }).fill('接口，验收')
  await page.getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect(page.getByRole('button', { name: '打开 接口约定', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '打开 接口约定', exact: true }).click()
  await page.getByLabel('正文', { exact: true }).fill('新增校验，保留未保存文字。')
  api.fail(true)
  await page.getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('暂时无法保存')
  await expect(page.getByLabel('正文', { exact: true })).toHaveValue('新增校验，保留未保存文字。')
  api.fail(false)
  await page.getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已保存')
  await page.getByLabel('搜索知识').fill('新增校验')
  await expect(page.getByRole('button', { name: '打开 联调记录', exact: true })).toHaveCount(0)
  await expect(page.getByRole('button', { name: '打开 接口约定', exact: true })).toBeVisible()
  await page.reload()
  await page.getByRole('button', { name: '打开 接口约定', exact: true }).click()
  await expect(page.getByLabel('正文', { exact: true })).toHaveValue('新增校验，保留未保存文字。')
  await page.getByRole('button', { name: '删除笔记', exact: true }).click()
  await expect(page.getByRole('alertdialog')).toBeVisible()
  await page.getByRole('button', { name: '确认删除笔记', exact: true }).click()
  await expect(page.getByRole('button', { name: '打开 接口约定', exact: true })).toHaveCount(0)
  expect(api.writes.find(w => w.method === 'POST' && w.path.endsWith('/entries'))?.body).toEqual({ title: '接口约定', body_text: '验收前检查接口版本。', tags: ['接口', '验收'] })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('graph edges follow independently dragged nodes and positions persist', async ({ page }) => {
  const api = await backend(page)
  await mount(page)
  await page.getByRole('button', { name: '关联图', exact: true }).click()
  const from = (await page.locator('.react-flow__node[data-id="1"] .react-flow__handle.source').boundingBox())!
  const to = (await page.locator('.react-flow__node[data-id="2"] .react-flow__handle.target').boundingBox())!
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2)
  await page.mouse.down(); await page.mouse.move(to.x + to.width / 2, to.y + to.height / 2, { steps: 12 }); await page.mouse.up()
  await expect(page.getByLabel('关联起点', { exact: true })).toHaveValue('1')
  await expect(page.getByLabel('关联终点', { exact: true })).toHaveValue('2')
  await page.getByLabel('关联说明').fill('提供验收依据')
  await page.getByRole('button', { name: '添加关联', exact: true }).click()
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  const edge = page.locator('.react-flow__edge-path').first()
  // A horizontal SVG path has a zero-height bounding box even when painted.
  await expect(edge).toHaveAttribute('d', /^M.+C/)
  await expect(page.locator('.react-flow__edge-text')).toHaveText('提供验收依据')
  const before = await edge.getAttribute('d')
  const node = page.locator('.react-flow__node[data-id="1"]')
  const box = (await node.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2)
  await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 70, box.y + box.height / 2 + 80, { steps: 12 }); await page.mouse.up()
  await expect.poll(() => api.positions.length).toBe(1)
  await expect.poll(() => edge.getAttribute('d')).not.toBe(before)
  expect(api.positions[0].x).not.toBe(0)
  await page.reload(); await page.getByRole('button', { name: '关联图', exact: true }).click()
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(1)
  await expect(page.locator('.react-flow__node[data-id="1"]')).toHaveCSS('transform', `matrix(1, 0, 0, 1, ${api.positions[0].x}, ${api.positions[0].y})`)
  await page.getByText('更多', { exact: true }).click()
  await page.getByRole('button', { name: '手动调整关联', exact: true }).click()
  await page.getByRole('button', { name: '编辑关联 提供验收依据', exact: true }).click()
  await page.getByLabel('关联说明').fill('已确认的验收依据')
  await page.getByRole('button', { name: '保存关联', exact: true }).click()
  await expect(page.getByRole('button', { name: '编辑关联 已确认的验收依据', exact: true })).toBeVisible()
  await page.getByRole('button', { name: '删除关联 已确认的验收依据', exact: true }).click()
  await expect(page.locator('.react-flow__edge-path')).toHaveCount(0)
})

test('repeated own-source sync refreshes once without duplicating entries', async ({ page }) => {
  await backend(page); await mount(page)
  await page.getByRole('button', { name: '打开 联调记录', exact: true }).click()
  await page.getByLabel('正文', { exact: true }).fill('保存的个人解释')
  await page.getByRole('button', { name: '保存笔记', exact: true }).click()
  await page.getByText('更多', { exact: true }).click()
  await page.getByRole('button', { name: '仅收集资料', exact: true }).click()
  await expect(page.getByRole('button', { name: '打开 我的汇报', exact: true })).toHaveCount(1)
  await expect(page.getByRole('status')).toContainText('收集 1')
  await page.getByRole('button', { name: '仅收集资料', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('收集 0')
  await expect(page.getByRole('button', { name: '打开 我的汇报', exact: true })).toHaveCount(1)
  await page.getByRole('button', { name: '打开 联调记录', exact: true }).click()
  await expect(page.getByLabel('正文', { exact: true })).toHaveValue('保存的个人解释')
})

test('read errors can be retried without showing unauthorized knowledge', async ({ page }) => {
  let attempts = 0
  await page.route('**/api/v1/projects/1/personal-knowledge', route => {
    attempts++
    return attempts === 1 ? route.fulfill({ status: 403, json: { code: 403, message: '项目访问资格已变更' } }) : success(route, { scope: { company_id: 3, project_id: 1, owner_user_id: 7 }, entries: [entry(1, '重新授权的条目')], links: [] })
  })
  await mount(page)
  await expect(page.getByRole('alert')).toContainText('项目访问资格已变更')
  await expect(page.getByRole('button', { name: '打开 重新授权的条目' })).toHaveCount(0)
  await page.getByRole('button', { name: '重新加载', exact: true }).click()
  await expect(page.getByRole('button', { name: '打开 重新授权的条目' })).toBeVisible()
})

test('mobile dark graph and editor stay within the viewport', async ({ page }, testInfo) => {
  await backend(page); await mount(page, '1', 390)
  await page.evaluate(() => document.documentElement.classList.add('dark'))
  await page.getByRole('button', { name: '关联图', exact: true }).click()
  await expect(page.locator('.react-flow__node')).toHaveCount(2)
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  await page.screenshot({ path: testInfo.outputPath('mobile-dark-graph.png'), fullPage: true })
  await page.getByRole('button', { name: '记一条', exact: true }).click()
  await expect(page.getByLabel('标题', { exact: true })).toBeInViewport()
  await expect(page.getByRole('button', { name: '保存笔记', exact: true })).toBeInViewport()
  expect(await page.evaluate(() => window.scrollY)).toBe(0)
  await page.getByLabel('标题', { exact: true }).fill('手机上的想法')
  await page.getByLabel('正文', { exact: true }).fill('随手记下工作经验。')
  await page.screenshot({ path: testInfo.outputPath('mobile-dark-editor.png'), fullPage: true })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('late reads and saves cannot populate another project', async ({ page }) => {
  let releaseRead: (() => void) | undefined
  let releaseSave: (() => void) | undefined
  let reads = 0
  await page.route('**/api/v1/projects/*/personal-knowledge**', async route => {
    const projectId = Number(new URL(route.request().url()).pathname.split('/')[4])
    if (route.request().method() === 'PATCH') {
      await new Promise<void>(resolve => { releaseSave = resolve })
      return success(route, entry(1, '旧项目保存结果', route.request().postDataJSON()))
    }
    if (projectId === 1 && reads++ === 0) await new Promise<void>(resolve => { releaseRead = resolve })
    return success(route, { scope: { company_id: 3, project_id: projectId, owner_user_id: 7 }, entries: [entry(1, projectId === 1 ? '产品私人条目' : '客户私人条目')], links: [] })
  })
  await mount(page)
  await expect.poll(() => !!releaseRead).toBe(true)
  await page.getByLabel('知识空间项目').selectOption('2'); releaseRead?.()
  await expect(page.getByRole('button', { name: '打开 客户私人条目', exact: true })).toBeVisible()
  await expect(page.getByRole('button', { name: '打开 产品私人条目', exact: true })).toHaveCount(0)
  await page.getByLabel('知识空间项目').selectOption('1')
  await page.getByRole('button', { name: '打开 产品私人条目', exact: true }).click()
  await page.getByLabel('正文', { exact: true }).fill('属于产品的修改')
  await page.getByRole('button', { name: '保存笔记', exact: true }).click()
  await expect.poll(() => !!releaseSave).toBe(true)
  await page.getByLabel('知识空间项目').selectOption('2'); releaseSave?.()
  await expect(page.getByRole('button', { name: '打开 客户私人条目', exact: true })).toBeVisible()
  await expect(page.getByLabel('正文', { exact: true })).toHaveCount(0)
  await expect(page.getByText('旧项目保存结果')).toHaveCount(0)
})
