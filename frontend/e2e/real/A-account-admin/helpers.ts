import { expect, type APIRequestContext, type Page } from '@playwright/test';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';

/** 区域 A 公共工具：读取审计账号、调接口、从 mailpit 取信。不打桩任何接口。 */
export const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://127.0.0.1:8097';
export const MAIL = process.env.AUDIT_MAIL_URL || 'http://127.0.0.1:8025';
const CRED_FILE = (process.env.AUDIT_CRED_FILE || 'C:/Users/11580/AppData/Local/Temp/claude/0ea118bfe5784990/63b0b73d-66cc-42ca-9829-633749930870/scratchpad/audit/credentials.env');

export function creds() {
  const env: Record<string, string> = {};
  for (const line of readFileSync(CRED_FILE, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) env[m[1]] = m[2].trim();
  }
  return { user: env.AUDIT_ADMIN_USER, password: env.AUDIT_ADMIN_PASSWORD, email: env.AUDIT_ADMIN_EMAIL };
}

export const COMPANY_ID = 1;
/** 本区域恢复用的公司发信 / AI 基线（公共说明里规定的值） */
export const SMTP_BASELINE = { smtp_host: 'mailpit', smtp_port: 1025, smtp_user: 'sender@audit.test', smtp_password: 'any-pass', smtp_from: 'sender@audit.test' };
export const LLM_BASELINE = { provider: 'fake', base_url: '', model: 'fake', enabled: true, use_for_judge: true, use_for_agent: true };

const STATE_FILE = 'e2e/real/A-account-admin/.state.json';
export function readState(): Record<string, any> {
  try { return existsSync(STATE_FILE) ? JSON.parse(readFileSync(STATE_FILE, 'utf8')) : {}; } catch { return {}; }
}
export function patchState(patch: Record<string, any>) {
  writeFileSync(STATE_FILE, JSON.stringify({ ...readState(), ...patch }, null, 2));
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** nginx 对 /auth/(login|send-code|register|token) 全环境共用 20 次/分钟/IP；撞到 429 就等一会儿重试。 */
export async function retry429<T extends { status(): number }>(fn: () => Promise<T>, tries = 10): Promise<T> {
  let last!: T;
  for (let i = 0; i < tries; i++) {
    last = await fn();
    if (last.status() !== 429) return last;
    await sleep(7000 + i * 1500);
  }
  return last;
}

export async function apiLogin(request: APIRequestContext, username: string, password: string) {
  const res = await retry429(() => request.post(`${BASE}/api/v1/auth/login`, { data: { username, password } }));
  expect(res.status(), `login ${username}`).toBe(200);
  const body = await res.json();
  return { token: body.data.access_token as string, refresh: body.data.refresh_token as string, user: body.data.user };
}

/** 超管会话缓存 10 分钟，避免反复撞共享的登录限流 */
export async function adminSession(request: APIRequestContext) {
  const st = readState();
  if (st.admin && Date.now() - st.admin.at < 10 * 60_000) return st.admin as { token: string; refresh: string; at: number };
  const c = creds();
  const r = await apiLogin(request, c.user, c.password);
  const admin = { token: r.token, refresh: r.refresh, at: Date.now() };
  patchState({ admin });
  return admin;
}
export async function adminToken(request: APIRequestContext) {
  return (await adminSession(request)).token;
}

/** 不走登录框，直接把令牌种进浏览器（登录框另有专门用例）。 */
export async function seedSession(page: Page, s: { token: string; refresh: string }) {
  await page.addInitScript(([t, r]) => {
    try { localStorage.setItem('access_token', t); localStorage.setItem('refresh_token', r); } catch { /* ignore */ }
  }, [s.token, s.refresh]);
}

export async function api(request: APIRequestContext, token: string, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, data?: unknown) {
  const res = await request[method](`${BASE}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    ...(data !== undefined ? { data } : {}),
  });
  let body: any = null;
  try { body = await res.json(); } catch { /* 非 JSON */ }
  return { status: res.status(), body, data: body?.data };
}

/** 唯一后缀：同一次运行内部共用，避免重复数据 */
export const RUN = Date.now().toString(36);

// ---------------- mailpit ----------------
export async function mailList(request: APIRequestContext, to: string) {
  const res = await request.get(`${MAIL}/api/v1/search`, { params: { query: `to:${to}` } });
  const body = await res.json();
  return (body.messages || []) as any[];
}

export async function mailBody(request: APIRequestContext, id: string) {
  const res = await request.get(`${MAIL}/api/v1/message/${id}`);
  return await res.json();
}

/** 轮询等待发给 to 的邮件（可按主题关键字过滤，且必须晚于 sinceMs）。 */
export async function waitMail(request: APIRequestContext, to: string, opts: { subject?: RegExp; sinceMs?: number; timeoutMs?: number } = {}) {
  const deadline = Date.now() + (opts.timeoutMs ?? 25_000);
  while (Date.now() < deadline) {
    const msgs = await mailList(request, to);
    const hit = msgs.find((m) => {
      if (opts.subject && !opts.subject.test(m.Subject || '')) return false;
      if (opts.sinceMs && new Date(m.Created).getTime() < opts.sinceMs - 2000) return false;
      return true;
    });
    if (hit) return { summary: hit, detail: await mailBody(request, hit.ID) };
    await new Promise((r) => setTimeout(r, 800));
  }
  throw new Error(`mailpit 在限定时间内没有收到发给 ${to} 的邮件 ${opts.subject ?? ''}`);
}

export function codeFrom(detail: any): string {
  const m = `${detail.Text || ''} ${detail.HTML || ''}`.match(/(?<!\d)(\d{6})(?!\d)/);
  if (!m) throw new Error('邮件正文里找不到 6 位验证码：' + (detail.Text || '').slice(0, 200));
  return m[1];
}

// ---------------- 页面 ----------------
export async function uiLogin(page: Page, username: string, password: string) {
  await page.goto('/');
  for (let i = 0; i < 8; i++) {
    await page.getByPlaceholder('用户名 / 邮箱 / 手机号').fill(username);
    await page.locator('input[type="password"]').first().fill(password);
    const resp = page.waitForResponse((r) => r.url().includes('/auth/login') && r.request().method() === 'POST');
    await page.getByRole('button', { name: '登录', exact: true }).last().click();
    if ((await resp).status() !== 429) break;
    await sleep(8000);
  }
  await expect(page.getByTestId('user-menu-button')).toBeVisible({ timeout: 30_000 });
}

/** 收集控制台 error 与 pageerror，用于“无报错”断言。已知无关噪声（资源 404 等）可在调用方过滤。 */
export function trackErrors(page: Page) {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  page.on('response', (r) => { if (r.status() >= 500) errors.push(`HTTP ${r.status()} ${r.request().method()} ${new URL(r.url()).pathname}`); });
  return errors;
}
