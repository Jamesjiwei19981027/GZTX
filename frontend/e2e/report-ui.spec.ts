import { expect, test } from '@playwright/test'

/**
 * Report center button smoke test. API responses are deterministic so this
 * covers the browser interaction contract without requiring a live LLM.
 */
test('AI report center clicks every report action', async ({ page }) => {
  const calls: string[] = []
  let reportRead = false
  let summaryGenerated = false
  let summaryPublished = false
  const summary = { id: 301, project_id: 1, status: 'submitted', summary_text: '项目汇总：接口联调完成', report_count: 1, source_count: 1 }
  const publishedSummary = { ...summary, status: 'published', published_at: '2026-10-19T10:30:00Z', published_by: 7 }
  const browserErrors: string[] = []
  page.on('pageerror', error => browserErrors.push(error.message))
  page.on('console', (message) => { if (message.type() === 'error') console.log(`report-ui console: ${message.text()}`) })

  await page.route('**/api/v1/**', async (route) => {
    const request = route.request()
    const url = new URL(request.url())
    const path = url.pathname.replace('/api/v1', '')
    calls.push(`${request.method()} ${path}`)

    let data: unknown = {}
    if (path === '/tasks/stats/trend') data = { series: [] }
    else if (path === '/tasks/stats') data = { total: 0, completed: 0, pending: 0, in_progress: 0, overdue: 0 }
    else if (path === '/projects/1/report-policies') data = { items: [{ id: 1, name: '每周汇报', enabled: true }] }
    else if (path === '/projects/1/report-agents/bindings' && request.method() === 'GET') {
      data = { items: [{ id: 101, user_id: 7, role: 'member', project_id: 1 }, { id: 102, user_id: 9, role: 'project', project_id: 1 }] }
    } else if (path === '/projects/1/report-agents/bindings' && request.method() === 'POST') {
      data = { items: [{ id: 101, user_id: 7, role: 'member', project_id: 1 }, { id: 102, user_id: 9, role: 'project', project_id: 1 }] }
    } else if (path === '/projects/1/agent-reports' && request.method() === 'GET') {
      data = { items: [{ id: 201, binding_id: 101, author_user_id: 8, parent_user_id: 7, status: 'submitted', summary_text: '下属汇报', submitted_at: '2026-10-19T08:00:00Z', sources: [{ id: 1, source_type: 'task', excerpt: '接口联调' }], source_count: 1, read: reportRead }] }
    } else if (path === '/reports/inbox') {
      data = { items: [{ id: 201, report_id: 201, parent_user_id: 7, status: 'submitted', summary_text: '下属汇报', read: reportRead, sources: [{ id: 1, source_type: 'task', excerpt: '接口联调' }] }] }
    } else if (path === '/companies/9/leadership-reports/latest') data = null
    else if (path === '/reports/generate') data = { id: 202, project_id: 1, status: 'draft', summary_text: 'AI 草稿：接口联调进行中', payload_json: { source_count: 2 }, sources: [] }
    else if (path === '/reports/202/submit') data = { id: 202, project_id: 1, status: 'submitted', summary_text: '编辑后的汇报', sources: [] }
    else if (path === '/reports/inbox/201/read') { reportRead = true; data = { id: 201, read: true } }
    else if (path === '/projects/1/agent-reports/aggregate' && request.method() === 'POST') { summaryGenerated = true; data = summary }
    else if (path === '/projects/1/report-summaries' && request.method() === 'GET') {
      // One stateful fixture covers the initial, generated and published versions.
      data = { items: summaryGenerated ? [summaryPublished ? publishedSummary : summary] : [], latest_published: summaryPublished ? publishedSummary : null, can_publish: true }
    }
    else if (path === '/projects/1/report-summaries/301/publish' && request.method() === 'POST') { summaryPublished = true; data = publishedSummary }
    else if (path === '/companies/9/leadership-reports/aggregate') data = { id: 401, company_id: 9, status: 'published', summary_text: '总领导摘要：项目进展正常', payload_json: {}, created_at: '2026-10-19T09:00:00Z' }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 200, message: 'ok', data }) })
  })

  await page.route((url) => url.pathname === '/', (route) => route.fulfill({
    contentType: 'text/html; charset=utf-8',
    body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
      <script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {}; window.$RefreshSig$ = () => (type) => type; window.__vite_plugin_react_preamble_installed__ = true;
      </script>
      <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css';
      import { ReportsView } from '/src/components/views/ReportsView.tsx';
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ReportsView,{tasks:[],projectId:'1',projectName:'验收项目',userId:'7',companyId:9,lang:'zh'}));
      </script></body></html>`,
  }))

  await page.goto('/')
  await expect(page.getByRole('heading', { name: '项目 AI 汇报中心' })).toBeVisible()

  await page.getByRole('button', { name: '同步人轴智能体' }).click()
  await expect(page.getByText('2 个智能体')).toBeVisible()

  await page.getByRole('button', { name: '生成 AI 草稿' }).click()
  await expect(page.getByLabel('我的 AI 汇报正文', {exact:true})).toHaveValue('AI 草稿：接口联调进行中')
  await page.getByLabel('我的 AI 汇报正文', {exact:true}).fill('编辑后的汇报')
  const submitted = page.waitForRequest(request => request.method() === 'POST' && request.url().endsWith('/reports/202/submit'))
  await page.getByRole('button', { name: '提交给直属领导' }).click()
  expect((await submitted).postDataJSON()).toEqual({ sources: [], summary: '编辑后的汇报' })
  await expect(page.getByText('项目内成员汇报')).toBeVisible()

  await page.getByText('下属汇报', { exact: true }).click()
  await expect.poll(() => reportRead).toBe(true)

  await page.getByRole('button', { name: '汇总项目汇报' }).click()
  await expect(page.getByTestId('pending-summary-301')).toContainText('项目汇总：接口联调完成')
  await page.getByRole('button', { name: '确认发布', exact: true }).click()
  await expect(page.getByTestId('published-summary')).toContainText('已发布版本 #301')
  await expect(page.getByTestId('published-summary')).toContainText('项目汇总：接口联调完成')
  await expect(page.getByTestId('pending-summary-301')).toHaveCount(0)

  await page.getByRole('button', { name: '汇总全部项目' }).click()
  await expect(page.getByText('总领导摘要：项目进展正常')).toBeVisible()

  expect(calls).toEqual(expect.arrayContaining([
    'POST /projects/1/report-agents/bindings',
    'POST /reports/generate',
    'POST /reports/202/submit',
    'PUT /reports/inbox/201/read',
    'POST /projects/1/agent-reports/aggregate',
    'POST /projects/1/report-summaries/301/publish',
    'POST /companies/9/leadership-reports/aggregate',
  ]))
  expect(browserErrors).toEqual([])
})
