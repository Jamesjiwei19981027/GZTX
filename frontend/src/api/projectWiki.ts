import { apiRequest } from './client'

export type WikiFact = {
  text: string; quote: string; source_name: string; source_id: string
  package_id: number; line_start: number; line_end: number
}
export type WikiProposal = { key: string; title: string; topic: string; facts: WikiFact[] }
export type WikiPage = { id: number; title: string; body_text?: string; meta: {
  facts?: WikiFact[]; revision?: number; proposals?: WikiProposal[]
} }
export type ProjectWikiCatalog = {
  engine: string; can_publish: boolean; pages: WikiPage[]; drafts: WikiPage[]
  materials: { id: number; title: string; node_id: number; status: string; can_generate: boolean }[]
}

export const getProjectWiki = (id: number, q = '') => apiRequest<ProjectWikiCatalog>(
  `/projects/${id}/llm-wiki?q=${encodeURIComponent(q)}`)
export const generateWikiDraft = (id: number, packageId: number) => apiRequest<{ id: number }>(
  `/projects/${id}/llm-wiki/drafts`, { method: 'POST', body: JSON.stringify({ package_id: packageId }) })
export const publishWikiDraft = (id: number, draftId: number) => apiRequest<{ published_ids: number[] }>(
  `/projects/${id}/llm-wiki/drafts/${draftId}/publish`, { method: 'POST' })

export async function uploadEvidenceFile(file: File, companyId: number, projectId: number) {
  const body = new FormData()
  body.set('file', file); body.set('company_id', String(companyId)); body.set('project_id', String(projectId))
  return apiRequest<{ file_id: number }>('/evidence/files', { method: 'POST', body })
}
