/** 收件箱里通知来源的中文名；后端给的是模板键名，不能把原始键名直接露给用户 */
export function inboxSourceLabel(key: string): string {
  const k = (key || '').toLowerCase()
  if (k.includes('reply')) return '需回复通知'
  if (k.includes('report')) return '汇报通知'
  if (k.includes('task')) return '任务通知'
  if (k.includes('invite')) return '邀请通知'
  if (k.includes('mention')) return '提及通知'
  if (k.includes('system')) return '系统通知'
  return '协作通知'
}
