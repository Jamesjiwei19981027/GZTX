const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');

const entry = (id, title, position = null) => ({ id, title, body_text: '正文', tags: ['验收'], position, source_type: 'manual', source_id: null, source_ref: {}, updated_at: null });
const event = id => ({ currentTarget: { dataset: { id } } });
function load(request, wxOverrides = {}) {
  let definition;
  runInNewContext(readFileSync(path.join(__dirname, '../pages/knowledge/knowledge.js'), 'utf8'), {
    Page: value => { definition = value; }, require: () => request,
    wx: { showToast() {}, showModal: value => value.success({ confirm: true }), ...wxOverrides },
  });
  return { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(value, done) { Object.assign(this.data, value); if (done) done(); } };
}
const scopeResponse = entries => ({ data: { scope: { company_id: 3, project_id: 1, owner_user_id: 7 }, entries, links: [] } });

test('new and edited entries save current project title, body and normalized tags', async () => {
  const calls = [];
  const page = load({ post: async (url, body) => { calls.push({ url, body }); return { data: entry(11, body.title) }; }, patch: async (url, body) => { calls.push({ url, body }); return { data: entry(11, body.title) }; } });
  page.setData({ projectId: '1' });
  page.openNew(); page.setData({ formTitle: ' 验收结论 ', formBody: '可编辑的知识', formTags: '交付，验收,交付' });
  await page.saveEntry();
  assert.equal(calls[0].url, '/projects/1/personal-knowledge/entries');
  assert.equal(JSON.stringify(calls[0].body), JSON.stringify({ title: '验收结论', body_text: '可编辑的知识', tags: ['交付', '验收'] }));
  assert.equal(page.data.entries[0].id, 11);
  page.editEntry(event(11)); page.setData({ formTitle: '修订结论' }); await page.saveEntry();
  assert.equal(calls[1].url, '/projects/1/personal-knowledge/entries/11');
  assert.equal(page.data.entries[0].title, '修订结论');
});

test('project change clears drafts and ignores a late old-project response', async () => {
  let resolveOld;
  const page = load({ get: url => url.includes('/1/') ? new Promise(resolve => { resolveOld = resolve; }) : Promise.resolve({ data: { scope: { project_id: 2 }, entries: [entry(20, '项目二')], links: [] } }) });
  page.setData({ projects: [{ id: 1, name: '一' }, { id: 2, name: '二' }] });
  const first = page.selectProject('1');
  page.openNew(); page.setData({ formBody: '项目一私密草稿' });
  await page.selectProject('2'); resolveOld(scopeResponse([entry(10, '旧项目')])); await first;
  assert.equal(page.data.projectId, '2'); assert.equal(page.data.entries[0].id, 20);
  assert.equal(page.data.formBody, ''); assert.equal(page.data.editorOpen, false);
});

test('manual labeled links use entry IDs and deletion removes the connection', async () => {
  const calls = [];
  const page = load({ post: async (url, body) => { calls.push({ url, body }); return { data: { id: 8, ...body } }; }, del: async url => { calls.push({ url }); return { data: { id: 8, is_deleted: true } }; } });
  page.setData({ projectId: '1', entries: [entry(11, '一'), entry(12, '二')] });
  page.openLink(); page.setData({ linkSourceIndex: 0, linkTargetIndex: 1, linkLabel: '支持结论' }); await page.saveLink();
  assert.equal(calls[0].url, '/projects/1/personal-knowledge/links');
  assert.equal(JSON.stringify(calls[0].body), JSON.stringify({ source_entry_id: 11, target_entry_id: 12, label: '支持结论' }));
  assert.equal(page.data.links[0].label, '支持结论'); await page.deleteLink(event(8));
  assert.equal(calls[1].url, '/projects/1/personal-knowledge/links/8'); assert.equal(page.data.links.length, 0);
});

test('sync sends empty body in current project and reloads server entries', async () => {
  let call;
  const page = load({ post: async (url, body) => { call = { url, body }; return { data: { created: 1, skipped: 2 } }; }, get: async () => scopeResponse([entry(11, '真实导入资料')]) });
  page.setData({ projectId: '1' }); await page.syncSources();
  assert.equal(call.url, '/projects/1/personal-knowledge/sync'); assert.equal(JSON.stringify(call.body), '{}');
  assert.equal(page.data.entries[0].title, '真实导入资料'); assert.equal(page.data.syncMessage.includes('1'), true);
});

test('drag follows endpoint positions and persists unscaled coordinates only at drag end', async () => {
  const patches = [];
  const page = load({ patch: async (url, body) => { patches.push({ url, body }); return { data: entry(11, '一', body.position) }; } });
  page.setData({ projectId: '1', zoom: 0.5, entries: [entry(11, '一', { x: 40, y: 60 }), entry(12, '二', { x: 400, y: 60 })], links: [{ id: 9, source_entry_id: 11, target_entry_id: 12, label: '解释' }] });
  page.refreshView();
  page.onNodeMove({ currentTarget: { dataset: { id: 11 } }, detail: { source: 'touch', x: 100, y: 80 } });
  assert.equal(page.data.entries[0].position.x, 200); assert.equal(page.data.edges[0].startX, 210);
  assert.equal(patches.length, 0); await page.onNodeDragEnd(event(11));
  assert.equal(patches[0].url, '/projects/1/personal-knowledge/entries/11');
  assert.equal(JSON.stringify(patches[0].body), '{"position":{"x":200,"y":160}}');
});

