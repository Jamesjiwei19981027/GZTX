import { test, type Page } from '@playwright/test'
import fs from 'node:fs'
import { apiLogin, readState, SHOT, BTN_SEL } from './_h'

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })

const ROLE = process.env.CRAWL_ROLE === 'admin' ? 'admin' : 'member'
const MAX_DEPTH = Number(process.env.CRAWL_DEPTH || (ROLE === 'admin' ? 1 : 3))
const BUDGET_MS = Number(process.env.CRAWL_BUDGET_MIN || 25) * 60_000
const OUT = `e2e/real/D-mobile-web/crawl-${ROLE}.json`

// 不点这些（会破坏数据/会话/造成外部影响）；点它们之前的“弹出确认框”那一步仍然会被覆盖（只是不点确认）
const SKIP = /退出|注销|删除账号|清空|永久|彻底|确认删除|确定删除|确认移除|解除绑定|解绑|离职|移出项目|归档项目|重置密码|导出数据/
const ADMIN_MUTATE = /完成|保存|提交|发送|创建|新建|添加|确认|确定|生成|导入|同步|标记|已读|开始|结束|拨打|通话|删除|移除|撤销|授权|审批|通过|拒绝|发布|采纳|更新|修改|上传|录音|语音/
const DEV_WORDS = /开发中|敬请期待|即将上线|暂未开放|暂不支持|尚未实现|建设中|coming soon|not implemented|TODO|功能暂未|暂未实现|暂无法使用/i
const BACK_NAMES = /^(返回|取消|关闭|完成|知道了|我知道了)$/

type Step = { t: 'tab'; name: string } | { t: 'click'; name: string; nth: number }
type Rec = { page: string; path: string; button: string; nth: number; result: string; detail: string }
const records: Rec[] = []
const visited = new Set<string>()
const nodeInfo: any[] = []

async function install(page: Page) {
  await page.addInitScript((sel) => {
    (window as any).__clk = () => {
      const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const cs = getComputedStyle(el as HTMLElement); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
      const els = Array.from(document.querySelectorAll(sel)).filter(vis) as HTMLElement[]
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
      return els
    }
    ;(window as any).__nm = (el: HTMLElement) => (el.getAttribute('aria-label') || el.innerText || el.getAttribute('title') || el.getAttribute('placeholder') || '').replace(/\s+/g, ' ').trim().slice(0, 40)
  }, BTN_SEL)
}

async function list(page: Page): Promise<Item[]> {
  return page.evaluate(() => (window as any).__clk().map((el: HTMLElement, i: number) => ({
    i, name: (window as any).__nm(el) as string, tag: el.tagName.toLowerCase(),
    inTab: !!el.closest('nav[aria-label="主要页面导航"]'),
    disabled: (el as any).disabled === true || el.getAttribute('aria-disabled') === 'true',
  })))
}
type Item = { i: number; name: string; tag: string; inTab: boolean; disabled: boolean }

async function clickAt(page: Page, i: number) {
  const pt = await page.evaluate((i) => {
    const el = (window as any).__clk()[i] as HTMLElement
    if (!el) return null
    el.scrollIntoView({ block: 'center' })
    return true
  }, i)
  if (!pt) return false
  await page.waitForTimeout(120)
  const pt2 = await page.evaluate((i) => { const el = (window as any).__clk()[i] as HTMLElement; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } }, i)
  await page.mouse.click(pt2.x, pt2.y)
  return true
}

function nthOf(items: Item[], it: Item) { return items.filter(x => x.name === it.name && x.i < it.i).length }

async function reach(page: Page, path: Step[]) {
  await page.goto('/')
  await page.getByRole('tab', { name: '工作' }).waitFor({ timeout: 20000 })
  await page.waitForTimeout(1200)
  for (const s of path) {
    if (s.t === 'tab') { await page.getByRole('tab', { name: s.name }).click() }
    else {
      const items = await list(page)
      const cand = items.filter(x => x.name === s.name)
      const tgt = cand[s.nth] ?? cand[0]
      if (!tgt) return false
      await clickAt(page, tgt.i)
    }
    await page.waitForTimeout(600)
  }
  return true
}

