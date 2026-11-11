import { test, expect } from '@playwright/test'
import { api, apiLogin, readState, writeState, COMPANY } from './_h'

test('D02 为手机端点测准备数据（任务/人轴节点/一条私聊）', async ({ request }) => {
  const st = readState()
  const a = await apiLogin(request)
  const m = await apiLogin(request, st.member.username, st.member.password)
  const memberId = (await api(request, m.h, 'get', '/users/me')).data.id
  const today = new Date()
  const iso = (d: number) => new Date(today.getTime() + d * 86400000).toISOString()
  const tasks: any[] = []
  for (const [title, status, prio, due] of [['待办', 0, 0, 2], ['进行中', 1, 0, 1], ['已完成', 2, 1, -1], ['逾期', 0, 2, -2]] as [string, number, number, number][]) {
    const r = await api(request, m.h, 'post', '/tasks', { title: `D-任务-${title}`, status, priority: prio, due_date: iso(due) })
    expect(r.status, JSON.stringify(r.body)).toBeLessThan(300)
    tasks.push(r.data.id)
  }
  // 缺陷探针 D-BUG-1：受邀成员（无手机验证）创建挂项目的任务
  const linked = await api(request, m.h, 'post', '/tasks', { title: 'D-项目任务-探针', project_id: st.projectId, company_id: COMPANY, origin: 'project_link' })
  expect(linked.status, JSON.stringify(linked.body)).toBe(201)
  console.log('LINKED_TASK_BY_MEMBER', linked.status, JSON.stringify(linked.body))
  const adminLinked = await api(request, a.h, 'post', '/tasks', { title: 'D-项目任务-超管派给成员', project_id: st.projectId, company_id: COMPANY, origin: 'project_link', assignee_user_ids: [memberId] })
  expect(adminLinked.status, JSON.stringify(adminLinked.body)).toBe(201)
  console.log('LINKED_TASK_BY_ADMIN', adminLinked.status, JSON.stringify(adminLinked.body).slice(0, 200))
  // 人轴：admin(root person) -> member(person) -> work_item
  const existingTree = await api(request, a.h, 'get', `/projects/${st.projectId}/tree`)
  expect(existingTree.status).toBe(200)
  const existingRoot = existingTree.data.nodes.find((n: any) => n.parent_id === null)
  const root = existingRoot ? { status: 200, data: existingRoot, body: null } : await api(request, a.h, 'post', `/projects/${st.projectId}/nodes`, { node_type_key: 'person', title: 'D-超管根', assignees: [{ user_id: 1 }] })
  expect(root.status, JSON.stringify(root.body)).toBe(200)
  console.log('ROOT', root.status, JSON.stringify(root.body).slice(0, 200))
  let memberNode: any = null, wi: any = null
  if (root.status === 200) {
    const oldMember = root.data.children?.find((n: any) => n.title === 'D-成员节点' && n.assignees?.some((a: any) => a.user_id === memberId))
    memberNode = oldMember ? { status: 200, data: oldMember, body: null } : await api(request, a.h, 'post', `/projects/${st.projectId}/nodes`, { node_type_key: 'person', parent_id: root.data.id, title: 'D-成员节点', assignees: [{ user_id: memberId }] })
    expect(memberNode.status, JSON.stringify(memberNode.body)).toBe(200)
    console.log('MEMBERNODE', memberNode.status, JSON.stringify(memberNode.body).slice(0, 200))
    if (memberNode.status === 200) {
      const oldItem = memberNode.data.children?.find((n: any) => n.title === 'D-事项一')
      wi = oldItem ? { status: 200, data: oldItem, body: null } : await api(request, a.h, 'post', `/projects/${st.projectId}/nodes`, { node_type_key: 'work_item', parent_id: memberNode.data.id, title: 'D-事项一', assignees: [{ user_id: memberId }], due_at: iso(5) })
      expect(wi.status, JSON.stringify(wi.body)).toBe(200)
      console.log('WI', wi.status, JSON.stringify(wi.body).slice(0, 200))
    }
  }
  writeState({ taskIds: tasks, rootNode: root.data?.id, memberNode: memberNode?.data?.id, workItem: wi?.data?.id })
})
