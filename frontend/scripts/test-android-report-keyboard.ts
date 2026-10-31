/** Installed Flutter APP, real ADB taps and system IME. Never dismiss IME to pass visibility checks. */
import { chromium, expect as baseExpect, type Locator } from '@playwright/test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';

const expect = baseExpect.configure({ timeout: 30000 });

const run = promisify(execFile);
const adb = 'C:/Users/11580/AppData/Local/Android/Sdk/platform-tools/adb.exe';
const endpoint = 'http://127.0.0.1:9222';
const origin = 'http://127.0.0.1:5177';
const out = 'android-acceptance/test-results/report-keyboard';
await mkdir(out, { recursive: true });
const browser = await chromium.connectOverCDP(endpoint, { noDefaults: true });
const page = browser.contexts()[0].pages()[0];
page.setDefaultTimeout(20000);
const checks: { name: string; [key: string]: unknown }[] = [];
const shell = (...args: string[]) => run(adb, ['-s', 'emulator-5554', 'shell', ...args]);
const imeShown = async () => /mInputShown=true/.test((await shell('dumpsys', 'input_method')).stdout);
async function view() {
  const targets = await (await fetch(endpoint + '/json/list')).json() as { url: string; description: string }[];
  return JSON.parse(targets.find(target => target.url === page.url())!.description) as { screenX: number; screenY: number };
}
async function tap(locator: Locator) {
  await locator.scrollIntoViewIfNeeded();
  const rect = (await locator.boundingBox())!;
  const v = await view();
  const ratio = await page.evaluate(() => devicePixelRatio);
  await shell('input', 'tap', String(Math.round(v.screenX + (rect.x + rect.width / 2) * ratio)), String(Math.round(v.screenY + (rect.y + rect.height / 2) * ratio)));
}
async function visibleOverKeyboard(locator: Locator) {
  expect(await imeShown(), 'System IME must remain open for visibility verification').toBe(true);
  const dump = (await shell('dumpsys', 'window')).stdout;
  const frame = dump.match(/type=ime frame=\[\d+,(\d+)\]\[\d+,\d+\][^\r\n]*visible=true/);
  if (!frame) throw new Error('Cannot find visible native IME frame');
  const keyboardTop = Number(frame[1]);
  const v = await view();
  const dpr = await page.evaluate(() => devicePixelRatio);
  await expect.poll(async () => { const r = (await locator.boundingBox())!; return v.screenY + (r.y + r.height) * dpr; }).toBeLessThanOrEqual(keyboardTop + 2);
  return { keyboardTop, rect: await locator.boundingBox(), native: await page.evaluate(() => window.__NATIVE_RUNTIME__) };
}
async function screenshot(name: string) {
  await shell('screencap', '-p', '/sdcard/codex-report-keyboard.png');
  await run(adb, ['-s', 'emulator-5554', 'pull', '/sdcard/codex-report-keyboard.png', `${out}/${name}.png`]);
}
async function dismiss() {
  await shell('input', 'keyevent', '111');
  await expect.poll(imeShown).toBe(false);
  await expect.poll(() => page.evaluate(() => (window.__NATIVE_RUNTIME__ as any)?.keyboardInset)).toBe(0);
}
let drafts: [string, string][] = [];
try {
  if (await imeShown()) await dismiss();
  await page.goto(origin + '/?view=ai');
  await expect(page.getByRole('heading', { name: 'AI 汇报与助手', exact: true })).toBeVisible({ timeout: 30000 });
  drafts = await page.evaluate(() => Object.entries(localStorage).filter(([key]) => key.startsWith('wt_ai_report_draft_')));
  await page.getByLabel('汇报项目', { exact: true }).selectOption('1');
  await tap(page.getByRole('button', { name: '告诉 AI 最新进展', exact: true }));
  const input = page.getByPlaceholder('输入项目进展与工作事实…');
  const viewportHeight = await page.evaluate(() => innerHeight);
  const initial = (await input.boundingBox())!;
  await tap(input);
  await expect.poll(imeShown).toBe(true);
  await expect.poll(() => page.evaluate(() => (window.__NATIVE_RUNTIME__ as any)?.keyboardInset || 0)).toBeGreaterThan(100);
  checks.push({ name: 'AI 输入框避开真实系统键盘', ...await visibleOverKeyboard(input) });
  console.log('PASS real keyboard overlap and bridge');
  expect(await page.evaluate(() => innerHeight), 'Whole APP viewport must remain unchanged').toBe(viewportHeight);
  const progressText = '已完成接口联调\n项目进展已记录\n风险已排查\n下一步准备汇报';
  await input.fill(progressText);
  expect((await input.boundingBox())!.height).toBeGreaterThan(initial.height + 25);
  // Pace real key events to the unaccelerated emulator rather than flood its IME.
  await shell('input', 'text', 'z');
  await expect(input).toHaveValue(progressText + 'z');
  await shell('input', 'text', 'y');
  await expect(input).toHaveValue(progressText + 'zy');
  await visibleOverKeyboard(input);
  await visibleOverKeyboard(page.getByRole('button', { name: '发送项目进展', exact: true }));
  await screenshot('chat-keyboard');
  console.log('PASS multiline growth and real IME typing');
  checks.push({ name: '多行输入自动增高，真实 IME 继续输入，发送按钮可见，页面高度保持不变', viewportHeight });
  await input.fill(Array(40).fill('长汇报输入验证，最后一行仍可以查看').join('\n'));
  expect((await input.boundingBox())!.height).toBeLessThanOrEqual(200);
  expect(await input.evaluate(el => el.scrollHeight > el.clientHeight && el.scrollTop > 0)).toBe(true);
  await visibleOverKeyboard(input);
  await screenshot('chat-long-keyboard');
  console.log('PASS long report and internal scroll');
  checks.push({ name: '长汇报到达高度上限后框内滚动，末尾可见且键盘保持打开' });
  await input.fill('');
  await dismiss();
  await expect.poll(async () => (await input.boundingBox())!.y).toBeGreaterThan(initial.y - 3);
  checks.push({ name: '关闭键盘后输入区恢复原位' });

  await tap(page.getByRole('button', { name: '返回', exact: true }));
  await tap(page.getByText('整理本周汇报', { exact: true }));
  const risk = page.getByLabel('进行中与风险汇报内容', { exact: true });
  await tap(risk);
  await expect.poll(imeShown).toBe(true);
  await risk.fill(Array(12).fill('进度与风险：验证输入区域跟随键盘').join('\n'));
  await visibleOverKeyboard(risk);
  await visibleOverKeyboard(page.getByRole('button', { name: '确认提交', exact: true }));
  await screenshot('editor-keyboard');
  console.log('PASS report editor over keyboard');
  checks.push({ name: '汇报编辑页长文输入和确认提交按钮均在系统键盘上方' });
  await dismiss();

  await page.goto(origin);
  await tap(page.getByRole('button', { name: '快速添加', exact: true }));
  const quick = page.getByRole('dialog', { name: '快速添加', exact: true });
  const quickInput = quick.locator('textarea');
  await tap(quickInput);
  await expect.poll(imeShown).toBe(true);
  await quickInput.fill(Array(7).fill('快速记录项目汇报和任务').join('\n'));
  await visibleOverKeyboard(quickInput);
  await visibleOverKeyboard(quick.locator('button[type=submit]'));
  await screenshot('quick-keyboard');
  console.log('PASS quick add over keyboard');
  checks.push({ name: '快速添加弹窗自动增高，输入区与添加按钮均避开系统键盘' });
  await dismiss();
  await tap(quick.getByRole('button', { name: '取消', exact: true }));
  await writeFile(out + '/result.json', JSON.stringify({ status: 'passed', realAndroid: true, mockedApi: false, checks }, null, 2));
  for (const check of checks) console.log('PASS ' + check.name);
} catch (error) {
  await screenshot('failure').catch(() => {});
  await writeFile(out + '/result.json', JSON.stringify({ status: 'failed', realAndroid: true, checks, error: String(error) }, null, 2));
  throw error;
} finally {
  // Restore pre-existing local report drafts; never submit test text to the server.
  await page.evaluate(saved => {
    for (const key of Object.keys(localStorage)) if (key.startsWith('wt_ai_report_draft_')) localStorage.removeItem(key);
    for (const [key, value] of saved) localStorage.setItem(key, value);
  }, drafts).catch(() => {});
  await browser.close();
}