test('entry deletion needs confirmation and removes its links while retaining other entries', async () => {
  let deleted = 0;
  const page = load({ del: async () => { deleted++; return { data: { id: 11, is_deleted: true } }; } }, { showModal: value => value.success({ confirm: false }) });
  page.setData({ projectId: '1', entries: [entry(11, '一'), entry(12, '二')], links: [{ id: 9, source_entry_id: 11, target_entry_id: 12, label: '解释' }] });
  await page.deleteEntry(event(11)); assert.equal(deleted, 0); assert.equal(page.data.entries.length, 2);
});

test('search reads body and tags, and source reference can be inspected', () => {
  let source;
  const page = load({}, { showModal: value => { source = value.content; } });
  const imported = { ...entry(11, '验收'), source_type: 'agent_report', source_id: 31, source_ref: { report_id: 31, title: '周报' } };
  page.setData({ entries: [imported, { ...entry(12, '另一条'), tags: [], body_text: '无匹配' }] });
  page.onSearch({ detail: { value: '验收' } }); assert.equal(page.data.filteredEntries.length, 1);
  page.viewSource(event(11)); assert.equal(source.includes('31'), true); assert.equal(source.includes('周报'), true);
});

test('confirmed deletion removes the current entry and incident links', async () => {
  let deletion;
  const page = load({ del: async url => { deletion = url; return { data: { id: 11, is_deleted: true } }; } });
  page.setData({ projectId: '1', entries: [entry(11, '一'), entry(12, '二')], links: [{ id: 9, source_entry_id: 11, target_entry_id: 12, label: '解释' }] });
  await page.deleteEntry(event(11));
  assert.equal(deletion, '/projects/1/personal-knowledge/entries/11');
  assert.equal(page.data.entries.length, 1); assert.equal(page.data.entries[0].id, 12); assert.equal(page.data.links.length, 0);
});

test('late entry save cannot close or overwrite the new project draft', async () => {
  let resolveSave;
  const page = load({ post: () => new Promise(resolve => { resolveSave = resolve; }), get: async () => ({ data: { scope: { project_id: 2 }, entries: [], links: [] } }) });
  page.setData({ projectId: '1', projects: [{ id: 2, name: '二' }] });
  page.openNew(); page.setData({ formTitle: '旧项目新建' }); const save = page.saveEntry();
  await page.selectProject('2'); page.openNew(); page.setData({ formTitle: '新项目草稿' });
  resolveSave({ data: entry(11, '旧项目条目') }); await save;
  assert.equal(page.data.entries.length, 0); assert.equal(page.data.formTitle, '新项目草稿'); assert.equal(page.data.editorOpen, true);
});

test('project picker loads real project IDs across companies and honors a concrete requested project', async () => {
  const page = load({ get: async url => {
    if (url === '/companies/mine') return { data: { items: [{ id: 3 }, { id: 4 }] } };
    if (url.startsWith('/projects?company_id=3')) return { data: { items: [{ id: 1, name: '一' }] } };
    if (url.startsWith('/projects?company_id=4')) return { data: { items: [{ id: 2, name: '二' }] } };
    assert.equal(url, '/projects/2/personal-knowledge'); return { data: { scope: { project_id: 2 }, entries: [], links: [] } };
  } });
  await page.onLoad({ project_id: '2' });
  assert.equal(page.data.projects.length, 2); assert.equal(page.data.projectId, '2'); assert.equal(page.data.projectIndex, 1);
  assert.equal(page.data.entries.length, 0);
});

test('canvas draws smooth cubic Bezier connections using the updated endpoint', () => {
  let curve;
  const ctx = { clearRect(){}, setLineWidth(){}, setStrokeStyle(){}, setFontSize(){}, setFillStyle(){}, beginPath(){}, moveTo(){}, bezierCurveTo(...args){ curve = args; }, stroke(){}, fillText(){}, lineTo(){}, draw(){} };
  const page = load({}, { createCanvasContext: () => ctx });
  page.setData({ projectId: '1', mode: 'graph', zoom: 1, entries: [entry(11, '一', {x:40,y:60}), entry(12, '二', {x:400,y:60})], links: [{ id: 9, source_entry_id: 11, target_entry_id: 12, label: '解释' }] });
  page.refreshView(); assert.deepEqual(curve, [330,112,330,112,400,112]);
  page.onNodeMove({ currentTarget: { dataset: { id: 12 } }, detail: { source: 'touch', x: 500, y: 200 } });
  assert.deepEqual(curve, [380,112,380,252,500,252]);
});

