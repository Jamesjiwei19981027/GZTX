import React from 'react'
import { Check, Circle, FileText, Flag } from 'lucide-react'
import type { AxisWorkItem, Language, TeamMember } from '../../types'

export function AxisOriginBadge({origin, lang}: {origin?: 'project' | 'subordinate'; lang: Language}) {
  const subordinate = origin === 'subordinate'
  return <span className={`axis-origin-badge${subordinate ? ' is-subordinate' : ''}`}>{lang === 'zh' ? subordinate ? '下级自建' : '项目成员' : subordinate ? 'Self-added' : 'Project member'}</span>
}

export function AxisAvatar({ person, small = false }: { person: Pick<TeamMember, 'name' | 'avatar'>; small?: boolean }) {
  return <span className={`axis-avatar${small ? ' axis-avatar-small' : ''}`}>
    {person.avatar ? <img src={person.avatar} alt="" draggable={false} onError={e => { e.currentTarget.hidden = true }} /> : null}
    <span aria-hidden="true">{person.name.slice(0, 1)}</span>
  </span>
}

export function AxisProgress({ value, label = false }: { value: number; label?: boolean }) {
  const percent = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0))
  return <div className="axis-progress-line">
    <div className="axis-progress" role="progressbar" aria-label="进度" aria-valuemin={0} aria-valuemax={100} aria-valuenow={percent}>
      <span style={{ width: `${percent}%` }} />
    </div>
    {label && <span className="axis-percent">{percent}%</span>}
  </div>
}

export function AxisMatter({ item, lang }: { item: AxisWorkItem; lang: Language }) {
  const done = item.status === 'Done'
  const active = item.status === 'In Progress'
  const Icon = done ? Check : item.type === 'milestone' ? Flag : active ? FileText : Circle
  return <div className="axis-matter">
    <span className={`axis-matter-icon ${done ? 'is-done' : ''}`}><Icon size={17} /></span>
    <span className="axis-matter-name">{item.title}</span>
    <span className={`axis-status ${done ? 'is-done' : active ? 'is-active' : ''}`}>
      {lang === 'zh' ? done ? '已完成' : active ? '进行中' : '待开始' : item.status}
    </span>
  </div>
}
