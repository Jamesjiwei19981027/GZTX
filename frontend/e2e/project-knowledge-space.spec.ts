import { expect, test, type Page, type Route } from '@playwright/test'

const ok = (route: Route, data: unknown) => route.fulfill({ json: { code: 200, data } })
const sharedPages = [
  { id: 11, title: '验收标准', body_text: '客户确认：验收需要联调记录与签字。', source: 'llm_wiki', meta: { facts: [{ text: '验收需要联调记录', quote: '需要联调记录与签字', package_id: 9, source_name: '验收说明', line_start: 1, line_end: 1 }] }, updated_at: null },
  { id: 12, title: '发布约定', body_text: '发布需要先完成验收。', source: 'manual', meta: {}, updated_at: null },
]
const summary = { id: 31, title: '验收与发布', body_text: '验收需要联调记录，再进行发布。', sources: [{ page_id: 11, title: '验收标准', quote: '验收需要联调记录与签字' }], page_ids: [11, 12], status: 'draft', provider: 'test-llm', model_source: 'user_agent', personal_entry_id: null }
const savedEntry = (body: any) => ({ id: 41, ...body, position: null, source_type: 'project_summary', source_id: 31, source_ref: { project_id: 1, summary_id: 31, sources: summary.sources }, updated_at: null })

