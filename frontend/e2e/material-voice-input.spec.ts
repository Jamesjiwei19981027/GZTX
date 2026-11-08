import {expect,test} from '@playwright/test';

async function mount(page:any, denied=false) {
  await page.setViewportSize({width:390,height:844});
  await page.route('**/api/v1/nodes/9', (route:any)=>route.fulfill({json:{code:200,data:{id:9,title:'本周交付'}}}));
  await page.route((url:URL)=>url.pathname==='/',(route:any)=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><meta charset="utf-8"><body><div id="root"></div>
    <script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
    <script type="module">
      import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css';import {MobileEvidenceSubmitScreen} from '/src/mobile/features/people-axis/MobileEvidenceScreens.tsx';
      window.__stoppedTracks=0;
      Object.defineProperty(navigator,'mediaDevices',{configurable:true,value:{getUserMedia:async()=>{${denied?"throw new DOMException('denied','NotAllowedError');":"return {getTracks:()=>[{stop:()=>window.__stoppedTracks++}]};"}}}});
      window.MediaRecorder=class{static isTypeSupported(){return true;}state='inactive';mimeType='audio/webm';start(){this.state='recording';}stop(){this.state='inactive';this.ondataavailable?.({data:new Blob(['recorded-audio'],{type:'audio/webm'})});this.onstop?.();}};
      function App(){const [project,setProject]=React.useState(1);return React.createElement(React.Fragment,null,React.createElement('button',{onClick:()=>setProject(2)},'切换项目'),React.createElement(MobileEvidenceSubmitScreen,{projectId:project,companyId:3,nodeId:9,currentUser:{id:'7',name:'员工'}}));}
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
    </script></body></html>`}));
  await page.goto('/');
}

test('text material can be submitted without attachments',async({page})=>{
  let body:any;
  await page.route('**/api/v1/nodes/9/evidence',route=>{body=route.request().postDataJSON();return route.fulfill({json:{code:200,data:{id:1}}});});
  await mount(page);
  await page.getByRole('textbox',{name:'文字材料',exact:true}).fill('今天完成联调，等待客户验收。');
  await page.getByRole('button',{name:'提交材料',exact:true}).click();
  await expect.poll(()=>body).toMatchObject({summary_text:'今天完成联调，等待客户验收。',file_ids:[]});
});

test('dictation appends editable words and stops all microphone tracks',async({page})=>{
  let requests=0;
  await page.route('**/api/v1/asr/transcribe',route=>{requests++;expect(route.request().postData()).toContain('name="project_id"\r\n\r\n1');return route.fulfill({json:{code:200,data:{text:'语音补充：明天验收。'}}});});
  await mount(page);
  const text=page.getByRole('textbox',{name:'文字材料',exact:true});
  await text.fill('原有材料内容');
  await page.getByRole('button',{name:'语音输入',exact:true}).click();
  await expect(page.getByRole('status')).toContainText('正在录音');
  await expect(page.getByRole('button',{name:'提交材料',exact:true})).toBeDisabled();
  await page.getByRole('button',{name:/结束录音并转文字/}).click();
  await expect(text).toHaveValue('原有材料内容\n语音补充：明天验收。');
  await text.fill('核对并修改后的材料');
  expect(requests).toBe(1);
  expect(await page.evaluate(()=>(window as any).__stoppedTracks)).toBeGreaterThan(0);
});

test('permission denial leaves typed material intact',async({page})=>{
  await mount(page,true);
  await page.getByRole('textbox',{name:'文字材料',exact:true}).fill('已有事实');
  await page.getByRole('button',{name:'语音输入',exact:true}).click();
  await expect(page.getByRole('alert')).toContainText('麦克风权限未开启');
  await expect(page.getByRole('textbox',{name:'文字材料',exact:true})).toHaveValue('已有事实');
});

test('cancelled recording never uploads and late transcription cannot cross project',async({page})=>{
  let calls=0;let resolve:(()=>void)|undefined;
  await page.route('**/api/v1/asr/transcribe',async route=>{calls++;await new Promise<void>(done=>{resolve=done;});await route.fulfill({json:{code:200,data:{text:'旧项目录音'}}}).catch(()=>{});});
  await mount(page);
  await page.getByRole('button',{name:'语音输入',exact:true}).click();
  await page.getByRole('button',{name:'取消语音',exact:true}).click();
  expect(calls).toBe(0);
  await page.getByRole('button',{name:'语音输入',exact:true}).click();
  await page.getByRole('button',{name:/结束录音并转文字/}).click();
  await expect.poll(()=>calls).toBe(1);
  await page.getByRole('button',{name:'切换项目',exact:true}).click();
  resolve?.();
  await expect(page.getByRole('textbox',{name:'文字材料',exact:true})).toHaveValue('');
});

test('failed transcription preserves typed text and allows retry of the same audio',async({page})=>{
  let calls=0;
  await page.route('**/api/v1/asr/transcribe',route=>{
    calls++;
    return calls===1?route.fulfill({status:503,json:{code:50300,message:'语音转写服务尚未配置'}}):route.fulfill({json:{code:200,data:{text:'重试识别文字'}}});
  });
  await mount(page);
  const text=page.getByRole('textbox',{name:'文字材料',exact:true});
  await text.fill('已有进展');
  await page.getByRole('button',{name:'语音输入',exact:true}).click();
  await page.getByRole('button',{name:/结束录音并转文字/}).click();
  await expect(page.getByRole('alert')).toContainText('尚未配置');
  await expect(text).toHaveValue('已有进展');
  await page.getByRole('button',{name:'重试转写',exact:true}).click();
  await expect(text).toHaveValue('已有进展\n重试识别文字');
});

test('ASR settings report success only after the configuration is actually saved',async({page})=>{
  let saved:any, finish:(()=>void)|undefined;
  await page.route('**/api/v1/notifications/llm-config',route=>route.fulfill({json:{code:200,data:{provider:'openai',base_url:'',model:'gpt-4o',enabled:false,configured:false,has_api_key:false}}}));
  await page.route('**/api/v1/companies/3/bindings',route=>route.fulfill({json:{code:200,data:{asr:{provider_id:'builtin',config_json:null}}}}));
  await page.route('**/api/v1/companies/3/bindings/asr',async route=>{
    saved=route.request().postDataJSON();
    await new Promise<void>(resolve=>{finish=resolve;});
    await route.fulfill({json:{code:200,data:{provider_id:'cloud:whisper',has_api_key:true}}});
  });
  await page.route((url:URL)=>url.pathname==='/',route=>route.fulfill({contentType:'text/html',body:`<!doctype html><html><meta charset="utf-8"><body><div id="root"></div>
    <script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
    <script type="module">import React from '/node_modules/.vite/deps/react.js';import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
    import {AdminAiServicesSection} from '/src/components/admin/EnterpriseSettingsSections.tsx';
    ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(AdminAiServicesSection,{isAdmin:true,companyId:3,lang:'zh'}));</script></body></html>`}));
  await page.goto('/');
  await page.getByRole('button',{name:'Whisper 兼容服务',exact:true}).click();
  await page.getByLabel('语音服务地址',{exact:true}).fill('https://speech.example.test/v1');
  await page.getByLabel('语音服务密钥',{exact:true}).fill('test-voice-key');
  await page.getByRole('button',{name:'保存 ASR 语音配置',exact:true}).click();
  await expect.poll(()=>!!saved).toBe(true);
  await expect(page.getByText('语音识别引擎参数已更新！',{exact:true})).toHaveCount(0);
  expect(saved.provider_id).toBe('cloud:whisper');
  expect(saved.config_json.base_url).toBe('https://speech.example.test/v1');
  finish?.();
  await expect(page.getByText('语音识别引擎参数已更新！',{exact:true})).toBeVisible();
  await expect(page.getByLabel('语音服务密钥',{exact:true})).toHaveValue('');
});
