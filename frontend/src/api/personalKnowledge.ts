import { apiRequest } from './client'

export type PersonalKnowledgeEntry = {
  id: number
  title: string
  body_text: string
  tags: string[]
  position: { x: number; y: number } | null
  source_type: 'manual' | 'evidence_package' | 'evidence_file' | 'agent_report' | 'agent_message' | 'project_summary'
  source_id: number | null
  source_ref: Record<string, unknown>
  updated_at: string | null
}
export type PersonalKnowledgeLink = { id: number; source_entry_id: number; target_entry_id: number; label: string }
export type PersonalKnowledgeSpaceData = {
  scope: { company_id: number; project_id: number; owner_user_id: number }
  entries: PersonalKnowledgeEntry[]
  links: PersonalKnowledgeLink[]
}
export type PersonalKnowledgeEntryInput = Pick<PersonalKnowledgeEntry, 'title' | 'body_text' | 'tags'>
export type PersonalKnowledgeEntryPatch = Partial<PersonalKnowledgeEntryInput & Pick<PersonalKnowledgeEntry, 'position'>>
const base = (projectId: number) => `/projects/${projectId}/personal-knowledge`
const json = (method: string, body: unknown): RequestInit => ({ method, body: JSON.stringify(body) })

// Ownership is derived from the authentication token; clients never send an owner ID.
export const getPersonalKnowledge = (projectId: number, signal?: AbortSignal) =>
  apiRequest<PersonalKnowledgeSpaceData>(base(projectId), { signal })
export const createPersonalKnowledgeEntry = (projectId: number, input: PersonalKnowledgeEntryInput) =>
  apiRequest<PersonalKnowledgeEntry>(`${base(projectId)}/entries`, json('POST', input))
export const updatePersonalKnowledgeEntry = (projectId: number, id: number, input: PersonalKnowledgeEntryPatch) =>
  apiRequest<PersonalKnowledgeEntry>(`${base(projectId)}/entries/${id}`, json('PATCH', input))
export const deletePersonalKnowledgeEntry = (projectId: number, id: number) =>
  apiRequest<{ id: number; is_deleted: boolean }>(`${base(projectId)}/entries/${id}`, { method: 'DELETE' })
export const syncPersonalKnowledge = (projectId: number) =>
  apiRequest<{ created: number; skipped: number }>(`${base(projectId)}/sync`, json('POST', {}))
export const createPersonalKnowledgeLink = (projectId: number, input: Omit<PersonalKnowledgeLink, 'id'>) =>
  apiRequest<PersonalKnowledgeLink>(`${base(projectId)}/links`, json('POST', input))
export const updatePersonalKnowledgeLink = (projectId: number, id: number, label: string) =>
  apiRequest<PersonalKnowledgeLink>(`${base(projectId)}/links/${id}`, json('PATCH', { label }))
export const deletePersonalKnowledgeLink = (projectId: number, id: number) =>
  apiRequest<{ id: number; is_deleted: boolean }>(`${base(projectId)}/links/${id}`, { method: 'DELETE' })

export type KnowledgeSuggestion = Omit<PersonalKnowledgeLink, 'id'> & {
  reason: string; source_quote: string; target_quote: string;
  source_fingerprint: string; target_fingerprint: string;
}
export const suggestKnowledgeRelationships = (projectId: number, entryIds?: number[]) =>
  apiRequest<{ suggestions: KnowledgeSuggestion[]; analyzed: number }>(`${base(projectId)}/assist`, json('POST', entryIds ? { entry_ids: entryIds } : {}))
export const applyKnowledgeRelationships = (projectId: number, suggestions: KnowledgeSuggestion[]) =>
  apiRequest<{ links: PersonalKnowledgeLink[]; created: number; skipped: number }>(`${base(projectId)}/assist/apply`, json('POST', { suggestions }))