async function mount(page: Page, width = 1280, standalone = false) {
  await page.setViewportSize({ width, height: 950 })
  await page.route(url => url.pathname === '/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
    <script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
    <script type="module">import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import '/src/index.css';import {PersonalKnowledgeSpace} from '/src/components/PersonalKnowledgeSpace.tsx';import {ProjectKnowledgeSpace} from '/src/components/ProjectKnowledgeSpace.tsx';
    const projects=[{id:'1',name:'产品升级',description:'',color:'blue',active:true},{id:'2',name:'客户交付',description:'',color:'green',active:true}];
    function App(){const [project,setProject]=React.useState(projects[0]);return ${standalone ? "React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setProject(projects[1])},'切换测试项目'),React.createElement(ProjectKnowledgeSpace,{projectId:Number(project.id),userId:'7',onSaved:()=>{window.__saved=(window.__saved||0)+1}}))" : "React.createElement(PersonalKnowledgeSpace,{userId:'7',projects,currentProject:project,onSelectProject:setProject})"};}ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>` }))
  await page.goto('/')
  if (!standalone) await page.getByRole('tab', { name: '项目知识', exact: true }).click()
}

async function mockApi(page: Page, granted = true, manager = false) {
  const writes: { method: string; path: string; body: any }[] = []
  let entries: any[] = []
  let saveError = ''
  let generateError = ''
  let grantError = false
  let restored = { ...summary }
  await page.route('**/api/v1/projects/*/personal-knowledge**', route => ok(route, { scope: { company_id: 3, project_id: Number(new URL(route.request().url()).pathname.split('/')[4]), owner_user_id: 7 }, entries, links: [] }))
  await page.route('**/api/v1/projects/*/knowledge-space**', async route => {
    const path = new URL(route.request().url()).pathname
    const method = route.request().method()
    const body = route.request().postDataJSON()
    if (method !== 'GET') writes.push({ method, path, body })
    if (path.endsWith('/save')) {
      if (saveError) return route.fulfill({ status: 409, json: { code: 409, message: saveError } })
      const already = entries.length > 0
      if (!already) entries.push(savedEntry(body))
      restored = { ...restored, status: 'saved', personal_entry_id: 41 }
      return ok(route, { entry: entries[0], already_saved: already })
    }
    if (path.endsWith('/summaries') && method === 'POST') {
      if (generateError) return route.fulfill({ status: 503, json: { code: 503, message: generateError } })
      return ok(route, summary)
    }
    if (path.includes('/summaries/')) return ok(route, restored)
    if (path.includes('/grants/')) {
      if (grantError) return route.fulfill({ status: 403, json: { code: 403, message: '当前无授权管理权限' } })
      return ok(route, { user_id: 8, name: '同事小林', can_summarize: body.can_summarize, is_manager: false })
    }
    return ok(route, { scope: { company_id: 3, project_id: Number(path.split('/')[4]), owner_user_id: 7 }, pages: sharedPages, permissions: { can_summarize: granted, can_manage_grants: manager }, members: manager ? [{ user_id: 7, name: '项目经理', can_summarize: true, is_manager: true }, { user_id: 8, name: '同事小林', can_summarize: false, is_manager: false }] : [] })
  })
  return { writes, failSave: (message: string) => { saveError = message }, failGenerate: (message: string) => { generateError = message }, failGrant: (value: boolean) => { grantError = value } }
}

test('ordinary readers can inspect shared sources but need an explicit summary grant', async ({ page }) => {
  await mockApi(page, false)
  await mount(page)
  await page.getByRole('button', { name: '查看项目知识 验收标准', exact: true }).click()
  await expect(page.getByRole('article').getByText('客户确认：验收需要联调记录与签字。', { exact: true })).toBeVisible()
  await page.getByText('查看原始依据', { exact: true }).click()
  await expect(page.getByText('需要联调记录与签字', { exact: true })).toBeVisible()
  await page.getByRole('dialog').getByRole('button', { name: '关闭', exact: true }).click()
  await expect(page.getByText('请联系项目经理开通 AI 总结权限。')).toBeVisible()
  await expect(page.getByRole('button', { name: 'AI 总结到我的知识', exact: true })).toBeDisabled()
  await expect(page.getByRole('checkbox', { name: '允许 同事小林 总结项目知识' })).toHaveCount(0)
})

for (const width of [390, 1280]) test(`granted selected pages produce editable cited draft and explicit private save at ${width}px`, async ({ page }) => {
  const api = await mockApi(page)
  await mount(page, width)
  await page.getByRole('checkbox', { name: '选择 验收标准', exact: true }).check()
  await page.getByRole('checkbox', { name: '选择 发布约定', exact: true }).check()
  await page.getByText('补充整理要求', { exact: true }).click()
  await page.getByLabel('整理要求', { exact: true }).fill('整理成验收清单')
  await page.getByRole('button', { name: 'AI 总结到我的知识', exact: true }).click()
  await expect(page.getByRole('heading', { name: '总结草稿', exact: true })).toBeVisible()
  await page.getByText('标签与来源', { exact: true }).click()
  await expect(page.getByText('验收需要联调记录与签字', { exact: true })).toBeVisible()
  expect(api.writes.filter(write => write.path.endsWith('/save'))).toHaveLength(0)
  await page.getByLabel('总结标题', { exact: true }).fill('我整理的验收清单')
  await page.getByLabel('总结正文', { exact: true }).fill('先准备联调记录，最后确认客户签字。')
  await page.getByLabel('总结标签', { exact: true }).fill('验收，交付')
  await page.getByRole('button', { name: '确认存入我的知识', exact: true }).click()
  await expect(page.getByRole('tab', { name: '我的知识', exact: true })).toHaveAttribute('aria-selected', 'true')
  await page.getByRole('button', { name: '打开 我整理的验收清单', exact: true }).click()
  await expect(page.getByLabel('正文', { exact: true })).toHaveValue('先准备联调记录，最后确认客户签字。')
  await page.getByText('查看来源', { exact: true }).click()
  await expect(page.getByText('项目知识总结', { exact: true }).last()).toBeVisible()
  expect(api.writes.find(write => write.path.endsWith('/summaries'))?.body).toEqual({ page_ids: [11, 12], instruction: '整理成验收清单' })
  expect(api.writes.find(write => write.path.endsWith('/save'))?.body).toEqual({ title: '我整理的验收清单', body_text: '先准备联调记录，最后确认客户签字。', tags: ['验收', '交付'] })
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
})

test('manager grant changes follow server confirmation and permission failures stay honest', async ({ page }) => {
  const api = await mockApi(page, true, true)
  await mount(page)
  await page.getByText('管理总结授权', { exact: true }).click()
  const grant = page.getByRole('checkbox', { name: '允许 同事小林 总结项目知识', exact: true })
  api.failGrant(true); await grant.click()
  await expect(page.getByRole('alert')).toContainText('无授权管理权限')
  await expect(grant).not.toBeChecked()
  api.failGrant(false); await expect(grant).toBeEnabled(); await grant.click()
  await expect(grant).toBeChecked(); await expect(grant).toBeEnabled()
  await grant.click(); await expect(grant).not.toBeChecked()
  expect(api.writes.filter(write => write.path.endsWith('/grants/8')).map(write => write.body)).toEqual([{ can_summarize: true }, { can_summarize: true }, { can_summarize: false }])
})

test('model configuration and source-version errors preserve instructions and edited text', async ({ page }) => {
  const api = await mockApi(page)
  await mount(page, 390)
  await page.getByRole('checkbox', { name: '选择 验收标准', exact: true }).check()
  await page.getByText('补充整理要求', { exact: true }).click()
  await page.getByLabel('整理要求', { exact: true }).fill('保留当前整理要求')
  api.failGenerate('尚未配置可用的个人模型')
  await page.getByRole('button', { name: 'AI 总结到我的知识', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('尚未配置可用的个人模型')
  await expect(page.getByLabel('整理要求', { exact: true })).toHaveValue('保留当前整理要求')
  await expect(page.getByRole('heading', { name: '总结草稿', exact: true })).toHaveCount(0)
  api.failGenerate(''); await page.getByRole('button', { name: 'AI 总结到我的知识', exact: true }).click()
  await page.getByLabel('总结正文', { exact: true }).fill('我已核对并编辑的内容')
  api.failSave('来源页已更新，请重新总结')
  await page.getByRole('button', { name: '确认存入我的知识', exact: true }).click()
  await expect(page.getByRole('alert')).toContainText('来源页已更新')
  await expect(page.getByLabel('总结正文', { exact: true })).toHaveValue('我已核对并编辑的内容')
})

test('source graph uses explicit package citations and curves follow independent dragging', async ({ page }) => {
  await mockApi(page)
  await mount(page)
  await page.getByRole('button', { name: '来源关系图', exact: true }).click()
  await expect(page.locator('.project-knowledge .react-flow__node')).toHaveCount(3)
  await expect(page.locator('.project-knowledge .react-flow__edge')).toHaveCount(1)
  const curve = page.locator('.project-knowledge .react-flow__edge-path')
  const before = await curve.getAttribute('d')
  const other = page.locator('.project-knowledge .react-flow__node[data-id="page:12"]')
  const otherBefore = await other.getAttribute('style')
  const source = page.locator('.project-knowledge .react-flow__node[data-id="package:9"]')
  // 关系图在首屏以下，鼠标只能拖到视口内的元素
  await source.scrollIntoViewIfNeeded()
  const box = (await source.boundingBox())!
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 60, box.y + box.height / 2 + 70, { steps: 10 }); await page.mouse.up()
  await expect.poll(() => curve.getAttribute('d')).not.toBe(before)
  expect(await other.getAttribute('style')).toBe(otherBefore)
})

test('private draft ID restores across refresh and repeated save reports the existing entry', async ({ page }) => {
  await mockApi(page)
  await mount(page, 1280, true)
  await page.getByRole('checkbox', { name: '选择 验收标准', exact: true }).check()
  await page.getByRole('button', { name: 'AI 总结到我的知识', exact: true }).click()
  await expect(page.getByLabel('总结标题', { exact: true })).toHaveValue('验收与发布')
  await page.reload()
  await page.getByRole('button', { name: '继续查看总结', exact: true }).click()
  await expect(page.getByLabel('总结标题', { exact: true })).toHaveValue('验收与发布')
  await page.getByRole('button', { name: '确认存入我的知识', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已存入我的知识')
  await page.getByRole('button', { name: '继续查看总结', exact: true }).click()
  await page.getByRole('button', { name: '确认存入我的知识', exact: true }).click()
  await expect(page.getByRole('status')).toContainText('已存在')
})

test('late project summary and save responses cannot alter the next project', async ({ page }) => {
  let release: (() => void) | undefined
  await page.route('**/api/v1/projects/*/personal-knowledge**', route => ok(route, { scope: { company_id: 3, project_id: Number(new URL(route.request().url()).pathname.split('/')[4]), owner_user_id: 7 }, entries: [], links: [] }))
  await page.route('**/api/v1/projects/*/knowledge-space**', async route => {
    const projectId = Number(new URL(route.request().url()).pathname.split('/')[4])
    if (route.request().method() === 'POST') { await new Promise<void>(resolve => { release = resolve }); return ok(route, summary) }
    return ok(route, { scope: { company_id: 3, project_id: projectId, owner_user_id: 7 }, pages: [projectId === 1 ? sharedPages[0] : { ...sharedPages[1], title: '客户专属标准' }], permissions: { can_summarize: true, can_manage_grants: false }, members: [] })
  })
  await mount(page)
  await page.getByRole('checkbox', { name: '选择 验收标准', exact: true }).check()
  await page.getByRole('button', { name: 'AI 总结到我的知识', exact: true }).click()
  await expect.poll(() => !!release).toBe(true)
  await page.getByLabel('知识空间项目').selectOption('2'); release?.()
  await page.getByRole('tab', { name: '项目知识', exact: true }).click()
  await expect(page.getByRole('button', { name: '查看项目知识 客户专属标准', exact: true })).toBeVisible()
  await expect(page.getByRole('heading', { name: '总结草稿', exact: true })).toHaveCount(0)
  await expect(page.getByLabel('总结正文', { exact: true })).toHaveCount(0)
})
