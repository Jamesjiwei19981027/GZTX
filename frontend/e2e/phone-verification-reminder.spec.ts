import { expect, test, type Page } from '@playwright/test';

const now = new Date('2026-10-20T10:00:00+08:00');
const startKey = 'phone-verification-reminder-start:41';

async function openVerification(page: Page, options: {verified?: boolean; startedDaysAgo?: number; profile?: boolean} = {}) {
  const server = {verified: options.verified ?? false, reads: 0, binds: [] as unknown[]};
  await page.setViewportSize({width:390,height:844});
  await page.clock.setFixedTime(now);
  if (options.startedDaysAgo !== undefined) {
    await page.addInitScript(({key,started})=>localStorage.setItem(key,String(started)),
      {key:startKey,started:now.getTime()-options.startedDaysAgo*86400000});
  }
  const status = () => ({email:'member@example.test',email_verified:true,phone:'13800138000',phone_verified:server.verified});
  await page.route('**/api/v1/**',async route=>{
    const path=new URL(route.request().url()).pathname;
    let data:unknown={items:[]};
    if(path.endsWith('/users/me/verification')){server.reads++;data=status();}
    if(path.endsWith('/users/me/verification/confirm')){
      server.binds.push(route.request().postDataJSON());server.verified=true;data=status();
    }
    if(path.endsWith('/users/me/verification/send-code')) data={cooldown_seconds:60};
    if(path.endsWith('/users/me'))data={id:41,nickname:'项目成员',email:'member@example.test',phone_verified:server.verified};
    await route.fulfill({json:{code:200,data}});
  });
  await page.route(url=>url.pathname==='/',route=>route.fulfill({contentType:'text/html; charset=utf-8',body:`
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
    <script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
    <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css';
      import {PhoneVerificationReminder} from '/src/components/PhoneVerificationReminder.tsx';
      import {MobileProfileScreen,MobileSecurityScreen} from '/src/mobile/features/settings/MobileSettingsScreens.tsx';
      import {MobileNavigationProvider} from '/src/mobile/navigation/MobileNavigationProvider.tsx';
      window.__isFlutterApp=true;
      const noop=()=>{};
      const user={id:'41',name:'项目成员',email:'member@example.test',role:'成员'};
      const props={user,settings:{language:'zh',themeMode:'light'},onUpdateUser:async()=>{},onUpdateSettings:noop,onLogout:async()=>{}};
      function App(){
        const [verified,setVerified]=React.useState(false);
        const [screen,setScreen]=React.useState('${options.profile ? 'profile' : 'home'}');
        const onVerified=React.useCallback(()=>{document.body.dataset.serverVerified='true';setVerified(true);},[]);
        const onVerify=React.useCallback(()=>setScreen('security'),[]);
        return React.createElement(MobileNavigationProvider,{initialTab:'me'},
          React.createElement(React.Fragment,null,
            React.createElement('button',{onClick:()=>setScreen('profile')},'测试打开个人资料'),
            screen==='profile'?React.createElement(MobileProfileScreen,props):screen==='security'?React.createElement(MobileSecurityScreen,props):React.createElement('h1',null,'工作台'),
            ${options.profile ? 'null' : "React.createElement(PhoneVerificationReminder,{userId:'41',verified,onVerify,onVerified})"}));
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
    </script><style>html,body,#root{height:100%;margin:0}#root{display:flex;flex-direction:column}</style></body></html>`}));
  await page.goto('/');
  return server;
}

const reminder=(page:Page)=>page.getByRole('alertdialog',{name:'手机号码尚未验证'});
const resume=(page:Page)=>page.evaluate(()=>window.dispatchEvent(new Event('nativeAppResumed')));

test('unverified cold launch prompts again on native resume without extending the first reminder date',async({page})=>{
  await openVerification(page);
  await expect(reminder(page)).toBeVisible();
  const started=await page.evaluate(key=>localStorage.getItem(key),startKey);
  expect(Number(started)).toBe(now.getTime());
  await reminder(page).getByRole('button',{name:'稍后提醒',exact:true}).click();
  await expect(reminder(page)).toHaveCount(0);
  await resume(page);
  await expect(reminder(page)).toBeVisible();
  expect(await page.evaluate(key=>localStorage.getItem(key),startKey)).toBe(started);
});

test('the persisted seven-day window suppresses launch and resume reminders',async({page})=>{
  const server=await openVerification(page,{startedDaysAgo:7});
  await expect.poll(()=>server.reads).toBe(1);
  await expect(page.getByRole('heading',{name:'工作台'})).toBeVisible();
  await expect(reminder(page)).toHaveCount(0);
  await resume(page);
  await expect.poll(()=>server.reads).toBe(2);
  await expect(reminder(page)).toHaveCount(0);
  expect(await page.evaluate(key=>Number(localStorage.getItem(key)),startKey)).toBe(now.getTime()-7*86400000);
});

test('server-verified phone closes reminders even when the cached user starts unverified',async({page})=>{
  await openVerification(page,{verified:true});
  await expect(page.locator('body')).toHaveAttribute('data-server-verified','true');
  await expect(reminder(page)).toHaveCount(0);
  await resume(page);
  await expect(reminder(page)).toHaveCount(0);
  expect(await page.evaluate(key=>localStorage.getItem(key),startKey)).toBeNull();
});

for(const verified of [false,true]){
  test(`profile phone badge is ${verified?'green after verification':'gray before verification'}`,async({page})=>{
    await openVerification(page,{verified,profile:true});
    const field=page.locator('div.flex.flex-col.gap-1\\.5').filter({has:page.locator('label').filter({hasText:'手机号码'})});
    await expect(field.getByText('13800138000',{exact:true})).toBeVisible();
    const badge=field.getByText(verified?'已验证':'未验证',{exact:true});
    await expect(badge).toBeVisible();
    await expect(badge).toHaveClass(verified?/text-\[#2f7d4f\]/:/text-on-surface-variant/);
    expect(await badge.evaluate(el=>getComputedStyle(el).color)).toBe(verified?'rgb(47, 125, 79)':'rgb(92, 88, 80)');
  });
}

test('successful phone binding updates the security badge and stops reminders on resume',async({page})=>{
  const server=await openVerification(page);
  await reminder(page).getByRole('button',{name:'去绑定手机',exact:true}).click();
  await expect(page.getByRole('heading',{name:'账号安全',exact:true})).toBeVisible();
  await page.getByRole('button',{name:'验证',exact:true}).click();
  await page.getByPlaceholder('13800000000').fill('13800138000');
  await page.getByPlaceholder('6 位数字验证码').fill('123456');
  await page.getByRole('button',{name:'确认绑定',exact:true}).click();
  await expect(page.getByText('绑定验证成功',{exact:true})).toBeVisible();
  expect(server.binds).toEqual([{channel:'sms',target:'13800138000',code:'123456'}]);
  await expect(page.getByText('13800138000 · 已验证',{exact:true})).toHaveClass(/text-\[#2f7d4f\]/);
  await resume(page);
  await expect(page.locator('body')).toHaveAttribute('data-server-verified','true');
  await expect(reminder(page)).toHaveCount(0);
  await page.getByRole('button',{name:'测试打开个人资料',exact:true}).click();
  await expect(page.getByRole('heading',{name:'个人资料',exact:true})).toBeVisible();
  const field=page.locator('div.flex.flex-col.gap-1\\.5').filter({has:page.locator('label').filter({hasText:'手机号码'})});
  await expect(field.getByText('已验证',{exact:true})).toHaveClass(/text-\[#2f7d4f\]/);
});
