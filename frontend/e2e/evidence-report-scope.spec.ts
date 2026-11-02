import { test, expect } from '@playwright/test';

const harness = (body: string) => `<!doctype html><html><body><div id="root"></div>
<script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{}; window.$RefreshSig$=()=>(type)=>type; window.__vite_plugin_react_preamble_installed__=true;</script>
<script type="module">
import React from '/node_modules/.vite/deps/react.js';
import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
import { MobileNavigationProvider } from '/src/mobile/navigation/MobileNavigationProvider.tsx';
import { MyReportEditor } from '/src/mobile/features/reports/MyReportEditor.tsx';
import { MyAgentScreen } from '/src/mobile/features/reports/MyAgentScreen.tsx';
import { MobileEvidenceSubmitScreen } from '/src/mobile/features/people-axis/MobileEvidenceScreens.tsx';
const user = {id:'7',name:'测试员工',role:'Member'};
const projects = [{id:'1',name:'项目 A',active:true},{id:'2',name:'项目 B',active:true}];
${body}
</script></body></html>`;

test('multi-file evidence uses real upload IDs and caption without a category field', async ({ page }) => {
  const uploads: string[] = [];
  let submitted: any;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = {};
    if (path.endsWith('/evidence/files')) {
      const body = route.request().postData() || '';
      expect(body).toContain('name="project_id"\r\n\r\n1');
      expect(body).toContain('name="company_id"\r\n\r\n3');
      uploads.push(body);
      data = { file_id: 100 + uploads.length };
    } else if (route.request().method() === 'POST') {
      submitted = route.request().postDataJSON();
      data = { id: 55 };
    } else data = { id: 9, title: '测试事项' };
    await route.fulfill({ json: { code: 200, data } });
  });
  await page.route((url) => url.pathname === '/', (route) => route.fulfill({ contentType: 'text/html', body: harness(`ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MobileEvidenceSubmitScreen,{user,currentUser:user,projectId:1,companyId:3,nodeId:9}));`) }));
  await page.goto('/');
  await expect(page.getByText('材料类型')).toHaveCount(0);
  await page.locator('textarea').fill('本周验收材料与结论');
  await page.getByLabel('材料附件',{exact:true}).setInputFiles([
    { name: '结论.pdf', mimeType: 'application/pdf', buffer: Buffer.from('first') },
    { name: '清单.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('second') },
  ]);
  await expect(page.getByText('清单.docx')).toBeVisible();
  await page.getByRole('button', { name: '提交材料', exact: true }).click();
  await expect.poll(() => submitted).toEqual({ summary_text: '本周验收材料与结论', evidence_kind: 'document', file_ids: [101, 102] });
});

test('switching AI chat projects clears messages and ignores a previous project reply', async ({ page }) => {
  let finishReply: (() => void) | undefined;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = { items: [] };
    if (path.endsWith('/agents/chat')) {
      expect(route.request().postDataJSON().project_id).toBe(1);
      await new Promise<void>((resolve) => { finishReply = resolve; });
      data = { reply: '项目 A 的迟到回复' };
    }
    await route.fulfill({ json: { code: 200, data } });
  });
  await page.route((url) => url.pathname === '/', (route) => route.fulfill({ contentType: 'text/html', body: harness(`
function App(){const [project,setProject]=React.useState(projects[0]);return React.createElement(MobileNavigationProvider,null,React.createElement(MyAgentScreen,{user,currentProject:project,projects,onSelectProject:setProject,companyId:3,initialViewMode:'chat',projectMembers:[]}));}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));`) }));
  await page.goto('/');
  await page.getByPlaceholder('输入项目进展与工作事实…').fill('项目 A 的事实');
  // 输入框 Enter 为换行，Ctrl/Cmd+Enter 或发送按钮才提交
  await page.getByRole('button', { name: '发送项目进展', exact: true }).click();
  await expect.poll(() => Boolean(finishReply)).toBe(true);
  await page.getByLabel('汇报项目', { exact: true }).selectOption('2');
  await expect(page.getByText('项目 A 的事实', { exact: true })).toHaveCount(0);
  finishReply?.();
  await expect(page.getByText('项目 A 的迟到回复')).toHaveCount(0);
  await expect(page.getByPlaceholder('输入项目进展与工作事实…')).toHaveValue('');
});

test('switching report projects restores only that project draft and discards stale generation', async ({ page }) => {
  let finishGeneration: (() => void) | undefined;
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = { items: [] };
    if (path.endsWith('/reports/generate')) {
      await new Promise<void>((resolve) => { finishGeneration = resolve; });
      data = { id: 90, project_id: 1, summary_text: '项目 A 迟到的草稿', sources: [] };
    }
    await route.fulfill({ json: { code: 200, data } });
  });
  await page.route((url) => url.pathname === '/', (route) => route.fulfill({ contentType: 'text/html', body: harness(`
function App(){const [project,setProject]=React.useState(projects[0]);return React.createElement(MobileNavigationProvider,null,React.createElement(MyReportEditor,{user,currentProject:project,projects,onSelectProject:setProject,projectMembers:[]}));}
ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));`) }));
  await page.goto('/');
  await page.locator('textarea').first().fill('项目 A 的工作进展');
  await page.getByRole('button', { name: '重新生成' }).click();
  await expect.poll(() => Boolean(finishGeneration)).toBe(true);
  await page.getByLabel('汇报项目', { exact: true }).selectOption('2');
  await expect(page.locator('textarea').first()).toHaveValue('');
  await page.locator('textarea').first().fill('项目 B 的工作进展');
  finishGeneration?.();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('wt_ai_report_draft_7_2') || '{}').summary)).toBe('项目 B 的工作进展');
  await page.getByLabel('汇报项目', { exact: true }).selectOption('1');
  await expect(page.locator('textarea').first()).toHaveValue('项目 A 的工作进展');
  await expect(page.getByText('项目 A 迟到的草稿')).toHaveCount(0);
});
