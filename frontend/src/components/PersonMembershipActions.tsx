import React, {useEffect, useState} from 'react';
import {deletePersonNode, previewNodeDeletion, updateTreeNode, type NodeDeletionPreview} from '../api/backend';
import type {PeopleAxisNode, ResponsibilityNodeCapabilities} from '../types';

/** Shared browser/APP management surface; the server is authoritative for every action. */
export function PersonMembershipActions({node,capabilities,onChanged}: {
  node:PeopleAxisNode;capabilities?:ResponsibilityNodeCapabilities;onChanged:()=>void|Promise<void>;
}) {
  const [preview,setPreview]=useState<NodeDeletionPreview|null>(null);
  const [target,setTarget]=useState('');
  const [cascade,setCascade]=useState(false);
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const [access,setAccess]=useState(!!node.responsibilityPermissions?.channel_access);
  useEffect(()=>{setPreview(null);setTarget('');setCascade(false);setError('');setAccess(!!node.responsibilityPermissions?.channel_access);},[node.id,node.responsibilityPermissions?.channel_access]);
  const run=async(action:()=>Promise<void>)=>{setBusy(true);setError('');try{await action();}catch(e){setError(e instanceof Error?e.message:'操作失败，请刷新后重试');}finally{setBusy(false);}};
  return <section aria-label="人员权限与交接" className="p-4 space-y-3 rounded-xl bg-slate-50 dark:bg-slate-900 text-sm text-slate-800 dark:text-slate-200">
    <h3 className="font-semibold">人员权限与交接</h3>
    <p className="text-xs text-slate-500">{node.nodeOrigin==='subordinate'?'次级人员：仅所属主轴负责人可以移除。默认不开放项目频道。':'主轴人员：由项目经理管理。'} 人轴最多四级。</p>
    {capabilities?.can_manage_channel_access && node.nodeOrigin==='subordinate' && <label className="flex gap-2 items-center">
      <input type="checkbox" checked={access} disabled={busy} onChange={e=>{const next=e.target.checked;void run(async()=>{await updateTreeNode(Number(node.id),{responsibility_permissions:{...node.responsibilityPermissions,channel_access:next}});setAccess(next);await onChanged();});}} />
      允许进入项目频道
    </label>}
    {capabilities?.can_delete_person && !preview && <button type="button" disabled={busy} onClick={()=>void run(async()=>{setPreview(await previewNodeDeletion(Number(node.id)));})} className="min-h-11 px-3 text-red-600 rounded-lg border border-red-200">查看移除影响与交接</button>}
    {preview && <div className="space-y-3" role="group" aria-label="移除人员确认">
      <p className="text-amber-700 dark:text-amber-300">{preview.warning}</p>
      <p>涉及 {preview.affected_user_ids.length} 位成员、{preview.descendant_count} 个下级节点、{preview.affected_task_count} 项任务、{preview.affected_evidence_count} 份材料。</p>
      {preview.descendants.length>0 && <ul className="max-h-36 overflow-y-auto text-xs">{preview.descendants.map(item=><li key={item.id}>{item.title} · {item.node_type_key==='person'?'人员':'事项'}</li>)}</ul>}
      <label className="block">交接给
        <select aria-label="交接负责人" value={target} disabled={busy} onChange={e=>{setTarget(e.target.value);setCascade(false);}} className="block w-full min-h-11 mt-1 bg-white dark:bg-slate-800 rounded-lg border border-slate-300 px-2">
          <option value="">请选择交接负责人</option>{preview.handover_candidates.map(person=><option key={person.id} value={person.id}>{person.title}</option>)}
        </select>
      </label>
      {!target && <label className="flex gap-2 text-red-600"><input type="checkbox" checked={cascade} onChange={e=>setCascade(e.target.checked)} disabled={busy}/>我已知悉：一并移除下级、将关联任务移入回收站，并撤销被移除成员的项目沟通访问权限。</label>}
      <div className="flex gap-3"><button type="button" disabled={busy||(!target&&!cascade)} className="min-h-11 px-3 bg-red-600 text-white rounded-lg disabled:opacity-40" onClick={()=>void run(async()=>{await deletePersonNode(Number(node.id),{preview_token:preview.preview_token,...(target?{handover_to_node_id:Number(target)}:{cascade:true})});setPreview(null);await onChanged();})}>{busy?'处理中…':target?'确认交接并移除':'确认级联移除'}</button>
        <button type="button" disabled={busy} onClick={()=>{setPreview(null);setCascade(false);setTarget('');}}>取消移除</button></div>
    </div>}
    {error && <p role="alert" className="text-red-600">{error}</p>}
  </section>;
}
