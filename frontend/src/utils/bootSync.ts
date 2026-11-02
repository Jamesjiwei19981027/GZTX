/**
 * 项目与工作区刷新失败时的状态合并策略
 */
export function handleBootRefreshFailure<TTask, TActivity>(
  errorMessage: string,
): {
  tasks: TTask[];
  activities: TActivity[];
  bootError: string;
} {
  // 项目列表是导航依据，清空会让用户误以为项目被删了：本函数不返回 projects，调用方不动项目列表。
  return {
    tasks: [],
    activities: [],
    bootError: errorMessage,
  };
}

export function getInviteNotice(refreshSuccess: boolean, language: 'zh' | 'en' = 'zh'): string {
  if (refreshSuccess) {
    return language === 'zh' ? '已加入受邀项目' : 'Joined invited project';
  }
  return language === 'zh'
    ? '已加入受邀项目，但工作区刷新失败，请点重试'
    : 'Joined invited project, but workspace refresh failed. Please retry.';
}
