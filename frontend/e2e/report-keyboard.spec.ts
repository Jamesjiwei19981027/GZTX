import { expect, test, type Page } from '@playwright/test';

// A missing keyboard bridge/avoidance must leave the composer covered; fixed-height
// inputs must fail the growth assertions. Only API responses are fixtures.
async function mount(page: Page, screen: 'chat' | 'editor' | 'quick' | 'desktop') {
  page.on('pageerror', error => console.log('Keyboard regression page error:', error.message));
  await page.setViewportSize({ width: screen === 'desktop' ? 1280 : 430, height: 880 });
  await page.route('**/api/v1/**', route => route.fulfill({ json: { code: 200, data: { items: [] } } }));
  await page.route(url => url.pathname === '/', route => route.fulfill({
    contentType: 'text/html; charset=utf-8', body: `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head><body><div id="root"></div>
    <script type="module">import RefreshRuntime from '/@react-refresh';RefreshRuntime.injectIntoGlobalHook(window);window.$RefreshReg$=()=>{};window.$RefreshSig$=()=>type=>type;window.__vite_plugin_react_preamble_installed__=true;</script>
    <script type="module">
      import React from '/node_modules/.vite/deps/react.js';
      import ReactDOM from '/node_modules/.vite/deps/react-dom_client.js';
      import '/src/index.css';
      import {MobileNavigationProvider} from '/src/mobile/navigation/MobileNavigationProvider.tsx';
      import {MyAgentScreen} from '/src/mobile/features/reports/MyAgentScreen.tsx';
      import {MyReportEditor} from '/src/mobile/features/reports/MyReportEditor.tsx';
      import {QuickAddModal} from '/src/components/modals/QuickAddModal.tsx';
      import {ProjectAgentChat} from '/src/components/ProjectAgentChat.tsx';
      const props={user:{id:'7',name:'林悦'},currentProject:{id:'1',name:'项目'},companyId:1,projectMembers:[]};
      const screen='${screen}';
      const content=screen==='chat'?React.createElement(MyAgentScreen,{...props,initialViewMode:'chat'}):screen==='editor'?React.createElement(MyReportEditor,props):screen==='quick'?React.createElement(QuickAddModal,{isOpen:true,onClose:()=>{},onCreateTask:async()=>false,projectId:'1',lang:'zh'}):React.createElement(ProjectAgentChat,{companyId:1,projectId:'1'});
      ReactDOM.createRoot(document.getElementById('root')).render(React.createElement(MobileNavigationProvider,null,React.createElement('main',{style:{height:'100dvh',paddingBottom:56,boxSizing:'border-box'}},content)));
    </script></body></html>`
  }));
  await page.goto('/');
}
async function keyboard(page: Page, inset: number) {
  await page.evaluate(inset => {
    const runtime = { v: 1, platform: 'android', surface: 'app', colorScheme: 'light', textSizes: { body: 16, caption: 12, navTitle: 18, displayTitle: 22 }, safeAreaOwner: 'native', reduceMotion: false, reduceTransparency: false, capabilities: { haptics: true, nativeBack: true }, keyboardInset: inset };
    (window as any).__NATIVE_RUNTIME__ = runtime;
    window.dispatchEvent(new CustomEvent('nativeRuntimeChange', { detail: runtime }));
  }, inset);
}

test('AI composer stays visible over overlay keyboard, grows, scrolls long text and restores on dismiss', async ({ page }) => {
  await mount(page, 'chat');
  const input = page.getByPlaceholder('输入项目进展与工作事实…');
  const original = (await input.boundingBox())!;
  await input.focus();
  await keyboard(page, 320);
  await expect.poll(async () => { const r = (await input.boundingBox())!; return r.y + r.height; }).toBeLessThanOrEqual(560);
  expect(await page.evaluate(() => innerHeight)).toBe(880);
  await input.fill('已完成项目接口联调\n完成第一轮验收\n发现风险并提交\n正在准备项目汇报');
  await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(original.height + 25);
  await input.fill(Array(40).fill('汇报内容：验证长文本和末尾输入位置').join('\n'));
  expect((await input.boundingBox())!.height).toBeLessThanOrEqual(200);
  expect(await input.evaluate(el => el.scrollHeight > el.clientHeight)).toBe(true);
  await expect.poll(async () => { const r = (await input.boundingBox())!; return r.y + r.height; }).toBeLessThanOrEqual(560);
  await input.fill('中文输入');
  await input.dispatchEvent('keydown', { key: 'Enter', isComposing: true });
  await expect(input).toHaveValue('中文输入');
  await input.press('Enter');
  await expect(input).toHaveValue('中文输入\n');
  await input.fill('');
  await expect.poll(async () => (await input.boundingBox())!.height).toBe(original.height);
  await keyboard(page, 0);
  await expect.poll(async () => (await input.boundingBox())!.y).toBeGreaterThan(700);
});

test('mobile browser visual viewport also keeps AI input above its keyboard', async ({ page }) => {
  await mount(page, 'chat');
  const input = page.getByPlaceholder('输入项目进展与工作事实…');
  await input.focus();
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, value: 560 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await input.fill('使用手机浏览器\n输入项目汇报\n输入框自动扩展');
  await expect.poll(async () => { const r = (await input.boundingBox())!; return r.y + r.height; }).toBeLessThanOrEqual(560);
  expect(await page.evaluate(() => innerHeight)).toBe(880);
  await page.evaluate(() => {
    Object.defineProperty(window.visualViewport!, 'height', { configurable: true, value: 880 });
    window.visualViewport!.dispatchEvent(new Event('resize'));
  });
  await expect.poll(async () => (await input.boundingBox())!.y).toBeGreaterThan(600);
});

test('report editor grows and keeps the focused risk field and submit action above the keyboard', async ({ page }) => {
  await mount(page, 'editor');
  const input = page.getByPlaceholder('描述当前阻塞问题、待决策事项或依赖外部的事项…');
  const initial = (await input.boundingBox())!.height;
  await input.focus();
  await keyboard(page, 320);
  await input.fill(Array(12).fill('进行中：项目进度汇报和风险排查').join('\n'));
  await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(initial + 30);
  await expect.poll(async () => { const r = (await input.boundingBox())!; return r.y + r.height; }).toBeLessThanOrEqual(560);
  const action = (await page.getByRole('button', { name: '确认提交', exact: true }).boundingBox())!;
  expect(action.y + action.height).toBeLessThanOrEqual(560);
});

test('quick add remains usable with keyboard and grows while keeping its create action visible', async ({ page }) => {
  await mount(page, 'quick');
  const input = page.locator('form input, form textarea');
  const initial = (await input.boundingBox())!.height;
  await keyboard(page, 400);
  await input.fill(Array(8).fill('记录汇报材料与工作进展').join('\n'));
  await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(initial + 20);
  await expect.poll(async () => { const r = (await input.boundingBox())!; return r.y + r.height; }).toBeLessThanOrEqual(480);
  await expect.poll(async () => { const r = (await page.locator('button[type=submit]').boundingBox())!; return r.y + r.height; }).toBeLessThanOrEqual(480);
});

test('desktop project AI input grows and retains multiline content', async ({ page }) => {
  await mount(page, 'desktop');
  const input = page.getByLabel('助手消息', { exact: true });
  const initial = (await input.boundingBox())!.height;
  const text = Array(10).fill('项目完成情况与需要协调的工作').join('\n');
  await input.fill(text);
  await expect.poll(async () => (await input.boundingBox())!.height).toBeGreaterThan(initial + 30);
  await expect(input).toHaveValue(text);
});
