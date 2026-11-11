import { test, expect } from '@playwright/test'
import { apiLogin, bootPage, readState, SHOT } from './_h'

test.use({ viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, locale: 'zh-CN' })

/** 页面顶部有几条“顶栏”（贴顶、高 36~80、全宽、有文字，且不是底部导航） */
async function topBars(page: any): Promise<string[]> {
  return page.evaluate(() => {
    // 按实际顶栏元素计数；同一 header 内的居中标题与左右容器不能重复计成三条顶栏。
    const candidates = Array.from(document.querySelectorAll('header, [class*="sticky"][class*="top-0"]')).filter(el => {
      const r = el.getBoundingClientRect(), css = getComputedStyle(el)
      return r.width >= 340 && r.height >= 36 && r.height <= 90 && r.top >= -2 && r.top <= 90 && css.visibility !== 'hidden' && css.display !== 'none' && !el.closest('nav')
    })
    return candidates.filter(el => !candidates.some(other => other !== el && other.contains(el))).map(el => (el.textContent || '').replace(/\s+/g, ' ').trim())
  })
}

async function login(page: any, request: any, admin: boolean) {
  const st = readState()
  const m = admin ? await apiLogin(request) : await apiLogin(request, st.member.username, st.member.password)
  await bootPage(page, m.tokens)
  await page.getByRole('tab', { name: '工作' }).waitFor()
  await page.waitForTimeout(1500)
  return st
}
async function openProjectOverview(page: any, name: string) {
  await page.getByRole('button', { name: '项目列表' }).click()
  await page.waitForTimeout(700)
  await page.getByText(name).first().click()
  await page.waitForTimeout(1000)
  await page.getByRole('button', { name: '查看项目详情' }).first().click()
  await page.waitForTimeout(1200)
}

type Case = { name: string; go: (p: any, st: any) => Promise<void> }
const cases: Case[] = [
  { name: '项目详情', go: async (p, st) => { await openProjectOverview(p, st.projectName) } },
  { name: '项目详情>成员邀请', go: async (p, st) => { await openProjectOverview(p, st.projectName); await p.getByText('邀请新成员加入').click() } },
  { name: '项目详情>项目设置', go: async (p, st) => { await openProjectOverview(p, st.projectName); await p.getByRole('button', { name: '项目设置' }).click() } },
  { name: '工作>完整日历', go: async (p) => { await p.getByRole('button', { name: '完整日历' }).click() } },
  { name: '工作>统计详情', go: async (p) => { await p.getByRole('button', { name: '展开统计详情' }).click() } },
  { name: '工作>任务管理>回收站', go: async (p) => { await p.getByRole('button', { name: /^待办事项/ }).click(); await p.waitForTimeout(500); await p.getByLabel('任务更多操作', { exact: true }).click(); await p.getByRole('button', { name: '回收站', exact: true }).click() } },
  { name: '工作>搜索', go: async (p) => { await p.getByRole('button', { name: '搜索' }).click() } },
  { name: '工作>项目列表>新建项目', go: async (p) => { await p.getByRole('button', { name: '项目列表' }).click(); await p.getByText('新建项目').first().click() } },
  { name: '工作>记录进展', go: async (p) => { await p.getByRole('button', { name: '记录进展' }).click() } },
  { name: '消息>通知与收件箱', go: async (p) => { await p.getByRole('tab', { name: '消息' }).click(); await p.getByRole('button', { name: '通知与收件箱', exact: true }).click() } },
  { name: '消息>新建私聊', go: async (p) => { await p.getByRole('tab', { name: '消息' }).click(); await p.getByRole('button', { name: '新建私聊', exact: true }).click() } },
  { name: '我的>账号安全', go: async (p) => { await p.getByRole('tab', { name: '我的' }).click(); await p.getByText('账号安全', { exact: true }).first().click() } },
  { name: '我的>外观', go: async (p) => { await p.getByRole('tab', { name: '我的' }).click(); await p.getByText('外观', { exact: true }).first().click() } },
  { name: '人轴>委托授权', go: async (p) => { await p.getByRole('tab', { name: '人轴' }).click(); await p.getByText('委托授权').first().click() } },
  { name: '知识', go: async (p) => { await p.getByRole('tab', { name: '知识' }).click() } },
]

