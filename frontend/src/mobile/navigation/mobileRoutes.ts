/**
 * 移动端导航路由表与返回动作决策器
 */

import { AppIconName } from '../ui/AppIcon';

export type MobileTab = 'work' | 'axis' | 'knowledge' | 'messages' | 'me';
export type LegacyMobileTab = MobileTab | 'ai';
export type MobileRouteInput = Partial<Omit<MobileRoute, 'tab'>> & { tab?: LegacyMobileTab; screen: string };

export type MobilePresentation = 'page' | 'sheet' | 'dialog';

export type MobileRouteParams = {
  projectId?: string;
  taskId?: string;
  nodeId?: string;
  reportId?: string;
  filter?: string;
  date?: string;
  [key: string]: string | undefined;
};

export type MobileRoute = {
  tab: MobileTab;
  screen: string;
  presentation: MobilePresentation;
  params: MobileRouteParams;
  title?: string;
};

export type BackAction = 'confirm-discard' | 'close-overlay' | 'pop-detail' | 'root';

export interface TabConfig {
  id: MobileTab;
  label: string;
  iconName: AppIconName;
  defaultScreen: string;
}

export const MOBILE_TABS: ReadonlyArray<TabConfig> = [
  { id: 'work', label: '工作', iconName: 'work', defaultScreen: 'work-root' },
  { id: 'axis', label: '人轴', iconName: 'axis', defaultScreen: 'axis-root' },
  { id: 'knowledge', label: '知识', iconName: 'knowledge', defaultScreen: 'knowledge-root' },
  { id: 'messages', label: '消息', iconName: 'messages', defaultScreen: 'messages-root' },
  { id: 'me', label: '我的', iconName: 'me', defaultScreen: 'me-root' },
];

export const REGISTERED_SCREENS: Record<MobileTab, ReadonlySet<string>> = {
  work: new Set([
    'work-root',
    'work-tasks',
    'work-kanban',
    'work-calendar',
    'work-statistics',
    'work-trash',
    'work-task-detail',
    'work-task-edit',
    'work-quick-add',
    'work-search',
    'work-chat-extract',
    'project-switch',
    'project-create',
    'company-create',
    'project-overview',
    'project-settings',
    'project-invite',
    'invite-accept',
    'ai-root', 'ai-chat', 'ai-report-create', 'ai-report-submitted', 'ai-report-detail',
    'ai-inbox', 'ai-project-contrast', 'ai-project-aggregate', 'ai-leadership',
    'ai-agent-bindings', 'ai-review-followup', 'ai-review-conflict',
  ]),
  axis: new Set([
    'axis-root',
    'axis-node-detail',
    'axis-person-detail',
    'axis-edit-responsibility',
    'axis-evidence-submit',
    'axis-evidence-detail',
    'axis-progress',
    'axis-delegations',
    'axis-audit',
    'axis-wiki',
    'axis-wiki-draft',
    'axis-wiki-search',
  ]),
  knowledge: new Set(['knowledge-root', 'knowledge-chat']),
  messages: new Set([
    'messages-root',
    'messages-contacts',
    'messages-chat',
    'messages-call',
    'messages-profile',
    'messages-inbox',
    'messages-external-mail',
    'messages-notifications',
  ]),
  me: new Set([
    'me-root',
    'me-account',
    'me-profile',
    'me-security',
    'me-appearance',
    'me-notifications',
    'me-defaults',
    'me-billing-help',
    'me-notify-logs',
    'me-integrations',
    'me-team',
    'me-help',
    'me-about',
    // T11 企业管理员与基础设施集成
    'admin-notify-channels',
    'admin-llm-config',
    'admin-org-sso',
    'admin-push-certs',
    'admin-model-keys',
    'admin-asr-config',
    'admin-sso-config',
    // T12 账号注销确认
    'adapt-account-delete',
  ]),
};

export function isValidScreenForTab(tab: MobileTab, screen: string): boolean {
  const screens = REGISTERED_SCREENS[tab];
  return Boolean(screens && screens.has(screen));
}

export function createDefaultRoute(tab: MobileTab, params: MobileRouteParams = {}): MobileRoute {
  const tabConfig = MOBILE_TABS.find((t) => t.id === tab) || MOBILE_TABS[0];
  return {
    tab,
    screen: tabConfig.defaultScreen,
    presentation: 'page',
    params,
    title: tabConfig.label,
  };
}