test('a rejected graph load clears inaccessible entries and can be retried', async () => {
  let fail = true;
  const page = load({ get: async () => { if (fail) throw new Error('无权访问项目'); return scopeResponse([entry(11, '恢复')]); } });
  page.setData({ projectId: '1', entries: [entry(10, '原内容')] }); await page.reload();
  assert.equal(page.data.entries.length, 0); assert.equal(page.data.error, '无权访问项目');
  fail = false; await page.retry(); assert.equal(page.data.entries[0].title, '恢复'); assert.equal(page.data.error, '');
});

test('quick successive drags persist in order so an older response cannot restore the old position', async () => {
  let finishFirst;
  const patches = [];
  const page = load({ patch: async (url, body) => {
    patches.push(body.position.x);
    if (patches.length === 1) await new Promise(resolve => { finishFirst = resolve; });
    return { data: entry(11, '一', body.position) };
  } });
  page.setData({ projectId: '1', zoom: 1, entries: [entry(11, '一', { x: 40, y: 60 })] });
  page.onNodeMove({ ...event(11), detail: { source: 'touch', x: 100, y: 60 } }); const first = page.onNodeDragEnd(event(11));
  await Promise.resolve();
  page.onNodeMove({ ...event(11), detail: { source: 'touch', x: 200, y: 60 } }); const second = page.onNodeDragEnd(event(11));
  await Promise.resolve(); assert.deepEqual(patches, [100]);
  finishFirst(); await first; await second;
  assert.deepEqual(patches, [100, 200]); assert.equal(page.data.entries[0].position.x, 200);
});

test('relationship labels are edited with an atomic scoped PATCH', async () => {
  let call;
  const page = load({ patch: async (url, body) => { call = { url, body }; return { data: { id: 9, source_entry_id: 11, target_entry_id: 12, label: body.label } }; } }, { showModal: value => value.success({ confirm: true, content: '更新解释' }) });
  page.setData({ projectId: '1', entries: [entry(11, '一'), entry(12, '二')], links: [{ id: 9, source_entry_id: 11, target_entry_id: 12, label: '原解释' }] });
  await page.editLink(event(9));
  assert.equal(call.url, '/projects/1/personal-knowledge/links/9'); assert.equal(JSON.stringify(call.body), '{"label":"更新解释"}'); assert.equal(page.data.links[0].label, '更新解释');
});

test('closing graph overlays redraws connections on the recreated canvas', () => {
  let curves = [];
  const ctx = { clearRect(){ curves = []; }, setLineWidth(){}, setStrokeStyle(){}, setFontSize(){}, setFillStyle(){}, beginPath(){}, moveTo(){}, bezierCurveTo(...args){ curves.push(args); }, stroke(){}, fillText(){}, lineTo(){}, draw(){} };
  const page = load({}, { createCanvasContext: () => ctx });
  page.setData({ projectId: '1', mode: 'graph', zoom: 1, entries: [entry(11, '一', { x: 40, y: 60 }), entry(12, '二', { x: 400, y: 60 })], links: [{ id: 9, source_entry_id: 11, target_entry_id: 12, label: '解释' }] });
  page.refreshView();
  for (const [open, close] of [
    [() => page.openEntry(event(11)), () => page.closeDetail()],
    [() => page.openNew(), () => page.closeEditor()],
    [() => page.openLink(), () => page.closeLink()],
  ]) {
    open();
    curves = []; // wx:if removes the native canvas while an overlay is open.
    close();
    assert.deepEqual(curves, [[330, 112, 330, 112, 400, 112]]);
  }
});

test('negative Web coordinates remain visible and dragging saves world coordinates', async () => {
  const patches = [];
  const page = load({ patch: async (url, body) => { patches.push({ url, body }); return { data: entry(11, '一', body.position) }; } });
  page.setData({ projectId: '1', zoom: 0.5, entries: [entry(11, '一', { x: -160, y: -80 }), entry(12, '二', { x: 240, y: 120 })], links: [{ id: 9, source_entry_id: 11, target_entry_id: 12, label: '解释' }] });
  page.refreshView();
  assert.equal(page.data.nodes[0].x, 0); assert.equal(page.data.nodes[0].y, 0);
  assert.equal(page.data.nodes[1].x, 200); assert.equal(page.data.nodes[1].y, 100);
  assert.equal(page.data.edges[0].startX, 110); assert.equal(page.data.edges[0].endX, 200);
  assert.equal(page.data.entries[0].position.x, -160);
  page.onNodeMove({ ...event(11), detail: { source: 'touch', x: 50, y: 30 } });
  assert.equal(page.data.nodes[0].x, 50); assert.equal(page.data.nodes[0].y, 30);
  assert.equal(page.data.nodes[1].x, 200); assert.equal(page.data.nodes[1].y, 100);
  await page.onNodeDragEnd(event(11));
  assert.equal(patches[0].url, '/projects/1/personal-knowledge/entries/11');
  assert.equal(JSON.stringify(patches[0].body), '{"position":{"x":-60,"y":-20}}');
  page.onZoom({ detail: { value: 100 } });
  assert.equal(page.data.nodes[0].x, 100); assert.equal(page.data.nodes[0].y, 60);
  assert.equal(page.data.nodes[1].x, 400); assert.equal(page.data.nodes[1].y, 200);
});
