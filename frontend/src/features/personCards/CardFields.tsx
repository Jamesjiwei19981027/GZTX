import React from 'react'
import type { PeopleAxisNode } from '../../types'
import { cardOverdueCount } from '../../api/mappers'
import { CARD_PALETTE, type ResolvedCard, type CardTag } from './model'

export function CardTagLabel({ tag }: { tag: CardTag; key?: string | number }) {
  return <span className="person-card-tag" style={{ '--card-tag-color': CARD_PALETTE[tag.color]?.color ?? CARD_PALETTE.ink.color } as React.CSSProperties}>{tag.text}</span>
}
export function FoldedCardLabel({ node, config }: { node: PeopleAxisNode; config: ResolvedCard }) {
  return <span className="person-card-folded-label"><i className="card-color-dot" style={{ backgroundColor: CARD_PALETTE[config.color].color }} aria-hidden="true" /><strong>{node.person.name}</strong>{config.tags[0] && <CardTagLabel tag={config.tags[0]} />}</span>
}
export function CardFields({ node, config }: { node: PeopleAxisNode; config: ResolvedCard }) {
  const tasks = node.workItems
  const percent = tasks.length ? Math.round(tasks.reduce((sum, t) => sum + (t.status === 'Done' ? 100 : t.progress), 0) / tasks.length) : 0
  const due = tasks.filter(t => t.status !== 'Done' && t.progress < 100 && t.dueDate).map(t => t.dueDate).sort()[0]
  const recent = tasks.filter(t => t.lastProgressAt).sort((a, b) => (b.lastProgressAt || '').localeCompare(a.lastProgressAt || ''))[0]
  const notes = (node.cardDescription || '').split('\n').filter(line => !line.startsWith('@axis-person ')).join('\n')
  const src = node.person.avatar && (/^https?:\/\//i.test(node.person.avatar) || /^\/(?!\/)/.test(node.person.avatar)) ? node.person.avatar : undefined
  const values: Record<string, React.ReactNode> = {
    avatar: <span className="person-card-avatar">{config.avatar === 'profile' && src ? <img src={src} alt="" onError={e => { e.currentTarget.style.display = 'none' }} /> : null}<span>{[...node.person.name][0] || '人'}</span></span>,
    name: <strong className="person-card-name">{node.person.name}</strong>, role: node.roleTitle || '未填写职位', department: node.person.department || '未填写部门',
    description: notes || '暂无职责描述', task_count: `任务 ${tasks.length}`, overdue_count: `逾期 ${cardOverdueCount(tasks, new Date())}`,
    progress: <span className="person-card-progress"><span>进度 {percent}%</span><progress max={100} value={percent} /></span>,
    recent_progress: recent ? `${recent.title} · ${recent.lastProgressText || `${recent.progress}%`}` : '暂无进展',
    next_due: due ? `最近截止 ${due}` : '暂无截止日期',
    tags: config.tags.map((tag, i) => <CardTagLabel key={i} tag={tag} />),
    custom_fields: config.custom_fields.map((field, i) => <div className="person-card-custom-value" key={i}><span>{field.key}</span><span>{field.value || '—'}</span></div>),
  }
  return <div role="group" aria-label={`人员卡片 ${node.person.name}`} className={`person-card-fields density-${config.density}`} style={{ '--card-accent': CARD_PALETTE[config.color].color } as React.CSSProperties} data-testid="person-card-fields"><div className="person-card-color"><i className="card-color-dot" aria-hidden="true" /></div>{config.fields.map(field => <div key={field} className={`person-card-field field-${field}`} data-field={field}>{values[field]}</div>)}</div>
}
