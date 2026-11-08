import { expect, test } from '@playwright/test'

test('five destinations keep knowledge independent and work owns AI flows', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })
  await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 200, data: route.request().url().includes('/personal-knowledge')
    ? { scope: { company_id: 1, project_id: 1, owner_user_id: 7 }, entries: [], links: [] }
    : { items: [] } } }))
  await page.route(url => url.pathname === '/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
    <script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
    <script type="module">
      import React from '/node_modules/.vite/deps/react.js'; import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css'; import {MobileAppShell} from '/src/mobile/MobileAppShell.tsx';
      const noop=()=>{}; const project={id:'1',name:'导航验收项目',color:'blue'};
      const props={user:{id:'7',name:'导航测试',role:'member'},projects:[project],currentProject:project,tasks:[],activities:[],companyId:1,projectMembers:[],
        settings:{themeMode:'light',language:'zh',notifications:{},taskDefaults:{priority:'Medium',category:'Work'}},
        onSelectProject:noop,onUpdateSettings:noop,onUpdateUser:noop,onUploadAvatar:noop,onLogout:noop,onOpenNewTask:noop,onOpenQuickAdd:noop,onOpenSearch:noop,
        onSelectTask:noop,onToggleTaskCompletion:noop,onBatchComplete:noop,onBatchReschedule:noop,onBatchDelete:noop};
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MobileAppShell,props));
    </script></body></html>` }))
  await page.goto('/?view=knowledge')
  await expect(page.getByRole('heading', { name: '我的知识空间', exact: true })).toBeVisible()
  await expect(page.getByText('记下第一条工作积累', { exact: true })).toBeVisible()
  const navigation = page.getByRole('tablist', { name: '主要页面导航', exact: true })
  await expect(navigation.getByRole('tab')).toHaveText(['工作','人轴','知识','消息','我的'])
  await expect(navigation.getByRole('tab',{name:'知识',exact:true})).toHaveAttribute('aria-selected','true')
  await navigation.getByRole('tab',{name:'工作',exact:true}).click()
  await page.getByRole('button',{name:'查看汇报',exact:true}).click()
  await expect(page.getByRole('heading',{name:'汇报',exact:true})).toBeVisible()
  await expect(navigation.getByRole('tab',{name:'工作',exact:true})).toHaveAttribute('aria-selected','true')
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await expect(page.getByRole('region',{name:'待办汇总'})).toBeVisible()
  await navigation.getByRole('tab',{name:'我的',exact:true}).click()
  await expect(page.getByText('个人设置', { exact: true })).toBeVisible()
  await page.getByText('我的知识空间', { exact: true }).click()
  await expect(page.getByRole('heading', { name: '我的知识空间', exact: true })).toBeVisible()
  await expect(navigation.getByRole('tab',{name:'知识',exact:true})).toHaveAttribute('aria-selected','true')
  await page.getByRole('button',{name:'问知识助手',exact:true}).click()
  await expect(page.getByRole('heading',{name:'与我的 AI 对话',exact:true})).toBeVisible()
  await expect(navigation.getByRole('tab',{name:'知识',exact:true})).toHaveAttribute('aria-selected','true')
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await expect(page.getByRole('heading', {name:'我的知识空间',exact:true})).toBeVisible()
  await page.evaluate(() => (window as any).__MOBILE_NAV__.push({tab:'ai',screen:'ai-root'}))
  await expect(page.getByRole('heading',{name:'汇报',exact:true})).toBeVisible()
  await expect(navigation.getByRole('tab',{name:'工作',exact:true})).toHaveAttribute('aria-selected','true')
  await page.evaluate(() => (window as any).__MOBILE_NAV__.push({tab:'ai',screen:'record-progress'}))
  await expect(page.getByRole('heading',{name:'记录进展',exact:true})).toBeVisible()
  await page.getByRole('button',{name:'返回',exact:true}).click()
  await expect(page.getByRole('heading',{name:'汇报',exact:true})).toBeVisible()
})
