import { expect, test, type Page } from '@playwright/test';

test.use({ timezoneId: 'Asia/Shanghai' });

async function open(page: Page, screen: string, manager = true, userId = '2', pullAll = true, customNodes?: any[], startAll = false) {
  page.on('pageerror',error=>console.log(`feedback-pageerror: ${error.message}
${error.stack}`));
  const isDesktop = screen.startsWith('desktop-');
  await page.setViewportSize(isDesktop ? { width: 1440, height: 1000 } : { width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: 'light' });
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname;
    let data: any = { items: [] };
    const person = (id: number, parent: number | null, name: string, children: any[] = []) => ({
      id, parent_id: parent, node_type_key: 'person', title: name, children, node_origin: parent ? 'subordinate' : 'project',
      assignees: [{ user_id: id, display_name: name, role_key: 'primary' }],
    });
    if (path.endsWith('/tree')) data = { nodes: customNodes ?? [person(1, null, '项目经理', [person(2, 1, '直属成员'), person(3, 1, '同级成员'),
      {id:11,parent_id:1,node_type_key:'work_item',title:'方案确认',progress_json:{percent:100,status:'done'},children:[]},
      {id:12,parent_id:1,node_type_key:'work_item',title:'接口联调',progress_json:{percent:50,status:'in_progress'},children:[]},
    ])] };
    if (path.endsWith('/my-permissions')) data = { is_pm: manager, is_superadmin: false, can_edit_all: manager,
      can_move: manager, owned_node_ids: [2], node_permissions: { '1': { can_add_subordinate: manager, can_edit_person: manager, can_delete_person:manager, can_move_person:manager },
        '2': { can_add_subordinate: false, can_edit_person: true, can_manage_permissions: false, can_delete_person:false, can_move_person:false,can_manage_assignees:false } } };
    if (path.endsWith('/deletion-preview')) data = {node_id:1,descendants:[{id:2,title:'直属成员',node_type_key:'person',node_origin:'subordinate'}],descendant_count:1,affected_user_ids:[1,2],affected_task_count:2,affected_evidence_count:1,handover_candidates:[{id:3,title:'同级成员'}],requires_confirmation:true,warning:'移除后撤销项目频道和群聊访问，请先交接。',preview_token:'fixture-preview'};
    if (path.endsWith('/contacts')) data = { items: [{ id: 1, name: '直属领导' }] };
    if (path.endsWith('/users/me')) data = {id:Number(userId),username:'test',nickname:'测试用户'};
    if (path.endsWith('/projects/1')) data = {id:1,name:'测试项目',company_id:1,pm_user_id:1};
    if (path.endsWith('/projects/1/members')) data = {items:[{user_id:1,display_name:'项目经理'},{user_id:2,display_name:'直属成员'}]};
    if (path.endsWith('/conversations') && route.request().method() === 'POST') data = { id: 20, member_user_ids: [1, 2], kind: 'direct' };
    await route.fulfill({ json: { code: 200, data } });
  });
  await page.route(url => url.pathname === '/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
    <script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => type => type; window.__vite_plugin_react_preamble_installed__ = true;
    </script><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css';
      import '/src/assets/material-symbols-subset.css';
      import { MobileAxisScreens } from '/src/mobile/features/people-axis/MobileAxisScreens.tsx';
      import { MobileMessageListScreen } from '/src/mobile/features/messages/MobileMessageScreens.tsx';
      import { MobileNavigationProvider } from '/src/mobile/navigation/MobileNavigationProvider.tsx';
      import { MobileRouteOutlet } from '/src/mobile/navigation/MobileRouteOutlet.tsx';
      import { MobileAppearanceScreen } from '/src/mobile/features/settings/MobileSettingsScreens.tsx';
      import { MessagesView } from '/src/components/views/MessagesView.tsx';
      import { PeopleAxisView } from '/src/components/views/PeopleAxisView.tsx';
      import { MobileDelegationsScreen } from '/src/mobile/features/people-axis/MobileEvidenceScreens.tsx';
      import { DelegationModal } from '/src/components/modals/DelegationModal.tsx';
      const project = { id:'1', name:'全盘研发概览', color:'#0058BE' };
      const noop = () => {};
      function App() {
        const [current, setCurrent] = React.useState(${startAll ? "{id:'all',name:'全部项目',color:'#0058BE'}" : 'project'});
        const [settings, setSettings] = React.useState({themeMode:'light', accentColor:'blue', language:'zh', notifications:{},taskDefaults:{priority:'Medium',category:'Work'}});
        React.useEffect(() => { document.documentElement.classList.toggle('dark', settings.themeMode === 'dark'); }, [settings]);
        const props = { settings, onUpdateSettings: partial => setSettings(old => ({...old,...partial})), user:{id:'2',name:'直属成员',role:'member'},
          tasks:[{id:'schedule-1',title:'周会讨论',status:'To Do',priority:'Medium',projectId:'1',dueDate:'2026-10-20',dueTime:'09:30',subtasks:[]}], projects:${startAll ? "[{id:'all',name:'全部项目',color:'#0058BE'},project]" : '[project]'}, currentProject:current, companyId:1, projectMembers:[], activities:[],
          onSelectProject:p => { window.__selected = p.id; ${startAll ? 'setCurrent(p)' : ''} }, onOpenNewTask:noop, onOpenQuickAdd:noop, onOpenSearch:noop, onSelectTask:noop, onToggleTaskCompletion:noop,
          onBatchComplete:noop,onBatchReschedule:noop,onBatchDelete:noop,onUpdateUser:noop,onUploadAvatar:noop,onLogout:noop };
        props.user.id = '${userId}'; props.user.name = '${userId}' === '2' ? '直属成员' : '无节点项目经理';
        let content;
        if ('${screen}' === 'desktop-messages') content = React.createElement(MessagesView, {...props, projectId:'1',lang:'zh',members:[{id:'999',name:'不应自动选择的成员'}]});
        else if ('${screen}' === 'axis') content = React.createElement(MobileAxisScreens, {...props, projectId:1,currentUser:props.user,
          onOpenDelegation:()=>{document.body.dataset.opened='delegations'},onOpenAudit:()=>{document.body.dataset.opened='audit'}});
        else if ('${screen}' === 'desktop-axis') content = React.createElement(PeopleAxisView, {projectId:'1',projects:props.projects,lang:'zh'});
        else if ('${screen}' === 'delegations') content = React.createElement(MobileDelegationsScreen,{projectId:1,companyId:1,currentUser:props.user});
        else if ('${screen}' === 'desktop-delegations') content = React.createElement(DelegationModal,{isOpen:true,onClose:noop,companyId:1,projectId:1,members:[{id:'2',name:'直属成员'}],lang:'zh',canManage:${manager},currentUserId:Number('${userId}')});
        else if ('${screen}' === 'messages') content = React.createElement(MobileMessageListScreen, {...props,currentUserId:'2', projectId:'1',
          onSelectChannel:noop,onSelectDirect: conv => {document.body.dataset.opened = String(conv.id)}});
        else if ('${screen}' === 'theme') content = React.createElement(MobileAppearanceScreen,props);
        else content = React.createElement(MobileRouteOutlet,props);
        ${pullAll ? `localStorage.setItem('axis-pulled:' + '${userId}' + ':1', JSON.stringify(['1','2','3']));` : ''}
        return React.createElement(MobileNavigationProvider,{initialTab:'work'},content);
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
    </script><style>html,body,#root {height:100%;margin:0} #root {display:flex;flex-direction:column}</style></body></html>` }));
  await page.goto('/');
}

test('axis exposes delegation and audit without opening canvas settings in either view', async ({page}) => {
  await open(page, 'axis');
  for (const view of ['我的职责', '项目全貌']) {
    await page.getByRole('button', {name:view,exact:true}).click();
    await page.getByRole('button', {name:'委托授权',exact:true}).click();
    await expect(page.locator('body')).toHaveAttribute('data-opened','delegations');
    await page.getByRole('button', {name:'AI 责任链审计',exact:true}).click();
    await expect(page.locator('body')).toHaveAttribute('data-opened','audit');
    await expect(page.getByRole('dialog')).toHaveCount(0);
  }
});

test('desktop axis directly exposes delegation and audit for project members',async ({page})=>{
  await open(page,'desktop-axis',false);
  await page.setViewportSize({width:1440,height:1000});
  const actions=page.getByRole('navigation',{name:'人轴协作与检查',exact:true});
  await expect(actions.getByRole('button',{name:'AI 责任链审计',exact:true})).toBeVisible();
  await actions.getByRole('button',{name:'委托授权',exact:true}).click();
  await expect(page.getByText(/不授予手机或电脑本地文件的访问权限/)).toBeVisible();
  await expect(page.getByRole('button',{name:'创建委托',exact:true})).toHaveCount(0);
});

for(const mobile of [true,false]) for(const manager of [true,false]) {
  test(`${mobile?'APP':'Web'} delegation explains scope and ${manager?'permits':'hides'} creation for this role`,async ({page})=>{
    await open(page,mobile?'delegations':'desktop-delegations',manager);
    await expect(page.getByText(/不授予手机或电脑本地文件的访问权限/)).toBeVisible();
    const create=page.getByRole('button',{name:mobile?'创建授权':'创建委托',exact:true});
    if(manager) await expect(create).toBeVisible();
    else await expect(create).toHaveCount(0);
  });
}

for(const mobile of [true,false]) test(`${mobile?'APP':'Web'} delegation expiry includes the selected local day`,async ({page})=>{
  let payload: any;
  await open(page,mobile?'delegations':'desktop-delegations',true);
  await page.route('**/api/v1/delegations',async route=>{
    payload=route.request().postDataJSON();
    await route.fulfill({json:{code:200,data:{id:42,...payload}}});
  });
  if(mobile) await page.getByRole('button',{name:'创建授权',exact:true}).click();
  await page.locator('select').selectOption('2');
  await page.locator('input[type=date]').fill('2026-10-22');
  await page.getByRole('button',{name:mobile?'创建授权':'创建委托',exact:true}).last().click();
  await expect.poll(()=>payload?.valid_to).toBe('2026-10-22T15:59:59.000Z');
  expect(payload.project_id).toBe(1);
  expect(payload.actions).toEqual(['progress.read']);
});

test('person cards drag independently and connected lines follow in both orientations', async ({ page }) => {
  await open(page, 'axis');
  await page.getByRole('button', { name: '项目全貌', exact: true }).click();
  const graph = page.getByTestId('mobile-axis-graph');
  await expect(graph.locator('.react-flow__edge-path')).toHaveCount(2);
  const card = page.getByTestId('mobile-axis-node-1');
  const before = await card.boundingBox();
  // 默认取景把卡片放在视口右缘附近，拖动会触发画布自动平移；所以「另一张卡片没动」按画布坐标比较，而不是屏幕坐标
  const flowPos = (id: number) => page.locator(`.react-flow__node[data-id="${id}"]`).evaluate(el => (el as HTMLElement).style.transform);
  const otherBefore = await flowPos(2);
  const lineBefore = await graph.locator('.react-flow__edge-path').first().getAttribute('d');
  await page.mouse.move(before!.x + 80, before!.y + 24);
  await page.mouse.down(); await page.mouse.move(before!.x + 140, before!.y + 74, { steps: 12 }); await page.mouse.up();
  expect((await card.boundingBox())!.x - before!.x).toBeGreaterThan(45);
  expect(await flowPos(2)).toBe(otherBefore);
  expect(await graph.locator('.react-flow__edge-path').first().getAttribute('d')).not.toBe(lineBefore);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '横向', exact: true }).click();
  await expect(graph.locator('.react-flow__edge-path')).toHaveCount(2);
  await page.screenshot({ path: test.info().outputPath('axis-horizontal.png') });
});

