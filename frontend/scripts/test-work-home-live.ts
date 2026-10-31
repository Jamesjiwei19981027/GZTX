/** Real desktop + installed Android APP, actual backend, ADB taps. Fixture tasks only. */
import { chromium, expect as baseExpect, type Page, type Locator } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';

const expect = baseExpect.configure({ timeout: 30000 });
const run = promisify(execFile);
const adb = 'C:/Users/11580/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const origin = 'http://127.0.0.1:5177';
const endpoint = 'http://127.0.0.1:9222';
const backOnly = process.env.WORK_HOME_ANDROID_BACK_ONLY === 'true';
const out = 'android-acceptance/test-results/' + (backOnly ? 'work-home-back' : 'work-home');
await mkdir(out, { recursive: true });
const checks: string[] = [];
const ids: number[] = [];
const shell = (...args: string[]) => run(adb, ['-s', 'emulator-5554', 'shell', ...args]);
const desktop = await chromium.launch();
const android = await chromium.connectOverCDP(endpoint, { noDefaults: true });
try {
  for (const mobile of backOnly ? [true] : [false, true]) {
    const label = mobile ? 'Android APP' : '桌面 Web';
    const page = mobile ? android.contexts()[0].pages()[0] : await desktop.newPage({ viewport: { width: 1440, height: 1000 }, timezoneId: 'Asia/Shanghai' });
    page.setDefaultTimeout(30000);
    const tap = async (locator: Locator) => {
      if (!mobile) { await locator.click(); return; }
      if (/mInputShown=true/.test((await shell('dumpsys', 'input_method')).stdout)) await shell('input', 'keyevent', '111');
      await locator.scrollIntoViewIfNeeded();
      const rect = (await locator.boundingBox())!;
      const targets = await (await fetch(endpoint + '/json/list')).json() as { url: string; description: string }[];
      const view = JSON.parse(targets.find(target => target.url === page.url())!.description);
      const ratio = await page.evaluate(() => devicePixelRatio);
      await shell('input', 'tap', String(Math.round(view.screenX + (rect.x + rect.width / 2) * ratio)), String(Math.round(view.screenY + (rect.y + rect.height / 2) * ratio)));
    };
    const capture = async (name: string) => {
      if (!mobile) return page.screenshot({ path: `${out}/desktop-${name}.png`, fullPage: true });
      await shell('screencap', '-p', '/sdcard/codex-work-home.png');
      await run(adb, ['-s', 'emulator-5554', 'pull', '/sdcard/codex-work-home.png', `${out}/android-${name}.png`]);
    };
    await page.goto(origin);
    await expect.poll(() => page.locator('input[type=password]').isVisible().then(login => login || page.getByRole('region', { name: '首页日程日历' }).isVisible())).toBe(true);
    if (await page.locator('input[type=password]').isVisible()) {
      await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill('axis_pm');
      await page.locator('input[type=password]').fill(process.env.AXIS_LIVE_PASSWORD || 'axis-debug-2026');
      await page.locator('form button[type=submit]').click();
    }
    await expect(page.getByRole('region', { name: '首页日程日历' })).toBeVisible();
    const dates = await page.evaluate(`(() => {
      const key = date => date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
      const today = new Date(); today.setHours(9, 30, 0, 0);
      const tomorrow = new Date(today); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(14, 45);
      return { today: key(today), tomorrow: key(tomorrow), due: today.toISOString(), updated: tomorrow.toISOString() };
    })()`) as { today: string; tomorrow: string; due: string; updated: string };
    const title = `[UI验收-${mobile ? '安卓' : '桌面'}-${Date.now()}] 首页日程修改`;
    const fixture = await page.evaluate(async ({ title, due }) => {
      const modulePath = '/src/api/backend.ts'; const api = await import(/* @vite-ignore */ modulePath);
      return api.createTask({ title, due_date: due, origin: 'personal', project_id: null });
    }, { title, due: dates.due });
    ids.push(fixture.id);
    try {
      await page.reload();
      const calendar = page.getByRole('region', { name: '首页日程日历' });
      await expect(calendar.getByText(title, { exact: true })).toBeVisible();
      if (mobile) for (const name of ['我的任务列表', '任务看板', '回收站']) await expect(page.getByRole('button', { name: new RegExp('^' + name) })).toHaveCount(0);
      await tap(calendar.getByRole('button', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));
      await expect(page.getByLabel('截止日期', { exact: true })).toHaveValue(dates.today);
      if (mobile) {
        if (/mInputShown=true/.test((await shell('dumpsys', 'input_method')).stdout)) await shell('input', 'keyevent', '111');
        await shell('input', 'keyevent', '4');
        await expect(page.getByRole('dialog', { name: '编辑任务', exact: true })).toHaveCount(0);
        await expect(calendar).toBeVisible();
        checks.push(label + '：真实系统返回键关闭日程编辑弹层并保留首页');
        console.log('PASS ' + checks.at(-1));
        if (backOnly) continue;
        await tap(calendar.getByRole('button', { name: new RegExp(title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')) }));
        await expect(page.getByLabel('截止日期', { exact: true })).toHaveValue(dates.today);
      }
      await page.getByLabel('截止日期', { exact: true }).fill(dates.tomorrow);
      await page.getByLabel('截止时刻', { exact: true }).fill('14:45');
      const saved = page.waitForResponse(response => response.url().endsWith(`/api/v1/tasks/${fixture.id}`) && response.request().method() === 'PUT');
      await tap(page.getByRole('button', { name: mobile ? '确认更新任务' : '保存日程', exact: true }));
      const savedResponse = await saved;
      expect(savedResponse.ok(), `${savedResponse.status()} ${await savedResponse.text()}`).toBe(true);
      if (!mobile) await tap(page.getByRole('button', { name: '关闭任务详情', exact: true }));
      await expect(calendar.getByText(title, { exact: true })).toHaveCount(0);
      await tap(calendar.getByRole('button', { name: dates.tomorrow, exact: true }));
      await expect(calendar.getByRole('button', { name: /14:45/ }).filter({ hasText: title })).toBeVisible();
      await page.reload();
      await tap(calendar.getByRole('button', { name: dates.tomorrow, exact: true }));
      await expect(calendar.getByRole('button', { name: /14:45/ }).filter({ hasText: title })).toBeVisible();
      await capture('calendar');
      checks.push(label + '：首页日历直接修改日期／时间，保存并刷新后保持');
      console.log('PASS ' + checks.at(-1));

      const metrics = mobile ? page.getByRole('region', { name: '待办汇总' }) : page.getByTestId('today-focus');
      await tap(metrics.getByRole('button', { name: /待办事项/ }));
      const views = page.getByRole('tablist', { name: '任务视图', exact: true });
      await expect(views.getByRole('tab', { name: '任务看板', exact: true })).toHaveAttribute('aria-selected', 'true');
      await tap(views.getByRole('tab', { name: '任务列表', exact: true }));
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      await capture('workspace');
      checks.push(label + '：顶部待办直达看板，切换列表保留范围');
      console.log('PASS ' + checks.at(-1));

      await page.evaluate(async id => { const modulePath = '/src/api/backend.ts'; const api = await import(/* @vite-ignore */ modulePath); await api.deleteTask(id); }, fixture.id);
      await tap(page.getByLabel('任务更多操作', { exact: true }));
      await tap(page.getByRole('button', { name: '回收站', exact: true }));
      const row = mobile ? page.locator('[role=button], button').filter({ hasText: title }).first() : page.getByTestId('trash-row').filter({ hasText: title });
      if (mobile) {
        const text = page.getByText(title, { exact: true });
        await expect(text).toBeVisible();
        const item = text.locator('xpath=../..');
        await tap(item.getByRole('button', { name: /恢复/ }));
      } else await tap(row.getByTestId('trash-restore'));
      await expect(page.getByText(title, { exact: true })).toHaveCount(0);
      await tap(page.getByRole('button', { name: mobile ? '返回' : '返回任务管理', exact: true }).first());
      await expect(views.getByRole('tab', { name: '任务列表', exact: true })).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByText(title, { exact: true })).toBeVisible();
      checks.push(label + '：更多进入回收站，恢复任务后返回原列表，实时更新');
      console.log('PASS ' + checks.at(-1));
    } finally {
      await page.evaluate(async id => { const modulePath = '/src/api/backend.ts'; const api = await import(/* @vite-ignore */ modulePath); await api.deleteTask(id); }, fixture.id).catch(() => {});
      if (backOnly) await page.goto(origin);
    }
    await page.goto(origin);
    if (!mobile) await page.close();
  }
  await writeFile(out + '/result.json', JSON.stringify({ status: 'passed', realAndroid: true, mockedApi: false, fixtureTaskIds: ids, cleanup: 'Fixture tasks soft-deleted through the API', checks }, null, 2));
} catch (error) {
  await writeFile(out + '/result.json', JSON.stringify({ status: 'failed', checks, error: String(error) }, null, 2));
  throw error;
} finally { await desktop.close(); await android.close(); }
