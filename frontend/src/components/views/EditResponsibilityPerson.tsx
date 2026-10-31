import React, { useEffect, useState } from 'react'
import type { Language, TeamMember } from '../../types'
import { ResponsibilityPermissionFields, defaultResponsibilityPermissions } from './ResponsibilityPermissionFields'
import { getTreeNode, updateTreeNode, type BackendTreeNode } from '../../api/backend'
import { mapTreeToPeopleAxis } from '../../api/mappers'
import { withAxisPersonMetadata } from '../../api/axisPerson'

export function EditResponsibilityPerson({ nodeId, members, lang, canManagePermissions, canManageAssignees = true, onSaved }: {
  nodeId: number; members: TeamMember[]; lang: Language; canManagePermissions: boolean; canManageAssignees?:boolean; onSaved: () => Promise<void>
}) {
  const zh = lang === 'zh'
  const [raw, setRaw] = useState<BackendTreeNode | null>(null)
  const [memberId, setMemberId] = useState('')
  const [name, setName] = useState('')
  const [role, setRole] = useState('')
  const [department, setDepartment] = useState('')
  const [permissions, setPermissions] = useState(defaultResponsibilityPermissions)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let cancelled = false
    setRaw(null); setError('')
    void getTreeNode(nodeId).then(node => {
      if (cancelled) return
      const mapped = mapTreeToPeopleAxis([node])[0]
      const primary = node.assignees?.find(a => a.role_key === 'primary') || node.assignees?.[0]
      setRaw(node); setMemberId(primary ? String(primary.user_id) : '')
      setName(mapped.person.name); setRole(mapped.roleTitle); setDepartment(mapped.person.department || '')
      setPermissions({...defaultResponsibilityPermissions,...node.responsibility_permissions})
    }).catch(e => { if (!cancelled) setError(e instanceof Error ? e.message : '加载失败') })
    return () => { cancelled = true }
  }, [nodeId, attempt])
  const save = async (event: React.FormEvent) => {
    event.preventDefault()
    if (!raw || saving) return
    setSaving(true); setError('')
    try {
      const primary = raw.assignees?.find(a => a.role_key === 'primary') || raw.assignees?.[0]
      const selected = members.find(member => member.id === memberId)
      const originalId = primary ? String(primary.user_id) : ''
      const assignees = !memberId ? [] : memberId === originalId
        ? (raw.assignees || []).map(a => ({ user_id: a.user_id, role_key: a.role_key || 'collaborator' }))
        : [
          ...(memberId ? [{ user_id: Number(memberId), role_key: 'primary' }] : []),
          ...(raw.assignees || []).filter(a => a.user_id !== primary?.user_id && String(a.user_id) !== memberId)
            .map(a => ({ user_id: a.user_id, role_key: a.role_key || 'collaborator' })),
        ]
      const personName = (memberId ? selected?.name || name : name).trim()
      await updateTreeNode(nodeId, {
        title: personName,
        description: withAxisPersonMetadata(raw.description, { name: personName, roleTitle: role.trim(), department: department.trim() }),
        ...(canManageAssignees ? {assignees} : {}),
        ...(canManagePermissions ? { responsibility_permissions: permissions } : {}),
      })
      await onSaved()
    } catch (e) { setError(e instanceof Error ? e.message : (zh ? '保存失败，请重试' : 'Save failed')) }
    finally { setSaving(false) }
  }
  return <form className="axis-evidence-form axis-person-edit-form" onSubmit={save}>
    <h2>{zh ? '编辑人员' : 'Edit person'}</h2>
    <p className="axis-muted">{zh ? '修改此项目中的人员与岗位，下级和事项继续保留。' : 'Update this project role while keeping subordinates and work items.'}</p>
    {error && <p role="alert" className="axis-form-error">{error}</p>}
    {!raw ? error ? <button type="button" className="axis-secondary-button" onClick={() => setAttempt(value => value + 1)}>{zh ? '重试加载' : 'Retry'}</button>
      : <p role="status">{zh ? '正在加载人员…' : 'Loading person…'}</p> : <>
      <label>{zh ? '关联成员' : 'Linked member'}<select value={memberId} disabled={saving || !canManageAssignees} onChange={e => { setMemberId(e.target.value); const member = members.find(m => m.id === e.target.value); if (member) setName(member.name) }}>
        <option value="">{zh ? '手动人员（不关联账号）' : 'Manual person (no account)'}</option>
        {members.map(member => <option key={member.id} value={member.id}>{member.name}</option>)}
        {memberId && !members.some(member => member.id === memberId) && <option value={memberId}>{name}</option>}
      </select></label>
      <label>{zh ? '人员姓名' : 'Name'}<input required value={name} disabled={!!memberId || saving} onChange={e => setName(e.target.value)} /></label>
      <label>{zh ? '项目岗位' : 'Project role'}<input required value={role} disabled={saving} onChange={e => setRole(e.target.value)} /></label>
      <label>{zh ? '所属部门' : 'Department'}<input value={department} disabled={saving} onChange={e => setDepartment(e.target.value)} /></label>
      {canManagePermissions ? <ResponsibilityPermissionFields value={permissions} onChange={setPermissions} lang={lang} disabled={saving} />
        : <p className="axis-muted">{zh ? '节点权限由直属上级或项目管理人员配置。' : 'Node permissions are configured by your manager or project administrator.'}</p>}
      <button className="axis-primary-button" type="submit" disabled={saving}>{zh ? saving ? '保存中…' : '保存修改' : saving ? 'Saving…' : 'Save changes'}</button>
    </>}
  </form>
}
