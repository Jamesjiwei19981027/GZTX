/** Real login + desktop browser and installed Android APP; no API interception. */
import {chromium, expect, type Page, type Locator} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';
const origin='http://127.0.0.1:5177';
const endpoint='http://127.0.0.1:9222';
const run=promisify(execFile);
const adb='C:/Users/11580/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const out='android-acceptance/test-results/five-tab-navigation';
const checks:string[]=[];
await mkdir(out,{recursive:true});
const passed=(value:string)=>{checks.push(value);console.log('PASS '+value)};
async function login(page:Page){
  if(await page.locator('input[type=password]').isVisible()){
    await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill('axis_pm');
    await page.locator('input[type=password]').fill(process.env.AXIS_LIVE_PASSWORD||'axis-debug-2026');
    await page.locator('form button[type=submit]').click();
  }
}
const desktop=await chromium.launch();
try{
  const page=await desktop.newPage({viewport:{width:1440,height:1000}});
  await page.goto(origin);await login(page);
  const aside=page.locator('aside');
  for(const name of ['工作','人轴','知识','消息','我的'])await expect(aside.getByRole('button',{name,exact:true})).toBeVisible();
  await page.getByRole('button',{name:'查看汇报',exact:true}).click();
  await expect(page.getByRole('heading',{name:'AI 汇报与助手',exact:true})).toBeVisible();
  await expect(aside.getByRole('button',{name:'工作',exact:true})).toHaveAttribute('aria-current','page');
  passed('桌面真实登录：五个主入口与工作中的 AI 汇报页面可达');
  await aside.getByRole('button',{name:'知识',exact:true}).click();
  await page.getByLabel('知识空间项目',{exact:true}).selectOption('1');
  await expect(page.getByRole('tab',{name:'我的知识',exact:true})).toBeVisible();
  await page.getByRole('tab',{name:'项目知识',exact:true}).click();
  await expect(page.getByRole('heading',{name:'项目知识',exact:true})).toBeVisible();
  await page.screenshot({path:out+'/desktop.png'});
  passed('桌面知识独立入口：本人和项目知识使用真实后端读取');
}finally{await desktop.close()}
const android=await chromium.connectOverCDP(endpoint,{noDefaults:true});
try{
  const page=android.contexts()[0].pages()[0];page.setDefaultTimeout(20000);
  const tap=async(locator:Locator)=>{
    const ime=(await run(adb,['-s','emulator-5554','shell','dumpsys','input_method'])).stdout;
    if(/mInputShown=true/.test(ime))await run(adb,['-s','emulator-5554','shell','input','keyevent','111']);
    await locator.scrollIntoViewIfNeeded();await locator.evaluate(el=>el.scrollIntoView({block:'center',behavior:'instant'}));
    await expect.poll(()=>locator.evaluate(el=>{const b=el.getBoundingClientRect(),hit=document.elementFromPoint(b.x+b.width/2,b.y+b.height/2);return hit===el||!!hit&&el.contains(hit)})).toBe(true);
    const b=(await locator.boundingBox())!;
    const targets=await(await fetch(endpoint+'/json/list')).json() as {url:string;description:string}[];
    const v=JSON.parse(targets.find(t=>t.url===page.url())!.description);const d=await page.evaluate(()=>devicePixelRatio);
    await run(adb,['-s','emulator-5554','shell','input','tap',String(Math.round(v.screenX+(b.x+b.width/2)*d)),String(Math.round(v.screenY+(b.y+b.height/2)*d))]);
  };
  await page.goto(origin);await login(page);
  const nav=page.getByRole('tablist',{name:'主要页面导航',exact:true});
  await expect(nav.getByRole('tab')).toHaveText(['工作','人轴','知识','消息','我的']);
  for(const name of ['工作','人轴','知识','消息','我的']){await tap(nav.getByRole('tab',{name,exact:true}));await expect(nav.getByRole('tab',{name,exact:true})).toHaveAttribute('aria-selected','true')}
  passed('Android 安装 APP：ADB 实际点击全部五个 Tab，顺序和选中状态正确');
  await tap(nav.getByRole('tab',{name:'知识',exact:true}));
  await page.getByLabel('知识空间项目',{exact:true}).selectOption('1');
  await tap(page.getByRole('tab',{name:'项目知识',exact:true}));
  await expect(page.getByRole('heading',{name:'项目知识',exact:true})).toBeVisible();
  await tap(page.getByRole('tab',{name:'我的知识',exact:true}));
  await tap(page.getByRole('button',{name:'询问知识助手',exact:true}));
  await expect(page.getByRole('heading',{name:'与我的 AI 对话',exact:true})).toBeVisible();
  await tap(page.getByRole('button',{name:'返回',exact:true}));
  await expect(page.getByRole('heading',{name:'我的知识空间',exact:true})).toBeVisible();
  passed('Android 知识 Tab：项目知识、个人知识和知识助手往返可用');
  await tap(nav.getByRole('tab',{name:'工作',exact:true}));
  await tap(page.getByRole('button',{name:'查看汇报',exact:true}));
  await expect(page.getByRole('heading',{name:'AI 汇报与助手',exact:true})).toBeVisible();
  await expect(nav.getByRole('tab',{name:'工作',exact:true})).toHaveAttribute('aria-selected','true');
  await tap(page.getByRole('button',{name:'返回',exact:true}));
  await expect(page.getByRole('region',{name:'待办汇总'})).toBeVisible();
  passed('Android 工作 Tab：AI 汇报入口和返回工作首页可用');
  await page.goto(origin+'/?view=ai');
  await expect(page.getByRole('heading',{name:'AI 汇报与助手',exact:true})).toBeVisible();
  await expect(nav.getByRole('tab',{name:'工作',exact:true})).toHaveAttribute('aria-selected','true');
  await page.goto(origin+'/?view=knowledge');
  await expect(nav.getByRole('tab',{name:'知识',exact:true})).toHaveAttribute('aria-selected','true');
  await page.screenshot({path:out+'/android.png'});
  passed('Android 旧 AI 深链归工作、知识深链直达独立 Tab');
  await writeFile(out+'/result.json',JSON.stringify({status:'passed',checks,mockedApi:false,realAndroid:true},null,2));
}finally{await android.close()}
