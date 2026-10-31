const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');

function load(request, wxOverrides = {}) {
  let definition;
  runInNewContext(readFileSync(path.join(__dirname, '../pages/people-axis/people-axis.js'), 'utf8'), {
    Page: value => { definition = value; }, require: () => request,
    getApp: () => ({ globalData: { userInfo: { id: 7 },baseUrl:'https://app.example.test/api/v1',token:'test-token' } }),
    wx: { showToast() {}, showModal(value) { value.success({ confirm: true }); }, ...wxOverrides },
  });
  return { ...definition, data: { ...definition.data }, setData(value) { Object.assign(this.data, value); } };
}

test('people cards cap matter previews at three and preserve primary/secondary permissions', async () => {
  const posts = [];
  const nodes = [{ id: 10, title: '主责任', node_type_key: 'person', node_origin: 'project', parent_id: null, assignees: [{ user_id: 7, role_key: 'primary' }] },
    { id: 20, title: '下辖责任', node_type_key: 'person', node_origin: 'subordinate', parent_id: 10 },
    ...[1, 2, 3, 4].map(id => ({ id, title: '事项' + id, node_type_key: 'work_item', parent_id: 10 }))];
  const request = { get: async url => {
    if (url.endsWith('/tree?format=flat')) return { data: { nodes } };
    if (url.endsWith('/my-permissions')) return { data: { is_pm: false, node_permissions: { 10: { can_add_subordinate: true, can_edit_person: true }, 20: { can_move_person: true, can_delete_person: true } } } };
    if (url.endsWith('/members')) return { data: { items: [{ user_id: 8, display_name: '现有成员' }] } };
    return { data: { id: 1, company_id: 3, name: '项目' } };
  }, post: async (url, body) => { posts.push({ url, body }); return { data: { id: 21 } }; } };
  const page = load(request);
  await page.onLoad({ project_id: '1' });
  assert.equal(page.data.cards[0].matters.length, 3);
  assert.equal(page.data.cards[0].matterCount, 4);
  assert.equal(page.data.cards[0].canMove, false);
  assert.equal(page.data.cards[1].canMove, true);
  page.openAdd({ currentTarget: { dataset: { id: 10 } } });
  page.setData({ formTitle: '新增下级', memberIndex: 0 });
  await page.savePerson();
  assert.equal(posts[0].body.parent_id, 10);
  assert.equal(posts[0].body.node_origin, 'subordinate');
  assert.equal(posts[0].body.assignees[0].user_id, 8);
});

test('cascade deletion consumes the preview token after confirmation', async () => {
  let deletion;
  const page = load({
    get: async () => ({ data: { node_id: 20, descendant_count: 2, affected_task_count: 1, affected_evidence_count: 3, handover_candidates: [], preview_token: 'preview token', warning: '子树将删除' } }),
    del: async url => { deletion = url; return { data: {} }; },
  });
  page.setData({ cards: [{ id: 20, canDelete: true }] });
  page.reload = async () => {};
  await page.previewDelete({ currentTarget: { dataset: { id: 20 } } });
  await page.confirmDelete();
  assert.equal(deletion, '/nodes/20?preview_token=preview%20token&cascade=true');
});

test('evidence submission includes caption and server file IDs and infers the uploaded type', async () => {
  let submitted;
  const page = load({ post: async (url, body) => { submitted = { url, body }; return { data: { id: 1 } }; } });
  page.setData({ evidenceNodeId: 12, caption: ' 本周验收结论 ', uploadedFiles: [{ id: 101, name: '结论.pdf' }, { id: 102, name: '清单.docx' }], permissions: { node_permissions: { 12: { can_submit_evidence: true } } } });
  await page.submitEvidence();
  assert.equal(submitted.url, '/nodes/12/evidence');
  assert.equal(submitted.body.summary_text, '本周验收结论');
  assert.equal(submitted.body.evidence_kind, 'document');
  assert.equal(JSON.stringify(submitted.body.file_ids), '[101,102]');
});

test('text-only material is valid without any file upload', async () => {
  let body;
  const page = load({ post:async(url,data)=>{body=data;return {data:{id:1}};} });
  page.setData({ evidenceNodeId:12,caption:'独立文字进展',uploadedFiles:[],permissions:{node_permissions:{12:{can_submit_evidence:true}}} });
  await page.submitEvidence();
  assert.equal(body.summary_text,'独立文字进展');
  assert.equal(body.evidence_kind,'document');
  assert.equal(body.file_ids.length,0);
});

test('voice appends editable transcript and checks the current material scope',async()=>{
  let pending;
  const page=load({}, {uploadFile(options){pending=options;return {abort(){}};}});
  page.setData({projectId:'1',project:{company_id:3},evidenceNodeId:12,caption:'先输入的材料'});
  const first=page.transcribeVoice('/tmp/material.mp3');
  assert.equal(page.data.voiceTranscribing,true);
  assert.equal(pending.formData.project_id,'1');
  pending.success({statusCode:200,data:JSON.stringify({data:{text:'语音补充'}})});
  await first;
  assert.equal(page.data.caption,'先输入的材料\n语音补充');
  const second=page.transcribeVoice('/tmp/other.mp3');
  page.cancelVoice();
  page.setData({projectId:'2',evidenceNodeId:13,caption:'新项目内容'});
  pending.success({statusCode:200,data:JSON.stringify({data:{text:'旧项目迟到的结果'}})});
  await second;
  assert.equal(page.data.caption,'新项目内容');
});

test('recorder cancellation stops microphone without uploading',()=>{
  let onStart,onStop,stops=0,uploads=0;
  const recorder={onStart:fn=>{onStart=fn;},onStop:fn=>{onStop=fn;},onError(){},start(){onStart();},stop(){stops++;onStop({tempFilePath:'/tmp/cancelled.mp3'});}};
  const page=load({}, {getRecorderManager:()=>recorder,uploadFile(){uploads++;}});
  page.startVoice();
  assert.equal(page.data.voiceRecording,true);
  page.cancelVoice();
  assert.equal(page.data.voiceRecording,false);
  assert.equal(stops,1);
  assert.equal(uploads,0);
});
