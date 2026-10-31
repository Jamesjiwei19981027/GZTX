import { expect, test } from '@playwright/test'

for (const width of [390, 1280]) {
  test(`project wiki preview and publication at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 844 })
    const facts = [{ text: '开发完成，验收待处理。', quote: '开发已完成，验收未通过。',
      source_name: '提交说明', source_id: 'note:1', package_id: 1, line_start: 1, line_end: 1 }]
    const proposal = { key: 'work:4', topic: 'work', title: '交付状态', facts }
    let drafts: unknown[] = []
    let pages: unknown[] = []
    await page.route('**/api/v1/projects/1/llm-wiki**', async route => {
      let data: unknown
      if (route.request().url().endsWith('/publish')) {
        drafts = []
        pages = [{ id: 3, title: '交付状态', meta: { facts, revision: 1 } }]
        data = { published_ids: [3] }
      } else if (route.request().method() === 'POST') {
        drafts = [{ id: 2, title: '待确认', meta: { proposals: [proposal] } }]
        data = { id: 2, proposals: [proposal] }
      } else data = { engine: 'microsoft/llmwiki', can_publish: true, pages, drafts,
        materials: [{ id: 1, title: '开发交付报告', status: 'adopted', can_generate: true }] }
      await route.fulfill({ json: { code: 200, data } })
    })
    await page.route(url => url.pathname === '/', route => route.fulfill({
      contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
      <script type="module">
      import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>(type)=>type;window.__vite_plugin_react_preamble_installed__=true;
      </script><script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css';
      import { ProjectWikiPanel } from '/src/components/views/ProjectWikiPanel.tsx';
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(ProjectWikiPanel,{projectId:1,projectName:'产品升级',lang:'zh',onClose:()=>{}}));
      </script></body></html>`,
    }))
    await page.goto('/')
    await expect(page.getByRole('heading', { name: '产品升级 · 项目知识' })).toBeVisible()
    await page.getByRole('button', { name: 'AI 整理为草稿' }).click()
    await expect(page.getByText('开发已完成，验收未通过。')).toBeVisible()
    await expect(page.getByText('提交说明 · 第 1–1 行')).toBeVisible()
    await page.getByRole('button', { name: '确认发布到项目知识' }).click()
    await expect(page.getByText('已发布 · 版本 1')).toBeVisible()
    await expect(page.getByRole('button', { name: '确认发布到项目知识' })).toHaveCount(0)
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true)
  })
}
