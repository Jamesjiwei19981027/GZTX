import { apiRequest } from './client';

export type RecordProgressTarget = 'report_draft' | 'evidence' | 'knowledge';

export interface RecordProgressSuggestRequest {
  text: string;
  has_attachments: boolean;
  project_id?: number | null;
  node_id?: number | null;
}

export interface RecordProgressSuggestResponse {
  target: RecordProgressTarget;
  reason: string;
  source: 'llm' | 'rule';
}

export async function suggestRecordProgress(body: RecordProgressSuggestRequest): Promise<RecordProgressSuggestResponse> {
  return apiRequest<RecordProgressSuggestResponse>('/record-progress/suggest', {
    method: 'POST',
    body: JSON.stringify(body),
  });
}
