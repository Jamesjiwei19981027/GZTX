// Read-only checks for the design-to-implementation documentation handoff.
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const approval=JSON.parse(fs.readFileSync(path.join(root,'approval.json'),'utf8'));
const plan=path.resolve(root,'../../superpowers/plans/2026-10-19-app-v2-ui-gemini.md');
const files=['README.md','GEMINI-HANDOFF.md','IOS-ADAPTATION.md','IMPLEMENTATION-TRACKER.md'].map(f=>path.join(root,f)).concat(plan);
const broken=[];
for(const file of files){const text=fs.readFileSync(file,'utf8');for(const match of text.matchAll(/\[[^\]]*\]\(([^)]+)\)/g)){const href=match[1];if(/^(https?:|#)/.test(href))continue;const target=path.resolve(path.dirname(file),decodeURIComponent(href.split('#')[0]));if(!fs.existsSync(target))broken.push({file:path.basename(file),href});}}
const ledger=fs.readFileSync(path.join(root,'IMPLEMENTATION-TRACKER.md'),'utf8');
const rows=[...ledger.matchAll(/^\| (\d{2,3}) \| .*? \| (T\d{2}) \|/gm)];
const ids=new Set(rows.map(m=>m[1]));
const taskIds=[...fs.readFileSync(plan,'utf8').matchAll(/^### (T\d{2})：/gm)].map(m=>m[1]);
const missingScreens=manifest.pages.filter(p=>!ids.has(p.id));
const missingImages=manifest.pages.filter(p=>!fs.existsSync(path.join(root,p.image)));
const placeholders=files.flatMap(file=>{const text=fs.readFileSync(file,'utf8');return /\b(TODO|TBD|FIXME)\b/.test(text)?[path.basename(file)]:[];});
const result={checkedAt:new Date().toISOString(),approved:approval.visualStatus==='approved',approvedScreens:approval.approvedScreenCount,manifestScreens:manifest.pages.length,trackedRows:rows.length,uniqueTrackedIds:ids.size,planTasks:taskIds.length,taskIds,brokenLocalLinks:broken,missingScreens:missingScreens.map(p=>p.id),missingImages:missingImages.map(p=>p.id),placeholderFiles:placeholders,implementationExecuted:false};
if(!result.approved||result.approvedScreens!==100||result.manifestScreens!==100||rows.length!==100||ids.size!==100||taskIds.length!==16||broken.length||missingScreens.length||missingImages.length||placeholders.length)throw Error(JSON.stringify(result,null,2));
fs.writeFileSync(path.join(root,'handoff-check.json'),JSON.stringify(result,null,2));
console.log(JSON.stringify(result,null,2));
