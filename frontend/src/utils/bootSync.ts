/**
 * 项目与工作区刷新失败时的状态合并策略
 */
export function handleBootRefreshFailure<TProject, TTask, TActivity>(
  previousProjects: TProject[],
  errorMessage: string,
): {
  projects: TProject[];
  tasks: TTask[];
  activities: TActivity[];
  bootError: string;
} {
  // 项目列表是导航依据，清空会让用户误以为项目被删了。保留上一次成功拿到的真实项目列表。
  return {
    projects: previousProjects,
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
