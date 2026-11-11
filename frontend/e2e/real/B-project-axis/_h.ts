import { expect, type Page, type APIRequestContext } from '@playwright/test'
import fs from 'node:fs'

const ENV = (process.env.AUDIT_CRED_FILE || 'C:/Users/11580/AppData/Local/Temp/claude/0ea118bfe5784990/63b0b73d-66cc-42ca-9829-633749930870/scratchpad/audit/credentials.env')
export function creds() {
  const o: Record<string, string> = {}
  for (const l of fs.readFileSync(ENV, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z_]+)\s*=\s*(.*)$/); if (m) o[m[1]] = m[2].trim().replace(/^["']|["']$/g, '')
  }
  return o
}
export const COMPANY = 1
/** 真环境已超过100个项目，测试自身也必须遍历接口分页。 */
export async function allProjects(request: APIRequestContext, h: any) {
  const items: any[] = []
  for (let page = 1; page <= 10; page++) {
    const res = await api(request, h, 'get', `/projects?company_id=1&as_admin=true&page_size=100&page=${page}`)
    expect(res.status).toBe(200)
    items.push(...res.data.items)
    if (items.length >= res.data.total || res.data.items.length < 100) return items
  }
  throw new Error('项目分页超过测试安全上限')
}
export const stamp = () => Date.now().toString(36)

export async function apiLogin(request: APIRequestContext, username?: string, password?: string) {
  const c = creds()
  const r = await request.post('/api/v1/auth/login', { data: { username: username ?? c.AUDIT_ADMIN_USER, password: password ?? c.AUDIT_ADMIN_PASSWORD } })
  expect(r.ok(), 'login ' + r.status()).toBeTruthy()
  const d = (await r.json()).data
  return { tokens: d, h: { Authorization: `Bearer ${d.access_token}` } as Record<string, string> }
}
export async function bootPage(page: Page, tokens: any, url = '/') {
  await page.addInitScript(t => {
    localStorage.setItem('access_token', t.access_token); localStorage.setItem('refresh_token', t.refresh_token)
  }, tokens)
  const companies = page.waitForResponse(r => new URL(r.url()).pathname === '/api/v1/companies/mine' && r.request().method() === 'GET')
  await page.goto(url)
  expect((await companies).status()).toBe(200)
  await expect(page.getByText('正在从后端同步…', { exact: true })).toBeHidden()
  await expect(page.getByTestId('user-menu-button')).toBeVisible()
}
export async function api(request: APIRequestContext, h: any, method: 'get'|'post'|'put'|'patch'|'delete', path: string, data?: any) {
  const r = await (request as any)[method]('/api/v1' + path, { headers: h, data })
  let body: any = null; try { body = await r.json() } catch {}
  return { status: r.status(), body, data: body?.data }
}

export async function mailCode(request: APIRequestContext, to: string): Promise<string> {
  for (let i = 0; i < 20; i++) {
    const r = await request.get('http://127.0.0.1:8025/api/v1/search?query=' + encodeURIComponent('to:' + to))
    const j = await r.json()
    if (j.messages?.length) {
      const id = j.messages[0].ID
      const m = await (await request.get('http://127.0.0.1:8025/api/v1/message/' + id)).json()
      const mm = (m.Text || '').match(/(?<!\d)(\d{6})(?!\d)/)
      if (mm) return mm[1]
    }
    await new Promise(res => setTimeout(res, 500))
  }
  throw new Error('no mail for ' + to)
}
export const MEMBER_PW = 'Bmember-Pass-2026x'
/** 邀请 + mailpit 验证码注册一个 B- 用户，返回登录态 */
export async function registerMember(request: APIRequestContext, adminH: any, projectId: number, tag: string) {
  const email = `B-${tag}@audit.example.com`
  const username = `B_${tag}`.replace(/[^A-Za-z0-9_]/g, '_')
  const inv = await api(request, adminH, 'post', `/projects/${projectId}/invitations`, { email })
  expect(inv.status, 'invite ' + JSON.stringify(inv.body)).toBe(200)
  const token = inv.data.token
  const sc = await request.post('/api/v1/auth/send-code', { data: { channel: 'email', target: email, purpose: 'register', invite_token: token } })
  expect(sc.ok(), 'send-code ' + sc.status() + await sc.text()).toBeTruthy()
  const code = await mailCode(request, email)
  const reg = await request.post('/api/v1/auth/register', { data: { username, password: MEMBER_PW, email, email_code: code, nickname: 'B成员' + tag, invite_token: token } })
  expect(reg.status(), 'register ' + await reg.text()).toBe(201)
  const lg = await apiLogin(request, username, MEMBER_PW)
  const me = await api(request, lg.h, 'get', '/users/me')
  return { ...lg, email, username, id: me.data.id as number, token }
}

const MFILE = 'e2e/real/B-project-axis/.member.json'
/** 复用一个已注册的 B- 成员（注册接口被网关限流，只注册一次），再把他拉进指定项目 */
export async function sharedMember(request: APIRequestContext, adminH: any, projectId: number) {
  let info: any = null
  try { info = JSON.parse(fs.readFileSync(MFILE, 'utf8')) } catch {}
  if (!info) {
    for (let i = 0; i < 6; i++) {
      try { const m = await registerMember(request, adminH, projectId, 'm' + stamp()); info = { username: m.username, email: m.email, id: m.id }; break }
      catch (e) { if (i === 5) throw e; await new Promise(r => setTimeout(r, 15000)) }
    }
    fs.writeFileSync(MFILE, JSON.stringify(info))
  } else {
    const pull = await api(request, adminH, 'post', `/projects/${projectId}/members`, { user_id: info.id })
    expect([200, 409]).toContain(pull.status)
  }
  const lg = await apiLogin(request, info.username, MEMBER_PW)
  return { ...lg, ...info }
}
