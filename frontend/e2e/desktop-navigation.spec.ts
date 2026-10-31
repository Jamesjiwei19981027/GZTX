import { expect, test } from '@playwright/test'

test('desktop uses the same five destinations and opens work assistant with scoped chat', async ({page}) => {
  await page.setViewportSize({width:1440,height:1000})
  let posted: any
  await page.route('**/api/v1/agents/chat',route=>{posted=route.request().postDataJSON();return route.fulfill({json:{code:200,data:{reply:'已核对当前项目资料',session_id:1}}})})
  await page.route(url=>url.pathname==='/',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`<!doctype html><html><body><div id="root"></div>
  <script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
  <script type="module">import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';import '/src/index.css';import {Sidebar} from '/src/components/Sidebar.tsx';import {DashboardView} from '/src/components/views/DashboardView.tsx';import {ProjectAgentChat} from '/src/components/ProjectAgentChat.tsx';
  const noop=()=>{};function App(){const [view,setView]=React.useState('dashboard');return React.createElement(React.Fragment,null,React.createElement(Sidebar,{activeView:view,onSelectView:setView,onOpenNewTask:noop,lang:'zh'}),React.createElement('main',{style:{marginLeft:300,paddingTop:80}},view==='dashboard'?React.createElement(DashboardView,{user:{id:'7',name:'测试'},tasks:[],activities:[],onSelectTask:noop,onOpenNewTask:noop,onNavigateToTasks:noop,onNavigateToAssistant:()=>setView('reports'),lang:'zh'}):view==='reports'?React.createElement(ProjectAgentChat,{companyId:3,projectId:'1',userId:'7'}):React.createElement('h1',null,view)));}ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));</script></body></html>`}))
  await page.goto('/')
  const aside=page.locator('aside')
  for(const label of ['工作','人轴','知识','消息','我的']) await expect(aside.getByRole('button',{name:label,exact:true})).toBeVisible()
  await page.getByRole('button',{name:'查看汇报',exact:true}).click()
  await expect(aside.getByRole('button',{name:'工作',exact:true})).toHaveAttribute('aria-current','page')
  await page.getByLabel('助手消息',{exact:true}).fill('核对验收进展')
  await page.getByRole('button',{name:'发送给我的 AI',exact:true}).click()
  await expect(page.getByText('已核对当前项目资料',{exact:false})).toBeVisible()
  expect(posted).toMatchObject({company_id:3,project_id:1,message:'核对验收进展'})
  await aside.getByRole('button',{name:'知识',exact:true}).click()
  await expect(page.getByRole('heading',{name:'knowledge',exact:true})).toBeVisible()
})