test('project selector does not overlap title, member cannot add subordinates or change supervisor', async ({ page }) => {
  await open(page, 'axis', false);
  const title = await page.getByRole('heading', { name:'我的职责', exact:true }).boundingBox();
  const picker = await page.getByLabel('选择项目', {exact:true}).boundingBox();
  expect(picker!.y).toBeGreaterThanOrEqual(title!.y + title!.height);
  await expect(page.getByRole('button', { name:'添加下级人员',exact:true })).toHaveCount(0);
  await page.getByRole('button', {name:'项目全貌',exact:true}).click();
  await page.getByTestId('mobile-axis-node-2').click();
  await expect(page.getByRole('button',{name:'新增下级',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'调整上级',exact:true})).toHaveCount(0);
});

test('new-message button opens contacts and starts explicitly selected private chat', async ({page}) => {
  await open(page, 'messages');
  await page.getByRole('button',{name:'新建私聊'}).click();
  await expect(page.getByRole('heading',{name:'工作联系人',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.getByRole('heading',{name:'消息中心',exact:true})).toHaveCount(0);
  await page.getByRole('button',{name:'直属领导',exact:true}).click();
  await expect(page.locator('body')).toHaveAttribute('data-opened','20');
});

test('Bezier endpoints follow a card throughout dragging, before pointer release', async ({page}) => {
  await open(page,'axis');
  await page.getByRole('button',{name:'项目全貌',exact:true}).click();
  const path = page.locator('.react-flow__edge[data-id="branch-2"] .react-flow__edge-path');
  await expect(path).toHaveAttribute('d',/C/);
  const card = page.getByTestId('mobile-axis-node-1');
  const box = (await card.boundingBox())!;
  const original = await path.getAttribute('d');
  await page.mouse.move(box.x+box.width/2,box.y+20); await page.mouse.down();
  await page.mouse.move(box.x+box.width/2+25,box.y+40,{steps:4});
  await expect(path).not.toHaveAttribute('d',original!);
  const mid = await path.getAttribute('d');
  await page.mouse.move(box.x+box.width/2+50,box.y+65,{steps:4});
  await expect(path).not.toHaveAttribute('d',mid!);
  const point = await path.evaluate(el => {
    const path = el as SVGPathElement;
    const p=path.getPointAtLength(0), matrix=path.getScreenCTM()!;
    return {x:matrix.a*p.x+matrix.c*p.y+matrix.e,y:matrix.b*p.x+matrix.d*p.y+matrix.f};
  });
  // 连线端点贴着被拖卡片的边（浮动连线按对端方向取边上的点，不再固定在底部手柄）
  const rect = (await page.locator('.react-flow__node[data-id="1"] .axis-map-card').boundingBox())!;
  const inside = (m: number) => point.x >= rect.x + m && point.x <= rect.x + rect.width - m && point.y >= rect.y + m && point.y <= rect.y + rect.height - m;
  expect(inside(-4)).toBe(true);
  expect(inside(4)).toBe(false);
  await page.mouse.up();
});

test('home shows interactive schedule and real project progress',async ({page})=>{
  await page.clock.install({time:new Date('2026-10-20T10:00:00+08:00')});
  await open(page,'work');
  const calendar=page.getByRole('region',{name:'首页日程日历'});
  await expect(calendar.getByRole('heading',{name:'日程日历',exact:true})).toBeVisible();
  await expect(calendar.getByText('周会讨论',{exact:true})).toBeVisible();
  await calendar.getByRole('button',{name:'2026-10-21',exact:true}).click();
  await expect(calendar.getByText('当天暂无日程',{exact:true})).toBeVisible();
  await calendar.getByRole('button',{name:'今天',exact:true}).click();
  await expect(calendar.getByText('周会讨论',{exact:true})).toBeVisible();
  const progress=page.getByRole('region',{name:'项目进度简介'});
  await expect(progress).toContainText('75%');
  await expect(progress).toContainText('已完成 1 / 2 项');
  await page.getByRole('button',{name:'项目列表',exact:true}).click();
  await expect(page.getByRole('heading',{name:'切换工作区与项目',exact:true})).toBeVisible();
  await expect(page.getByRole('heading',{name:'工作联系人',exact:true})).toHaveCount(0);
});

test('project axis navigation switches tab and preserves work navigation stack', async ({page}) => {
  await open(page, 'work');
  await page.evaluate(() => (window as any).__MOBILE_NAV__.push({tab:'axis',screen:'axis-root',title:'人轴'}));
  await expect(page.getByRole('heading',{name:'我的职责',exact:true})).toBeVisible();
  expect(await page.evaluate(() => (window as any).__MOBILE_NAV__.currentTab)).toBe('axis');
  await page.evaluate(() => (window as any).__MOBILE_NAV__.switchTab('work'));
  await expect(page.getByRole('region',{name:'首页日程日历'})).toBeVisible();
  expect(await page.evaluate(() => (window as any).__MOBILE_NAV__.activeRoute.screen)).toBe('work-root');
});

test('manual dark theme renders even when host prefers light, and switches back', async ({page}) => {
  await open(page, 'theme');
  await page.getByRole('button',{name:'深色模式'}).click();
  await expect(page.locator('html')).toHaveClass(/dark/);
  const header = page.locator('header').first();
  await expect.poll(() => header.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe('rgba(255, 255, 255, 0.95)');
  const dark = await header.evaluate(el => getComputedStyle(el).backgroundColor);
  await page.getByRole('button',{name:'浅色模式'}).click();
  await expect.poll(() => header.evaluate(el => getComputedStyle(el).backgroundColor)).not.toBe(dark);
});

test('work has one search, task creation and AI progress entry without duplicate record action',async ({page})=>{
  await open(page,'work');
  await expect(page.getByRole('button',{name:/搜索/})).toHaveCount(1);
  await expect(page.getByRole('button',{name:'新建任务',exact:true})).toContainText('新建任务');
  await expect(page.getByRole('button',{name:'快速添加',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'记录进展',exact:true})).toBeVisible();
});

test('project manager without assigned node is never labelled as a different employee', async ({page}) => {
  await open(page, 'axis', true, '99');
  await expect(page.getByRole('heading',{name:'我的职责',exact:true})).toBeVisible();
  await expect(page.getByText(/· 我$/)).toHaveCount(0);
  await expect(page.getByText('当前为项目顶层负责人，无直属上级')).toHaveCount(0);
});

test('editing a root person keeps an empty supervisor instead of selecting the person itself', async ({page}) => {
  const moves: string[] = [];
  page.on('request', request => { if (request.method() === 'POST' && request.url().endsWith('/move')) moves.push(request.url()); });
  await open(page,'axis');
  await page.getByRole('button',{name:'项目全貌',exact:true}).click();
  await page.getByTestId('mobile-axis-node-1').click();
  await page.getByRole('button',{name:'编辑人员',exact:true}).click();
  await expect(page.getByLabel('直属上级',{exact:true})).toHaveValue('');
  await page.getByRole('button',{name:'保存人员',exact:true}).click();
  await expect(page.getByText('人员信息保存成功',{exact:true})).toBeVisible();
  expect(moves).toHaveLength(0);
});

test('desktop send never silently chooses a member and keeps draft until recipient selection', async ({page}) => {
  const mutations: {path:string;body:any}[] = [];
  page.on('request', request => { if (request.method() === 'POST') mutations.push({path:new URL(request.url()).pathname,body:request.postDataJSON()}); });
  await open(page,'desktop-messages');
  await page.setViewportSize({width:1280,height:900});
  await page.getByRole('button',{name:'@ 私信与提及',exact:true}).click();
  await expect(page.getByText('暂无私信会话，请选择工作联系人。', {exact:true})).toBeVisible();
  await page.getByPlaceholder('输入消息…').fill('先确认收件人再发送');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect(page.getByRole('heading',{name:'工作联系人',exact:true})).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(mutations).toHaveLength(0);
  await page.getByRole('button',{name:'直属领导',exact:true}).click();
  await expect(page.getByRole('heading',{name:'工作联系人',exact:true})).toHaveCount(0);
  expect(mutations[0].body.member_user_ids).toEqual([1]);
  await expect(page.getByPlaceholder('输入消息…')).toHaveValue('先确认收件人再发送');
  await page.getByRole('button',{name:'发送',exact:true}).click();
  await expect.poll(()=>mutations.some(m=>m.path==='/api/v1/conversations/20/messages')).toBe(true);
});


test('person removal requires preview and explicit handover, while secondary removal is hidden for PM',async({page})=>{
  const removals:string[]=[];
  page.on('request',req=>{if(req.method()==='DELETE' && req.url().includes('/nodes/'))removals.push(req.url());});
  await open(page,'axis');
  await page.getByRole('button',{name:'项目全貌',exact:true}).click();
  await page.getByTestId('mobile-axis-node-2').click();
  await expect(page.getByRole('button',{name:'查看移除影响与交接'})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'调整上级',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:'编辑人员',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'关闭',exact:true}).click();
  await page.getByTestId('mobile-axis-node-1').click();
  await page.getByRole('button',{name:'查看移除影响与交接'}).click();
  await expect(page.getByRole('button',{name:'确认级联移除',exact:true})).toBeDisabled();
  await expect(page.getByRole('group',{name:'移除人员确认'})).toContainText('2 项任务');
  await page.getByLabel('交接负责人',{exact:true}).selectOption('3');
  await page.getByRole('button',{name:'确认交接并移除',exact:true}).click();
  await expect.poll(()=>removals.length).toBe(1);
  const url=new URL(removals[0]);
  expect(url.searchParams.get('handover_to_node_id')).toBe('3');
  expect(url.searchParams.get('preview_token')).toBe('fixture-preview');
  expect(url.searchParams.has('cascade')).toBe(false);
});

test('my duty screen: shows no false report row, zero evidence count, and overdue badge', async ({ page }) => {
  const person = (id: number, parent: number | null, name: string, children: any[] = []) => ({
    id,
    parent_id: parent,
    node_type_key: 'person',
    title: name,
    children,
    node_origin: parent ? 'subordinate' : 'project',
    assignees: [{ user_id: id, display_name: name, role_key: 'primary' }],
  });

  const customNodes = [
    person(1, null, '项目经理', [
      person(2, 1, '直属成员', [
        {
          id: 21,
          parent_id: 2,
          node_type_key: 'work_item',
          title: '移动端责任事项',
          due_at: '2026-11-01T00:00:00Z',
          progress_json: { percent: 30, status: 'in_progress' },
          children: [],
        },
      ]),
    ]),
  ];

  await open(page, 'axis', false, '2', true, customNodes);

  // 1. 标题为“我的职责”
  await expect(page.getByRole('heading', { name: '我的职责', exact: true })).toBeVisible();

  // 2. 断言无汇报时页面不出现「已收到你的汇报」
  await expect(page.getByText('已收到你的汇报')).toHaveCount(0);
  await expect(page.getByText('暂无汇报').first()).toBeVisible();

  // 3. 断言材料数为 0 时显示「0 份材料」
  await expect(page.getByText('0 份材料')).toBeVisible();

  // 4. 断言逾期事项显示「逾期」
  await expect(page.getByText(/逾期/)).toBeVisible();
});

test('my duty report row opens the record-progress page with the shown project instead of the select-project prompt', async ({ page }) => {
  await open(page, 'work', false, '2', true, undefined, true);
  await page.evaluate(() => (window as any).__MOBILE_NAV__.push({tab:'axis',screen:'axis-root',title:'人轴'}));
  await expect(page.getByRole('heading',{name:'我的职责',exact:true})).toBeVisible();
  await page.getByText('暂无汇报').last().click();
  await expect(page.getByRole('heading',{name:'记录进展'})).toBeVisible();
  await expect(page.getByText('请选择具体项目')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__selected)).toBe('1');
});


test('axis delegation and audit screens use the fallback project instead of requesting NaN under all-projects', async ({ page }) => {
  const urls: string[] = [];
  page.on('request', request => urls.push(request.url()));
  await open(page, 'work', true, '2', true, undefined, true);
  await page.evaluate(() => (window as any).__MOBILE_NAV__.push({tab:'axis',screen:'axis-root',title:'人轴'}));
  await expect(page.getByRole('heading',{name:'我的职责',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'委托授权',exact:true}).click();
  await expect(page.getByText('请先选择项目')).toHaveCount(0);
  await expect.poll(() => urls.some(u => /\/projects\/1\/my-permissions/.test(u))).toBe(true);
  await page.goBack().catch(() => undefined);
  expect(urls.filter(u => /\/projects\/NaN/.test(u))).toEqual([]);
});

test.describe('browser back button follows the in-app page stack', () => {
  const screenOf = (page: Page) => page.evaluate(() => (window as any).__MOBILE_NAV__.activeRoute.screen as string);
  const push = (page: Page, screen: string, tab = 'work') =>
    page.evaluate(([s, t]) => (window as any).__MOBILE_NAV__.push({ tab: t, screen: s, title: s }), [screen, tab]);

  test('consecutive pushes unwind one level per browser back and leave the app at the root', async ({ page }) => {
    await open(page, 'work');
    expect(await screenOf(page)).toBe('work-root');
    await push(page, 'work-trash');
    await push(page, 'work-search');
    expect(await screenOf(page)).toBe('work-search');
    await page.goBack();
    await expect.poll(() => screenOf(page)).toBe('work-trash');
    await page.goBack();
    await expect.poll(() => screenOf(page)).toBe('work-root');
    // 栈空时不拦截：再按一次返回离开应用页面
    await page.goBack();
    await expect.poll(() => page.url()).toBe('about:blank');
  });

  test('in-page back button and browser back do not double-pop', async ({ page }) => {
    await open(page, 'work');
    await push(page, 'work-trash');
    await push(page, 'work-search');
    await page.getByRole('button', { name: '返回' }).first().click();
    await expect.poll(() => screenOf(page)).toBe('work-trash');
    // 页面内返回之后历史条数同步回落：浏览器再返回一次应只回到根页，且不离开应用
    await page.goBack();
    await expect.poll(() => screenOf(page)).toBe('work-root');
    await page.waitForTimeout(300);
    expect(page.url()).not.toBe('about:blank');
  });

  test('tab switch keeps each tab stack and its history in step', async ({ page }) => {
    await open(page, 'work');
    await push(page, 'work-trash');
    await page.evaluate(() => (window as any).__MOBILE_NAV__.switchTab('axis'));
    await expect.poll(() => page.evaluate(() => (window as any).__MOBILE_NAV__.currentTab)).toBe('axis');
    await page.evaluate(() => (window as any).__MOBILE_NAV__.switchTab('work'));
    await expect.poll(() => screenOf(page)).toBe('work-trash');
    await page.goBack();
    await expect.poll(() => screenOf(page)).toBe('work-root');
  });

  test('overlay closes with browser back without popping the page underneath, and closing it in-page leaves history intact', async ({ page }) => {
    await open(page, 'work');
    await push(page, 'work-trash');
    await page.evaluate(() => (window as any).__MOBILE_NAV__.openOverlay({ id: 'o1', type: 'sheet' }));
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__MOBILE_NAV__.overlay))).toBe(true);
    await page.goBack();
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__MOBILE_NAV__.overlay))).toBe(false);
    expect(await screenOf(page)).toBe('work-trash');
    // 再开再由页面内关闭，随后浏览器返回只应退一层页面
    await page.evaluate(() => (window as any).__MOBILE_NAV__.openOverlay({ id: 'o2', type: 'sheet' }));
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__MOBILE_NAV__.overlay))).toBe(true);
    await page.evaluate(() => (window as any).__MOBILE_NAV__.closeOverlay());
    await expect.poll(() => page.evaluate(() => Boolean((window as any).__MOBILE_NAV__.overlay))).toBe(false);
    await page.goBack();
    await expect.poll(() => screenOf(page)).toBe('work-root');
    await page.waitForTimeout(300);
    expect(page.url()).not.toBe('about:blank');
  });
});