for (const role of ['member', 'admin'] as const) {
  test(`D60 手机端二级页：不出现双顶栏、返回回到上一级（${role}）`, async ({ page, request }) => {
    test.setTimeout(240_000)
    page.setDefaultTimeout(6000)
    const st = await login(page, request, role === 'admin')
    const doubles: string[] = []
    const badBack: string[] = []
    const entryFailures: string[] = []
    for (const c of cases) {
      await page.goto('/')
      await page.getByRole('tab', { name: '工作' }).waitFor()
      await page.waitForTimeout(1000)
      if (role === 'member' && ['项目详情>成员邀请', '项目详情>项目设置'].includes(c.name)) continue
      try { await c.go(page, st) } catch (e) { entryFailures.push(`${c.name}: 无法进入(${String(e).slice(0, 120)})`); continue }
      await page.waitForTimeout(900)
      const bars = await topBars(page)
      const file = `${role}-${c.name.replace(/[>\/]/g, '_')}`
      await page.screenshot({ path: SHOT + `d60-${file}.png` })
      const line = `${role} | ${c.name} | 顶栏=${JSON.stringify(bars)}`
      console.log('TOPBAR', line)
      if (bars.length > 1) doubles.push(`${c.name}: ${bars.join(' // ')}`)
      if (c.name === '工作>统计详情') {
        await expect(page.getByRole('button', { name: '收起统计详情' })).toHaveAttribute('aria-expanded', 'true')
        await page.getByRole('button', { name: '收起统计详情' }).click()
        await expect(page.getByRole('button', { name: '展开统计详情' })).toHaveAttribute('aria-expanded', 'false')
        continue
      }
      if (c.name === '知识') { await expect(page.getByRole('tab', { name: '知识' })).toHaveAttribute('aria-selected', 'true'); continue }
      // 返回
      const back = page.getByRole('button', { name: /^(返回(?:消息)?|关闭|取消)$/ }).first()
      if (await back.count()) {
                try {
          await back.click(); await page.waitForTimeout(800)
          if (c.name === '项目详情>成员邀请' || c.name === '项目详情>项目设置') await expect(page.getByRole('heading', { name: st.projectName, exact: true, level: 1 })).toBeVisible()
          else if (c.name === '工作>项目列表>新建项目') await expect(page.getByRole('heading', { name: '切换工作区与项目' })).toBeVisible()
          else if (c.name === '工作>任务管理>回收站') await expect(page.getByRole('tablist', { name: '任务视图' })).toBeVisible()
          else if (c.name.startsWith('消息>')) await expect(page.getByRole('heading', { name: '消息中心', exact: true })).toBeVisible()
          else if (c.name.startsWith('我的>')) await expect(page.getByText('个人资料', { exact: true })).toBeVisible()
          else if (c.name.startsWith('人轴>')) await expect(page.getByRole('button', { name: '委托授权', exact: true })).toBeVisible()
          else await expect(page.getByRole('button', { name: '项目列表', exact: true })).toBeVisible()
          console.log('BACK', role, c.name, '→', (await page.locator('h1,h2').first().innerText().catch(() => '?')).slice(0, 20))
        } catch (e) { badBack.push(`${c.name}: ${String(e).slice(0, 120)}`) }
      } else { badBack.push(c.name + '(无返回按钮)') }
    }
    console.log('DOUBLE_TOPBAR_PAGES', role, JSON.stringify(doubles))
    console.log('NO_BACK_PAGES', role, JSON.stringify(badBack))
    expect(entryFailures, '各入口应可实际进入').toEqual([])
    expect(badBack, '二级页应可返回').toEqual([])
    expect(doubles.filter(name => !name.startsWith('消息>通知与收件箱:')), '其他页面不应出现双顶栏').toEqual([])
    test.fail(true, '缺陷 Rx-01：手机通知与收件箱同时显示外层返回顶栏和页面内顶栏')
    expect(doubles, '不应出现双顶栏').toEqual([])
  })
}
