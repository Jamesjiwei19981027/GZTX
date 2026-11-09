import { expect, test, type Page } from '@playwright/test';

async function openOverview(page: Page, kind: 'mobile-home' | 'desktop-home' | 'project') {
  await page.setViewportSize({width:kind==='desktop-home'?1280:390,height:844});
  await page.clock.install({time:new Date('2026-10-20T10:00:00+08:00')});
  await page.route('**/api/v1/**',async route=>{
    const url=new URL(route.request().url());
    let data:unknown={items:[]};
    if(url.pathname.endsWith('/tree'))data={nodes:[]};
    if(url.pathname.endsWith('/my-permissions'))data={is_pm:true};
    if(url.pathname.endsWith('/projects/1'))data={id:1,name:'测试项目',status:'active'};
    if(url.pathname.endsWith('/projects/1/tasks'))data=url.searchParams.get('page')==='2'
      ?{items:[{id:3,title:'团队已完成事项',status:2,priority:1,project_id:1}],total:3}
      :{items:[{id:1,title:'团队待办事项',status:0,priority:1,project_id:1},{id:2,title:'团队进行中事项',status:1,priority:2,project_id:1}],total:3};
    await route.fulfill({json:{code:200,data}});
  });
  await page.route(url=>url.pathname==='/',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
    <script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
    <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css';
      import { MobileWorkbenchScreen } from '/src/mobile/features/work/MobileWorkScreens.tsx';
      import { DashboardView } from '/src/components/views/DashboardView.tsx';
      import { MobileProjectOverviewScreen } from '/src/mobile/features/projects/MobileProjectScreens.tsx';
      const noop=()=>{};
      const project={id:'1',name:'测试项目',color:'#0058be',active:true};
      const props={user:{id:'1',name:'测试用户',role:'成员'},tasks:[],projects:[project],currentProject:project,activities:[],lang:'zh',onSelectTask:task=>{document.body.dataset.task=task.id},onOpenNewTask:noop,onOpenQuickAdd:noop,onOpenSearch:noop,onNavigateToTasks:noop,onNavigateToCalendar:noop,onNavigateToKanban:noop,onNavigateToStatistics:noop,onNavigateToTrash:noop};
      const kind='${kind}';
      const component=kind==='project'?MobileProjectOverviewScreen:kind==='desktop-home'?DashboardView:MobileWorkbenchScreen;
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(component,kind==='project'?{projectId:1,onSelectTask:props.onSelectTask,onNavigateToInvite:noop,onNavigateToKnowledge:()=>{document.body.dataset.knowledgeProject='1'}}:props));
    </script><style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style></body></html>`}));
  await page.goto('/');
}

for(const kind of ['mobile-home','desktop-home'] as const){
  test(`${kind} opens full month after metrics, then progress and new task`,async({page})=>{
    await openOverview(page,kind);
    const calendar=page.getByRole('region',{name:'首页日程日历'});
    await expect(calendar.getByRole('button',{name:/^2026-/})).toHaveCount(35);
    await expect(calendar.getByRole('button',{name:'2026-10-01',exact:true})).toHaveCount(1);
    await expect(calendar.getByRole('button',{name:'2026-10-31',exact:true})).toHaveCount(1);
    await expect(calendar.getByRole('button',{name:'2026-10-20',exact:true})).toHaveAttribute('aria-pressed','true');
    const metrics=kind==='mobile-home'?page.getByRole('region',{name:'待办汇总'}):page.getByTestId('today-focus');
    const progress=page.getByRole('region',{name:'项目进度简介'});
    const create=page.getByRole('button',{name:'新建任务',exact:true});
    expect(await metrics.evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('[aria-label="首页日程日历"]')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    expect(await calendar.evaluate(el=>!!(el.compareDocumentPosition(document.querySelector('[aria-label="项目进度简介"]')!)&Node.DOCUMENT_POSITION_FOLLOWING))).toBe(true);
    const progressBox=(await progress.boundingBox())!;const createBox=(await create.boundingBox())!;
    expect(createBox.y).toBeGreaterThanOrEqual(progressBox.y+progressBox.height);
    await calendar.getByRole('button',{name:'下个月',exact:true}).click();
    await expect(calendar.getByText('2026年11月',{exact:true})).toBeVisible();
    await expect(calendar.getByRole('button',{name:/^2026-/})).toHaveCount(42);
    await calendar.getByRole('button',{name:'今天',exact:true}).click();
    await expect(calendar.getByRole('button',{name:'2026-10-20',exact:true})).toHaveAttribute('aria-pressed','true');
  });
}

test('project opens invitation, all paginated tasks and expanded status board',async({page})=>{
  await openOverview(page,'project');
  const invite=page.getByRole('button',{name:/邀请新成员加入/});
  await expect(invite).toBeVisible();
  const list=page.getByRole('region',{name:'项目任务待办'});
  await expect(list.getByRole('heading',{name:'项目任务待办 · 3'})).toBeVisible();
  const board=page.getByRole('region',{name:'项目任务看板'});
  for(const title of ['团队待办事项','团队进行中事项','团队已完成事项']){
    await expect(list.getByText(title,{exact:true})).toHaveCount(1);
    await expect(board.getByText(title,{exact:true})).toHaveCount(1);
  }
  expect((await invite.boundingBox())!.y).toBeLessThan((await list.boundingBox())!.y);
  await list.getByRole('button',{name:/团队已完成事项/}).click();
  await expect(page.locator('body')).toHaveAttribute('data-task','3');
  await page.getByText('项目知识空间', {exact:true}).click();
  await expect(page.locator('body')).toHaveAttribute('data-knowledge-project','1');
});

