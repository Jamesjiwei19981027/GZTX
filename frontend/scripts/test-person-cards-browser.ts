import assert from 'node:assert/strict'
import { chromium, expect } from '@playwright/test'
import { createServer } from 'vite'
import { mkdir } from 'node:fs/promises'
import { createServer as createSocket } from 'node:net'

// 同一前台进程持有临时 Vite，探测空闲端口，finally 关闭，不触碰既有服务。
const socket = createSocket()
await new Promise<void>(resolve => socket.listen(0, '127.0.0.1', resolve))
const freePort = (socket.address() as { port: number }).port
await new Promise<void>((resolve, reject) => socket.close(e => e ? reject(e) : resolve()))
const server = await createServer({ server: { port: freePort, strictPort: true, host: '127.0.0.1', hmr: false } })
await server.listen()
await server.environments.client.depsOptimizer?.scanProcessing
const port = (server.httpServer!.address() as { port: number }).port
const base = 'http://127.0.0.1:' + port
const browser = await chromium.launch({ headless: true })
await mkdir('../.tmp/featcard-browser', { recursive: true })
try {
  for (const mobile of [false, true]) {
    const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile })
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error') console.error(m.text()) })
    page.on('pageerror', e => console.error(e.message))
    page.on('requestfailed', r => console.error('request failed', r.url(), r.failure()?.errorText))
    let saved: Record<string, unknown> | null = null
    let failOnce = true
    await page.route('**/api/v1/**', async route => {
      if (route.request().method() === 'PUT') {
        if (failOnce) { failOnce = false; await route.fulfill({ status: 403, json: { code: 40300, message: '无权修改卡片，请联系项目负责人' } }); return }
        saved = route.request().postDataJSON()
      }
      await route.fulfill({ json: { code: 200, data: {} } })
    })
    await page.route(base + '/featcard-test', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"></head><body><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module">
      import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js'; import '/src/index.css';
      import {CardEditor} from '/src/features/personCards/CardEditor.tsx';import {CardFields,FoldedCardLabel} from '/src/features/personCards/CardFields.tsx';import {mergeCard} from '/src/features/personCards/model.ts';import {saveCardStyle,saveCardTemplate,saveCardView} from '/src/features/personCards/api.ts';
      localStorage.setItem('access_token','test'); const node={id:'1',person:{id:'2',name:'林悦',avatar:'',role:'成员'},roleTitle:'设计师',orderOnAxis:0,workItems:[]};
      function Demo(){const[open,setOpen]=React.useState(null),[style,setStyle]=React.useState({color:'sage',tags:[{text:'驻场',color:'clay'}]}),[template,setTemplate]=React.useState({fields:['name','role','tags']}),[view,setView]=React.useState({});const cfg=mergeCard(template,style,view);return React.createElement(React.Fragment,null,
      React.createElement('button',{onClick:()=>setOpen('style')},'编辑卡片'),React.createElement('button',{onClick:()=>setOpen('template')},'卡片模板'),React.createElement('button',{onClick:()=>setOpen('view')},'显示设置'),React.createElement('div',{'data-testid':'actual-card'},React.createElement(CardFields,{node,config:cfg})),React.createElement('div',{'data-testid':'folded'},React.createElement(FoldedCardLabel,{node,config:cfg})),open&&React.createElement(CardEditor,{key:open,mode:open,initial:open==='style'?style:open==='template'?template:view,template,style,node,onClose:()=>setOpen(null),onSave:async value=>{if(open==='style'){await saveCardStyle(1,1,value);setStyle(value)}else if(open==='template'){await saveCardTemplate(1,value);setTemplate(value)}else{await saveCardView(1,value);setView(value)}}}));} ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(Demo));
    </script></body></html>` }))
    await page.goto(base + '/featcard-test')
    await page.getByRole('button', { name: '编辑卡片', exact: true }).click()
    const dialog = page.getByRole('dialog', { name: '编辑卡片', exact: true })
    await expect(dialog).toBeVisible()
    await dialog.getByLabel('标签1', { exact: true }).fill('交付')
    await expect(dialog.locator('.person-card-preview')).toContainText('交付')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog.getByRole('alert')).toContainText('无权修改卡片')
    await expect(dialog.getByLabel('标签1', { exact: true })).toHaveValue('交付')
    await dialog.getByLabel('自定义显示字段', { exact: true }).check()
    await dialog.getByRole('button', { name: '上移标签', exact: true }).click()
    await dialog.getByRole('button', { name: '添加字段', exact: true }).click()
    await dialog.getByLabel('字段1名称', { exact: true }).fill('地点')
    await dialog.getByLabel('字段1值', { exact: true }).fill('上海')
    await dialog.getByRole('button', { name: '保存', exact: true }).click()
    await expect(dialog).toHaveCount(0)
    assert.equal((saved as any)?.tags[0].text, '交付')
    assert.deepEqual((saved as any)?.custom_fields, [{ key: '地点', value: '上海' }])
    await expect(page.getByTestId('folded')).toContainText('交付')
    await page.getByRole('button', { name: '显示设置', exact: true }).click()
    const display = page.getByRole('dialog', { name: '显示设置' })
    await display.getByLabel('显示别人设置的标签').uncheck()
    await display.getByLabel('显示别人设置的颜色').uncheck()
    await display.getByRole('button', { name: '保存', exact: true }).click()
    await expect(page.getByTestId('folded')).not.toContainText('交付')
    assert.deepEqual(saved, { person_cards: { 1: { show_tags: false, show_colors: false } } })
    await page.getByRole('button', { name: '卡片模板', exact: true }).click()
    const tpl = page.getByRole('dialog', { name: '卡片模板' })
    await tpl.getByLabel('卡片密度', { exact: true }).selectOption('detailed')
    await expect(tpl.locator('.person-card-preview .density-detailed')).toBeVisible()
    await page.screenshot({ path: `../.tmp/featcard-browser/${mobile ? 'mobile' : 'desktop'}-template.png` })
    await tpl.getByRole('button', { name: '保存', exact: true }).click()
    assert.equal((saved as any)?.density, 'detailed')
    await page.getByRole('button', { name: '编辑卡片', exact: true }).click()
    await page.getByRole('button', { name: '恢复为项目默认', exact: true }).click()
    assert.deepEqual(saved, {})
    await expect(page.getByTestId('actual-card')).toContainText('设计师')
    assert.deepEqual(errors, [])
    console.log(`person card browser ${mobile ? 'mobile 390px touch' : 'desktop 1440px'}: preview, reorder, 403 draft retention, template, preferences, folding and reset passed`)
    await page.close()
    const integrated = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1440, height: 1000 }, isMobile: mobile, hasTouch: mobile })
    integrated.on('pageerror', e => errors.push(e.message))
    const person = { id: 1, parent_id: null, node_type_key: 'person', title: '林悦', can_edit_card_style: true, assignees: [{ user_id: 2, role_key: 'primary', display_name: '林悦' }], card_style_json: { color: 'sage', tags: [{ text: '驻场', color: 'clay' }] }, children: [] }
    const project = { id: 1, company_id: 1, name: '卡片验收', pm_user_id: 2, created_by: 2, can_edit_card_template: true, card_template_json: { fields: ['name', 'tags'], density: 'standard' } }
    await integrated.route('**/api/v1/**', route => {
      const path = new URL(route.request().url()).pathname
      let data: unknown = { items: [] }
      if (path.endsWith('/tree')) data = { project_id: 1, nodes: [person], card_template_json: project.card_template_json, can_edit_card_template: true }
      else if (path.endsWith('/my-permissions')) data = { is_pm: true, can_edit_all: true, owned_node_ids: [1], can_read_evidence: true, can_submit_evidence: true }
      else if (path.endsWith('/users/me')) data = { id: 2, nickname: '林悦' }
      else if (path.endsWith('/ui-prefs')) data = { ui: {} }
      else if (path.endsWith('/projects/1')) data = project
      return route.fulfill({ json: { code: 200, data } })
    })
    await integrated.route(base + '/integration-test', route => route.fulfill({ contentType: 'text/html', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body style="margin:0"><div id="root" style="height:100vh"></div><script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script><script type="module">import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import '/src/index.css';import {PeopleAxisView} from '/src/components/views/PeopleAxisView.tsx';import {MobileAxisScreens} from '/src/mobile/features/people-axis/MobileAxisScreens.tsx';localStorage.setItem('access_token','test');const props={lang:'zh',projectId:'1',currentProject:{id:'1',name:'卡片验收',color:'#1d4e9e'},currentUser:{id:'2',name:'林悦',avatar:'',role:'成员'},companyId:1};ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(${mobile ? 'MobileAxisScreens' : 'PeopleAxisView'},props));</script></body></html>` }))
    await integrated.goto(base + '/integration-test')
    await integrated.getByRole('button', { name: '显示设置', exact: true }).click()
    await expect(integrated.getByRole('dialog', { name: '显示设置', exact: true })).toBeVisible()
    await integrated.getByRole('button', { name: '关闭显示设置', exact: true }).click()
    await expect(integrated.getByTestId('person-card-fields').first()).toContainText('林悦')
    assert.deepEqual(errors, [])
    console.log(`person card integrated ${mobile ? 'mobile' : 'desktop'} axis: loading, render and display settings passed`)
    await integrated.close()
  }
} finally { await browser.close(); await server.close() }

