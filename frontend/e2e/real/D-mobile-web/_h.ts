import { expect, type Page, type APIRequestContext } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'

const ENV = (process.env.AUDIT_CRED_FILE || 'C:/Users/11580/AppData/Local/Temp/claude/0ea118bfe5784990/63b0b73d-66cc-42ca-9829-633749930870/scratchpad/audit/credentials.env')
export const STATE_FILE = path.join(process.cwd(), 'e2e/real/D-mobile-web/_state.json')
export const COMPANY = 1
export const MAILPIT = 'http://127.0.0.1:8025'

export function creds() {
  const o: Record<string, string> = {}
  for (const l of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/)
    if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return o
}
export const stamp = () => Date.now().toString(36)
export function readState(): any {
  try { return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8')) } catch { return {} }
}
export function writeState(patch: any) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...readState(), ...patch }, null, 2))
}

export async function apiLogin(request: APIRequestContext, username?: string, password?: string) {
  const c = creds()
  const r = await request.post('/api/v1/auth/login', { data: { username: username ?? c.AUDIT_ADMIN_USER, password: password ?? c.AUDIT_ADMIN_PASSWORD } })
  expect(r.ok(), 'login ' + r.status()).toBeTruthy()
  const d = (await r.json()).data
  return { tokens: d, h: { Authorization: `Bearer ${d.access_token}` } as Record<string, string> }
}
export async function api(request: APIRequestContext, h: any, method: 'get' | 'post' | 'put' | 'patch' | 'delete', path: string, data?: any) {
  const r = await (request as any)[method]('/api/v1' + path, { headers: h, data })
  let body: any = null
  try { body = await r.json() } catch { /* ignore */ }
  return { status: r.status(), body, data: body?.data }
}
export async function bootPage(page: Page, tokens: any, url = '/') {
  await page.addInitScript(t => {
    localStorage.setItem('access_token', t.access_token)
    localStorage.setItem('refresh_token', t.refresh_token)
  }, tokens)
  await page.goto(url)
}
/** 从 mailpit 取发给某邮箱的最新验证码（6 位数字） */
export async function mailCode(request: APIRequestContext, to: string, since = 0): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const r = await request.get(`${MAILPIT}/api/v1/search?query=${encodeURIComponent('to:' + to)}`)
    const j = await r.json()
    const msgs = (j.messages || []).filter((m: any) => new Date(m.Created).getTime() >= since)
    for (const m of msgs) {
      const d = await (await request.get(`${MAILPIT}/api/v1/message/${m.ID}`)).json()
      const mm = String(d.Text || d.HTML || '').match(/\b(\d{6})\b/)
      if (mm) return mm[1]
    }
    await new Promise(r => setTimeout(r, 500))
  }
  throw new Error('no mail code for ' + to)
}

export const SHOT = 'e2e/real/D-mobile-web/shots/'
export const BTN_SEL = 'button, [role="button"], a[href], [role="tab"], [role="menuitem"], summary, input[type="checkbox"], input[type="radio"], [role="switch"], [tabindex="0"], select'

/** 当前页所有可点击元素的 {名称, 序号} ；额外收录 cursor:pointer 的非按钮元素 */
export async function listClickables(page: Page) {
  return page.evaluate((sel) => {
    const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const cs = getComputedStyle(el as HTMLElement); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
    let els = Array.from(document.querySelectorAll(sel)).filter(vis) as HTMLElement[]
    const set = new Set(els)
    for (const el of Array.from(document.querySelectorAll('div,li,span,p,td,tr,img,svg')) as HTMLElement[]) {
      if (set.has(el) || !vis(el)) continue
      if (getComputedStyle(el).cursor !== 'pointer') continue
      if (el.closest('button,a[href],[role="button"],[role="tab"],label,select')) continue
      let p = el.parentElement, dup = false
      while (p) { if (set.has(p) || (getComputedStyle(p).cursor === 'pointer' && p !== document.body)) { dup = true; break } p = p.parentElement }
      if (dup) continue
      els.push(el); set.add(el)
    }
    els.sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (ra.top - rb.top) || (ra.left - rb.left) })
    return els.map((el, i) => {
      const r = el.getBoundingClientRect()
      const name = (el.getAttribute('aria-label') || (el as HTMLElement).innerText || el.getAttribute('title') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 40)
      const inTab = !!el.closest('nav[aria-label="主要页面导航"]')
      return { i, name, tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', disabled: (el as any).disabled === true || el.getAttribute('aria-disabled') === 'true', inTab, x: Math.round(r.x), y: Math.round(r.y), w: Math.round(r.width), h: Math.round(r.height) }
    })
  }, BTN_SEL)
}
