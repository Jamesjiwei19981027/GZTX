import { apiRequest } from './client'

export type KnowledgeChunk = {
  chunk_id: number
  chunk_text: string
  source_type: string
  source_id: number
  score?: number
}

/** 项目知识检索（需 progress.read；空查询后端直接返回空列表） */
export async function searchKnowledge(
  projectId: number,
  q: string,
  topK = 5,
): Promise<KnowledgeChunk[]> {
  const data = await apiRequest<{ items: KnowledgeChunk[] }>(
    `/projects/${projectId}/knowledge/search?q=${encodeURIComponent(q)}&top_k=${topK}`,
  )
  return data.items || []
}
