const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');

const event = id => ({ currentTarget: { dataset: { id } } });
const pageItem = (id, meta = {}) => ({ id, title: '共享页' + id, body_text: '已发布的共享正文', source: 'llm_wiki', meta, updated_at: null });
const catalog = (projectId = 1, allowed = true, manager = false) => ({ data: {
  scope: { company_id: 3, project_id: projectId, owner_user_id: 7 }, pages: [pageItem(11), pageItem(12)],
  permissions: { can_summarize: allowed, can_manage_grants: manager },
  members: manager ? [{ user_id: 8, name: '同事', can_summarize: false, is_manager: false }] : [],
} });
const draft = (id = 41) => ({ id, title: '模型总结', body_text: '来自所选页的总结', sources: [{ page_id: 11, title: '共享页11', quote: '共享正文' }], page_ids: [11], status: 'draft', provider: 'openai_compatible', model_source: 'user', personal_entry_id: null });
function load(request, wxOverrides = {}, file = '../pages/project-knowledge/project-knowledge.js') {
  let definition;
  const storage = {};
  runInNewContext(readFileSync(path.join(__dirname, file), 'utf8'), {
    Page: value => { definition = value; }, require: () => request, getApp: () => ({ globalData: { userInfo: { id: 7 } } }),
    wx: { showToast() {}, showModal: value => value.success({ confirm: true }), getStorageSync: key => storage[key], setStorageSync: (key, value) => { storage[key] = value; }, ...wxOverrides },
  });
  return { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(value, done) { Object.assign(this.data, value); if (done) done(); } };
}

test('ungranted members read shared pages but cannot generate a summary', async () => {
  let posts = 0;
  const page = load({ get: async () => catalog(1, false), post: async () => { posts++; } });
  await page.onLoad({ project_id: '1' });
  page.togglePage(event(11)); await page.generateSummary();
  assert.equal(page.data.pages.length, 2); assert.equal(page.data.permissions.can_summarize, false);
  assert.equal(posts, 0); assert.equal(page.data.summary, null);
});

test('selected pages generate a cited editable draft without saving it', async () => {
  const calls = [];
  const page = load({ get: async () => catalog(), post: async (url, body) => { calls.push({ url, body }); return { data: draft() }; } });
  await page.onLoad({ project_id: '1', project_name: '交付项目' });
  page.togglePage(event(11)); page.onInstruction({ detail: { value: '提炼验收步骤' } });
  await page.generateSummary();
  assert.equal(calls.length, 1); assert.equal(calls[0].url, '/projects/1/knowledge-space/summaries');
  assert.equal(JSON.stringify(calls[0].body), '{"page_ids":[11],"instruction":"提炼验收步骤"}');
  assert.equal(page.data.formBody, '来自所选页的总结'); assert.equal(page.data.summary.sources[0].page_id, 11);
  assert.equal(page.data.savedEntry, null);
});

test('save requires confirmation and sends reviewed text and tags to the owner-scoped endpoint', async () => {
  let confirm = false, call;
  const page = load({ get: async () => catalog(), post: async (url, body) => { call = { url, body }; return { data: { entry: { id: 91 }, already_saved: false } }; } }, { showModal: options => options.success({ confirm }) });
  await page.onLoad({ project_id: '1' }); page.applySummary(draft());
  page.onTitle({ detail: { value: ' 我的验收知识 ' } }); page.onBody({ detail: { value: '我审核过的内容' } }); page.onTags({ detail: { value: '验收，交付,验收' } });
  await page.saveSummary(); assert.equal(call, undefined);
  confirm = true; await page.saveSummary();
  assert.equal(call.url, '/projects/1/knowledge-space/summaries/41/save');
  assert.equal(JSON.stringify(call.body), '{"title":"我的验收知识","body_text":"我审核过的内容","tags":["验收","交付"]}');
  assert.equal(page.data.savedEntry.id, 91); assert.equal(page.data.summary.status, 'saved');
});

test('model and source-change errors remain visible and preserve draft edits', async () => {
  const page = load({ get: async () => catalog(), post: async url => { throw new Error(url.endsWith('/save') ? '来源已变化，请重新总结' : '请配置可用的个人模型'); } });
  await page.onLoad({ project_id: '1' }); page.applySummary(draft()); page.onBody({ detail: { value: '未保存的人工修订' } });
  await page.saveSummary(); assert.equal(page.data.formBody, '未保存的人工修订'); assert.match(page.data.error, /来源已变化/);
  page.togglePage(event(11)); await page.generateSummary();
  assert.match(page.data.error, /配置可用/); assert.equal(page.data.formBody, '未保存的人工修订'); assert.equal(page.data.summary.id, 41);
});

test('manager grants use server-confirmed PUT results and failed changes retain member state', async () => {
  let fail = true, call;
  const page = load({ get: async () => catalog(1, true, true), put: async (url, body) => { call = { url, body }; if (fail) throw new Error('授权已撤销'); return { data: { user_id: 8, name: '同事', can_summarize: true, is_manager: false } }; } });
  await page.onLoad({ project_id: '1' });
  const toggle = { ...event(8), detail: { value: true } };
  await page.changeGrant(toggle); assert.equal(page.data.members[0].can_summarize, false); assert.match(page.data.error, /授权已撤销/);
  fail = false; await page.changeGrant(toggle);
  assert.equal(call.url, '/projects/1/knowledge-space/grants/8'); assert.equal(JSON.stringify(call.body), '{"can_summarize":true}');
  assert.equal(page.data.members[0].can_summarize, true);
});