async function snapshot(page: Page) {
  return page.evaluate(() => {
    const body = (document.body.innerText || '').replace(/[ \t]+/g, ' ')
    const main = document.querySelector('main')
    const vis = (el: Element) => { const r = (el as HTMLElement).getBoundingClientRect(); const cs = getComputedStyle(el as HTMLElement); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none' }
    const tops = Array.from(document.querySelectorAll('header, [class*="sticky"], [class*="fixed"]')).filter(vis).filter(el => {
      const r = (el as HTMLElement).getBoundingClientRect(); return r.top >= -2 && r.top <= 4 && r.height >= 36 && r.height <= 80 && r.width >= 300 && ((el as HTMLElement).innerText || '').trim().length > 0 && !el.closest('nav[aria-label="主要页面导航"]')
    })
    const hs = Array.from(document.querySelectorAll('h1,h2')).filter(vis).map(e => (e as HTMLElement).innerText.trim()).filter(Boolean)
    return {
      body, mainLen: (main?.innerText || '').trim().length, topBars: tops.map(e => ((e as HTMLElement).innerText || '').replace(/\s+/g, ' ').slice(0, 30)),
      headings: hs.slice(0, 4), dialogs: document.querySelectorAll('[role="dialog"],[aria-modal="true"]').length,
      scrollW: document.documentElement.scrollWidth,
    }
  })
}

function sigOf(items: Item[]) {
  return items.filter(x => !x.inTab && !/^\d{4}-\d\d-\d\d$/.test(x.name)).map(x => x.name).slice(0, 25)
}
function jac(a: string[], b: string[]) {
  const A = new Set(a), B = new Set(b); let n = 0; A.forEach(x => { if (B.has(x)) n++ }); const u = new Set([...a, ...b]).size
  return u ? n / u : 1
}
const pathStr = (p: Step[]) => p.map(s => s.t === 'tab' ? `[${s.name}]` : `>${s.name}${s.nth ? '#' + s.nth : ''}`).join('')

test(`D10 手机网页逐按钮爬点（${ROLE}）`, async ({ page, request }) => {
  test.setTimeout(BUDGET_MS + 120_000)
  const st = readState()
  const { tokens } = ROLE === 'admin' ? await apiLogin(request) : await apiLogin(request, st.member.username, st.member.password)
  await page.addInitScript(t => { localStorage.setItem('access_token', t.access_token); localStorage.setItem('refresh_token', t.refresh_token) }, tokens)
  await install(page)

  const errs: string[] = []
  const bad: string[] = []
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text().slice(0, 160)) })
  page.on('pageerror', e => errs.push('pageerror:' + e.message.slice(0, 160)))
  page.on('response', r => { if (r.url().includes('/api/') && r.status() >= 400) bad.push(`${r.request().method()} ${r.url().replace(/^.*\/api\/v1/, '')} ${r.status()}`) })
  let reqs = 0
  page.on('request', r => { if (r.url().includes('/api/')) reqs++ })

  const started = Date.now()
  const queue: { path: Step[]; depth: number; label: string }[] = ['工作', '人轴', '知识', '消息', '我的'].map(n => ({ path: [{ t: 'tab', name: n } as Step], depth: 0, label: n }))

  while (queue.length && Date.now() - started < BUDGET_MS) {
    const node = queue.shift()!
    if (!(await reach(page, node.path))) { records.push({ page: node.label, path: pathStr(node.path), button: '(进入该页)', nth: 0, result: '无法到达', detail: '重放路径时找不到按钮' }); continue }
    const items = (await list(page)).filter(x => !x.inTab)
    const sig = sigOf(items)
    const key = sig.join('|')
    if (visited.has(key) && node.depth > 0) continue
    visited.add(key)
    const snap0 = await snapshot(page)
    nodeInfo.push({ label: node.label, path: pathStr(node.path), depth: node.depth, headings: snap0.headings, topBars: snap0.topBars, buttons: items.length, scrollW: snap0.scrollW })
    await page.screenshot({ path: SHOT + `c-${ROLE}-${nodeInfo.length}.png` })
    if (snap0.topBars.length > 1) records.push({ page: node.label, path: pathStr(node.path), button: '(页面顶栏)', nth: 0, result: '缺陷:双顶栏', detail: snap0.topBars.join(' || ') })
    if (snap0.scrollW > 376) records.push({ page: node.label, path: pathStr(node.path), button: '(页面)', nth: 0, result: '缺陷:横向溢出', detail: `scrollWidth=${snap0.scrollW}` })
    if (snap0.mainLen < 4 && items.length === 0) records.push({ page: node.label, path: pathStr(node.path), button: '(页面)', nth: 0, result: '缺陷:空白页', detail: '' })

    let first = true
    const seen: Record<string, number> = {}
    for (const it of items) {
      if (Date.now() - started > BUDGET_MS) break
      if (it.tag === 'select') continue
      const nm = it.name || '(无名)'
      if (SKIP.test(nm)) { records.push({ page: node.label, path: pathStr(node.path), button: nm, nth: 0, result: '跳过(危险)', detail: '' }); continue }
      if (ROLE === 'admin' && ADMIN_MUTATE.test(nm)) { records.push({ page: node.label, path: pathStr(node.path), button: nm, nth: 0, result: '跳过(超管只读遍历)', detail: '' }); continue }
      const isDate = /^\d{4}-\d\d-\d\d$/.test(nm)
      const gk = isDate ? '__date__' : nm
      seen[gk] = (seen[gk] || 0) + 1
      if (seen[gk] > (isDate ? 1 : 2)) continue
      if (Object.keys(seen).length > 26) break
      if (it.disabled) { records.push({ page: node.label, path: pathStr(node.path), button: nm, nth: 0, result: '禁用', detail: '' }); continue }
      if (!first) {
        const ok = await reach(page, node.path)
        if (!ok) break
      }
      first = false
      const cur = await list(page)
      const cand = cur.filter(x => x.name === it.name && !x.inTab)
      const nth = nthOf(items, it)
      const tgt = cand[nth] ?? cand[0]
      if (!tgt) { records.push({ page: node.label, path: pathStr(node.path), button: nm, nth, result: '无法定位', detail: '' }); continue }
      const before = (await snapshot(page)).body
      const e0 = errs.length, b0 = bad.length, r0 = reqs
      await page.evaluate(() => { (window as any).__mut = 0; (window as any).__mo?.disconnect(); const mo = new MutationObserver(m => { (window as any).__mut += m.length }); mo.observe(document.body, { subtree: true, childList: true, characterData: true }); (window as any).__mo = mo })
      await clickAt(page, tgt.i)
      await page.waitForTimeout(800)
      const snap = await snapshot(page)
      const mut = await page.evaluate(() => (window as any).__mut as number)
      const after = snap.body
      const itemsAfter = (await list(page)).filter(x => !x.inTab)
      const sigAfter = sigOf(itemsAfter)
      const j = jac(sig, sigAfter)
      const addedText = after.split('\n').filter(l => l.trim() && !before.includes(l)).join(' / ').slice(0, 200)
      const newErr = errs.slice(e0), newBad = bad.slice(b0)
      const devHit = DEV_WORDS.test(addedText) ? '含“开发中/敬请期待”类提示：' + addedText : ''
      let result = ''
      const changed = before !== after
      if (!changed && mut === 0 && reqs === r0) result = '点了没反应'
      else if (devHit) result = '缺陷:只提示开发中'
      else if (snap.mainLen < 4 && itemsAfter.length === 0) result = '缺陷:跳到空白页'
      else if (j < 0.6 || snap.dialogs > 0) result = j < 0.6 ? '进入新页面/浮层' : '浮层'
      else result = changed ? '有反应(原页变化)' : '有反应(请求/微变化)'
      const detail = [devHit, newBad.length ? '接口错误:' + newBad.join(';') : '', newErr.length ? '控制台:' + newErr.slice(0, 2).join(';') : '', addedText && !devHit ? '新增文本:' + addedText : ''].filter(Boolean).join(' | ').slice(0, 400)
      if (newBad.length || newErr.length) result += '(带错误)'
      if (snap.topBars.length > 1 && result.startsWith('进入')) result += '+双顶栏'
      records.push({ page: node.label, path: pathStr(node.path), button: nm, nth, result, detail })

      // 新页面：入队；并检查返回
      if (result.startsWith('进入') && node.depth < MAX_DEPTH) {
        const nextPath: Step[] = [...node.path, { t: 'click', name: it.name, nth }]
        const backItem = itemsAfter.find(x => /返回/.test(x.name)) || itemsAfter.find(x => BACK_NAMES.test(x.name))
        if (backItem) {
          await clickAt(page, backItem.i); await page.waitForTimeout(900)
          const back = (await list(page)).filter(x => !x.inTab)
          const jb = jac(sig, sigOf(back))
          const sb = await snapshot(page)
          records.push({ page: node.label, path: pathStr(nextPath), button: `[返回:${backItem.name}]`, nth: 0, result: jb >= 0.6 ? '返回正确' : '缺陷:返回未回到上一级', detail: jb >= 0.6 ? '' : `返回后按钮: ${sigOf(back).slice(0, 8).join(',')} ; 标题: ${sb.headings.join('/')}` })
        } else {
          records.push({ page: node.label, path: pathStr(nextPath), button: '[返回]', nth: 0, result: '无返回按钮', detail: `页面标题:${snap.headings.join('/')}` })
        }
        queue.push({ path: nextPath, depth: node.depth + 1, label: `${node.label}>${it.name}` })
      }
    }
    fs.writeFileSync(OUT, JSON.stringify({ records, nodeInfo, queueLeft: queue.length }, null, 1))
  }
  fs.writeFileSync(OUT, JSON.stringify({ records, nodeInfo, queueLeft: queue.length, finished: queue.length === 0 }, null, 1))
  console.log(`CRAWL DONE role=${ROLE} nodes=${nodeInfo.length} records=${records.length} queueLeft=${queue.length}`)
})
