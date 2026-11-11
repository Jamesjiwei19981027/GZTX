import { expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';

export const B = 'http://127.0.0.1:8097/api/v1';
const dir = path.join(process.cwd(), 'e2e/real/C-progress-report');
export const PASS = 'CAudit-Pass-2026!';
export const state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
const envTxt = fs.readFileSync((process.env.AUDIT_CRED_FILE || 'C:/Users/11580/AppData/Local/Temp/claude/0ea118bfe5784990/63b0b73d-66cc-42ca-9829-633749930870/scratchpad/audit/credentials.env'), 'utf8');
const env: Record<string, string> = Object.fromEntries(envTxt.split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
export const ADMIN = { username: env.AUDIT_ADMIN_USER, password: env.AUDIT_ADMIN_PASSWORD };
export const M1 = { username: 'c_m1', password: PASS };
export const M2 = { username: 'c_m2', password: PASS };
export const PID: number = state.project.id;
export const PNAME: string = state.project.name;

export async function api(method: string, url: string, body?: unknown, token?: string) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j: any; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
}
const cacheFile = path.join(dir, '.tokens.json');
/** 登录有 nginx 限流（429）：令牌缓存 8 分钟（有效期 15 分钟）并在 429 时退避重试 */
export async function tokensFor(u: { username: string; password: string }) {
  let cache: Record<string, any> = {};
  try { cache = JSON.parse(fs.readFileSync(cacheFile, 'utf8')); } catch { /* 无缓存 */ }
  const hit = cache[u.username];
  if (hit && Date.now() - hit.at < 8 * 60 * 1000) return { access: hit.access as string, refresh: hit.refresh as string };
  for (let i = 0; i < 12; i++) {
    const r = await api('POST', '/auth/login', u);
    if (r.j?.data?.access_token) {
      cache[u.username] = { access: r.j.data.access_token, refresh: r.j.data.refresh_token, at: Date.now() };
      try { fs.writeFileSync(cacheFile, JSON.stringify(cache)); } catch { /* ignore */ }
      return { access: r.j.data.access_token as string, refresh: r.j.data.refresh_token as string };
    }
    await new Promise(res => setTimeout(res, 5000 * (i + 1)));
  }
  throw new Error('登录失败（限流）：' + u.username);
}
/** 注入登录态并进入桌面端首页，选中 C- 项目 */
export async function openAs(page: Page, u: { username: string; password: string }) {
  const t = await tokensFor(u);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.addInitScript(([a, r]) => { localStorage.setItem('access_token', a); localStorage.setItem('refresh_token', r); }, [t.access, t.refresh]);
  await page.goto('/');
  await expect(page.locator('aside')).toBeVisible({ timeout: 20000 });
  return t.access;
}
export function collectErrors(page: Page) {
  const errs: string[] = [];
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  return errs;
}

/** 站内通知由后台队列异步投递，轮询等待（最多 90 秒） */
export async function waitNotif(token: string, pred: (n: any) => boolean, timeoutMs = 90000) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeoutMs) {
    const r = await api('GET', '/notifications/collab?page=1&state=all', undefined, token);
    const hit = (r.j?.data?.items || []).find(pred);
    if (hit) return { hit, waited: Date.now() - t0 };
    await new Promise(res => setTimeout(res, 2000));
  }
  return { hit: null as any, waited: Date.now() - t0 };
}
