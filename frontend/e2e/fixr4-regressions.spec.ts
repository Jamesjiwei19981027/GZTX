import { expect, test, type Page, type Route } from '@playwright/test';

type Handler = (route: Route) => Promise<boolean | void>;
async function mount(page: Page, view: string, handler?: Handler, admin = true) {
  const source = await (await page.request.get('/src/main.tsx')).text();
  const react = source.match(/from "([^"\n]*\/react\.js\?[^"\n]+)"/)?.[1];
  const dom = source.match(/from "([^"\n]*\/react-dom_client\.js\?[^"\n]+)"/)?.[1];
  expect(react, '模拟界面需要当前工作树 Vite').toBeTruthy();
  await page.route('**/api/v1/**', async route => {
    if (await handler?.(route)) return;
    const url = new URL(route.request().url()), path = url.pathname;
    let data: any = { items: [] };
    if (path.endsWith('/users/me')) data = { id: 2, username: '成员', nickname: '成员', notify_pref: {} };
    if (path.endsWith('/my-permissions')) data = { is_pm: admin, is_superadmin: admin, can_edit_all: admin,
      can_read_evidence: true, can_submit_evidence: true,
      owned_node_ids: [1], node_permissions: { '1': { can_read_evidence: true, can_submit_evidence: true } } };
    if (path.endsWith('/companies')) data = { items: [{ id: 1, name: '公司', my_membership: { is_super_admin: admin, is_org_leader: admin } }] };
    if (path.endsWith('/projects/1')) data = { id: 1, company_id: 1, name: '测试项目', pm_user_id: 2, created_by: 2 };
    if (path.endsWith('/tree')) data = { nodes: [{ id: 1, node_type_key: 'person', title: '成员', parent_id: null,
      assignees: [{user_id: 2, role_key: 'primary', display_name: '成员'}], children: [{ id: 11, parent_id: 1,
        node_type_key: 'work_item', title: 'D-事项一', children: [], progress_json: { percent: 10 } }] }] };
    if (path.endsWith('/channels')) data = { items: [{ id: 1, key: 'general' }, { id: 2, key: 'project' }] };
    if (path.endsWith('/tasks/stats')) data = { total: 1, completed: 0, pending: 1, in_progress: 0, overdue: 0 };
    if (path.endsWith('/tasks/trend')) data = { items: [] };
    if (path.endsWith('/integrations')) data = { items: [{ provider: 'dingtalk', has_credentials: true,
      credentials: { corp_id: 'corp', app_key: 'app', agent_id: '100', app_secret_configured: true } }] };
    if (path.endsWith('/login-methods')) data = { password: true, dingtalk: false, oidc: false };
    await route.fulfill({ json: { code: 200, data } });
  });
  await page.route(url => url.pathname === '/', route => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
    <script type="module">import R from '/@react-refresh'; R.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
    <script type="module">
    import React from '${react}';import ReactDOM from '${dom}';import '/src/index.css';
    import { ToastProvider } from '/src/components/toast/ToastProvider.tsx';
    import { PeopleAxisView } from '/src/components/views/PeopleAxisView.tsx';
    import { MessagesView } from '/src/components/views/MessagesView.tsx';
    import { ReportsView } from '/src/components/views/ReportsView.tsx';
    import { TeamView } from '/src/components/views/TeamView.tsx';
    import { Navbar } from '/src/components/Navbar.tsx';
    import { AdminIntegrationsSection } from '/src/components/admin/EnterpriseSettingsSections.tsx';
    import { MobileNavigationProvider } from '/src/mobile/navigation/MobileNavigationProvider.tsx';
    import { MobileRouteOutlet } from '/src/mobile/navigation/MobileRouteOutlet.tsx';
    import { completeTask, uncompleteTask } from '/src/api/backend.ts';
    const noop=()=>{}, user={id:'2',name:'成员',email:'member@example.test',avatar:'',role:'${admin ? '管理员' : '成员'}'};
    const project={id:'1',name:'测试项目',description:'',color:'#1d4e9e',active:true};
    const projects=Array.from({length:80},(_,i)=>({...project,id:String(i+1),name:i===0?'测试项目':'项目'+(i+1)}));
    function App(){
      const [tasks,setTasks]=React.useState([{id:'21',title:'可撤销任务',status:'To Do',priority:'Medium',dueDate:'',subtasks:[]}]);
      const [current,setCurrent]=React.useState(project);
      const props={user,tasks,projects,currentProject:current,onSelectProject:setCurrent,companyId:1,projectId:current.id,lang:'zh',
        settings:{language:'zh',themeMode:'light',accentColor:'blue',taskDefaults:{priority:'Medium',category:'Work'},notifications:{}},
        projectMembers:[],activities:[],onSelectTask:noop,onOpenNewTask:noop,onOpenQuickAdd:noop,onOpenSearch:noop,
        onBatchComplete:async()=>{},onBatchReschedule:async()=>{},onBatchDelete:async()=>{},onUpdateUser:async()=>{},onUploadAvatar:async()=>{},onUpdateSettings:noop,onLogout:async()=>{},
        onToggleTaskCompletion:async task=>{await(task.status==='Done'?uncompleteTask:completeTask)(Number(task.id));setTasks(old=>old.map(t=>t.id===task.id?{...t,status:task.status==='Done'?'To Do':'Done'}:t));}};
      let content;
      if('${view}'==='axis') content=React.createElement(PeopleAxisView,props);
      else if('${view}'==='messages') content=React.createElement(MessagesView,props);
      else if('${view}'==='reports') content=React.createElement(ReportsView,{...props,userId:'2'});
      else if('${view}'==='team') content=React.createElement(TeamView,{...props,isCompanyAdmin:${admin},currentUserId:2});
      else if('${view}'==='integrations') content=React.createElement(AdminIntegrationsSection,{isAdmin:${admin},companyId:1});
      else if('${view}'==='navbar') content=React.createElement(Navbar,{...props,searchQuery:'',onSearchChange:noop,onToggleLang:noop,onOpenSettings:noop,onResetDemo:noop});
      else content=React.createElement(MobileRouteOutlet,props);
      const screen='${view}'.startsWith('mobile:')?'${view}'.slice(7):'work-root';
      const tab=screen.startsWith('me-')?'me':screen.startsWith('axis-')?'axis':'work';
      return React.createElement(ToastProvider,null,React.createElement(MobileNavigationProvider,{initialRoute:{tab,screen,presentation:'page',params:{},title:'测试页面'}},content));
    }
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
    </script><style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style></body></html>` }));
  await page.goto('/');
}

for (const decision of ['adopted', 'rejected']) test(`C-2 ${decision} 同行刷新且保留材料面板`, async ({ page }) => {
  let status = 'pending_review';
  await mount(page, 'axis', async route => {
    const path = new URL(route.request().url()).pathname;
    if (!path.endsWith('/evidence') && !path.endsWith('/review')) return false;
    if (path.endsWith('/review')) status = route.request().postDataJSON().decision;
    const evidence = { id: 31, status, can_review: status === 'pending_review', summary_text: '联调材料', reject_reason: status === 'rejected' ? '缺少截图' : null };
    await route.fulfill({ json: { code: 200, data: path.endsWith('/review') ? evidence : { items: [evidence] } } });
    return true;
  });
  await page.getByRole('tab', {name:'责任链', exact:true}).click();
  await page.getByTestId('axis-chain-node-1').click();
  await page.getByRole('tab', {name:'材料',exact:true}).click();
  const row = page.getByTestId('axis-evidence-31');
  await expect(row.locator('.axis-status')).toHaveText('待负责人确认');
  if(decision==='adopted') await row.getByRole('button',{name:'采纳',exact:true}).click();
  else { await row.getByRole('button',{name:'驳回',exact:true}).click();await row.getByLabel('驳回原因').fill('缺少截图');await row.getByRole('button',{name:'确认驳回'}).click(); }
  await expect(row.locator('.axis-status')).toHaveText(decision==='adopted'?'已采纳':'已驳回');
  await expect(page.getByRole('tab',{name:'材料',exact:true})).toHaveAttribute('aria-selected','true');
  if(decision==='rejected') await expect(row.getByTestId('axis-reject-reason')).toContainText('缺少截图');
});

test('私信：独立于频道加载，自动刷新被动参与方消息', async ({ page }) => {
  let conversations: any[] = [], content = '成员发给 PM 的私信';
  await mount(page,'messages',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/channels')) {await route.fulfill({status:403,json:{code:40300,message:'旧项目无频道权限'}});return true;}
    if(path.endsWith('/conversations')) {await route.fulfill({json:{code:200,data:{items:conversations}}});return true;}
    if(path.includes('/conversations/')&&path.endsWith('/messages')) {await route.fulfill({json:{code:200,data:{items:[{id:51,sender_name:'成员',body:content}]}}});return true;}
    return false;
  });
  await page.getByRole('button',{name:'@ 私信与提及'}).click();
  await expect(page.getByText('暂无私信会话，请选择工作联系人。')).toBeVisible();
  conversations=[{id:7,company_id:1,title:'成员私信',kind:'direct',members:[],last_message:{body:content}}];
  await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await expect(page.getByTestId('direct-conversation-7')).toContainText(content);
  await expect(page.getByText(content,{exact:true})).toHaveCount(2);
});

test('R4-01 长项目菜单可滚动点击最后一个项目', async ({page})=>{
  await page.setViewportSize({width:1280,height:720});
  await mount(page,'navbar');
  await page.getByRole('button',{name:/测试项目.*expand_more/}).click();
  await page.getByRole('button',{name:'项目80',exact:true}).click();
  await expect(page.locator('header')).toContainText('项目80');
});

test('D-2 工作台完成后仍可进入详情并往返切换完成',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  const writes:string[]=[];
  await mount(page,'mobile:work-root',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.includes('/tasks/21/')){writes.push(path);await route.fulfill({json:{code:200,data:{}}});return true;}return false;
  });
  await page.getByRole('button',{name:'完成任务',exact:true}).first().click();
  await expect(page.getByTestId('workbench-uncomplete-21')).toBeVisible();
  await page.getByText('可撤销任务',{exact:true}).first().click();
  await page.getByRole('button',{name:'标为未完成',exact:true}).last().click();
  await page.getByRole('button',{name:'完成任务',exact:true}).last().click();
  expect(writes.map(p=>p.split('/').pop())).toEqual(['complete','uncomplete','complete']);
});

test('D-10 移动搜索显示可见标题、命中任务并可返回',async({page})=>{
  await page.setViewportSize({width:375,height:812});await mount(page,'mobile:work-root');
  await page.getByRole('button',{name:'搜索',exact:true}).click();
  await expect(page.getByRole('heading',{name:'搜索',exact:true})).toBeVisible();
  await page.getByPlaceholder('搜索任务标题、项目、标签…').fill('可撤销');
  await expect(page.getByText('可撤销任务',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'取消',exact:true}).click();
  await expect(page.getByRole('button',{name:'搜索',exact:true})).toBeVisible();
});

for(const screen of ['work-statistics','record-progress','me-security','me-appearance','axis-delegations']) test(`D-9 ${screen} 只有一层顶栏并有返回`,async({page})=>{
  await page.setViewportSize({width:375,height:812});await mount(page,'mobile:'+screen);
  await expect(page.locator('header')).toHaveCount(1);
  await expect(page.getByRole('button',{name:'返回',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'返回',exact:true}).click();
});

for(const admin of [true,false]) test(`A-06 管理入口与确认（管理员=${admin}）`,async({page})=>{
  let status='active';const writes:any[]=[];
  await mount(page,'team',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.includes('/companies/1/members')){
      if(route.request().method()==='PATCH'){const body=route.request().postDataJSON();writes.push(body);status=body.status;}
      const member={user_id:3,nickname:'被管理成员',status,is_super_admin:false,is_org_leader:false};
      await route.fulfill({json:{code:200,data:route.request().method()==='PATCH'?member:{items:[member],total:1}}});return true;
    }return false;
  },admin);
  if(!admin){await expect(page.getByTestId('team-manage-member-status')).toHaveCount(0);return;}
  await page.getByTestId('team-manage-member-status').click();
  await page.getByTestId('company-member-disable-3').click();expect(writes).toEqual([]);
  await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
  await page.getByTestId('company-member-enable-3').click();expect(writes).toEqual([{status:'disabled'}]);
  await page.getByRole('dialog').getByRole('button',{name:'确认',exact:true}).click();
  await expect(page.getByTestId('company-member-disable-3')).toBeVisible();
  expect(writes).toEqual([{status:'disabled'},{status:'active'}]);
});

test('A-13 服务绑定页进入真实钉钉表单，密钥只写不回显',async({page})=>{
  let payload:any;
  await mount(page,'integrations',async route=>{
    if(new URL(route.request().url()).pathname.endsWith('/integrations/dingtalk')){
      payload=route.request().postDataJSON();await route.fulfill({json:{code:200,data:{provider:'dingtalk',has_credentials:true}}});return true;
    }return false;
  });
  await expect(page.getByTestId('integration-unsupported-wecom')).toHaveText('暂不支持');
  await expect(page.getByTestId('integration-unsupported-feishu')).toHaveText('暂不支持');
  await page.getByTestId('integration-open-config').click();
  await expect(page.getByLabel('企业标识',{exact:true})).toHaveValue('corp');
  const secret=page.getByLabel('钉钉应用密钥',{exact:true});await expect(secret).toHaveValue('');
  await secret.fill('fixture-only-secret');await page.getByRole('button',{name:'保存钉钉配置',exact:true}).click();
  await expect(secret).toHaveValue('');expect(payload.credentials.app_secret).toBe('fixture-only-secret');
});

test('记录进展后汇报页：普通成员不探测管理者接口产生403',async({page})=>{
  const forbidden:string[]=[];
  await mount(page,'reports',async route=>{
    const path=new URL(route.request().url()).pathname;
    if(path.endsWith('/latest')){forbidden.push(path);await route.fulfill({status:403,json:{code:40300,message:'管理者专用'}});return true;}
    return false;
  },false);
  await expect(page.getByRole('heading',{name:'AI 汇报与助手'})).toBeVisible();
  expect(forbidden).toEqual([]);
});

test('D-12 手机提交显示后端中文提示并保留表单',async({page})=>{
  await page.setViewportSize({width:375,height:812});
  await mount(page,'mobile:work-root',async route=>{
    if(new URL(route.request().url()).pathname==='/api/v1/tasks'&&route.request().method()==='POST'){
      await route.fulfill({status:409,json:{detail:'归档项目不允许创建或绑定任务'}});return true;
    }return false;
  });
  await page.getByRole('button',{name:'新建任务',exact:true}).click();
  await page.getByPlaceholder('例如：准备项目月度交付汇报材料').fill('不能丢失的输入');
  await page.getByRole('button',{name:'创建任务',exact:true}).click();
  await expect(page.getByTestId('task-edit-error')).toHaveText('归档项目不允许创建或绑定任务');
  await expect(page.getByPlaceholder('例如：准备项目月度交付汇报材料')).toHaveValue('不能丢失的输入');
});
