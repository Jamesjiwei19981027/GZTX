/**
 * 站内通知：模板键 -> 中文标题，以及材料/汇报类通知的跳转目标。
 * 界面永远不展示原始模板键。
 */
export const NOTIFICATION_TITLES: Record<string, string> = {
  'evidence.awaiting_review': '材料待你确认',
  'evidence.pending_review': '材料待负责人确认',
  'evidence.adopted': '材料已采纳',
  'evidence.rejected': '材料被驳回',
  'review.awaiting_pm': '复核待你确认',
  'progress.auto_write_alert': '进度写入过于频繁',
  'auth.welcome': '欢迎加入',
  'agent.report.submitted': '收到新的汇报',
  'project.report.aggregated': '项目汇报已汇总',
  'report.submitted': '收到新的汇报',
  'report.aggregated': '项目汇报已汇总',
  progress_summary: '进度汇总',
};

export function notificationTitle(templateKey?: string | null): string {
  const key = (templateKey || '').trim();
  if (!key) return '系统通知';
  if (NOTIFICATION_TITLES[key]) return NOTIFICATION_TITLES[key];
  if (key.startsWith('evidence.')) return '材料通知';
  if (key.includes('report')) return '汇报通知';
  return '系统通知';
}

export type NotificationTarget = { view: 'people-axis' | 'reports'; projectId?: number };

export function notificationTarget(
  templateKey?: string | null,
  payload?: Record<string, unknown> | null,
): NotificationTarget | null {
  const key = (templateKey || '').trim();
  const raw = payload?.project_id;
  const projectId = raw != null && Number.isFinite(Number(raw)) && Number(raw) > 0 ? Number(raw) : undefined;
  if (key.startsWith('evidence.')) return { view: 'people-axis', projectId };
  if (key.includes('report')) return { view: 'reports', projectId };
  return null;
}
