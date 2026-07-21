import request from './request'
import type {
  AgentChatResult,
  AgentDefinitionDTO,
  CompanyDTO,
  EvidencePackageDTO,
  OrgUnitDTO,
  PageData,
  ProgressRecordDTO,
  ProjectDTO,
  TreeNodeDTO,
} from '@/types/collab'

export function createCompany(body: {
  name: string
  slug: string
  policy_preset?: string
}) {
  return request.post<CompanyDTO>('/companies', body)
}

/** 当前用户所属公司列表 */
export function listMyCompanies() {
  return request.get<{ items: CompanyDTO[]; total: number }>('/companies/mine')
}

export function getCompany(companyId: number) {
  return request.get<CompanyDTO>(`/companies/${companyId}`)
}

/** 公司级 SMTP（密码脱敏，前端可配） */
export type CompanySmtpConfig = {
  smtp_host: string
  smtp_port: number
  smtp_user: string
  smtp_from: string
  has_password: boolean
  configured?: boolean
  source?: string
}

export function getCompanySmtp(companyId: number) {
  return request.get<CompanySmtpConfig>(`/companies/${companyId}/smtp`)
}

export function putCompanySmtp(
  companyId: number,
  body: {
    smtp_host?: string
    smtp_port?: number
    smtp_user?: string
    smtp_password?: string
    smtp_from?: string
  },
) {
  return request.put<CompanySmtpConfig>(`/companies/${companyId}/smtp`, body)
}

export function testCompanySmtp(companyId: number) {
  return request.post<{ message?: string } | null>(`/companies/${companyId}/smtp/test`)
}

export function getCompanyFeatures(companyId: number) {
  return request.get<{ features: Record<string, boolean>; unlocked: boolean; status: string }>(
    `/companies/${companyId}/features`,
  )
}

export function uploadLicense(
  companyId: number,
  body: { license_payload: string; signature: string },
) {
  return request.post<{ status: string; features: Record<string, unknown> }>(
    `/companies/${companyId}/license`,
    body,
  )
}

export function listProjects(companyId: number, params?: { page?: number; status?: string }) {
  // as_admin：超管/组织负责人可见公司全部项目（后端对普通成员自动降级为“我参与的”）
  return request.get<PageData<ProjectDTO>>('/projects', {
    params: { company_id: companyId, as_admin: true, ...params },
  })
}

export function createProject(body: { name: string; company_id: number }) {
  return request.post<ProjectDTO>('/projects', body)
}

export function getProject(projectId: number) {
  return request.get<ProjectDTO>(`/projects/${projectId}`)
}

export function getProjectTree(projectId: number, format: 'nested' | 'flat' = 'nested') {
  return request.get<{ project_id: number; nodes: TreeNodeDTO[] }>(
    `/projects/${projectId}/tree`,
    { params: { format } },
  )
}

export function createNode(
  projectId: number,
  body: {
    parent_id?: number | null
    node_type_key: string
    title: string
    description?: string
    assignees?: { user_id: number; role_key: string }[]
  },
) {
  return request.post<TreeNodeDTO>(`/projects/${projectId}/nodes`, body)
}

export function getNode(nodeId: number) {
  return request.get<TreeNodeDTO>(`/nodes/${nodeId}`)
}

export function submitEvidence(
  nodeId: number,
  body: {
    summary_text?: string
    structured?: Record<string, unknown>
    file_ids?: number[]
  },
) {
  return request.post<{ package_id: number; status: string; job_id: string }>(
    `/nodes/${nodeId}/evidence`,
    body,
  )
}

export function getNodeProgress(nodeId: number) {
  return request.get<{
    node_id: number
    progress_json: TreeNodeDTO['progress_json']
    recent_records: ProgressRecordDTO[]
  }>(`/nodes/${nodeId}/progress`)
}

export function listNodeEvidence(nodeId: number) {
  return request.get<PageData<EvidencePackageDTO>>(`/nodes/${nodeId}/evidence`)
}

export function uploadEvidenceFile(
  file: File,
  opts: { company_id: number; project_id?: number | null },
) {
  const form = new FormData()
  form.append('file', file)
  form.append('company_id', String(opts.company_id))
  if (opts.project_id != null) {
    form.append('project_id', String(opts.project_id))
  }
  return request.post<{
    file_id: number
    original_name: string
    size_bytes: number
    company_id: number
  }>('/evidence/files', form, {
    headers: { 'Content-Type': 'multipart/form-data' },
  })
}

export function listAgents(companyId: number) {
  return request.get<{ items: AgentDefinitionDTO[] }>('/agents', {
    params: { company_id: companyId },
  })
}

