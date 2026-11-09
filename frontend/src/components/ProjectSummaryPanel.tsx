import React, { useCallback, useEffect, useState } from 'react';
import { listReportSummaries, publishReportSummary, type ReportSummary } from '../api/manage';

interface Props {
  projectId: number;
  /** 变化时重新读取（例如刚汇总出新版本） */
  refreshKey?: unknown;
}

const fmt = (iso?: string | null) => (iso ? iso.slice(0, 16).replace('T', ' ') : '—');

/** 项目汇总的发布状态：负责人确认发布；成员与上级在这里看到已发布版本。 */
export const ProjectSummaryPanel: React.FC<Props> = ({ projectId, refreshKey }) => {
  const [data, setData] = useState<{ items: ReportSummary[]; latest_published: ReportSummary | null; can_publish: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await listReportSummaries(projectId));
      setError(null);
    } catch (e) {
      setData(null);
      setError(e instanceof Error ? e.message : '项目汇总加载失败');
    }
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load, refreshKey]);

  const publish = async (item: ReportSummary) => {
    setBusyId(item.id);
    setNotice(null);
    try {
      await publishReportSummary(projectId, item.id);
      setNotice('已发布，项目成员和上级现在可以在这里看到这一版');
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : '发布失败');
    } finally {
      setBusyId(null);
    }
  };

  if (error && !data) {
    return <p className="text-xs text-on-surface-variant" data-testid="project-summary-error">{error}</p>;
  }
  if (!data) return null;
  const pending = data.items.filter((i) => i.status !== 'published');
  const latest = data.latest_published;

  return (
    <div className="rounded-xl border border-outline-variant/40 p-3 space-y-3" data-testid="project-summary-panel">
      <div className="text-xs font-bold text-on-surface">项目汇总发布</div>
      {notice && <div role="status" className="text-xs text-emerald-700">{notice}</div>}
      {error && <div role="alert" className="text-xs text-red-600">{error}</div>}

      {latest ? (
        <div className="rounded-lg bg-emerald-500/5 border border-emerald-500/20 p-3" data-testid="published-summary">
          <div className="text-[11px] text-on-surface-variant">
            已发布版本 #{latest.id} · {fmt(latest.published_at)}
            {latest.published_by_name ? ` · ${latest.published_by_name} 确认` : ''}
          </div>
          <pre className="mt-1 text-sm whitespace-pre-wrap font-sans leading-6">{latest.summary_text}</pre>
        </div>
      ) : (
        <p className="text-xs text-on-surface-variant">负责人还没有发布过项目汇总。</p>
      )}

      {data.can_publish && pending.length > 0 && (
        <div className="space-y-2">
          <div className="text-[11px] font-bold text-on-surface-variant">待发布</div>
          {pending.slice(0, 3).map((item) => (
            <div key={item.id} className="rounded-lg bg-surface-container-low p-3" data-testid={`pending-summary-${item.id}`}>
              <div className="flex items-center gap-2 text-[11px] text-on-surface-variant">
                <span>#{item.id} · 生成于 {fmt(item.created_at)} · 汇总了 {item.report_count} 份汇报</span>
                <button
                  type="button"
                  disabled={busyId === item.id}
                  onClick={() => void publish(item)}
                  className="ml-auto px-3 py-1 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50 cursor-pointer"
                >
                  {busyId === item.id ? '发布中…' : '确认发布'}
                </button>
              </div>
              <pre className="mt-1 text-sm whitespace-pre-wrap font-sans leading-6">{item.summary_text}</pre>
            </div>
          ))}
        </div>
      )}
      {data.can_publish && pending.length === 0 && !latest && (
        <p className="text-xs text-on-surface-variant">先点「汇总项目汇报」生成一版，再在这里确认发布。</p>
      )}
    </div>
  );
};
