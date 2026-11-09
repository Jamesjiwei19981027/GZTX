/**
 * 第二轮补做的管理类接口：团队成员管理、项目管理、事项编辑/删除/撤销、
 * 项目汇总发布、汇报策略、记录进展存草稿。
 * 约定同 client.ts：HTTP 200 + code 200 为成功，失败抛 ApiError（message 为中文）。
 */
import { apiRequest } from './client'

/* ───────── 团队成员（公司级） ───────── */

export type CompanyMember = {
  user_id: number
  username?: string
  nickname?: string | null
  email?: string | null
  avatar_url?: string | null
  /** active 启用 / disabled 停用 / removed 已移出 */
  status: 'active' | 'disabled' | 'removed' | string
  employment_status?: string
  is_super_admin: boolean
  is_org_leader: boolean
  title?: string | null
}

/** 逐页取完公司成员（后端单页最多 100）。 */
export async function listCompanyMembers(companyId: number): Promise<CompanyMember[]> {
  const items: CompanyMember[] = []
  for (let page = 1; page <= 20; page += 1) {
    const res = await apiRequest<{ items: CompanyMember[]; total: number }>(
      `/companies/${companyId}/members?page=${page}&page_size=100`,
    )
    items.push(...(res.items || []))
    if (!res.items || res.items.length < 100 || items.length >= (res.total ?? 0)) break
  }
  return items
}

export type CompanyMemberPatch = {
  is_org_leader?: boolean
  is_super_admin?: boolean
  status?: 'active' | 'disabled'
  title?: string
}

export function patchCompanyMember(companyId: number, userId: number, body: CompanyMemberPatch) {
  return apiRequest<CompanyMember>(`/companies/${companyId}/members/${userId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function removeCompanyMember(companyId: number, userId: number) {
  return apiRequest<CompanyMember>(`/companies/${companyId}/members/${userId}`, { method: 'DELETE' })
}

/** 把成员拉入项目；停用后重新启用的人用它恢复项目成员关系。 */
export function pullMemberIntoProject(projectId: number, userId: number) {
  return apiRequest<{ project_id: number; user_id: number; role: string }>(
    `/projects/${projectId}/members`,
    { method: 'POST', body: JSON.stringify({ user_id: userId }) },
  )
}

/* ───────── 项目管理 ───────── */

export type ProjectState = {
  id: number
  name: string
  status?: string
  pm_user_id?: number | null
  archived_at?: string | null
}

export function updateProjectInfo(projectId: number, body: { name?: string; pm_user_id?: number }) {
  return apiRequest<ProjectState>(`/projects/${projectId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export function archiveProjectRequest(projectId: number) {
  return apiRequest<{ status: string; archived_at?: string | null }>(`/projects/${projectId}/archive`, {
    method: 'POST',
    body: '{}',
  })
}

export function unarchiveProjectRequest(projectId: number) {
  return apiRequest<{ status: string; archived_at?: string | null }>(`/projects/${projectId}/unarchive`, {
    method: 'POST',
    body: '{}',
  })
}

/** 通知 App 重新取项目列表（改名 / 换负责人 / 归档后调用）。 */
export const PROJECTS_CHANGED_EVENT = 'worktodo:projects-changed'
export function notifyProjectsChanged() {
  window.dispatchEvent(new Event(PROJECTS_CHANGED_EVENT))
}

/* ───────── 事项删除 / 撤销 ───────── */

export function deleteMatterNode(nodeId: number) {
  return apiRequest<{ id: number; is_deleted: boolean; can_restore?: boolean }>(`/nodes/${nodeId}`, {
    method: 'DELETE',
  })
}

export function restoreMatterNode(nodeId: number) {
  return apiRequest<{ id: number; title: string }>(`/nodes/${nodeId}/restore`, {
    method: 'POST',
    body: '{}',
  })
}

export function updateMatterNode(
  nodeId: number,
  body: { title?: string; due_at?: string | null; assignees?: { user_id: number; role_key: string }[] },
) {
  return apiRequest<{ id: number; title: string; due_at?: string | null }>(`/nodes/${nodeId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

/* ───────── 项目汇总发布 ───────── */

export type ReportSummary = {
  id: number
  project_id: number
  /** submitted 待发布 / published 已发布 */
  status: string
  summary_text: string
  report_count: number
  source_count: number
  conflicts?: unknown[]
  created_at?: string | null
  published_at?: string | null
  published_by?: number | null
  published_by_name?: string | null
}

export function listReportSummaries(projectId: number) {
  return apiRequest<{ items: ReportSummary[]; latest_published: ReportSummary | null; can_publish: boolean }>(
    `/projects/${projectId}/report-summaries`,
  )
}

export function publishReportSummary(projectId: number, summaryId: number) {
  return apiRequest<ReportSummary>(`/projects/${projectId}/report-summaries/${summaryId}/publish`, {
    method: 'POST',
    body: '{}',
  })
}

/* ───────── 汇报策略 ───────── */

export type ReportPeriod = 'daily' | 'weekly' | 'monthly'
export type ReportPolicySettings = {
  id: number
  enabled: boolean
  period: ReportPeriod
  deadline_time: string
  weekday: number
  month_day: number
  remind: boolean
}

export function saveReportPolicy(
  projectId: number,
  body: Partial<Omit<ReportPolicySettings, 'id'>>,
) {
  return apiRequest<ReportPolicySettings>(`/projects/${projectId}/report-policy`, {
    method: 'PUT',
    body: JSON.stringify(body),
  })
}

export const REPORT_PERIOD_LABELS: Record<ReportPeriod, string> = {
  daily: '每日',
  weekly: '每周',
  monthly: '每月',
}
export const WEEKDAY_LABELS = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']

/* ───────── 记录进展 → 汇报草稿 ───────── */

export function saveProgressNoteAsDraft(projectId: number, text: string, fileIds?: number[]) {
  return apiRequest<{ id: number; project_id: number; status: string; summary_text: string }>(
    `/projects/${projectId}/agent-reports/note-draft`,
    { method: 'POST', body: JSON.stringify({ text, file_ids: fileIds || [] }) },
  )
}

/* ───────── 报表导出（CSV） ───────── */

/** 把二维数据转成带 BOM 的 CSV 并触发下载（Excel 可直接打开，不乱码）。 */
export function downloadCsv(filename: string, rows: (string | number | null | undefined)[][]) {
  const esc = (v: string | number | null | undefined) => {
    const s = v == null ? '' : String(v)
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const body = rows.map((r) => r.map(esc).join(',')).join('\r\n')
  const blob = new Blob([String.fromCharCode(0xfeff) + body], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

