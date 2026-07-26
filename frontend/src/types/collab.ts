/** 团队协作类型（api-contracts-v1） */

export type CompanyStatus = 'pending_license' | 'active' | 'readonly' | 'suspended'
export type ProjectStatus = 'draft' | 'active' | 'archived'
export type BehaviorTemplate = 'scope' | 'work_item' | 'milestone' | 'person'

export interface ProgressJson {
  template: BehaviorTemplate
  status?: string
  percent?: number
  checklist?: { key: string; label: string; done: boolean }[]
  summary?: Record<string, unknown>
  updated_at?: string
  last_record_id?: number | null
}

export interface CompanyDTO {
  id: number
  name: string
  slug: string
  status: CompanyStatus
  policy_preset?: string | null
  policy?: Record<string, unknown>
  entitlement?: Record<string, unknown>
  login_methods?: Record<string, boolean>
  my_membership?: {
    status: string
    is_super_admin: boolean
    is_org_leader: boolean
    employment_status: string
    title?: string | null
  } | null
  created_at?: string | null
}

export interface ProjectOwnerDTO {
  user_id: number
  username?: string | null
  nickname?: string | null
  avatar_url?: string | null
  is_me?: boolean
}

export interface ProjectDTO {
  id: number
  company_id: number
  name: string
  status: ProjectStatus
  pm_user_id: number | null
  final_owner_user_id?: number | null
  created_by?: number | null
  final_owner?: ProjectOwnerDTO | null
  /** 终责卡片沿主干的偏移，服务端持久化（曾经只存 localStorage，不跨端） */
  final_owner_along_delta?: number
  my_role?: string | null
  created_at?: string | null
  member_count?: number
}

export interface NodeAssigneeDTO {
  user_id: number
  role_key: string
  nickname?: string | null
  username?: string | null
  display_name?: string | null
  avatar_url?: string | null
}

export interface ProjectMemberDTO {
  user_id: number
  display_name?: string | null
  nickname?: string | null
  username?: string | null
  avatar_url?: string | null
  role?: string | null
}

export interface TreeNodeDTO {
  id: number
  parent_id: number | null
  node_type_key: string
  behavior_template: BehaviorTemplate
  title: string
  description: string | null
  sort_order: number
  path: string
  depth: number
  start_at?: string | null
  due_at?: string | null
  milestone_at?: string | null
  progress_json: ProgressJson
  assignees: NodeAssigneeDTO[]
  children?: TreeNodeDTO[]
}

export interface EvidencePackageDTO {
  id: number
  node_id: number
  status: string
  summary_text: string | null
  structured?: Record<string, unknown> | null
  judge_result?: { decision?: string; reason?: string } | null
  submitted_at?: string | null
}

export interface ProgressRecordDTO {
  id: number
  event_type: string
  source: string
  after_json: ProgressJson
  reason?: string | null
  created_at?: string | null
}

export interface PageData<T> {
  items: T[]
  total: number
  page: number
  page_size: number
  total_pages: number
}

export interface AgentDefinitionDTO {
  id: number
  name: string
  kind: string
  scene: string
  owner_user_id?: number | null
  system_prompt?: string
}

export interface AgentChatResult {
  session_id: number
  reply: string
  channel: string
  tool_submit_evidence_allowed?: boolean
}

export interface OrgUnitDTO {
  id: number
  parent_id: number | null
  name: string
  external_id?: string | null
  source?: string
  leader_user_id?: number | null
  path?: string
  is_active?: boolean
}

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system'
  content: string
  at?: string
}
