import React, { useEffect, useState } from 'react';
import { createDirectConversation, listWorkContacts, type WorkContact } from '../api/shell';

export function WorkContactPicker({ companyId, projectId, onCreated }: {
  companyId: number; projectId?: number;
  onCreated: (id: number, title: string) => void;
}) {
  const [contacts, setContacts] = useState<WorkContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState('');
  useEffect(() => {
    let active = true;
    setLoading(true);
    setContacts([]); setError('');
    listWorkContacts(companyId, projectId).then(result => { if (active) setContacts(result.items); })
      .catch(err => { if (active) setError(err instanceof Error ? err.message : '联系人加载失败'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [companyId, projectId]);
  const start = async (contact: WorkContact) => {
    setCreating(true); setError('');
    try {
      const result = await createDirectConversation(companyId, { member_user_ids: [contact.id], project_id: projectId });
      onCreated(result.id, contact.name);
    } catch (err) { setError(err instanceof Error ? err.message : '创建会话失败'); }
    finally { setCreating(false); }
  };
  return <div className="p-4 space-y-3 text-slate-900 dark:text-slate-100">
    <p className="text-xs text-slate-500 dark:text-slate-400">工作联系人包含直属上下级及同级同事，项目经理可主动联系项目成员。其他协作请使用项目频道。</p>
    <input aria-label="搜索工作联系人" value={query} onChange={e => setQuery(e.target.value)} placeholder="搜索工作联系人"
      className="w-full rounded-xl p-3 border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900" />
    {error && <p role="alert" className="text-red-600">{error}</p>}
    {loading ? <p role="status">正在加载联系人…</p> : !contacts.length ? <p>暂无可联系人员，请通过项目频道沟通。</p> :
      contacts.filter(c => c.name.includes(query.trim())).map(c => <button key={c.id} type="button" disabled={creating}
        onClick={() => void start(c)} className="w-full min-h-[48px] rounded-xl p-3 text-left bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 disabled:opacity-50">{c.name}</button>)}
  </div>;
}
