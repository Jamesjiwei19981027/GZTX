import { apiRequest } from './client'

/** 与后端 ALLOWED_DELEGATION_ACTIONS 对齐（backend/app/api/v1/delegations.py） */
export const DELEGATION_ACTIONS: { key: string; zh: string; en: string }[] = [
  { key: 'progress.read', zh: '查看项目进度（进入项目视图的前提）', en: 'Read progress (required to view project)' },
  { key: 'progress.write_formal', zh: '录入正式进度', en: 'Write formal progress' },
  { key: 'progress.nudge', zh: '催办进度', en: 'Nudge progress' },
  { key: 'evidence.read', zh: '查看材料', en: 'Read evidence' },
  { key: 'evidence.submit', zh: '提交材料', en: 'Submit evidence' },
  { key: 'tree.edit_subtree', zh: '编辑负责子树', en: 'Edit owned subtree' },
  { key: 'wiki.manual_write', zh: '编辑项目 Wiki', en: 'Edit project wiki' },
  { key: 'review.read', zh: '查看评审', en: 'Read reviews' },
  { key: 'review.confirm', zh: '确认评审', en: 'Confirm reviews' },
  { key: 'project.read', zh: '查看项目信息', en: 'Read project info' },
  { key: 'member.pull', zh: '拉人入项目', en: 'Pull members' },
]

export type Delegation = {
  id: number
  company_id: number
  project_id: number | null
  grantor_user_id: number
  grantee_user_id: number
  actions: string[]
  status: string
  valid_from?: string | null
  valid_to?: string | null
  reason?: string | null
  created_at?: string | null
}

export async function listDelegations(companyId: number, projectId?: number) {
  const qs = projectId ? `?company_id=${companyId}&project_id=${projectId}` : `?company_id=${companyId}`
  return apiRequest<{ items: Delegation[] }>(`/delegations${qs}`)
}

export async function createDelegation(body: {
  company_id: number
  project_id?: number | null
  grantee_user_id: number
  actions: string[]
  valid_to?: string | null
  reason?: string | null
}) {
  return apiRequest<Delegation>('/delegations', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function revokeDelegation(delegationId: number) {
  return apiRequest<{ id: number; status: string }>(`/delegations/${delegationId}/revoke`, {
    method: 'POST',
    body: '{}',
  })
}
