import { notificationTarget } from '../utils/notificationText';
import type { MobileRouteInput } from '../mobile/navigation/mobileRoutes';

export function pushTarget(extras: Record<string, unknown>): MobileRouteInput {
  const key = typeof extras.template_key === 'string' ? extras.template_key : '';
  const legacy = notificationTarget(key, extras);
  const id = (name: string) => Number.isInteger(Number(extras[name])) && Number(extras[name]) > 0 ? String(extras[name]) : undefined;
  const projectId = id('project_id');
  const packageId = id('package_id');
  const nodeId = id('node_id');
  const reportId = id('report_id');
  if (legacy?.view === 'people-axis' && packageId) return { tab: 'axis', screen: 'axis-evidence-detail', params: { projectId, packageId } };
  if (key === 'progress.auto_write_alert' && nodeId) return { tab: 'axis', screen: 'axis-progress', params: { projectId, nodeId } };
  if (key === 'agent.report.submitted' && projectId && reportId) return { tab: 'work', screen: 'ai-report-detail', params: { projectId, reportId, fromManager: '1' } };
  if (key === 'project.report.aggregated' && projectId) return { tab: 'work', screen: 'ai-project-aggregate', params: { projectId } };
  if (key === 'auth.welcome') return { tab: 'work', screen: 'work-root' };
  if (legacy) return { tab: legacy.view === 'reports' ? 'work' : 'axis', screen: legacy.view === 'reports' ? 'ai-root' : 'axis-root', params: { projectId } };
  return { tab: 'messages', screen: 'messages-notifications' };
}

export function readyPushTarget(extras: Record<string, unknown>, projectIds: Array<string | number>, ready: boolean): MobileRouteInput | null {
  if (!ready) return null;
  const target = pushTarget(extras);
  if (target.params?.projectId && !projectIds.some(id => String(id) === target.params!.projectId)) {
    return { tab: 'messages', screen: 'messages-notifications' };
  }
  return target;
}