/** Old callers can keep their screen IDs; one registry decides the owning tab. */
export function normalizeMobileRoute(input: MobileRouteInput, fallback: MobileTab = 'work'): MobileRoute {
  const screen = input.screen === 'me-knowledge' ? 'knowledge-root' : input.screen;
  const owner = MOBILE_TABS.find(item => REGISTERED_SCREENS[item.id].has(screen));
  const tab = owner?.id ?? (input.tab === 'ai' ? 'work' : input.tab) ?? fallback;
  return { ...input, tab, screen, presentation: input.presentation ?? 'page', params: input.params ?? {} };
}

/**
 * 返回动作决策器：
 * 严格按照状态机优先级解析返回意图：
 * 1. currentDirty === true -> 'confirm-discard'（保护未保存内容）
 * 2. overlayOpen === true -> 'close-overlay'（优先关闭顶层 Sheet/弹窗）
 * 3. detailOpen === true -> 'pop-detail'（退出当前二级/详情页面）
 * 4. 否则 -> 'root'（已在根页面，由宿主决定或退出应用）
 */
export function resolveBackAction(state: {
  currentDirty: boolean;
  overlayOpen: boolean;
  detailOpen: boolean;
}): BackAction {
  if (state.currentDirty) {
    return 'confirm-discard';
  }
  if (state.overlayOpen) {
    return 'close-overlay';
  }
  if (state.detailOpen) {
    return 'pop-detail';
  }
  return 'root';
}

/**
 * 兼容旧 Web 链接与路由参数映射到移动 Route
 */
export function mapLegacyViewToMobileRoute(
  view?: string | null,
  params?: {
    taskId?: string;
    projectId?: string;
    nodeId?: string;
    reportId?: string;
    [key: string]: string | undefined;
  },
): MobileRoute {
  const routeParams: MobileRouteParams = { ...params };

  switch (view) {
    case 'dashboard':
      return { tab: 'work', screen: 'work-root', presentation: 'page', params: routeParams, title: '工作台' };
    case 'tasks':
      if (params?.taskId) {
        return { tab: 'work', screen: 'work-task-detail', presentation: 'page', params: routeParams, title: '任务详情' };
      }
      return { tab: 'work', screen: 'work-tasks', presentation: 'page', params: routeParams, title: '我的待办' };
    case 'kanban':
      return { tab: 'work', screen: 'work-kanban', presentation: 'page', params: routeParams, title: '任务看板' };
    case 'calendar':
      return { tab: 'work', screen: 'work-calendar', presentation: 'page', params: routeParams, title: '日程日历' };
    case 'reports':
      return { tab: 'work', screen: 'ai-root', presentation: 'page', params: routeParams, title: 'AI 汇报与助手' };
    case 'trash':
      return { tab: 'work', screen: 'work-trash', presentation: 'page', params: routeParams, title: '回收站' };
    case 'people-axis':
      if (params?.nodeId) {
        return { tab: 'axis', screen: 'axis-node-detail', presentation: 'page', params: routeParams, title: '责任链节点' };
      }
      return { tab: 'axis', screen: 'axis-root', presentation: 'page', params: routeParams, title: '人轴责任链' };
    case 'inbox':
    case 'messages':
      return { tab: 'messages', screen: 'messages-root', presentation: 'page', params: routeParams, title: '消息中心' };
    case 'notifications':
      return { tab: 'me', screen: 'me-notifications', presentation: 'page', params: routeParams, title: '通知设置' };
    case 'team':
      return { tab: 'me', screen: 'me-team', presentation: 'page', params: routeParams, title: '组织团队' };
    case 'settings':
      return { tab: 'me', screen: 'me-root', presentation: 'page', params: routeParams, title: '个人设置' };
    case 'knowledge':
    case 'me-knowledge':
      return { tab: 'knowledge', screen: 'knowledge-root', presentation: 'page', params: routeParams, title: '知识' };
    case 'ai':
      return { tab: 'work', screen: 'ai-root', presentation: 'page', params: routeParams, title: 'AI 汇报与助手' };
    default:
      return createDefaultRoute('work', routeParams);
  }
}
