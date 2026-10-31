import { chromium, expect as baseExpect, type Locator } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';

const expect = baseExpect.configure({ timeout: 30000 });
const run = promisify(execFile);
const adb = 'C:/Users/11580/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const origin = 'http://127.0.0.1:5177';
const endpoint = 'http://127.0.0.1:9222';
const scopeOnly = process.env.HOME_TREND_SCOPE_ONLY === 'true';
const out = 'android-acceptance/test-results/' + (scopeOnly ? 'home-project-scope' : 'home-trend');
await mkdir(out, { recursive: true });
const checks: string[] = [];
const ids: number[] = [];
const shell = (...args: string[]) => run(adb, ['-s', 'emulator-5554', 'shell', ...args]);
const desktop = await chromium.launch();
const android = await chromium.connectOverCDP(endpoint, { noDefaults: true });
try {
  for (const mobile of [false, true]) {
    const label = mobile ? 'Android APP' : '桌面 Web';
    const page = mobile ? android.contexts()[0].pages()[0] : await desktop.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai' });
    page.setDefaultTimeout(30000);
    const tap = async (locator: Locator, double = false) => {
      if (!mobile) { if (double) await locator.dblclick(); else await locator.click(); return; }
      if (/mInputShown=true/.test((await shell('dumpsys', 'input_method')).stdout)) await shell('input', 'keyevent', '111');
      await locator.scrollIntoViewIfNeeded();
      const rect = (await locator.boundingBox())!;
      const targets = await (await fetch(endpoint + '/json/list')).json() as { url: string; description: string }[];
      const view = JSON.parse(targets.find(target => target.url === page.url())!.description);
      const ratio = await page.evaluate(() => devicePixelRatio);
      const x = String(Math.round(view.screenX + (rect.x + rect.width / 2) * ratio));
      const y = String(Math.round(view.screenY + (rect.y + rect.height / 2) * ratio));
      if (double) await shell(`input tap ${x} ${y}; input tap ${x} ${y}`);
      else await shell('input', 'tap', x, y);
    };
    const backHome = async () => {
      if (mobile) await shell('input', 'keyevent', '4');
      else await page.getByRole('button', { name: '工作', exact: true }).click();
      await expect(page.getByRole('region', { name: '任务趋势', exact: true })).toBeVisible();
    };
    await page.goto(origin);
    await expect.poll(() => page.locator('input[type=password]').isVisible().then(login => login || page.getByRole('region', { name: '首页日程日历' }).isVisible())).toBe(true);
    if (await page.locator('input[type=password]').isVisible()) {
      await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill('axis_pm');
      await page.locator('input[type=password]').fill(process.env.AXIS_LIVE_PASSWORD || 'axis-debug-2026');
      await page.locator('form button[type=submit]').click();
    }
    const trend = page.getByRole('region', { name: '任务趋势', exact: true });
    await expect(trend.getByRole('img')).toBeVisible();
    if (scopeOnly) {
      const chooseProject = async (name: string) => {
        if (mobile) {
          await tap(page.getByRole('button', { name: '项目列表', exact: true }));
          await tap(page.getByText(name, { exact: true }));
        } else {
          await tap(page.getByRole('banner').getByRole('button').filter({ hasText: /全盘研发概览|责任树联合调试|跨项目角色联调/ }).first());
          await tap(page.getByRole('banner').getByRole('button').filter({ hasText: name }).last());
        }
      };
      for (const [id, name] of [['1', '责任树联合调试'], ['2', '跨项目角色联调']]) {
        const request = page.waitForResponse(response => response.url().includes('/tasks/stats/trend?') && new URL(response.url()).searchParams.get('project_id') === id);
        await chooseProject(name);
        expect((await request).ok()).toBe(true);
        await expect(trend.getByRole('img')).toBeVisible();
        await expect(trend.getByText('当前项目及个人待办', { exact: false })).toBeVisible();
      }
      const all = page.waitForResponse(response => response.url().includes('/tasks/stats/trend?') && !new URL(response.url()).searchParams.has('project_id'));
      await chooseProject(mobile ? '全部项目' : '全盘研发概览');
      expect((await all).ok()).toBe(true);
      await expect(trend.getByRole('img')).toBeVisible();
      checks.push(label + '：项目1／项目2／全部切换，趋势请求同步范围'); console.log('PASS ' + checks.at(-1));
      if (!mobile) await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
      else {
        await shell('screencap', '-p', '/sdcard/codex-home-scope.png');
        await run(adb, ['-s', 'emulator-5554', 'pull', '/sdcard/codex-home-scope.png', `${out}/android.png`]);
      }
      continue;
    }
    const ai = page.getByRole('region', { name: 'AI 汇报与助手', exact: true });
    const metrics = mobile ? page.getByRole('region', { name: '待办汇总' }) : page.getByTestId('today-focus');
    expect(await ai.evaluate((element, other) => !!(element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await metrics.elementHandle())).toBe(true);
    expect(await metrics.evaluate((element, other) => !!(element.compareDocumentPosition(other) & Node.DOCUMENT_POSITION_FOLLOWING), await trend.elementHandle())).toBe(true);
    await tap(trend.getByRole('button', { name: '本月', exact: true }));
    await expect(trend.getByRole('img')).toHaveAccessibleName(/2026-10-01/);
    await tap(trend.getByRole('button', { name: '展开统计详情', exact: true }));
    const quarter = page.waitForResponse(response => response.url().includes('/tasks/stats/trend?period=quarter'));
    await tap(trend.getByRole('button', { name: '本季度', exact: true }));
    expect((await quarter).ok()).toBe(true);
    await expect(trend.getByRole('img')).toHaveAccessibleName(/2026-10-01/);
    checks.push(label + '：首页顺序、月度和真实季度趋势'); console.log('PASS ' + checks.at(-1));

    await tap(ai.getByRole('button', { name: '告诉 AI 最新进展', exact: true }));
    if (mobile) await expect.poll(() => page.evaluate(() => (window as any).__MOBILE_NAV__.activeRoute.screen)).toBe('ai-chat');
    else await expect(page.getByRole('region', { name: '我的项目助手' })).toBeVisible();
    await backHome();
    await tap(ai.getByRole('button', { name: '查看汇报', exact: true }));
    if (mobile) await expect.poll(() => page.evaluate(() => (window as any).__MOBILE_NAV__.activeRoute.screen)).toBe('ai-root');
    else await expect(page.getByTestId('project-ai-report-center')).toBeVisible();
    await backHome();
    checks.push(label + '：AI进展／查看汇报入口及返回'); console.log('PASS ' + checks.at(-1));

    const dates = await page.evaluate(`(() => {
      const key = date => date.getFullYear() + '-' + String(date.getMonth()+1).padStart(2,'0') + '-' + String(date.getDate()).padStart(2,'0');
      const today = new Date(); const past = new Date(today); past.setDate(past.getDate()-1);
      return {today:key(today),past:key(past)};
    })()`) as { today: string; past: string };
    const calendar = page.getByRole('region', { name: '首页日程日历' });
    const day = calendar.getByRole('button', { name: dates.past, exact: true });
    await tap(day);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    // Let the single selection stand; double tap must be a new gesture.
    await expect(calendar.getByText(new RegExp(dates.past + ' ·'))).toBeVisible();
    await tap(day, true);
    await expect(page.getByRole('dialog')).toHaveCount(1);
    await expect(page.locator('input[type=date]').last()).toHaveValue(dates.past);
    const title = `[UI验收-${mobile ? '安卓' : '桌面'}-${Date.now()}] 双击日期`;
    const dialog = page.getByRole('dialog');
    await dialog.locator('input[type=text]').first().fill(title);
    const created = page.waitForResponse(response => response.url().endsWith('/api/v1/tasks') && response.request().method() === 'POST');
    await tap(dialog.locator('button[type=submit]'));
    const response = await created;
    expect(response.ok(), await response.text()).toBe(true);
    const task = (await response.json()).data;
    ids.push(task.id);
    expect(task.project_id).toBeNull();
    if (mobile) await tap(page.getByRole('dialog', { name: '任务详情', exact: true }).getByRole('button', { name: '关闭', exact: true }));
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await expect(calendar.getByText(title, { exact: true })).toBeVisible();
    await page.reload();
    await tap(calendar.getByRole('button', { name: dates.past, exact: true }));
    await expect(calendar.getByText(title, { exact: true })).toBeVisible();
    await tap(calendar.getByRole('button').filter({ hasText: title }));
    await page.getByLabel('截止日期', { exact: true }).fill(dates.today);
    await tap(page.getByRole('button', { name: mobile ? '确认更新任务' : '保存日程', exact: true }));
    if (!mobile) await tap(page.getByRole('button', { name: '查看日程修改记录', exact: true }));
    else {
      await tap(calendar.getByRole('button', { name: dates.today, exact: true }));
      await tap(calendar.getByRole('button').filter({ hasText: title }));
      await tap(page.getByRole('button', { name: '查看日程修改记录', exact: true }));
    }
    await expect(page.getByText('首次记录时间：', { exact: false })).toBeVisible();
    if (mobile) { await shell('input', 'keyevent', '4'); await expect(page.getByRole('dialog')).toHaveCount(0); }
    else await tap(page.getByRole('button', { name: '关闭任务详情', exact: true }));
    checks.push(label + '：双击过去日期新增、个人归属、保存刷新、改期历史'); console.log('PASS ' + checks.at(-1));

    await page.evaluate(async taskId => { const path='/src/api/backend.ts'; const api=await import(/* @vite-ignore */ path); await api.deleteTask(taskId); }, task.id);
    await page.reload();
    await expect(trend.getByRole('img')).toBeVisible();
    await tap(ai.getByRole('button', { name: '查看汇报', exact: true }));
    await backHome();
    await expect(trend.getByRole('img')).toBeVisible();
    if (!mobile) await page.screenshot({ path: `${out}/desktop.png`, fullPage: true });
    else {
      await shell('screencap', '-p', '/sdcard/codex-home-trend.png');
      await run(adb, ['-s', 'emulator-5554', 'pull', '/sdcard/codex-home-trend.png', `${out}/android.png`]);
    }
  }
  await writeFile(`${out}/result.json`, JSON.stringify({ passed: checks.length, checks, fixtureIds: ids, cleanup: 'soft-deleted', apiMocked: false }, null, 2));
} catch (error) {
  await writeFile(`${out}/failure.json`, JSON.stringify({ checks, fixtureIds: ids, error: String(error) }, null, 2));
  throw error;
} finally { await desktop.close(); await android.close(); }
