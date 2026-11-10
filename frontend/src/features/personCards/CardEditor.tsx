import React, { useEffect, useId, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { PeopleAxisNode } from '../../types'
import { useOptionalMobileNavigation } from '../../mobile/navigation/MobileNavigationProvider'
import { CardFields } from './CardFields'
import { CARD_FIELDS, CARD_PALETTE, FIELD_LABELS, cardDraftError, mergeCard, moveField, type CardField, type CardSettings, type CardStyle, type CardTemplate } from './model'

export type CardEditorProps = {
  key?: string | number
  mode: 'template' | 'style' | 'view'; initial: CardSettings; template?: CardTemplate; style?: CardStyle
  node?: PeopleAxisNode; onSave: (value: CardSettings) => Promise<unknown>; onClose: () => void
  onDirty?: () => void
}
const TITLES = { template: '卡片模板', style: '编辑卡片', view: '显示设置' }
const PREVIEW_NODE: PeopleAxisNode = { id: 'preview', person: { id: '', name: '姓名', role: '成员', department: '部门', avatar: '' }, roleTitle: '角色/职位', orderOnAxis: 0, workItems: [] }
const short = (value: string, limit: number) => [...value].slice(0, limit).join('')

export function CardEditorForm(p: CardEditorProps) {
  const [draft, setDraft] = useState<CardSettings>(() => structuredClone(p.initial))
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const mounted = useRef(true)
  useEffect(() => { mounted.current = true; return () => { mounted.current = false } }, [])
  const config = p.mode === 'template' ? mergeCard(draft) : p.mode === 'style' ? mergeCard(p.template, draft) : mergeCard(p.template, p.style, draft)
  const inherited = p.mode === 'template' ? mergeCard() : p.mode === 'style' ? mergeCard(p.template) : mergeCard(p.template, p.style)
  const fields = draft.fields ?? inherited.fields
  const [order, setOrder] = useState<CardField[]>(() => [...fields, ...CARD_FIELDS.filter(f => !fields.includes(f))])
  const update = (patch: Partial<CardSettings>) => { setDraft(cur => ({ ...cur, ...patch })); setError(''); p.onDirty?.() }
  const clear = (key: keyof CardSettings) => { setDraft(cur => { const next = { ...cur }; delete next[key]; return next }); p.onDirty?.() }
  const reorder = (source: CardField, target: CardField) => {
    const next = moveField(order, source, target)
    setOrder(next); update({ fields: next.filter(f => fields.includes(f)) })
  }
  const save = async (value: CardSettings) => {
    const message = cardDraftError(value)
    if (message) { setError(message); return }
    setBusy(true); setError('')
    try { await p.onSave(value); if (mounted.current) p.onClose() }
    catch (e) { if (mounted.current) setError(e instanceof Error ? e.message : '保存失败，请重试') }
    finally { if (mounted.current) setBusy(false) }
  }
  return <form className="person-card-editor-form" onSubmit={e => { e.preventDefault(); void save(draft) }}>
    <header><h2>{TITLES[p.mode]}</h2><p>{p.mode === 'view' ? '只影响你在当前项目看到的卡片' : p.mode === 'template' ? '对项目全员生效，个人覆盖优先' : `只修改${p.node?.person.name || '此人员'}的项目卡片`}</p></header>
    <div className="person-card-editor-grid"><fieldset disabled={busy}>
      <section><h3>显示字段与顺序</h3>
        <label className="card-check"><input type="checkbox" checked={draft.fields !== undefined} onChange={e => e.target.checked ? update({ fields: [...inherited.fields] }) : clear('fields')} />自定义显示字段</label>
        <p className="card-help">未开启时继承{p.mode === 'template' ? '系统默认' : p.mode === 'style' ? '项目模板' : '人员与项目设置'}。拖动排序，或用上移、下移按钮调整</p>
        <ol className="card-field-order">{order.map((field, index) => <li key={field} data-testid={`card-field-${field}`} draggable={draft.fields !== undefined} onDragStart={e => e.dataTransfer.setData('text/plain', field)} onDragOver={e => e.preventDefault()} onDrop={e => { e.preventDefault(); const source = e.dataTransfer.getData('text/plain') as CardField; if (CARD_FIELDS.includes(source)) reorder(source, field) }}>
          <span aria-hidden="true" className="card-drag-handle">⠿</span><label><input type="checkbox" disabled={draft.fields === undefined} checked={fields.includes(field)} onChange={e => update({ fields: order.filter(f => f === field ? e.target.checked : fields.includes(f)) })} />{FIELD_LABELS[field]}</label>
          <button type="button" aria-label={`上移${FIELD_LABELS[field]}`} disabled={draft.fields === undefined || index === 0} onClick={() => reorder(field, order[index - 1])}>↑</button>
          <button type="button" aria-label={`下移${FIELD_LABELS[field]}`} disabled={draft.fields === undefined || index === order.length - 1} onClick={() => reorder(order[index + 1], field)}>↓</button>
        </li>)}</ol>
      </section>
      {p.mode !== 'style' && <label className="card-setting-label">卡片密度<select aria-label="卡片密度" value={draft.density ?? ''} onChange={e => e.target.value ? update({ density: e.target.value as CardSettings['density'] }) : clear('density')}><option value="">继承默认密度</option><option value="compact">紧凑</option><option value="standard">标准</option><option value="detailed">详细</option></select></label>}
      {p.mode !== 'view' && <label className="card-setting-label">{p.mode === 'template' ? '默认强调色' : '卡片颜色'}<select aria-label="卡片颜色" value={draft.color ?? ''} onChange={e => e.target.value ? update({ color: e.target.value as CardSettings['color'] }) : clear('color')}><option value="">继承默认颜色</option>{Object.entries(CARD_PALETTE).map(([key, v]) => <option key={key} value={key}>{v.name}</option>)}</select></label>}
      {p.mode === 'view' && <section><h3>人员设置</h3><label className="card-check"><input type="checkbox" checked={draft.show_colors !== false} onChange={e => update({ show_colors: e.target.checked })} />显示别人设置的颜色</label><label className="card-check"><input type="checkbox" checked={draft.show_tags !== false} onChange={e => update({ show_tags: e.target.checked })} />显示别人设置的标签</label></section>}
      {p.mode === 'style' && <>
        <label className="card-setting-label">头像<select aria-label="头像方式" value={draft.avatar ?? ''} onChange={e => e.target.value ? update({ avatar: e.target.value as CardSettings['avatar'] }) : clear('avatar')}><option value="">默认头像</option><option value="initial">名字首字</option><option value="profile">已有个人头像</option></select><span className="card-help">个人头像可在“我的”资料中上传</span></label>
        <section><h3>标签 · {(draft.tags ?? []).length}/8</h3>{(draft.tags ?? []).map((tag, i) => <div key={i} className="card-edit-row"><input aria-label={`标签${i + 1}`} placeholder="标签" value={tag.text} onChange={e => update({ tags: (draft.tags ?? []).map((t, j) => i === j ? { ...t, text: short(e.target.value, 12) } : t) })} /><select aria-label={`标签${i + 1}颜色`} value={tag.color} onChange={e => update({ tags: (draft.tags ?? []).map((t, j) => i === j ? { ...t, color: e.target.value as typeof tag.color } : t) })}>{Object.entries(CARD_PALETTE).map(([key, v]) => <option key={key} value={key}>{v.name}</option>)}</select><button type="button" aria-label={`删除标签${i + 1}`} onClick={() => update({ tags: draft.tags?.filter((_, j) => j !== i) })}>移除</button></div>)}<button type="button" disabled={(draft.tags?.length ?? 0) >= 8} onClick={() => update({ tags: [...(draft.tags ?? []), { text: '', color: 'ink' }] })}>添加标签</button></section>
        <section><h3>自定义字段 · {(draft.custom_fields ?? []).length}/10</h3>{(draft.custom_fields ?? []).map((field, i) => <div key={i} className="card-edit-row custom-row"><input aria-label={`字段${i + 1}名称`} placeholder="名称" value={field.key} onChange={e => update({ custom_fields: (draft.custom_fields ?? []).map((f, j) => i === j ? { ...f, key: short(e.target.value, 12) } : f) })} /><input aria-label={`字段${i + 1}值`} placeholder="值" value={field.value} onChange={e => update({ custom_fields: (draft.custom_fields ?? []).map((f, j) => i === j ? { ...f, value: short(e.target.value, 60) } : f) })} /><button type="button" aria-label={`删除字段${i + 1}`} onClick={() => update({ custom_fields: draft.custom_fields?.filter((_, j) => j !== i) })}>移除</button></div>)}<button type="button" disabled={(draft.custom_fields?.length ?? 0) >= 10} onClick={() => update({ custom_fields: [...(draft.custom_fields ?? []), { key: '', value: '' }] })}>添加字段</button><p className="card-help">名称最多12字，值最多60字，可留空</p></section>
      </>}
    </fieldset><aside className="person-card-preview"><h3>{p.node ? '实时预览' : '示例预览'}</h3><div className="person-card-preview-surface" style={{ '--card-accent': CARD_PALETTE[config.color].color } as React.CSSProperties}><i className="card-color-dot" aria-hidden="true" /><CardFields node={p.node ?? PREVIEW_NODE} config={config} /></div>{p.mode === 'style' && <p className="card-help">预览使用此卡片设置。个人显示偏好仍会优先覆盖</p>}</aside></div>
    {error && <p role="alert" className="card-editor-error">{error}</p>}
    <footer><button type="button" disabled={busy} onClick={() => void save({})}>{p.mode === 'style' ? '恢复为项目默认' : '恢复默认'}</button><button type="button" disabled={busy} onClick={p.onClose}>取消</button><button className="card-save" type="submit" disabled={busy}>{busy ? '保存中…' : '保存'}</button></footer>
  </form>
}

export function CardEditor(p: CardEditorProps) {
  const nav = useOptionalMobileNavigation()
  const id = useId()
  const close = useRef(p.onClose); close.current = p.onClose
  const panel = useRef<HTMLDivElement>(null)
  const title = TITLES[p.mode]
  const openOverlay = nav?.openOverlay, unregister = nav?.unregisterOverlay
  useEffect(() => {
    openOverlay?.({ id, type: 'sheet', title, onDismiss: () => close.current() })
    return () => unregister?.(id)
  }, [id, title, openOverlay, unregister])
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden'; panel.current?.focus()
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close.current(); return }
      if (e.key !== 'Tab') return
      const elements = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), select:not(:disabled), [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length)
      const first = elements[0], last = elements.at(-1)
      if (!first) { e.preventDefault(); return }
      if (e.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { e.preventDefault(); last?.focus() }
      if (!e.shiftKey && (document.activeElement === last || document.activeElement === panel.current)) { e.preventDefault(); first.focus() }
    }
    document.addEventListener('keydown', handleKey, true)
    return () => { document.body.style.overflow = overflow; document.removeEventListener('keydown', handleKey, true); if (previous?.isConnected) previous.focus() }
  }, [])
  return createPortal(<div className="person-card-editor-layer"><div className="person-card-editor-backdrop" onClick={p.onClose} /><div className="person-card-editor" role="dialog" aria-modal="true" aria-label={title} ref={panel} tabIndex={-1}><button className="card-editor-close" aria-label={`关闭${title}`} onClick={p.onClose}>关闭</button><CardEditorForm {...p} onDirty={() => openOverlay?.({ id, type: 'sheet', title, dirty: true, onDismiss: () => close.current() })} /></div></div>, document.body)
}
