/**
 * 汇报链路能力校验、上下级真实性判定与 API 缺口适配器
 * 严格遵循 T08/T09 规范与 API-GAPS 定义
 */

import { AgentReport } from '../../../api/reports';

export interface SupervisorResolution {
  isValid: boolean;
  name: string;
  id: string;
  status: 'confirmed' | 'invalid_self' | 'unassigned';
  isSelf: boolean;
  avatar?: string;
  role?: string;
}

export interface MemberLike {
  id: string | number;
  name: string;
  avatar?: string;
  role?: string;
}

/**
 * 严格判定直属领导（直属领导绝对不能是自己）
 */
export function resolveDirectSupervisor(
  members: MemberLike[],
  currentUserId?: string | number | null,
  parentUserId?: string | number | null,
): SupervisorResolution {
  if (parentUserId == null || parentUserId === '') {
    return {
      isValid: false,
      name: '未指定直属领导',
      id: '',
      status: 'unassigned',
      isSelf: false,
      role: '人轴关系待确定',
    };
  }

  const strParentId = String(parentUserId);
  const strCurrentId = currentUserId ? String(currentUserId) : '';

  if (strParentId === strCurrentId) {
    return {
      isValid: false,
      name: '直属领导不能是自己',
      id: strParentId,
      status: 'invalid_self',
      isSelf: true,
      role: '违反责任链原则',
    };
  }

  const found = members.find((m) => String(m.id) === strParentId);
  if (found) {
    return {
      isValid: true,
      name: found.name,
      id: strParentId,
      status: 'confirmed',
      isSelf: false,
      avatar: found.avatar,
      role: found.role || '人轴直属领导',
    };
  }

  return {
    isValid: true,
    name: `直属领导 (${strParentId})`,
    id: strParentId,
    status: 'confirmed',
    isSelf: false,
    role: '人轴直属领导',
  };
}

/**
 * AI 送达回执与处理状态解释器
 * 依据 G01：无独立通用 AI 回执字段，禁止虚构四个全绿节点
 */
export function getAiDeliveryStatus(report?: AgentReport | null) {
  const isSubmitted = Boolean(report && (report.status === 'submitted' || report.status === 'aggregated'));
  const isRead = Boolean(report && (report.read || report.read_at));

  return {
    submitted: isSubmitted,
    submittedAt: report?.submitted_at || null,
    // 直属领导送达与已读状态
    leaderDelivery: isSubmitted
      ? {
          status: isRead ? '已读' : '已送达',
          readAt: report?.read_at || null,
          confirmed: true,
        }
      : {
          status: '未提交',
          readAt: null,
          confirmed: false,
        },
    // G01: 智能体接收/处理没有独立回执
    aiReceipt: {
      confirmed: false,
      statusText: '状态暂不可确认',
      badgeClass: 'text-slate-500 bg-slate-100 dark:bg-slate-800',
      description: '暂无独立 AI 处理回执，以直属领导与人轴状态为准 (G01)',
    },
    // 汇总状态
    rollupStatus: report?.status === 'aggregated' ? '已纳入项目汇总' : '等待汇总',
  };
}

/**
 * 本地隔离草稿管理（G02）
 * 基于 用户ID + 项目ID 严格隔离，禁止跨项目跨用户串草稿
 */
export interface LocalDraft {
  summary: string;
  draftReportId?: number | null;
  updatedAt: string;
  projectId: number;
  userId: string;
}

export function getDraftStorageKey(userId: string | number, projectId: string | number): string {
  return `wt_ai_report_draft_${userId}_${projectId}`;
}

export function saveLocalDraft(
  userId: string | number,
  projectId: string | number,
  draft: { summary: string; draftReportId?: number | null },
): void {
  try {
    const key = getDraftStorageKey(userId, projectId);
    const data: LocalDraft = {
      summary: draft.summary,
      draftReportId: draft.draftReportId,
      updatedAt: new Date().toISOString(),
      projectId: Number(projectId),
      userId: String(userId),
    };
    localStorage.setItem(key, JSON.stringify(data));
  } catch (err) {
    console.warn('saveLocalDraft failed', err);
  }
}

export function loadLocalDraft(
  userId: string | number,
  projectId: string | number,
): LocalDraft | null {
  try {
    const key = getDraftStorageKey(userId, projectId);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as LocalDraft;
    // 校验归属，防止恶意篡改或溢出
    if (String(parsed.userId) === String(userId) && Number(parsed.projectId) === Number(projectId)) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function clearLocalDraft(userId: string | number, projectId: string | number): void {
  try {
    const key = getDraftStorageKey(userId, projectId);
    localStorage.removeItem(key);
  } catch (err) {
    console.warn('clearLocalDraft failed', err);
  }
}

/**
 * 缺口定义字典，用于真实提示与防御
 */
export const REPORT_API_GAPS = {
  G01: {
    code: 'G01',
    name: 'AI 接收 / 处理回执缺失',
    actionDesc: 'AI 收到 / 已处理状态显示“状态暂不可确认”',
  },
  G02: {
    code: 'G02',
    name: '草稿独立多版本对比缺失',
    actionDesc: '本地隔离存储草稿，历史列表展示真实已提交记录',
  },
  G03: {
    code: 'G03',
    name: '汇总后正式发布审批流缺失',
    actionDesc: '当前仅支持生成与查看项目汇总，不假造入库归档流程',
  },
  G04: {
    code: 'G04',
    name: '差异追问工单流转缺失',
    actionDesc: '追问提示通过消息沟通，不伪造追问工单闭环',
  },
  G05: {
    code: 'G05',
    name: '资料差异核验决定持久化缺失',
    actionDesc: '展示冲突项与核验建议，不将未保存的审核谎报为落库成功',
  },
} as const;

/**
 * 从聚合载荷中提取冲突
 */
export function extractConflicts(payloadJson?: Record<string, unknown> | null) {
  if (!payloadJson) return [];
  const raw = payloadJson.conflicts ?? payloadJson.conflict;
  if (Array.isArray(raw)) {
    return raw.map((c) => ({
      type: typeof c.type === 'string' ? c.type : 'status_conflict',
      taskId: c.task_id != null ? Number(c.task_id) : undefined,
      reportIds: Array.isArray(c.report_ids) ? c.report_ids.map(Number) : [],
      statuses: Array.isArray(c.statuses) ? c.statuses : [],
      severity: typeof c.severity === 'string' ? c.severity : 'warning',
      description: typeof c.description === 'string' ? c.description : undefined,
    }));
  }
  return [];
}

/**
 * 合并本地暂存与服务端草稿：服务端草稿里有、本地没有的行（例如「记录进展」存进来的记录）
 * 追加到末尾；本地为空时直接用服务端内容。已有的行不会重复。
 */
export function mergeDraftText(local: string, server: string): string {
  const mine = (local || '').trim();
  const have = new Set(mine.split('\n').map((line) => line.trim()).filter(Boolean));
  const extra = (server || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !have.has(line.trim()));
  return [mine, ...extra].filter(Boolean).join('\n');
}
