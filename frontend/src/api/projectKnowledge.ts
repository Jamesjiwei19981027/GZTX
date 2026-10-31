import { apiRequest } from './client'
import type { PersonalKnowledgeEntry, PersonalKnowledgeEntryInput } from './personalKnowledge'

export type ProjectKnowledgePage = {
  id: number
  title: string
  body_text: string
  source: 'manual' | 'llm_wiki'
  meta: Record<string, unknown> | null
  updated_at: string | null
}
export type ProjectKnowledgeMember = { user_id: number; name: string; can_summarize: boolean; is_manager: boolean }
export type ProjectKnowledgeCatalog = {
  scope: { company_id: number; project_id: number; owner_user_id: number }
  pages: ProjectKnowledgePage[]
  permissions: { can_summarize: boolean; can_manage_grants: boolean }
  members: ProjectKnowledgeMember[]
}
export type ProjectKnowledgeSummary = {
  id: number
  title: string
  body_text: string
  sources: { page_id: number; title: string; quote: string }[]
  page_ids: number[]
  status: 'draft' | 'saved'
  provider: string
  model_source: string
  personal_entry_id: number | null
}
const base = (projectId: number) => `/projects/${projectId}/knowledge-space`
const json = (method: string, body: unknown) => ({ method, body: JSON.stringify(body) })

export const getProjectKnowledgeSpace = (projectId: number, signal?: AbortSignal) =>
  apiRequest<ProjectKnowledgeCatalog>(base(projectId), { signal })
export const setProjectKnowledgeGrant = (projectId: number, userId: number, canSummarize: boolean) =>
  apiRequest<ProjectKnowledgeMember>(`${base(projectId)}/grants/${userId}`, json('PUT', { can_summarize: canSummarize }))
export const generateProjectKnowledgeSummary = (projectId: number, pageIds: number[], instruction?: string) =>
  apiRequest<ProjectKnowledgeSummary>(`${base(projectId)}/summaries`, json('POST', { page_ids: pageIds, ...(instruction ? { instruction } : {}) }))
export const getProjectKnowledgeSummary = (projectId: number, id: number, signal?: AbortSignal) =>
  apiRequest<ProjectKnowledgeSummary>(`${base(projectId)}/summaries/${id}`, { signal })
export const saveProjectKnowledgeSummary = (projectId: number, id: number, input: PersonalKnowledgeEntryInput) =>
  apiRequest<{ entry: PersonalKnowledgeEntry; already_saved: boolean }>(`${base(projectId)}/summaries/${id}/save`, json('POST', input))
