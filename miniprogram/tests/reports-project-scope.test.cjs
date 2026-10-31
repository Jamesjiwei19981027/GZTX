const test = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const { runInNewContext } = require('node:vm');
const path = require('node:path');

test('report picker scopes personal reports, generation and delayed project responses', async () => {
  let definition;
  let resolveOld;
  const posts = [];
  const request = {
    get: async (url) => {
      if (url === '/projects/1/agent-reports') return new Promise(resolve => { resolveOld = resolve; });
      return { data: { items: [{ id: 22, project_id: 2 }] } };
    },
    post: async (url, body) => { posts.push({ url, body }); return { data: {} }; },
  };
  runInNewContext(readFileSync(path.join(__dirname, '../pages/reports/reports.js'), 'utf8'), {
    Page: value => { definition = value; }, require: () => request,
    wx: { showToast() {}, showLoading() {}, hideLoading() {}, showModal(value) { value.success({ confirm: true }); } },
  });
  const page = { ...definition, data: { ...definition.data, selectedProjectId: '1', projects: [{ id: 1 }, { id: 2 }], allReports: [{ id: 11, project_id: 1 }, { id: 22, project_id: 2 }] }, setData(value) { Object.assign(this.data, value); }, load() {} };
  const old = page.loadProjectReports('1');
  page.onProjectChange({ detail: { value: '1' } });
  await Promise.resolve();
  resolveOld({ data: { items: [{ id: 11, project_id: 1 }] } });
  await old;
  assert.equal(page.data.projectReports[0].id, 22);
  assert.equal(page.data.reports[0].id, 22);
  assert.equal(page.data.projectSummary, null);
  page.generate();
  await Promise.resolve();
  assert.equal(posts.length, 1);
  assert.equal(posts[0].url, '/reports/generate');
  assert.equal(posts[0].body.project_id, 2);
});
