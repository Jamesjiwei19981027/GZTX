import type { Language, ResponsibilityPermissions } from '../../types'

export const defaultResponsibilityPermissions: ResponsibilityPermissions = {
  evidence_submit: 'inherit', allow_add_subordinates: true, allow_add_work_items: true,
}

export function ResponsibilityPermissionFields({value, onChange, lang, disabled = false}: {
  value: ResponsibilityPermissions; onChange: (value: ResponsibilityPermissions) => void; lang: Language; disabled?: boolean
}) {
  const zh = lang === 'zh'
  return <fieldset className="axis-permission-fields" disabled={disabled}>
    <legend>{zh ? '节点权限' : 'Node permissions'}</legend>
    <label>{zh ? '材料提交范围' : 'Evidence submission'}<select value={value.evidence_submit} onChange={event => onChange({...value,evidence_submit:event.target.value as ResponsibilityPermissions['evidence_submit']})}>
      <option value="inherit">{zh ? '沿用上级与项目规则' : 'Inherit parent and project rules'}</option>
      <option value="members">{zh ? '项目成员（受上级限制）' : 'Project members, within parent limits'}</option>
      <option value="responsible">{zh ? '负责此分支的人员及上级' : 'Branch owners and their managers'}</option>
      <option value="disabled">{zh ? '禁止提交材料' : 'No evidence submissions'}</option>
    </select></label>
    <label className="axis-permission-toggle"><span>{zh ? '允许负责人新增下级' : 'Allow owners to add subordinates'}</span><input type="checkbox" checked={value.allow_add_subordinates} onChange={event => onChange({...value,allow_add_subordinates:event.target.checked})} /></label>
    <label className="axis-permission-toggle"><span>{zh ? '允许负责人新增事项' : 'Allow owners to add work items'}</span><input type="checkbox" checked={value.allow_add_work_items} onChange={event => onChange({...value,allow_add_work_items:event.target.checked})} /></label>
    <p className="axis-muted">{zh ? '下级权限同时受上级限制；项目管理人员可维护项目结构。' : 'Parent restrictions also apply. Project managers administer the project structure.'}</p>
  </fieldset>
}
