import { test, expect } from '@playwright/test'
import { apiLogin, bootPage, api, sharedMember, stamp, allProjects } from '../B-project-axis/_h'

/** E 区：人员卡片自定义真后端点测（不打桩）。项目模板 / 单人卡片 / 个人显示偏好：点了有反应、落点正确、读取处生效。 */
test.use({ actionTimeout: 15_000, viewport: { width: 1440, height: 1000 } })
test.setTimeout(180_000)

const flat = (nodes: any[]): any[] => nodes.flatMap(n => [n, ...flat(n.children || [])])

async function openAxis(page: any, pname: string) {
  await page.locator('aside').getByRole('button', { name: '人轴', exact: true }).click()
  await page.locator('.axis-project-picker select').first().selectOption({ label: pname })
}

test('E1 人员卡片：权限、模板、单卡样式、显示偏好全链路', async ({ page, request, browser }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push('pageerror ' + e.message))
  const { tokens, h } = await apiLogin(request)
  // 审计环境项目配额有限：复用名为 E-卡片 开头的项目，没有才新建；每次运行新建一棵人员树
  const rows = await allProjects(request, h)
  let found = rows.find(p => String(p.name).startsWith('E-卡片') && p.status !== 'archived')
  if (!found) {
    const pr = await api(request, h, 'post', '/projects', { company_id: 1, name: `E-卡片${stamp()}` })
    expect(pr.status, JSON.stringify(pr.body)).toBe(200)
    found = pr.data
  }
  const pid = found.id as number, pname = found.name as string
  const run = stamp()
  const m = await sharedMember(request, h, pid)
  const oldTemplate = (await api(request, h, 'get', `/projects/${pid}`)).data.card_template_json || {}
  const oldMemberView = (await api(request, m.h, 'get', '/users/me/ui-prefs')).data.ui?.person_cards?.[String(pid)] || {}
  const oldAdminView = (await api(request, h, 'get', '/users/me/ui-prefs')).data.ui?.person_cards?.[String(pid)] || {}
  try {
    // 测试必须从显示标签的可控状态开始，避免前次测试关闭标签污染本次读取验证。
    expect((await api(request, h, 'put', `/projects/${pid}/card-template`, {})).status).toBe(200)
    for (const session of [h, m.h]) expect((await api(request, session, 'put', '/users/me/ui-prefs', { person_cards: { [pid]: {} } })).status).toBe(200)
    // 每个项目只能有一个终责根节点：已有就复用，没有才创建
    const existing = ((await api(request, h, 'get', `/projects/${pid}/tree`)).data.nodes as any[]).find(n => n.parent_id === null)
    const root = existing ? { status: 200, data: existing } : await api(request, h, 'post', `/projects/${pid}/nodes`, { node_type_key: 'person', title: `E-总负责${run}`, assignees: [{ user_id: 1 }] })
    expect(root.status, JSON.stringify((root as any).body)).toBe(200)
    const sub = await api(request, h, 'post', `/projects/${pid}/nodes`, { node_type_key: 'person', title: `E-成员${run}`, parent_id: root.data.id, assignees: [{ user_id: m.id }] })
    expect(sub.status, JSON.stringify(sub.body)).toBe(200)
    const rootId = root.data.id as number, subId = sub.data.id as number

    // 1 权限：成员能改自己的卡，不能改上级卡和项目模板；树接口给出正确的可编辑标记
    const mtree = (await api(request, m.h, 'get', `/projects/${pid}/tree`)).data
    expect(mtree.can_edit_card_template).toBe(false)
    const mf = flat(mtree.nodes)
    expect(mf.find(n => n.id === subId).can_edit_card_style).toBe(true)
    expect(mf.find(n => n.id === rootId).can_edit_card_style).toBe(false)
    expect((await api(request, m.h, 'put', `/projects/${pid}/nodes/${rootId}/card-style`, { color: 'sage' })).status).toBe(403)
    expect((await api(request, m.h, 'put', `/projects/${pid}/card-template`, { density: 'compact' })).status).toBe(403)
    const own = await api(request, m.h, 'put', `/projects/${pid}/nodes/${subId}/card-style`, { custom_fields: [{ key: 'E-工位', value: 'A-12' }] })
    expect(own.status, JSON.stringify(own.body)).toBe(200)
    // 校验：非色板颜色、超量标签、非人员节点
    expect((await api(request, h, 'put', `/projects/${pid}/card-template`, { color: '#ff0000' })).status).toBe(422)
    expect((await api(request, h, 'put', `/projects/${pid}/nodes/${subId}/card-style`, { tags: Array.from({ length: 9 }, (_, i) => ({ text: 't' + i, color: 'ink' })) })).status).toBe(422)
    const item = await api(request, h, 'post', `/projects/${pid}/nodes`, { node_type_key: 'work_item', title: 'E-事项', parent_id: subId, assignees: [{ user_id: m.id }] })
    expect(item.status, JSON.stringify(item.body)).toBe(200)
    expect((await api(request, h, 'put', `/projects/${pid}/nodes/${item.data.id}/card-style`, { color: 'sage' })).status).toBe(422)

    // 2 网页：PM 打开人轴 → 责任链 → 编辑成员卡片，加标签保存
    await bootPage(page, tokens, '/')
    await openAxis(page, pname)
    await page.getByRole('tab', { name: '责任链' }).click()
    await page.getByTestId(`axis-chain-node-${subId}`).click()
    // 责任链每行人员卡片后紧跟自己的“编辑卡片”按钮
    await page.getByTestId(`axis-chain-node-${subId}`).locator('xpath=following-sibling::button[1]').click()
    let dlg = page.getByRole('dialog', { name: '编辑卡片' })
    await expect(dlg).toBeVisible()
    await expect(dlg.getByLabel('字段1名称')).toHaveValue('E-工位') // 读到成员自己保存的字段
    await dlg.getByRole('button', { name: '添加标签' }).click()
    await dlg.getByLabel('标签1', { exact: true }).fill(`E-重点${run}`)
    await dlg.getByLabel('标签1颜色').selectOption('clay')
    await dlg.getByLabel('卡片颜色').selectOption('sage')
    let saved = page.waitForResponse(r => r.url().includes(`/nodes/${subId}/card-style`) && r.request().method() === 'PUT')
    await dlg.getByRole('button', { name: '保存', exact: true }).click()
    expect((await saved).status()).toBe(200)
    await expect(dlg).toHaveCount(0)
    let tree = flat((await api(request, h, 'get', `/projects/${pid}/tree`)).data.nodes)
    const style = tree.find(n => n.id === subId).card_style_json
    expect(style.tags).toEqual([{ text: `E-重点${run}`, color: 'clay' }])
    expect(style.color).toBe('sage')
    expect(style.custom_fields).toEqual([{ key: 'E-工位', value: 'A-12' }])

    // 生效：成员登录看人轴，也能看到 PM 加的标签
    const mctx = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: 'zh-CN', baseURL: test.info().project.use.baseURL })
    const mpage = await mctx.newPage()
    mpage.on('pageerror', e => errors.push('member pageerror ' + e.message))
    await bootPage(mpage, m.tokens, '/')
    await openAxis(mpage, pname)
    await expect(mpage.getByText(`E-重点${run}`).first()).toBeVisible()

    // 3 个人显示偏好：成员关闭“显示别人设置的标签”→ 只影响成员本人
    await mpage.getByRole('button', { name: '显示设置' }).first().click()
    dlg = mpage.getByRole('dialog', { name: '显示设置' })
    await dlg.getByLabel('显示别人设置的标签').uncheck()
    saved = mpage.waitForResponse(r => r.url().includes('/users/me/ui-prefs') && r.request().method() === 'PUT')
    await dlg.getByRole('button', { name: '保存', exact: true }).click()
    expect((await saved).status()).toBe(200)
    const prefs = await api(request, m.h, 'get', '/users/me/ui-prefs')
    expect(prefs.data.ui.person_cards[String(pid)].show_tags).toBe(false)
    await mpage.reload()
    await openAxis(mpage, pname)
    await expect(mpage.getByText(`E-成员${run}`).first()).toBeVisible()
    await expect(mpage.getByText(`E-重点${run}`)).toHaveCount(0)
    await page.reload()
    await openAxis(page, pname)
    await expect(page.getByText(`E-重点${run}`).first()).toBeVisible() // PM 不受成员偏好影响

    // 4 项目模板：项目设置 → 卡片模板 → 密度紧凑、默认颜色
    await page.getByRole('tab', { name: '责任链' }).click()
    await page.getByTestId('axis-project-settings').click()
    await page.getByRole('button', { name: /卡片模板/ }).click()
    dlg = page.getByRole('dialog', { name: '卡片模板' })
    await dlg.getByLabel('卡片密度').selectOption('compact')
    await dlg.getByLabel('卡片颜色').selectOption('plum')
    saved = page.waitForResponse(r => r.url().includes(`/projects/${pid}/card-template`) && r.request().method() === 'PUT')
    await dlg.getByRole('button', { name: '保存', exact: true }).click()
    expect((await saved).status()).toBe(200)
    const proj = await api(request, h, 'get', `/projects/${pid}`)
    expect(proj.data.card_template_json).toEqual({ density: 'compact', color: 'plum' })
    expect((await api(request, m.h, 'get', `/projects/${pid}/tree`)).data.card_template_json.density).toBe('compact')

    // 5 恢复默认：单卡清空
    const reset = await api(request, h, 'put', `/projects/${pid}/nodes/${subId}/card-style`, {})
    expect(reset.status).toBe(200)
    tree = flat((await api(request, h, 'get', `/projects/${pid}/tree`)).data.nodes)
    expect(tree.find(n => n.id === subId).card_style_json).toEqual({})
    await mctx.close()
    expect(errors, errors.join('\n')).toEqual([])
  } finally {
    expect((await api(request, h, 'put', `/projects/${pid}/card-template`, oldTemplate)).status).toBe(200)
    expect((await api(request, m.h, 'put', '/users/me/ui-prefs', { person_cards: { [pid]: oldMemberView } })).status).toBe(200)
    expect((await api(request, h, 'put', '/users/me/ui-prefs', { person_cards: { [pid]: oldAdminView } })).status).toBe(200)
    expect((await api(request, h, 'get', `/projects/${pid}`)).data.card_template_json).toEqual(oldTemplate)
    expect((await api(request, m.h, 'get', '/users/me/ui-prefs')).data.ui.person_cards[String(pid)]).toEqual(oldMemberView)
    expect((await api(request, h, 'get', '/users/me/ui-prefs')).data.ui.person_cards[String(pid)]).toEqual(oldAdminView)
  }
})
