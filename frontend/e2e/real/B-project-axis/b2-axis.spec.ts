import { test, expect } from '@playwright/test'
import { apiLogin, bootPage, api, sharedMember, stamp } from './_h'

test.use({ actionTimeout: 15_000, viewport: { width: 1440, height: 1000 } })
test.setTimeout(170_000)

const flat = (nodes: any[]): any[] => nodes.flatMap(n => [n, ...flat(n.children || [])])
async function treeOf(request: any, h: any, pid: number) { return flat((await api(request, h, 'get', `/projects/${pid}/tree`)).data.nodes) }

test('B2 人轴：加人/下级/事项/编辑/视图切换/调整上级/删除，后端同步', async ({ page, request }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push('pageerror ' + e.message))
  const { tokens, h } = await apiLogin(request)
  // 经界面创建项目，再用侧栏进入人轴，验证实际创建与后续结构操作。
  const pname = `B-轴${stamp()}`
  await bootPage(page, tokens, '/?view=team')
  await page.getByRole('button', { name: '创建项目' }).click()
  await page.getByPlaceholder(/Q3 交付/).fill(pname)
  const cr = page.waitForResponse(r => r.url().endsWith('/api/v1/projects') && r.request().method() === 'POST')
  await page.getByRole('button', { name: '创建', exact: true }).click()
  const pid = (await (await cr).json()).data.id as number
  const pr = { data: { name: pname } }
  const m = await sharedMember(request, h, pid)
  await page.locator('aside').getByRole('button', { name: '人轴', exact: true }).click()
  await page.locator('.axis-project-picker select').first().selectOption({ label: pname })

  // 1 空项目：添加终责人
  await page.getByRole('button', { name: '先添加终责人' }).click()
  let dlg = page.getByRole('dialog')
  await dlg.getByPlaceholder('岗位责任称号', { exact: true }).fill('B-总负责')
  await dlg.getByRole('button', { name: /确认挂载节点/ }).click()
  await expect(page.getByText(/写回责任体系/)).toBeVisible()
  let nodes = await treeOf(request, h, pid)
  const root = nodes.find(n => n.parent_id === null)
  expect(root.node_type_key).toBe('person'); expect(root.assignees[0].user_id).toBe(1)

  // 2 责任链：新增下级、人挂人（第3层）
  await page.getByRole('tab', { name: '责任链' }).click()
  await page.getByTestId(`axis-chain-node-${root.id}`).click()
  await page.getByRole('button', { name: '新增下级' }).first().click()
  dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: '手动填写' }).click()
  await dlg.getByPlaceholder(/史蒂夫/).fill('B-下属甲')
  await dlg.getByPlaceholder('岗位责任称号', { exact: true }).fill('B-甲岗位')
  await dlg.getByRole('button', { name: /确认挂载节点/ }).click()
  await expect(page.getByTestId(/axis-chain-node-/).filter({ hasText: 'B-下属甲' })).toBeVisible()
  nodes = await treeOf(request, h, pid)
  const jia = nodes.find(n => n.title === 'B-下属甲')
  expect(jia.parent_id).toBe(root.id); expect(jia.node_origin).toBe('subordinate')

  await page.getByTestId(`axis-chain-node-${jia.id}`).click()
  await page.getByRole('button', { name: '新增下级' }).last().click()
  dlg = page.getByRole('dialog')
  await dlg.getByRole('button', { name: '手动填写' }).click()
  await dlg.getByPlaceholder(/史蒂夫/).fill('B-下属乙')
  await dlg.getByRole('button', { name: /确认挂载节点/ }).click()
  await expect(page.getByTestId(/axis-chain-node-/).filter({ hasText: 'B-下属乙' })).toBeVisible()
  nodes = await treeOf(request, h, pid)
  const yi = nodes.find(n => n.title === 'B-下属乙')
  expect(yi.parent_id).toBe(jia.id)

  // 3 给人挂 里程碑 / 范围 / 任务
  for (const [type, title, key] of [['milestone', 'B-里程碑一', 'milestone'], ['scope', 'B-范围一', 'scope'], ['task', 'B-事项一', 'work_item']] as const) {
    await page.getByTestId(`axis-chain-node-${jia.id}`).click()
    await page.getByRole('button', { name: '添加事项' }).click()
    dlg = page.getByRole('dialog')
    await dlg.locator('input[type=text]').first().fill(title)
    await dlg.locator('select').selectOption(type)
    if (type === 'milestone') await dlg.locator('input[type=date]').fill('2026-12-01')
    await dlg.getByRole('button', { name: '确认挂载' }).click()
    await expect(dlg).toHaveCount(0)
    nodes = await treeOf(request, h, pid)
    const it = nodes.find(n => n.title === title)
    expect(it, title + ' 应落库').toBeTruthy()
    expect(it.node_type_key, title).toBe(key); expect(it.parent_id).toBe(jia.id)
  }
  nodes = await treeOf(request, h, pid)
  const ms = nodes.find(n => n.title === 'B-里程碑一')
  expect(ms.due_at ?? ms.milestone_at, '里程碑日期应落库').toBeTruthy()

  // 4 编辑人员：岗位/部门/关联成员
  await page.getByTestId(`axis-chain-node-${jia.id}`).click()
  await page.getByRole('button', { name: '编辑人员' }).last().click()
  dlg = page.getByRole('dialog', { name: '编辑人员' })
  await dlg.getByLabel('项目岗位').fill('B-新岗位')
  await dlg.getByLabel('所属部门').fill('B-新部门')
  await dlg.getByLabel('关联成员').selectOption(String(m.id))
  const patched = page.waitForResponse(r => r.request().method() === 'PATCH' && r.url().endsWith(`/nodes/${jia.id}`))
  await dlg.getByRole('button', { name: '保存修改' }).click()
  expect((await patched).status()).toBe(200)
  nodes = await treeOf(request, h, pid)
  const jia2 = nodes.find(n => n.id === jia.id)
  expect(jia2.description).toContain('B-新岗位'); expect(jia2.description).toContain('B-新部门')
  expect(jia2.assignees.some((a: any) => a.user_id === m.id && a.role_key === 'primary'), '负责人改为成员').toBeTruthy()

  // 5 总览画布：纵横/曲直切换、折叠展开、画布设置
  await page.getByRole('tab', { name: '总览' }).click()
  await expect(page.locator('.react-flow__node').first()).toBeVisible()
  const n0 = await page.locator('.react-flow__node').count()
  for (const lab of ['纵向', '横向', '直线', '曲线']) await page.getByRole('button', { name: lab, exact: true }).click()
  const collapse = page.getByRole('button', { name: /折叠.*的下级|收起下级/ }).first()
  if (await collapse.count()) { await collapse.click(); await page.waitForTimeout(400); test.info().annotations.push({ type: '折叠后节点数', description: `${n0}->${await page.locator('.react-flow__node').count()}` }) }
  const expand = page.getByRole('button', { name: /展开.*的下级|展开下级/ }).first()
  if (await expand.count()) await expand.click()
  await page.getByRole('button', { name: '画布设置' }).first().click()
  test.info().annotations.push({ type: '画布设置内容', description: (await page.locator('main').innerText()).replace(/\s+/g, ' ').slice(0, 300) })
  await page.keyboard.press('Escape')

  // 6 调整上级：乙 改挂到 根
  await page.getByRole('tab', { name: '责任链' }).click()
  await page.getByTestId(`axis-chain-node-${yi.id}`).click()
  await page.getByTestId(`axis-chain-node-${yi.id}`).locator('xpath=ancestor::article[1]').getByRole('button', { name: '调整上级', exact: true }).click()
  await page.getByRole('tab', { name: '总览' }).click()
  await page.locator(`.react-flow__node[data-id="${root.id}"]`).click()
  await expect(page.getByTestId('reparent-confirm-dialog')).toBeVisible()
  const moved = page.waitForResponse(r => r.url().endsWith(`/nodes/${yi.id}/move`) && r.request().method() === 'POST')
  await page.getByTestId('reparent-confirm-yes').click()
  expect((await moved).status()).toBe(200)
  await expect.poll(async () => (await treeOf(request, h, pid)).find(n => n.id === yi.id)?.parent_id).toBe(root.id)

  // 7 删除（移除影响与交接）
  await page.getByRole('tab', { name: '责任链' }).click()
  await page.getByTestId(`axis-chain-node-${yi.id}`).click()
  await page.getByRole('button', { name: '查看移除影响与交接' }).click()
  await page.getByLabel('交接负责人').selectOption({ index: 1 })
  await page.getByRole('group', { name: '移除人员确认' }).getByRole('button').first().click()
  await page.waitForTimeout(1500)
  nodes = await treeOf(request, h, pid)
  expect(nodes.find(n => n.id === yi.id), '乙应被删除').toBeUndefined()
  expect(errors, errors.join('\n')).toEqual([])
})
