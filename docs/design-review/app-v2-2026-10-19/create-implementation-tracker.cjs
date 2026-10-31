// Generates a documentation checklist. Never writes application code or test data.
const fs=require('node:fs');
const path=require('node:path');
const root=__dirname;
const manifest=JSON.parse(fs.readFileSync(path.join(root,'manifest.json'),'utf8'));
const assignments={
  T04:[1,2,3,4,7,8,9,10,11,51,52,79,80,81],
  T05:[5,6,12,13,14,15,16,17,18,19,64,65,82,83,84,85],
  T06:[20,21,22,23,24,25,30,86,87],
  T07:[26,27,28,29,31,32,33,34,88],
  T08:[35,36,37,38,39],
  T09:[40,41,42,43,95,99,100],
  T10:[44,45,46,47,48,49,50,89,98],
  T11:[53,54,55,56,57,58,59,60,61,62,63,90,91,92,93,94],
  T12:[66,67,68,69,70,71,72,73,74,75,76,77,78,96,97],
};
const gaps={G01:[38,40,95],G02:[37,39],G03:[42],G04:[49,99],G05:[41,100],G06:[6,40],G07:[26,45,46,47,57,90,91],G08:[10,60,61,92,93,94],G09:[67,73,74,78],G10:[1,2,3,4,17,31,33,36,37,43,46,50,59,60,61,63,79,90,91,92,93,94]};
const seen=new Map();
for(const [task,ids]of Object.entries(assignments))for(const id of ids){if(seen.has(id))throw Error('Duplicate ID '+id);seen.set(id,task);}
const missing=manifest.pages.filter(p=>!seen.has(Number(p.id)));
if(missing.length||seen.size!==manifest.pages.length)throw Error('Incomplete or extra task assignment');
const file=path.join(root,'IMPLEMENTATION-TRACKER.md');
if(fs.existsSync(file)&&process.env.INITIALIZE_UI_TRACKER!=='1')throw Error('Tracker exists. Refusing to overwrite implementation progress.');
const lines=[
'# APP V2 逐页实施与验收跟踪表',
'',
'基准：用户已批准 V2-20261019-R1 的 100 张设计；已授权 iOS 风格优化。此表初始化于计划交接，所有实现和测试尚未在本任务开展。',
'',
'实施入口：[GEMINI-HANDOFF.md](GEMINI-HANDOFF.md)；规范：[IOS-ADAPTATION.md](IOS-ADAPTATION.md)；任务：[完整计划](../../superpowers/plans/2026-10-19-app-v2-ui-gemini.md)。',
'',
'## 填写规则',
'',
'- UI 状态：未开始 / 进行中 / 已实现。接口状态：待核实 / 已接入 / 依赖阻塞。两者分别更新。',
'- 验证状态：未验证 / 通过 / 失败 / 依赖阻塞。Android、iOS、Web 分别记录；浏览器模拟不等于平台真机通过。',
'- 完成时将“入口 / 证据”替换为实际路由、按钮路径、测试命令和证据链接。不得只填写“同上”或“全部通过”。',
'- G 编号引用计划第 4 节的核实项，表示存在需要核查的依赖，不预先宣称所有对应能力均缺失。',
'- 同一组件可覆盖多张模式 / 状态图，但每个编号都要有实际触发方式。不得把静态 PNG 当成已实现 UI。',
'- iOS 样式差异追加到“入口 / 证据”；涉及业务流程变更时写明依据，不能静默删功能。',
'',
'| 编号 | 页面 / 状态 | 任务 | 核实项 | UI | 接口 | Android | iOS | Web / 共享契约 | 入口 / 证据 |',
'|---|---|---|---|---|---|---|---|---|---|',
];
for(const p of manifest.pages){const dependencies=Object.entries(gaps).filter(([,ids])=>ids.includes(Number(p.id))).map(([id])=>id).join('、')||'常规权限 / API';const img=encodeURI(p.image);lines.push(`| ${p.id} | [${p.title.replaceAll('|','／')}](${img}) | ${seen.get(Number(p.id))} | ${dependencies} | 未开始 | 待核实 | 未验证 | 未验证 | 未验证 | 原入口：${p.source.replaceAll('|','／')}；实施后记录实际入口与证据 |`);}
lines.push('','## 原功能额外保留项','','- [ ] 原统计报表：趋势、状态分布、团队负载、时间范围；工作 → 统计，归 T05。','- [ ] 帮助与快捷键：手机帮助入口与桌面键盘操作；我的 → 帮助，归 T05 / T11。','- [ ] 原 API / 日期 / 重复任务 / 认证刷新 / 权限语义，归 T13。','- [ ] APP 提交 → Web 已读 → 小程序回读的三端样例，归 T13。','','## 模块交付记录','','- T00—T03：基础、导航与宿主尚未实施。','- T04—T12：按上表逐页更新。','- T13—T15：兼容与设备验收尚未开展。','- 接口缺口明细由 Gemini 在 T00 创建 API-GAPS.md。','- 实施总结由 Gemini 创建 IMPLEMENTATION-REPORT.md，记录变更、证据与剩余阻塞。','');
fs.writeFileSync(file,lines.join('\n'));
console.log(JSON.stringify({pages:manifest.pages.length,assigned:seen.size,taskCounts:Object.fromEntries(Object.entries(assignments).map(([task,ids])=>[task,ids.length])),output:file},null,2));