test('late generation cannot populate a new project and unload ignores late saves', async () => {
  let releaseGenerate, releaseSave;
  const page = load({ get: async url => catalog(url.includes('/2/') ? 2 : 1), post: url => new Promise(resolve => { if (url.endsWith('/save')) releaseSave = resolve; else releaseGenerate = resolve; }) });
  await page.onLoad({ project_id: '1' }); page.togglePage(event(11)); const pending = page.generateSummary();
  await page.setProject('2', '项目二'); releaseGenerate({ data: draft() }); await pending;
  assert.equal(page.data.projectId, '2'); assert.equal(page.data.summary, null); assert.equal(page.data.formBody, '');
  page.applySummary(draft()); const save = page.saveSummary(); await Promise.resolve();
  page.onUnload(); releaseSave({ data: { entry: { id: 91 }, already_saved: false } }); await save;
  assert.equal(page.data.savedEntry, null);
});

test('summary IDs restore through the private draft GET and saved copies open the current personal project', async () => {
  const calls = [], navigations = [];
  const page = load({ get: async url => { calls.push(url); return url.endsWith('/41') ? { data: { ...draft(), status: 'saved', personal_entry_id: 91 } } : catalog(); } }, { navigateTo: value => navigations.push(value.url) });
  await page.onLoad({ project_id: '1', summary_id: '41' });
  assert.equal(calls[1], '/projects/1/knowledge-space/summaries/41'); assert.equal(page.data.summary.id, 41);
  page.openSavedEntry(); assert.equal(navigations[0], '/pages/knowledge/knowledge?project_id=1&entry_id=91');
});

test('source graph uses published citation facts and independent dragging follows true endpoints', async () => {
  const page = load({ get: async () => ({ data: { ...catalog().data, pages: [pageItem(11, { facts: [{ package_id: 31, source_name: '验收.txt', quote: '已发布引用' }] }), pageItem(12)] } }) });
  await page.onLoad({ project_id: '1' });
  assert.equal(page.data.nodes.length, 3); assert.equal(page.data.edges.length, 1);
  assert.equal(page.data.edges[0].source, 'package:31'); assert.equal(page.data.edges[0].target, 'page:11');
  const other = page.data.nodes.find(node => node.id === 'page:12').x;
  page.onNodeMove({ ...event('page:11'), detail: { source: 'touch', x: 450, y: 200 } });
  assert.equal(page.data.edges[0].endX, 450); assert.equal(page.data.edges[0].endY, 200 + 52 * page.data.zoom);
  assert.equal(page.data.nodes.find(node => node.id === 'page:12').x, other);
});

test('personal project entry keeps project scope and labels saved summaries', async () => {
  let navigation;
  const personal = load({}, { navigateTo: value => { navigation = value.url; } }, '../pages/knowledge/knowledge.js');
  personal.setData({ projectId: '2', projectName: '我的项目', entries: [{ id: 91, title: '总结', body_text: '正文', tags: [], source_type: 'project_summary' }] });
  personal.refreshView(); personal.openProjectKnowledge();
  assert.equal(navigation, '/pages/project-knowledge/project-knowledge?project_id=2&project_name=' + encodeURIComponent('我的项目'));
  assert.equal(personal.data.entries[0].sourceLabel, '项目知识总结');
});

test('project detail opens its shared knowledge space with the real project ID', () => {
  let navigation;
  const detail = load({}, { navigateTo: value => { navigation = value.url; } }, '../pages/project-detail/project-detail.js');
  detail.projectId = 27; detail.setData({ project: { id: 27, name: '交付项目' }, loading: false });
  detail.openProjectKnowledge();
  assert.equal(navigation, '/pages/project-knowledge/project-knowledge?project_id=27&project_name=' + encodeURIComponent('交付项目'));
});

test('saved personal knowledge link opens the returned entry after a real catalog load', async () => {
  const personal = load({ get: async url => {
    if (url === '/companies/mine') return { data: [{ id: 3 }] };
    if (url.startsWith('/projects?')) return { data: [{ id: 1, name: '当前项目' }] };
    return { data: { scope: { project_id: 1 }, entries: [{ id: 91, title: '已确认总结', body_text: '人工修订', tags: [], source_type: 'project_summary' }], links: [] } };
  } }, {}, '../pages/knowledge/knowledge.js');
  await personal.onLoad({ project_id: '1', entry_id: '91' });
  assert.equal(personal.data.detail.id, 91); assert.equal(personal.data.detail.sourceLabel, '项目知识总结');
});

test('source graph redraws cubic curves after detail closes and normalizes negative view positions', async () => {
  let curves = [];
  const ctx = { clearRect(){ curves = []; }, setLineWidth(){}, setStrokeStyle(){}, beginPath(){}, moveTo(){}, bezierCurveTo(...args){ curves.push(args); }, stroke(){}, lineTo(){}, draw(){} };
  const page = load({ get: async () => ({ data: { ...catalog().data, pages: [pageItem(11, { facts: [{ package_id: 31, quote: '来源' }] })] } }) }, { createCanvasContext: () => ctx });
  await page.onLoad({ project_id: '1' }); page.setData({ mode: 'graph' });
  page._positions = { 'package:31': { x: -100, y: -50 }, 'page:11': { x: 300, y: 50 } }; page.refreshView();
  assert.equal(page.data.nodes[0].x, 0); assert.equal(page.data.nodes[1].x, 320);
  assert.deepEqual(curves[0], [248, 41.6, 248, 121.6, 320, 121.6]);
  page.openPage(event('page:11')); curves = []; page.closeDetail();
  assert.equal(curves.length, 1);
});
