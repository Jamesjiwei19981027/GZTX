/**
 * 手机顶栏归属：这些页面自己绘制了完整顶栏（带返回和标题），
 * 外层 Outlet 不能再画一条，否则会出现双顶栏、重复标题。
 */
const SCREENS_WITH_OWN_HEADER = new Set([
  'messages-contacts',
  'project-switch',
  'project-overview',
  'project-settings',
  'project-invite',
  'project-create',
  'invite-accept',
  'work-calendar',
  'work-statistics',
  'work-trash',
  'work-search',
]);

export function screenOwnsHeader(screen: string): boolean {
  return SCREENS_WITH_OWN_HEADER.has(screen);
}

/** 外层统一顶栏是否隐藏（整个 Tab 自带顶栏，或当前页自带顶栏） */
export function shouldHideOuterTopBar(currentTab: string, screen: string): boolean {
  if (currentTab === 'axis' || currentTab === 'knowledge' || currentTab === 'me') return true;
  if (screen.startsWith('ai-') || screen === 'messages-chat' || screen === 'record-progress') return true;
  return screenOwnsHeader(screen);
}
