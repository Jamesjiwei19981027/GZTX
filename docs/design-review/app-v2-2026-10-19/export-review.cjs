const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const {createRequire}=require('node:module');
const req=createRequire(path.resolve(__dirname,'../../../frontend/package.json'));
const {chromium}=req('@playwright/test');
const root=__dirname;
const mime={'.html':'text/html; charset=utf-8','.png':'image/png','.json':'application/json; charset=utf-8','.md':'text/plain; charset=utf-8','.css':'text/css; charset=utf-8'};
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const server=http.createServer((request,response)=>{
  try{const pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);const file=path.resolve(root,'.'+(pathname==='/'?'/index.html':pathname));if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}response.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');response.end(fs.readFileSync(file));}catch{response.writeHead(404).end('Not found');}
});
async function main(){
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const base=`http://127.0.0.1:${server.address().port}`;
  const browser=await chromium.launch({headless:true});
  const results=[];
  try{
    for(const p of manifest.pages){
      const page=await browser.newPage({viewport:{width:p.width,height:p.height},deviceScaleFactor:2});
      const errors=[];page.on('pageerror',e=>errors.push(e.message));
      await page.goto(`${base}/${p.html}`,{waitUntil:'load'});
      await page.evaluate(()=>document.fonts.ready);
      const dimensions=await page.evaluate(()=>{
        const width=document.documentElement.clientWidth;
        const overflow=[...document.querySelectorAll('.content *, .appbar *, .bottom-nav *')].filter(el=>{
          if(!(el instanceof HTMLElement)&&!(el instanceof SVGElement))return false;
          const r=el.getBoundingClientRect();const style=getComputedStyle(el);return r.width>0&&style.visibility!=='hidden'&&(r.right>width+1||r.left< -1);
        }).map(el=>({tag:el.tagName,text:(el.textContent||'').trim().slice(0,60),left:Math.round(el.getBoundingClientRect().left),right:Math.round(el.getBoundingClientRect().right)}));
        return{width,scrollWidth:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight,overflow};
      });
      await page.screenshot({path:path.join(root,p.image),fullPage:true,animations:'disabled'});
      results.push({id:p.id,title:p.title,...dimensions,errors});
      await page.close();
      console.log(`${p.id} ${p.title} ${dimensions.width}x${dimensions.height}${dimensions.overflow.length?' OVERFLOW '+JSON.stringify(dimensions.overflow):''}`);
    }
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    await page.goto(base,{waitUntil:'networkidle'});
    await page.locator('.entry img').evaluateAll(async imgs=>{for(const img of imgs)img.loading='eager';await Promise.all(imgs.map(img=>img.decode().catch(()=>{})));});
    const broken=await page.locator('.entry img').evaluateAll(imgs=>imgs.filter(img=>!img.complete||img.naturalWidth===0).map(img=>img.getAttribute('src')));
    await page.locator('[data-index="19"]').first().click();
    await page.waitForFunction(()=>document.querySelector('#large').complete&&document.querySelector('#large').naturalWidth>0);
    const selected=await page.locator('#screen-title').innerText();
    if(!selected.startsWith('20'))throw Error('Review navigation failed: '+selected);
    await page.locator('#feedback').fill('自动检查：审核意见保存和导出入口可用。');
    await page.locator('#save').click();
    const saved=await page.evaluate(()=>JSON.parse(localStorage.getItem('worktodo-app-v2-review-20261019')||'{}')['20']);
    if(!saved)throw Error('Review feedback not saved');
    await page.locator('#next').click();
    if(!(await page.locator('#screen-title').innerText()).startsWith('21'))throw Error('Next navigation failed');
    await page.keyboard.press('Escape');
    const downloadEvent=page.waitForEvent('download');
    await page.locator('#export').click();
    const download=await downloadEvent;
    const downloaded=JSON.parse(fs.readFileSync(await download.path(),'utf8'));
    if(downloaded.reviews[0]?.id!=='20')throw Error('Feedback export lost saved review');
    await page.screenshot({path:path.join(root,'review-gallery.png')});
    await page.evaluate(()=>localStorage.removeItem('worktodo-app-v2-review-20261019'));
    const summary={generatedAt:new Date().toISOString(),count:results.length,pageErrors:results.filter(p=>p.errors.length),horizontalOverflow:results.filter(p=>p.overflow.length),brokenImages:broken,reviewNavigation:'passed',feedbackSave:'passed',feedbackExport:'passed',pages:results};
    fs.writeFileSync(path.join(root,'render-check.json'),JSON.stringify(summary,null,2));
    if(summary.pageErrors.length||summary.horizontalOverflow.length||broken.length)throw Error('Design export checks found issues; see render-check.json');
    console.log(JSON.stringify({status:'passed',screens:results.length,brokenImages:0,horizontalOverflow:0,reviewNavigation:'passed'}));
  }finally{await browser.close();server.close();}
}
main().catch(e=>{console.error(e);server.close();process.exitCode=1});
