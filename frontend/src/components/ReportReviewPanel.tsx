import React, { useEffect, useRef, useState } from 'react';
import { reviewReport, type AgentReport } from '../api/reports';

export const ReportReviewPanel: React.FC<{ report: AgentReport; onSaved?: (report: AgentReport) => void }> = ({ report, onSaved }) => {
  const [saved, setSaved] = useState<AgentReport | null>(null);
  const [comment, setComment] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const generation = useRef(0);
  useEffect(() => {
    generation.current++;
    setSaved(null); setComment(''); setNotice(''); setBusy(false);
    return () => { generation.current++; };
  }, [report.id, report.can_review]);
  const current = saved || report;
  const save = async (decision: 'approved' | 'returned') => {
    if (busy || !current.can_review) return;
    if (!comment.trim() || comment.trim().length > 2000) { setNotice('请填写不超过 2000 字的核验意见'); return; }
    const version = generation.current;
    setBusy(true); setNotice('');
    try {
      const result = await reviewReport(report.id, decision, comment);
      if (version !== generation.current) return;
      setSaved({ ...current, ...result }); setNotice('核验意见已保存并通知成员'); onSaved?.({ ...current, ...result });
    } catch (error) {
      if (version === generation.current) setNotice(error instanceof Error ? error.message : '核验意见保存失败，请重试');
    } finally { if (version === generation.current) setBusy(false); }
  };
  if (!current.can_review && !current.review) return null;
  return <section aria-label={`汇报 ${report.id} 核验`} className="rounded-xl border border-outline-variant dark:border-outline-variant p-4 space-y-3 text-sm" onClick={event => event.stopPropagation()}>
    <h3 className="font-medium tabular-nums">汇报核验意见</h3>
    {current.review && <div><p className="font-normal tabular-nums">{current.review.decision === 'approved' ? '核验通过' : '退回修改'}</p><p className="whitespace-pre-wrap">{current.review.comment}</p></div>}
    {notice && <p role="status">{notice}</p>}
    {current.can_review && <>
      <label className="block space-y-1"><span>核验意见</span><textarea value={comment} disabled={busy} maxLength={2000} onChange={event => setComment(event.target.value)} rows={3} className="w-full p-3 rounded-lg border border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container-lowest text-on-surface dark:text-on-surface" /></label>
      <div className="flex flex-wrap gap-2"><button type="button" disabled={busy} onClick={() => void save('approved')} className="min-h-[44px] px-4 rounded-lg bg-primary text-on-primary disabled:opacity-50">{busy ? '正在保存…' : '核验通过'}</button><button type="button" disabled={busy} onClick={() => void save('returned')} className="min-h-[44px] px-4 rounded-lg border border-outline-variant disabled:opacity-50">退回修改</button></div>
    </>}
  </section>;
};
