export const CARD_FIELDS = ['avatar', 'name', 'role', 'department', 'description', 'task_count', 'overdue_count', 'progress', 'recent_progress', 'next_due', 'tags', 'custom_fields'] as const
export type CardField = typeof CARD_FIELDS[number]
export const FIELD_LABELS: Record<CardField, string> = { avatar: '头像', name: '姓名', role: '角色/职位', department: '部门', description: '职责描述', task_count: '任务数', overdue_count: '逾期数', progress: '进度条', recent_progress: '最近进展', next_due: '最近截止日期', tags: '标签', custom_fields: '自定义字段' }
export const CARD_PALETTE = {
  ink: { name: '墨蓝', color: '#1D4E9E' }, slate: { name: '岩灰', color: '#596678' },
  sage: { name: '鼠尾草', color: '#526C5B' }, ochre: { name: '赭石', color: '#8B682F' },
  clay: { name: '陶土', color: '#98634F' }, rose: { name: '灰玫瑰', color: '#945D67' },
  plum: { name: '灰梅', color: '#79617D' }, stone: { name: '石灰', color: '#6D695F' },
} as const
export type CardColor = keyof typeof CARD_PALETTE
export type CardDensity = 'compact' | 'standard' | 'detailed'
export type CardTag = { text: string; color: CardColor }
export type CustomCardField = { key: string; value: string }
export type CardTemplate = { fields?: readonly CardField[]; density?: CardDensity; color?: CardColor }
export type CardStyle = { fields?: readonly CardField[]; color?: CardColor; tags?: readonly CardTag[]; custom_fields?: readonly CustomCardField[]; avatar?: 'initial' | 'profile' }
export type CardView = { fields?: readonly CardField[]; density?: CardDensity; show_colors?: boolean; show_tags?: boolean }
export type CardSettings = CardTemplate & CardStyle & CardView
export type ResolvedCard = { fields: CardField[]; density: CardDensity; color: CardColor; tags: CardTag[]; custom_fields: CustomCardField[]; avatar: 'initial' | 'profile' }

export function mergeCard(template: CardTemplate = {}, style: CardStyle = {}, view: CardView = {}): ResolvedCard {
  const result: ResolvedCard = {
    fields: [...(view.fields ?? style.fields ?? template.fields ?? CARD_FIELDS)],
    density: view.density ?? template.density ?? 'standard', color: style.color ?? template.color ?? 'ink',
    tags: (style.tags ?? []).map(t => ({ ...t })), custom_fields: (style.custom_fields ?? []).map(f => ({ ...f })), avatar: style.avatar ?? 'profile',
  }
  if (view.show_colors === false) { result.color = 'ink'; result.tags = result.tags.map(t => ({ ...t, color: 'ink' })) }
  if (view.show_tags === false) result.tags = []
  return result
}

export function moveField<T extends string>(fields: readonly T[], source: T, target: T): T[] {
  if (source === target || !fields.includes(source) || !fields.includes(target)) return [...fields]
  const result = fields.filter(f => f !== source)
  result.splice(result.indexOf(target), 0, source)
  return result
}

export function cardDraftError(draft: CardSettings): string | null {
  if ((draft.tags?.length ?? 0) > 8 || (draft.custom_fields?.length ?? 0) > 10) return '标签最多8个，自定义字段最多10个'
  if (draft.tags?.some(t => !t.text.trim() || [...t.text].length > 12)) return '标签不能为空且最多12字'
  if (draft.custom_fields?.some(f => !f.key.trim() || [...f.key].length > 12 || [...f.value].length > 60)) return '自定义字段键不能为空且最多12字，值最多60字'
  return null
}
