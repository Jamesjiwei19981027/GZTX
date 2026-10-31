/**
 * 任务所属范围规范化与解析
 * 将 'all' / null / undefined 解释为个人范围（project_id 为 null，origin 为 'personal'）；
 * 正整数字符串解释为项目范围（origin 为 'project_link'）；
 * 其余非法输入抛出错误，避免以首个项目错误替代个人范围。
 */
export function normalizeTaskScope(projectId: string | null | undefined): {
  project_id: number | null
  origin: 'personal' | 'project_link'
} {
  if (projectId === null || projectId === undefined || projectId === '' || projectId === 'all') {
    return {
      project_id: null,
      origin: 'personal',
    }
  }

  const num = Number(projectId)
  if (Number.isInteger(num) && num > 0 && String(num) === String(projectId).trim()) {
    return {
      project_id: num,
      origin: 'project_link',
    }
  }

  throw new Error(`Invalid project task scope: ${projectId}`)
}
