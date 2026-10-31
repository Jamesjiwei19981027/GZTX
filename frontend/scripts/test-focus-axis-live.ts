import { chromium, expect as baseExpect, type Locator } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';

const expect = baseExpect.configure({ timeout: 30000 });
const run = promisify(execFile);
const adb = 'C:/Users/11580/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const shell = (...args: string[]) => run(adb, ['-s', 'emulator-5554', 'shell', ...args]);
const endpoint = 'http://127.0.0.1:9222';
const origin = 'http://127.0.0.1:5177';
const out = 'android-acceptance/test-results/focus-axis';
await mkdir(out, { recursive: true });
const checks: string[] = [];
const audits: { client: string; status: number; message: string }[] = [];
const desktop = await chromium.launch();
const android = await chromium.connectOverCDP(endpoint, { noDefaults: true });
try {
  for (const mobile of [false, true]) {
    const label = mobile ? 'Android APP' : 'Web';
    const page = mobile ? android.contexts()[0].pages()[0] : await desktop.newPage({ viewport: { width: 1440, height: 1000 } });
    page.setDefaultTimeout(30000);
    const tap = async (locator: Locator) => {
      if (!mobile) { await locator.click(); return; }
      await locator.scrollIntoViewIfNeeded();
      const rect = (await locator.boundingBox())!;
      const targets = await (await fetch(endpoint + '/json/list')).json() as { url: string; description: string }[];
      const view = JSON.parse(targets.find(target => target.url === page.url())!.description);
      const ratio = await page.evaluate(() => devicePixelRatio);
      await shell('input', 'tap', String(Math.round(view.screenX + (rect.x + rect.width / 2) * ratio)), String(Math.round(view.screenY + (rect.y + rect.height / 2) * ratio)));
    };
    const capture = async (name: string) => {
      if (!mobile) await page.screenshot({ path: `${out}/${name}.png` });
      else {
        await shell('screencap', '-p', '/sdcard/codex-focus-axis.png');
        await run(adb, ['-s', 'emulator-5554', 'pull', '/sdcard/codex-focus-axis.png', `${out}/${name}.png`]);
      }
    };
    await page.goto(origin);
    await expect.poll(async () => await page.locator('input[type=password]').isVisible() || await page.getByRole('region', { name: '重点待办与跟进', exact: true }).isVisible()).toBe(true);
    if (await page.locator('input[type=password]').isVisible()) {
      await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill('axis_pm');
      await page.locator('input[type=password]').fill(process.env.AXIS_LIVE_PASSWORD || 'axis-debug-2026');
      await page.locator('form button[type=submit]').click();
    }
    const focus = page.getByRole('region', { name: '重点待办与跟进', exact: true });
    await expect(focus).toBeVisible();
    const ai = page.getByRole('region', { name: 'AI 汇报与助手', exact: true });
    expect(await focus.evaluate((element, other) => !!(element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await ai.elementHandle())).toBe(true);
    await capture(`${mobile ? 'android' : 'web'}-home`);
    checks.push(`${label}：重点待办位于 AI 入口前，在首页直接可见`);

    if (mobile) {
      await tap(page.getByRole('button', { name: '项目列表', exact: true }));
      await tap(page.getByText('责任树联合调试', { exact: true }));
    } else {
      await tap(page.getByRole('banner').getByRole('button').filter({ hasText: /全盘研发概览|责任树联合调试|跨项目角色联调/ }).first());
      await tap(page.getByRole('banner').getByRole('button').filter({ hasText: '责任树联合调试' }).last());
    }
    await tap(page.getByRole(mobile ? 'tab' : 'button', { name: '人轴', exact: true }));
    const actions = page.getByRole('navigation', { name: '人轴协作与检查', exact: true });
    await expect(actions.getByRole('button', { name: '委托授权', exact: true })).toBeVisible();
    await expect(actions.getByRole('button', { name: 'AI 责任链审计', exact: true })).toBeVisible();
    await capture(`${mobile ? 'android' : 'web'}-axis`);
    const delegationResponse = page.waitForResponse(response => response.url().includes('/delegations?') && new URL(response.url()).searchParams.get('project_id') === '1');
    await tap(actions.getByRole('button', { name: '委托授权', exact: true }));
    expect((await delegationResponse).ok()).toBe(true);
    await expect(page.getByText(/不授予手机或电脑本地文件的访问权限/)).toBeVisible();
    await expect(page.getByText('产品设计节点 · 提交证据材料', { exact: true })).toHaveCount(0);
    await capture(`${mobile ? 'android' : 'web'}-delegation`);
    if (mobile) {
      await shell('input', 'keyevent', '4');
      await expect.poll(() => page.evaluate(() => (window as any).__MOBILE_NAV__.activeRoute.screen)).toBe('axis-root');
    } else await tap(page.getByRole('button', { name: '关闭委托授权', exact: true }));
    checks.push(`${label}：直接打开项目1委托授权，真实接口成功，说明可见并能返回`);

    const auditResponse = page.waitForResponse(response => response.url().endsWith('/projects/1/axis-audit'), { timeout: 60000 });
    await tap(actions.getByRole('button', { name: 'AI 责任链审计', exact: true }));
    const response = await auditResponse;
    const body = await response.json();
    audits.push({ client: label, status: response.status(), message: body.message || body.detail || 'success' });
    if (mobile) {
      await expect(page.getByRole('heading', { name: 'AI 责任链审计', exact: true })).toBeVisible();
      await capture('android-audit');
      await shell('input', 'keyevent', '4');
      await expect.poll(() => page.evaluate(() => (window as any).__MOBILE_NAV__.activeRoute.screen)).toBe('axis-root');
    }
    checks.push(`${label}：审计入口使用当前项目1，接口 HTTP ${response.status()}${mobile ? '，系统返回恢复人轴页' : ''}`);
    if (mobile) await tap(page.getByRole('tab', { name: '工作', exact: true }));
    console.log(checks.slice(-3).join('\n'));
  }
  await writeFile(`${out}/result.json`, JSON.stringify({ checks, audits, checkedAt: new Date().toISOString(), ios: '未验收' }, null, 2));
} finally {
  await desktop.close();
  await android.close();
}
