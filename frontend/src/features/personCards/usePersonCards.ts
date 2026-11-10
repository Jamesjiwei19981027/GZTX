import { useCallback, useEffect, useRef, useState } from 'react'
import { loadCardViews } from './api'
import { mergeCard, type CardTemplate, type CardView } from './model'
import type { PeopleAxisNode } from '../../types'
const EMPTY = {}

export function usePersonCards(projectId: number) {
  const [state, setState] = useState<{ id: number; template: CardTemplate; view: CardView }>({ id: projectId, template: {}, view: {} })
  const touched = useRef(false)
  useEffect(() => {
    touched.current = false
    let active = true
    if (projectId > 0) void loadCardViews().then(result => {
      if (active && !touched.current) setState(cur => ({ id: projectId, template: cur.id === projectId ? cur.template : {}, view: result.ui?.person_cards?.[String(projectId)] ?? {} }))
    }).catch(() => {})
    return () => { active = false }
  }, [projectId])
  const template = state.id === projectId ? state.template : EMPTY
  const view = state.id === projectId ? state.view : EMPTY
  const setTemplate = useCallback((value: CardTemplate) => setState(cur => ({ id: projectId, template: value, view: cur.id === projectId ? cur.view : {} })), [projectId])
  const setView = (value: CardView) => { touched.current = true; setState(cur => ({ id: projectId, view: value, template: cur.id === projectId ? cur.template : {} })) }
  const decorate = (nodes: PeopleAxisNode[]) => nodes.map(n => ({ ...n, cardConfig: mergeCard(template, n.cardStyle, view) }))
  return { template, view, setTemplate, setView, decorate }
}
