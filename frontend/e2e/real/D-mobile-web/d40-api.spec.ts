import { test, expect } from '@playwright/test'
import { api, apiLogin, readState } from './_h'
test('D40-1 任务趋势接口 /tasks/stats 不应 500（手机工作台“任务趋势”卡片依赖它）', async ({ request }) => {
  const st = readState()
  const m = await apiLogin(request, st.member.username, st.member.password)
  const r = await request.get('/api/v1/tasks/stats?period=week&timezone_offset=480', { headers: m.h })
  console.log('STATS', r.status(), (await r.text()).slice(0, 300))
  expect(r.status()).toBe(200)
})
