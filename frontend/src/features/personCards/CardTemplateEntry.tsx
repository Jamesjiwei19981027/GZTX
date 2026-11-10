import React, { useEffect, useState } from 'react'
import { getProject, getProjectTree } from '../../api/backend'
import { mapTreeToPeopleAxis } from '../../api/mappers'
import type { PeopleAxisNode } from '../../types'
import { CardEditor } from './CardEditor'
import { saveCardTemplate } from './api'
import type { CardTemplate } from './model'

export function CardTemplateEntry({ projectId, disabled, onChanged }: { projectId: number; disabled?: boolean; onChanged?: () => void }) {
  const [data, setData] = useState<{ id: number; template: CardTemplate; allowed: boolean; node?: PeopleAxisNode } | null>(null)
  const [open, setOpen] = useState(false)
  const [error, setError] = useState('')
  useEffect(() => {
    let active = true
    setOpen(false); setData(null); setError('')
    void Promise.all([getProject(projectId), getProjectTree(projectId)]).then(([p, tree]) => {
      if (active) setData({ id: projectId, template: p.card_template_json ?? {}, allowed: tree.can_edit_card_template === true && p.status !== 'archived', node: mapTreeToPeopleAxis(tree.nodes)[0] })
    }).catch(e => { if (active) setError(e instanceof Error ? e.message : '模板加载失败') })
    return () => { active = false }
  }, [projectId])
  return <><button type="button" className="card-template-entry" disabled={disabled || !data?.allowed || data.id !== projectId} onClick={() => setOpen(true)}>卡片模板<span>字段、密度与默认颜色 →</span></button>{error && <p role="alert">{error}</p>}{open && data?.id === projectId && <CardEditor key={projectId} mode="template" initial={data.template} node={data.node} onClose={() => setOpen(false)} onSave={async value => { await saveCardTemplate(projectId, value); setData(cur => cur?.id === projectId ? { ...cur, template: value } : cur); onChanged?.() }} />}</>
}
