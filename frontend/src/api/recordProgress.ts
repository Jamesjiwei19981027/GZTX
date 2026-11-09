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

export const RECORD_PROGRESS_LABELS: Record<RecordProgressTarget, string> = {
  report_draft: '汇报草稿',
  evidence: '证据材料',
  knowledge: '个人知识',
};

export interface RecordProgressSaveInput {
  text: string;
  companyId: number;
  projectId: number;
  nodeId?: number | null;
  fileIds: number[];
  evidenceKind: string;
}

export interface RecordProgressSaveDeps {
  agentChat: (body: { company_id: number; project_id: number; message: string; file_ids?: number[] }) => Promise<unknown>;
  submitEvidence: (nodeId: number, body: { summary: string; evidence_kind: any; file_ids: number[] }) => Promise<unknown>;
  createKnowledgeEntry: (projectId: number, body: { title: string; body_text: string; tags: string[]; file_ids?: number[] }) => Promise<unknown>;
}

/** 按去向调用原有接口；证据去向未选事项时抛错。 */
export async function saveRecordProgress(
  target: RecordProgressTarget,
  input: RecordProgressSaveInput,
  deps: RecordProgressSaveDeps,
): Promise<string> {
  const text = input.text.trim();
  if (target === 'report_draft') {
    await deps.agentChat({ company_id: input.companyId, project_id: input.projectId, message: text, file_ids: input.fileIds });
  } else if (target === 'evidence') {
    if (!input.nodeId) throw new Error('未选事项，请先选择关联事项');
    await deps.submitEvidence(input.nodeId, { summary: text, evidence_kind: input.evidenceKind, file_ids: input.fileIds });
  } else {
    const title = text.split('\n')[0].slice(0, 60) || '个人笔记';
    await deps.createKnowledgeEntry(input.projectId, { title, body_text: text, tags: [], file_ids: input.fileIds });
  }
  return `已存为${RECORD_PROGRESS_LABELS[target]}`;
}

/** 从事项/知识空间进入时已预选去向：规则兜底的建议不覆盖预选，模型建议采用。 */
export function resolveSuggestedTarget(
  res: RecordProgressSuggestResponse,
  initialTarget?: RecordProgressTarget,
): RecordProgressSuggestResponse {
  if (initialTarget && res.source === 'rule') {
    return { ...res, target: initialTarget, reason: '按你进入的入口预选为' + RECORD_PROGRESS_LABELS[initialTarget] };
  }
  return res;
}

/**
 * 保存时实际使用的关联事项：切换项目后，旧项目的事项不在新项目事项列表里，必须丢弃。
 * 事项列表还在加载（loaded=false）时无法判断，按当前选择放行。
 */
export function effectiveNodeId(selectedNodeId: string, nodeIds: string[], loaded: boolean): number | null {
  if (!selectedNodeId) return null;
  if (loaded && !nodeIds.includes(selectedNodeId)) return null;
  const n = Number(selectedNodeId);
  return Number.isFinite(n) && n > 0 ? n : null;
}
