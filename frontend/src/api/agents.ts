import { apiRequest } from './client'

export interface AgentDefinition {
  id: number
  name: string
  kind: 'user_created' | 'member_reporting' | 'project_reporting' | 'leadership_reporting' | string
  scene: string
  owner_user_id?: number | null
  system_prompt?: string
}

export interface AgentChatBody {
  company_id: number
  project_id?: number | null
  agent_definition_id?: number | null
  channel?: string
  message: string
}

export interface AgentChatResponse {
  session_id: number
  reply: string
  channel: string
  tool_submit_evidence_allowed: boolean
}

export async function listAgents(companyId: number) {
  return apiRequest<{ items: AgentDefinition[] }>(`/agents?company_id=${companyId}`)
}

export async function agentChat(body: AgentChatBody) {
  return apiRequest<AgentChatResponse>('/agents/chat', {
    method: 'POST',
    body: JSON.stringify({
      channel: 'web',
      ...body,
    }),
  })
}

export async function createAgent(body: { company_id: number; name: string; scene?: string; system_prompt?: string }) {
  return apiRequest<AgentDefinition>('/agents', {
    method: 'POST',
    body: JSON.stringify(body),
  })
}

export async function updateAgent(agentId: number, body: { name?: string; scene?: string; system_prompt?: string }) {
  return apiRequest<AgentDefinition>(`/agents/${agentId}`, {
    method: 'PATCH',
    body: JSON.stringify(body),
  })
}

export async function deleteAgent(agentId: number) {
  return apiRequest<{ id: number; deleted: boolean }>(`/agents/${agentId}`, {
    method: 'DELETE',
  })
}