export function createAgent(body: {
  company_id: number
  name: string
  scene?: string
  system_prompt?: string
}) {
  return request.post<AgentDefinitionDTO>('/agents', body)
}

export function updateAgent(
  agentId: number,
  body: { name?: string; scene?: string; system_prompt?: string },
) {
  return request.patch<AgentDefinitionDTO>(`/agents/${agentId}`, body)
}

export function deleteAgent(agentId: number) {
  return request.delete<{ id: number; deleted: boolean }>(`/agents/${agentId}`)
}

export function agentChat(body: {
  company_id: number
  project_id?: number | null
  agent_definition_id?: number | null
  channel?: string
  message: string
}) {
  return request.post<AgentChatResult>('/agents/chat', body)
}

export function getCompanyBindings(companyId: number) {
  return request.get<{
    storage: { provider_id: string; is_default?: boolean }
    asr: { provider_id: string; is_default?: boolean }
    model: { provider_id: string; is_default?: boolean }
  }>(`/companies/${companyId}/bindings`)
}

export function putStorageBinding(
  companyId: number,
  body: { provider_id: string; config_json?: Record<string, unknown> | null },
) {
  return request.put(`/companies/${companyId}/bindings/storage`, body)
}

export function putAsrBinding(
  companyId: number,
  body: { provider_id: string; config_json?: Record<string, unknown> | null },
) {
  return request.put(`/companies/${companyId}/bindings/asr`, body)
}

export function putModelBinding(
  companyId: number,
  body: { provider_id: string; config_json?: Record<string, unknown> | null },
) {
  return request.put(`/companies/${companyId}/bindings/models`, body)
}

/** 公司级 LLM（api_key 脱敏，前端可配） */
export type CompanyLlmConfig = {
  provider: string
  base_url: string
  model: string
  temperature: number
  max_tokens: number
  enabled: boolean
  use_for_judge: boolean
  use_for_agent: boolean
  has_api_key: boolean
  configured?: boolean
  source?: string
  presets?: Record<
    string,
    {
      label: string
      default_base_url?: string
      default_model?: string
      needs_key?: boolean
    }
  >
}

export function getCompanyLlm(companyId: number) {
  return request.get<CompanyLlmConfig>(`/companies/${companyId}/llm`)
}

export function putCompanyLlm(
  companyId: number,
  body: {
    provider?: string
    base_url?: string
    model?: string
    api_key?: string
    temperature?: number
    max_tokens?: number
    enabled?: boolean
    use_for_judge?: boolean
    use_for_agent?: boolean
  },
) {
  return request.put<CompanyLlmConfig>(`/companies/${companyId}/llm`, body)
}

export function testCompanyLlm(companyId: number) {
  return request.post<{
    provider?: string
    model?: string
    base_url?: string
    content?: string
  } | null>(`/companies/${companyId}/llm/test`)
}

export function patchLoginMethods(
  companyId: number,
  body: Record<string, boolean>,
) {
  return request.patch<Record<string, boolean>>(
    `/companies/${companyId}/login-methods`,
    body,
  )
}

export function getOrgTree(companyId: number) {
  return request.get<{ nodes: OrgUnitDTO[] }>(`/companies/${companyId}/org-tree`)
}

export type IntegrationField = {
  key: string
  label: string
  secret?: boolean
  type?: string
  placeholder?: string
}

export type IntegrationSchema = {
  label: string
  credential_fields: IntegrationField[]
  config_fields: IntegrationField[]
  note?: string
}

export type IntegrationDTO = {
  id: number
  provider: string
  config: Record<string, unknown>
  credentials: Record<string, unknown>
  has_credentials: boolean
  last_sync_at?: string | null
}

export function getIntegrationSchemas(companyId: number) {
  return request.get<{ providers: Record<string, IntegrationSchema> }>(
    `/companies/${companyId}/integrations/schemas`,
  )
}

export function listIntegrations(companyId: number) {
  return request.get<{ items: IntegrationDTO[] }>(`/companies/${companyId}/integrations`)
}

export function putIntegration(
  companyId: number,
  provider: string,
  body: {
    provider: string
    credentials: Record<string, unknown>
    config?: Record<string, unknown> | null
  },
) {
  return request.put<IntegrationDTO>(`/companies/${companyId}/integrations/${provider}`, body)
}

export function triggerOrgSync(companyId: number, provider?: string) {
  return request.post<{
    status: string
    provider?: string
    credentials_loaded?: boolean
    report: { dept_upserted: number; users_matched: number; left_count: number }
  }>(`/companies/${companyId}/org-sync`, null, {
    params: provider ? { provider } : undefined,
  })
}
