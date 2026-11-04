import { apiRequest } from './client'

/** Project reporting APIs. Visibility and PM permissions are enforced by the backend. */
export type ReportPolicy = {
  id: number
  name: string
  trigger: string
  template_key: string
  enabled: boolean
}

export type ProjectReportRun = {
  run_id: number
  status: 'pending' | 'completed' | 'failed' | string
  summary_text?: string | null
}

export type LeadershipReport = {
  id: number
  company_id: number
  leader_user_id: number
  status: string
  summary_text: string
  payload_json?: Record<string, unknown>
  created_at?: string | null
}

export type ReportAgentBinding = {
  id: number
  company_id: number
  project_id: number
  user_id?: number | null
  agent_definition_id: number
  role: 'member' | 'project' | string
  is_active: boolean
  context_scope?: { company_id?: number; project_id?: number }
}

export type AgentReport = {
  id: number
  binding_id: number
  author_user_id: number
  parent_user_id?: number | null
  status: 'draft' | 'submitted' | 'aggregated' | string
  summary_text: string
  payload_json?: Record<string, unknown>
  source_count?: number
  sources?: ReportSource[]
  read?: boolean
  read_at?: string | null
  created_at?: string | null
  submitted_at?: string | null
}

export type ReportSource = {
  id?: number
  source_type: string
  source_id?: number | null
  excerpt?: string | null
  metadata?: Record<string, unknown>
}

export async function listProjectReportPolicies(projectId: number) {
  return apiRequest<{ items: ReportPolicy[] }>(
    `/projects/${projectId}/report-policies`,
  )
}

export async function runProjectReport(
  projectId: number,
  body: { policy_id?: number; trigger?: string } = {},
) {
  return apiRequest<ProjectReportRun>(`/projects/${projectId}/reports/run`, {
    method: 'POST',
    body: JSON.stringify({ trigger: 'manual_confirm', ...body }),
  })
}

export async function listReportAgentBindings(projectId: number) {
  return apiRequest<{ items: ReportAgentBinding[] }>(`/projects/${projectId}/report-agents/bindings`)
}

export async function ensureReportAgentBindings(projectId: number) {
  return apiRequest<{ items: ReportAgentBinding[] }>(`/projects/${projectId}/report-agents/bindings`, { method: 'POST', body: '{}' })
}

export async function listAgentReports(projectId: number) {
  return apiRequest<{ items: AgentReport[] }>(`/projects/${projectId}/agent-reports`)
}

export async function listReportInbox() {
  return apiRequest<{ items: AgentReport[] }>('/reports/inbox')
}

export async function markReportRead(reportId: number) {
  return apiRequest<{ id: number; read: boolean }>(`/reports/inbox/${reportId}/read`, { method: 'PUT', body: '{}' })
}

export async function generateMyReportDraft(projectId?: number) {
  return apiRequest<AgentReport>('/reports/generate', {
    method: 'POST',
    body: JSON.stringify(projectId ? { project_id: projectId } : {}),
  })
}

export async function getReportDetail(reportId: number) {
  return apiRequest<AgentReport>(`/reports/${reportId}`)
}

export async function submitReportEdit(reportId: number, body: { summary?: string; sources?: ReportSource[] } = {}) {
  return apiRequest<AgentReport>(`/reports/${reportId}/submit`, {
    method: 'POST',
    body: JSON.stringify({ sources: [], ...body }),
  })
}

export async function submitAgentReport(projectId: number, body: { binding_id: number; summary: string; sources?: { source_type: string; source_id?: number; excerpt?: string }[]; payload?: Record<string, unknown> }) {
  return apiRequest<{ id: number; project_id: number; parent_user_id?: number | null; status: string; summary_text: string; source_count: number }>(`/projects/${projectId}/agent-reports`, {
    method: 'POST',
    body: JSON.stringify({ sources: [], payload: {}, ...body }),
  })
}

export async function aggregateAgentReports(projectId: number) {
  return apiRequest<{ id: number; project_id: number; status: string; summary_text: string; payload_json?: Record<string, unknown> }>(`/projects/${projectId}/agent-reports/aggregate`, { method: 'POST', body: '{}' })
}

export async function aggregateLeadershipReport(companyId: number, projectIds?: number[]) {
  return apiRequest<LeadershipReport>(`/companies/${companyId}/leadership-reports/aggregate`, {
    method: 'POST',
    body: JSON.stringify({ project_ids: projectIds?.length ? projectIds : null }),
  })
}

export async function getLatestLeadershipReport(companyId: number) {
  return apiRequest<LeadershipReport | null>(`/companies/${companyId}/leadership-reports/latest`)
}

export async function listMyReports(projectId?: number) {
  const query = projectId ? `?project_id=${projectId}` : ''
  return apiRequest<{ items: AgentReport[] }>(`/reports/my${query}`)
}

export async function rollupAgentReports(projectId: number) {
  return apiRequest<{ project_id: number; created: number; skipped: number; failed: number }>(
    `/projects/${projectId}/agent-reports/rollup`,
    { method: 'POST', body: '{}' },
  )
}

export function latestReportByUser(
  reports: AgentReport[],
  userId: number | string | null | undefined,
): AgentReport | null {
  if (userId == null) return null
  const matched = reports.filter(r => String(r.author_user_id) === String(userId))
  if (matched.length === 0) return null
  return [...matched].sort((a, b) => {
    const timeA = a.submitted_at || a.created_at || ''
    const timeB = b.submitted_at || b.created_at || ''
    if (timeA && timeB && timeA !== timeB) return timeB.localeCompare(timeA)
    return (b.id || 0) - (a.id || 0)
  })[0]
}

export function reportStatusLabel(
  report: AgentReport | null | undefined,
  now: Date = new Date(),
): string {
  void now
  if (!report) return '暂无汇报'
  if (report.status === 'draft') {
    const count = report.source_count ?? (report.sources ? report.sources.length : 0)
    return `草稿待提交 · ${count} 条来源`
  }
  const timeStr = report.submitted_at || report.created_at
  if (!timeStr) return '已提交'
  const d = new Date(timeStr)
  if (isNaN(d.getTime())) return '已提交'
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  const hh = String(d.getHours()).padStart(2, '0')
  const min = String(d.getMinutes()).padStart(2, '0')
  return `${mm}-${dd} ${hh}:${min} 已提交`
}



export type ReportStatusTone = {
  kind: 'submitted' | 'draft' | 'none'
  iconName: 'check-circle' | 'file' | null
  textClass: string
}

/** 汇报状态到展示样式：已提交=绿色对勾；草稿=蓝色文件；暂无汇报=灰色无图标。 */
export function reportStatusTone(report: AgentReport | null | undefined): ReportStatusTone {
  if (!report) {
    return { kind: 'none', iconName: null, textClass: 'text-slate-400 dark:text-slate-500' }
  }
  if (report.status === 'draft') {
    return { kind: 'draft', iconName: 'file', textClass: 'text-blue-600 dark:text-blue-400' }
  }
  return { kind: 'submitted', iconName: 'check-circle', textClass: 'text-emerald-600 dark:text-emerald-400' }
}
