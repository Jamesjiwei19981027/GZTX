import { expect, test, type Page } from '@playwright/test';

// 手机工作台的管理者视图只认服务端 /my-permissions（PM 或公司超管），
// 不看前端 UserProfile.role（mapUser 固定为「成员」，曾导致所有人都进不了管理者视图）。
async function openWorkbench(page: Page, perms: Record<string, Record<string, unknown>>, membership: Record<string, unknown> | null = null) {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route('**/api/v1/**', async (route) => {
    const path = new URL(route.request().url()).pathname;
    let data: unknown = { items: [] };
    const match = path.match(/\/projects\/(\d+)\/my-permissions$/);
    if (match) {
      const p = perms[match[1]];
      if (!p) return route.fulfill({ status: 403, json: { code: 403, message: '非项目成员' } });
      data = p;
    }
    if (path.endsWith('/companies/mine')) data = { items: [{ id: 1, name: '测试公司', my_membership: membership }] };
    await route.fulfill({ json: { code: 200, data } });
  });
  await page.route((url) => url.pathname === '/', (route) => route.fulfill({ contentType: 'text/html; charset=utf-8', body: `
    <html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
    <script type="module">import RefreshRuntime from '/@react-refresh'; RefreshRuntime.injectIntoGlobalHook(window); window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
    <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css';
      import { MobileWorkbenchScreen } from '/src/mobile/features/work/MobileWorkScreens.tsx';
      const noop=()=>{};
      const projects=[{id:'1',name:'项目一',active:true},{id:'2',name:'项目二',active:true},{id:'all',name:'全部项目',active:true}];
      function App(){
        const [current,setCurrent]=React.useState(projects[0]);
        window.__switchProject=id=>setCurrent(projects.find(p=>p.id===id));
        return React.createElement(MobileWorkbenchScreen,{user:{id:'1',name:'测试用户',role:'成员'},tasks:[],projects,currentProject:current,activities:[],lang:'zh',onSelectTask:noop,onOpenNewTask:noop,onOpenQuickAdd:noop,onOpenSearch:noop,onNavigateToTasks:noop,onNavigateToCalendar:noop,onNavigateToKanban:noop,onNavigateToStatistics:()=>{document.body.dataset.stats='1'},onNavigateToTrash:noop});
      }
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(App));
    </script></body></html>` }));
  await page.goto('/');
}

const member = { role: 'member', is_pm: false, is_superadmin: false };
const pm = { role: 'pm', is_pm: true, is_superadmin: false };
const superadmin = { role: 'superadmin', is_pm: false, is_superadmin: true };

test('ordinary members only see the employee workbench', async ({ page }) => {
  await openWorkbench(page, { '1': member });
  await expect(page.getByRole('region', { name: '重点待办与跟进' })).toBeVisible();
  await expect(page.getByRole('button', { name: /管理者全貌视图/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /事项总数/ })).toHaveCount(0);
});

for (const [label, perms] of [['project PM', pm], ['company super admin', superadmin]] as const) {
  test(`${label} opens the manager workbench and reaches statistics`, async ({ page }) => {
    await openWorkbench(page, { '1': perms });
    await expect(page.getByRole('button', { name: /管理者全貌视图/ })).toBeVisible();
    await page.getByRole('button', { name: /事项总数/ }).click();
    await expect.poll(() => page.evaluate(() => document.body.dataset.stats)).toBe('1');
    await page.getByRole('button', { name: /员工待办视图/ }).click();
    await expect(page.getByRole('button', { name: /事项总数/ })).toHaveCount(0);
  });
}

test('switching to a project without manager rights drops the manager view', async ({ page }) => {
  await openWorkbench(page, { '1': pm, '2': member });
  await expect(page.getByRole('button', { name: /事项总数/ })).toBeVisible();
  await page.evaluate(() => (window as unknown as { __switchProject: (id: string) => void }).__switchProject('2'));
  await expect(page.getByRole('button', { name: /管理者全貌视图/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: /事项总数/ })).toHaveCount(0);
});

test('a permission lookup failure falls back to the employee workbench', async ({ page }) => {
  await openWorkbench(page, {});
  await expect(page.getByRole('region', { name: '重点待办与跟进' })).toBeVisible();
  await expect(page.getByRole('button', { name: /管理者全貌视图/ })).toHaveCount(0);
});

test('all-projects overview uses company identity: org leaders get the manager view', async ({ page }) => {
  await openWorkbench(page, { '1': member }, { status: 'active', is_super_admin: false, is_org_leader: true });
  await expect(page.getByRole('region', { name: '重点待办与跟进' })).toBeVisible();
  await expect(page.getByRole('button', { name: /管理者全貌视图/ })).toHaveCount(0);
  await page.evaluate(() => (window as unknown as { __switchProject: (id: string) => void }).__switchProject('all'));
  await expect(page.getByRole('button', { name: /管理者全貌视图/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /事项总数/ })).toBeVisible();
});

test('all-projects overview keeps ordinary company members on the employee view', async ({ page }) => {
  await openWorkbench(page, { '1': pm }, { status: 'active', is_super_admin: false, is_org_leader: false });
  await expect(page.getByRole('button', { name: /管理者全貌视图/ })).toBeVisible();
  await page.evaluate(() => (window as unknown as { __switchProject: (id: string) => void }).__switchProject('all'));
  await expect(page.getByRole('button', { name: /管理者全貌视图/ })).toHaveCount(0);
});
