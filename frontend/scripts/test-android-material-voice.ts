/** Records through the real Android WebView microphone; no transcript is simulated. */
import {chromium,expect,type Locator} from '@playwright/test';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdir,writeFile} from 'node:fs/promises';

const endpoint='http://127.0.0.1:9222';
const browser=await chromium.connectOverCDP(endpoint,{noDefaults:true});
const page=browser.contexts()[0].pages()[0];
const run=promisify(execFile);
const adb='C:/Users/11580/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const out='android-acceptance/test-results/material-voice';
await mkdir(out,{recursive:true});
const checks:string[]=[];
const tap=async(locator:Locator)=>{
  await locator.scrollIntoViewIfNeeded();
  const box=(await locator.boundingBox())!;
  const targets=await (await fetch(endpoint+'/json/list')).json() as Array<{url:string;description:string}>;
  const view=JSON.parse(targets.find(target=>target.url===page.url())!.description);
  const ratio=await page.evaluate(()=>devicePixelRatio);
  await run(adb,['-s','emulator-5554','shell','input','tap',String(Math.round(view.screenX+(box.x+box.width/2)*ratio)),String(Math.round(view.screenY+(box.y+box.height/2)*ratio))]);
};
try {
  await page.goto('http://127.0.0.1:5177/');
  await expect(page.getByRole('tab',{name:'人轴',exact:true})).toBeVisible();
  await tap(page.getByRole('tab',{name:'人轴',exact:true}));
  await page.getByLabel('选择项目',{exact:true}).selectOption('1');
  const nodeId=await page.evaluate(async()=>{
    const moduleUrl='/src/api/backend.ts';
    const api=await import(/* @vite-ignore */moduleUrl);
    const tree=await api.getProjectTree(1);
    const queue=[...tree.nodes];
    while(queue.length){const node=queue.shift();if(node.node_type_key==='work_item'||node.node_type_key==='milestone')return String(node.id);queue.push(...(node.children||[]));}
    throw new Error('No seeded work item');
  });
  await page.evaluate(id=>(window as any).__MOBILE_NAV__.push({tab:'axis',screen:'record-progress',params:{nodeId:id}}),nodeId);
  const input=page.getByRole('textbox',{name:'文字材料',exact:true});
  await input.fill('保留的文字材料，附件可选。');
  await expect(page.getByRole('button',{name:'提交材料',exact:true})).toBeEnabled();
  checks.push('Text material is editable and submit is enabled without attachments');
  await tap(page.getByRole('button',{name:'语音输入',exact:true}));
  // Android may prompt on first use. Select its foreground microphone permission.
  const permissions=(await run(adb,['-s','emulator-5554','shell','dumpsys','package','com.worktodo.worktodo_app'])).stdout;
  if(!/android.permission.RECORD_AUDIO: granted=true/.test(permissions)){
    await run(adb,['-s','emulator-5554','shell','uiautomator','dump','--compressed','/sdcard/codex-material-permission.xml'],{timeout:15000});
    const xml=(await run(adb,['-s','emulator-5554','shell','cat','/sdcard/codex-material-permission.xml'])).stdout;
    const node=xml.match(/<node\b[^>]*resource-id="[^"]*permission_allow_foreground_only_button"[^>]*>/)?.[0];
    if(node){const coordinates=node.match(/bounds="\[(\d+),(\d+)\]\[(\d+),(\d+)\]"/)!;await run(adb,['-s','emulator-5554','shell','input','tap',String(Math.round((Number(coordinates[1])+Number(coordinates[3]))/2)),String(Math.round((Number(coordinates[2])+Number(coordinates[4]))/2))]);}
  }
  await expect(page.getByRole('status')).toContainText('正在录音',{timeout:20000});
  await expect(page.getByRole('button',{name:'提交材料',exact:true})).toBeDisabled();
  checks.push('Actual system microphone authorization and Android MediaRecorder start');
  await expect(page.getByRole('button',{name:/结束录音并转文字/})).not.toContainText('(0s)');
  const response=page.waitForResponse(response=>response.url().includes('/asr/transcribe'),{timeout:100000});
  await tap(page.getByRole('button',{name:/结束录音并转文字/}));
  const recognition=await response;
  if(recognition.status()===503){
    await expect(page.getByRole('alert')).toContainText('尚未配置');
    await expect(input).toHaveValue('保留的文字材料，附件可选。');
    await expect(page.getByRole('button',{name:'重试转写',exact:true})).toBeVisible();
    checks.push('Real recorded audio reached server; unconfigured ASR returns honest retryable error without changing text');
  }else{
    expect(recognition.status()).toBe(200);
    checks.push('Real recorded audio reached configured ASR and returned transcription');
  }
  await expect.poll(()=>page.evaluate(async()=>{
    const devices=await navigator.mediaDevices.enumerateDevices();return devices.filter(device=>device.kind==='audioinput').length;
  })).toBeGreaterThan(0);
  await page.screenshot({path:out+'/material-voice.png'});
  await writeFile(out+'/result.json',JSON.stringify({checks,status:'passed',transcriptionStatus:recognition.status(),accuracyVerified:false},null,2));
  for(const check of checks)console.log('PASS '+check);
}finally{await browser.close();}