test('all-projects: opening a responsibility item enters the material page of the shown project once', async ({ page }) => {
  const person = (id: number, parent: number | null, name: string, children: any[] = []) => ({
    id, parent_id: parent, node_type_key: 'person', title: name, children,
    node_origin: parent ? 'subordinate' : 'project',
    assignees: [{ user_id: id, display_name: name, role_key: 'primary' }],
  });
  const nodes = [person(1, null, '项目经理', [person(2, 1, '直属成员', [
    { id: 21, parent_id: 2, node_type_key: 'work_item', title: '移动端责任事项', due_at: '2026-12-31T00:00:00Z', progress_json: { percent: 30, status: 'in_progress' }, children: [] },
  ])])];
  const urls: string[] = [];
  page.on('request', request => urls.push(request.url()));
  await open(page, 'work', false, '2', true, nodes, true);
  await page.evaluate(() => (window as any).__MOBILE_NAV__.push({tab:'axis',screen:'axis-root',title:'人轴'}));
  await expect(page.getByRole('heading',{name:'我的职责',exact:true})).toBeVisible();
  await page.getByText('移动端责任事项').first().click();
  await expect(page.getByText('请先选择项目')).toHaveCount(0);
  expect(await page.evaluate(() => (window as any).__MOBILE_NAV__.activeRoute.screen)).toBe('record-progress');
  expect(await page.evaluate(() => (window as any).__selected)).toBe('1');
  expect(urls.filter(u => /\/projects\/NaN/.test(u))).toEqual([]);
});
