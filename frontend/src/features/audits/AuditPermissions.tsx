import React, { useEffect, useRef, useState } from 'react'
import { getAuditOptions, setAuditPermission, type AuditOptions } from '../../api/shell'
import './audits.css'

export const AuditPermissions: React.FC<{ projectId: number; disabled?: boolean }> = ({ projectId, disabled = false }) => {
  const [options, setOptions] = useState<AuditOptions | null>(null)
  const [error, setError] = useState('')
  const [saving, setSaving] = useState(false)
  const [reload, setReload] = useState(0)
  const epoch = useRef(0)
  useEffect(() => {
    const ticket = ++epoch.current
    setOptions(null); setError(''); setSaving(false)
    void getAuditOptions(projectId).then(data => { if (ticket === epoch.current) setOptions(data) })
      .catch(e => { if (ticket === epoch.current) setError(e instanceof Error ? e.message : '权限加载失败') })
    return () => { epoch.current++ }
  }, [projectId, reload])
  async function save(nodeId: number, value: string) {
    const ticket = epoch.current
    setSaving(true); setError('')
    try {
      const data = await setAuditPermission(projectId, nodeId, value === 'default' ? null : value === 'true')
      if (ticket === epoch.current) setOptions(data)
    } catch (e) { if (ticket === epoch.current) setError(e instanceof Error ? e.message : '权限保存失败') }
    finally { if (ticket === epoch.current) setSaving(false) }
  }
  return <section className="audit-panel audit-permissions" aria-label="下属审计权限">
    <h3>下属审计权限</h3>
    <p className="audit-muted">第 1、2 层人员默认打开，第 3 层及更深层默认关闭；打开后可审其整棵下属子树</p>
    {error && <p role="alert" className="audit-error">{error}{!options && <button type="button" onClick={() => setReload(n => n + 1)}>重试</button>}</p>}
    {!options && !error && <p>正在加载人员权限…</p>}
    {options && !options.can_manage && <p className="audit-muted">仅项目负责人或创建者可修改</p>}
    {options?.can_manage && options.people.length === 0 && <p className="audit-muted">暂无人员节点</p>}
    {options?.can_manage && options.people.map(person => <label className="audit-permission-row" key={person.node_id}>
      <span>{person.title}<small>第 {person.person_depth} 层 · 当前{person.effective ? '打开' : '关闭'}</small></span>
      <select aria-label={`${person.title}的下属审计权限`} value={person.allow_audit_subordinates === null ? 'default' : String(person.allow_audit_subordinates)} disabled={disabled || saving}
        onChange={e => void save(person.node_id, e.target.value)}>
        <option value="default">按层级默认</option><option value="true">打开</option><option value="false">关闭</option>
      </select>
    </label>)}
    {saving && <p role="status">正在保存…</p>}
  </section>
}
