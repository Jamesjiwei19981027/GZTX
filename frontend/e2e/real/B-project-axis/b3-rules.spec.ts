import { test, expect } from '@playwright/test'
import { apiLogin, bootPage, api, sharedMember, stamp } from './_h'

test.use({ actionTimeout: 15_000, viewport: { width: 1440, height: 1000 } })
test.setTimeout(120_000)

test('B3 后端规则：根必须是人、事项只能挂人、终责位置仅PM、成员权限边界', async ({ request }) => {
  const { h } = await apiLogin(request)
  const pr = await api(request, h, 'post', '/projects', { name: `B-规则${stamp()}`, company_id: 1 })
  expect(pr.status, JSON.stringify(pr.body)).toBe(200)
  const pid = pr.data.id
  const m = await sharedMember(request, h, pid)
  const post = (hh: any, body: any) => api(request, hh, 'post', `/projects/${pid}/nodes`, body)

  // 根节点不能是事项/里程碑/范围
  for (const t of ['work_item', 'milestone', 'scope']) {
    const r = await post(h, { parent_id: null, node_type_key: t, title: `B-违规根-${t}` })
    expect(r.status, `根下建 ${t} 应被拒: ${JSON.stringify(r.body)}`).toBeGreaterThanOrEqual(400)
    expect(r.status).toBeLessThan(500)
  }
  const root = await post(h, { parent_id: null, node_type_key: 'person', title: 'B-根人', assignees: [{ user_id: 1, role_key: 'primary' }] })
  expect(root.status).toBe(200)
  const item = await post(h, { parent_id: root.data.id, node_type_key: 'work_item', title: 'B-事项甲' })
  expect(item.status).toBe(200)
  // 事项下不能再挂事项/人
  for (const t of ['work_item', 'person']) {
    const r = await post(h, { parent_id: item.data.id, node_type_key: t, title: `B-违规挂事项-${t}` })
    expect(r.status, `事项下建 ${t} 应被拒`).toBeGreaterThanOrEqual(400)
    expect(r.status).toBeLessThan(500)
  }
  // 把事项移到根（null）应被拒
  const mv = await api(request, h, 'post', `/nodes/${item.data.id}/move`, { new_parent_id: null })
  expect(mv.status, '事项移成根应被拒').toBeGreaterThanOrEqual(400)
  expect(mv.status).toBeLessThan(500)
  // 第二个根人？（人挂人 / 多根）——记录行为
  const root2 = await post(h, { parent_id: null, node_type_key: 'person', title: 'B-第二根' })
  test.info().annotations.push({ type: '第二个根人节点', description: String(root2.status) })
  // 人挂人 4 级上限
  let parent = root.data.id; let lastStatus = 200; let depth = 1
  for (let i = 0; i < 5 && lastStatus === 200; i++) {
    const r = await post(h, { parent_id: parent, node_type_key: 'person', title: `B-层${i + 2}` })
    lastStatus = r.status; if (r.status === 200) { parent = r.data.id; depth++ }
  }
  test.info().annotations.push({ type: '人挂人最大层数(含根)', description: String(depth) })
  expect(depth).toBeLessThanOrEqual(4)

  // 终责位置：非 PM 成员 403，PM 200
  const memberPut = await api(request, m.h, 'put', `/projects/${pid}/final-owner-position`, { along_delta: 120 })
  expect(memberPut.status, '非PM改终责位置应403').toBe(403)
  const pmPut = await api(request, h, 'put', `/projects/${pid}/final-owner-position`, { along_delta: 120 })
  expect(pmPut.status).toBe(200)
  expect((await api(request, h, 'get', `/projects/${pid}`)).data.final_owner_along_delta).toBe(120)

  // 成员越权：不能在别人的分支下建人/事项，不能删根，不能指定PM、拉人、归档
  const mNew = await post(m.h, { parent_id: root.data.id, node_type_key: 'person', title: 'B-成员越权加人' })
  expect(mNew.status, '成员往PM根下加人应被拒').toBe(403)
  const mItem = await post(m.h, { parent_id: root.data.id, node_type_key: 'work_item', title: 'B-成员越权事项' })
  expect(mItem.status, '成员往PM根下加事项应被拒').toBe(403)
  const mDel = await api(request, m.h, 'delete', `/nodes/${root.data.id}`, {})
  expect(mDel.status).toBeGreaterThanOrEqual(400)
  expect((await api(request, m.h, 'post', `/projects/${pid}/pm`, { user_id: m.id })).status).toBe(403)
  expect((await api(request, m.h, 'post', `/projects/${pid}/archive`)).status).toBe(403)
})

test('B3b 网页端项目列表：超过20个项目仍全部可见', async ({ page, request }) => {
  const { tokens, h } = await apiLogin(request)
  const all = await api(request, h, 'get', '/projects?company_id=1&as_admin=true&page_size=100')
  const total = all.data.total as number
  const last = all.data.items[all.data.items.length - 1]
  await bootPage(page, tokens, '/?view=people-axis')
  await page.waitForTimeout(3000)
  const opts = await page.locator('.axis-project-picker select').first().locator('option').allInnerTexts()
  test.info().annotations.push({ type: '接口项目总数 / 界面下拉项数(含"全部项目")', description: `${total} / ${opts.length}` })
  console.log('PROJECT-PAGING total=', total, 'ui options=', opts.length)
  if (total > 20) expect(opts.length - 1, '界面项目数应等于接口总数').toBe(total)
  void last
})
