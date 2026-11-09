import React, { useEffect, useState } from 'react';
import { getProject, type BackendProject } from '../api/backend';
import {
  REPORT_PERIOD_LABELS,
  WEEKDAY_LABELS,
  archiveProjectRequest,
  notifyProjectsChanged,
  saveReportPolicy,
  unarchiveProjectRequest,
  updateProjectInfo,
  type ReportPeriod,
  type ReportPolicySettings,
} from '../api/manage';
import { listProjectReportPolicies } from '../api/reports';
import type { TeamMember } from '../types';

interface Props {
  projectId: number;
  /** 项目负责人 / 超管才可改；其余人只读 */
  canManage: boolean;
  /** 可选作新负责人的项目成员 */
  members: TeamMember[];
  onClose: () => void;
  /** 改名 / 换负责人 / 归档后通知页面重新加载 */
  onChanged?: () => void;
}

const DEFAULT_POLICY: Omit<ReportPolicySettings, 'id'> = {
  enabled: true,
  period: 'weekly',
  deadline_time: '18:00',
  weekday: 5,
  month_day: 25,
  remind: true,
};

/** 电脑端「项目设置」：改名、换负责人、归档 / 取消归档、汇报策略。 */
export const ProjectSettingsModal: React.FC<Props> = ({ projectId, canManage, members, onClose, onChanged }) => {
  const [project, setProject] = useState<BackendProject | null>(null);
  const [name, setName] = useState('');
  const [pmId, setPmId] = useState('');
  const [policy, setPolicy] = useState<Omit<ReportPolicySettings, 'id'>>(DEFAULT_POLICY);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);

  const archived = project?.status === 'archived';

  useEffect(() => {
    let cancelled = false;
    void Promise.all([getProject(projectId), listProjectReportPolicies(projectId).catch(() => ({ items: [] }))])
      .then(([p, pol]) => {
        if (cancelled) return;
        setProject(p);
        setName(p.name);
        setPmId(p.pm_user_id != null ? String(p.pm_user_id) : '');
        const first = (pol.items || []).find((i) => i.enabled) || pol.items?.[0];
        if (first) {
          setPolicy({
            enabled: first.enabled,
            period: first.period ?? DEFAULT_POLICY.period,
            deadline_time: first.deadline_time ?? DEFAULT_POLICY.deadline_time,
            weekday: first.weekday ?? DEFAULT_POLICY.weekday,
            month_day: first.month_day ?? DEFAULT_POLICY.month_day,
            remind: first.remind ?? DEFAULT_POLICY.remind,
          });
        }
      })
      .catch((e) => !cancelled && setNotice({ tone: 'error', text: e instanceof Error ? e.message : '项目信息加载失败' }));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const run = async (job: () => Promise<unknown>, okText: string, refresh = true) => {
    setBusy(true);
    setNotice(null);
    try {
      await job();
      if (refresh) {
        const fresh = await getProject(projectId);
        setProject(fresh);
        notifyProjectsChanged();
        onChanged?.();
      }
      setNotice({ tone: 'ok', text: okText });
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof Error ? e.message : '操作失败' });
    } finally {
      setBusy(false);
      setConfirmArchive(false);
    }
  };

  const saveInfo = () => {
    const body: { name?: string; pm_user_id?: number } = {};
    if (name.trim() && name.trim() !== project?.name) body.name = name.trim();
    if (pmId && Number(pmId) !== project?.pm_user_id) body.pm_user_id = Number(pmId);
    if (!Object.keys(body).length) {
      setNotice({ tone: 'ok', text: '没有需要保存的修改' });
      return;
    }
    void run(() => updateProjectInfo(projectId, body), '项目信息已保存');
  };

  const field = 'w-full p-2 rounded-xl bg-surface-container border border-outline-variant/40 text-sm disabled:opacity-60';
  const label = 'block text-xs font-medium text-on-surface-variant mb-1';

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="项目设置"
      className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
      data-testid="project-settings-modal"
    >
      <div className="bg-surface-container-lowest dark:bg-surface-container rounded-[var(--radius-ink-panel)] p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto space-y-5 border border-outline-variant/40">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-medium tabular-nums">项目设置</h3>
          <button type="button" onClick={onClose} className="text-sm cursor-pointer" aria-label="关闭">
            关闭
          </button>
        </div>
        {archived && (
          <div className="px-4 py-2   text-[#a86412] text-sm border-t border-outline-variant">
            此项目已归档，目前是只读状态。需要继续编辑请先取消归档。
          </div>
        )}
        {!canManage && (
          <div className="px-4 py-2 rounded-xl bg-surface-container-lowest dark:bg-surface-container text-sm">
            只有项目负责人或公司超级管理员可以修改项目设置。
          </div>
        )}
        {notice && (
          <div
            role="status"
            className={`px-4 py-2  text-sm border-t ${
              notice.tone === 'ok' ? ' text-[#2f7d4f] border-outline-variant' : 'bg-error-container text-error border-outline-variant'
            }`}
          >
            {notice.text}
          </div>
        )}

        <section className="space-y-3">
          <div>
            <label className={label} htmlFor="ps-name">项目名称</label>
            <input id="ps-name" className={field} value={name} maxLength={200} disabled={!canManage || archived || busy} onChange={(e) => setName(e.target.value)} />
          </div>
          <div>
            <label className={label} htmlFor="ps-pm">项目负责人</label>
            <select id="ps-pm" className={field} value={pmId} disabled={!canManage || archived || busy} onChange={(e) => setPmId(e.target.value)}>
              {!members.some((m) => m.id === pmId) && pmId && <option value={pmId}>当前负责人</option>}
              {members.map((m) => (
                <option key={m.id} value={m.id}>{m.name}</option>
              ))}
            </select>
            <p className="text-xs text-on-surface-variant mt-1">换负责人后，原负责人变为普通成员，终责卡片也随之更换。</p>
          </div>
          <div className="flex justify-end">
            <button type="button" disabled={!canManage || archived || busy} onClick={saveInfo} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-40 cursor-pointer tabular-nums">
              保存项目信息
            </button>
          </div>
        </section>

        <section className="space-y-3 border-t border-outline-variant/30 pt-4" data-testid="report-policy-section">
          <h4 className="text-sm font-medium tabular-nums">汇报策略</h4>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={label} htmlFor="ps-period">汇报周期</label>
              <select id="ps-period" className={field} disabled={!canManage || archived || busy} value={policy.period} onChange={(e) => setPolicy({ ...policy, period: e.target.value as ReportPeriod })}>
                {(Object.keys(REPORT_PERIOD_LABELS) as ReportPeriod[]).map((p) => (
                  <option key={p} value={p}>{REPORT_PERIOD_LABELS[p]}</option>
                ))}
              </select>
            </div>
            <div>
              <label className={label} htmlFor="ps-deadline">截止时间</label>
              <input id="ps-deadline" type="time" className={field} disabled={!canManage || archived || busy} value={policy.deadline_time} onChange={(e) => setPolicy({ ...policy, deadline_time: e.target.value })} />
            </div>
            {policy.period === 'weekly' && (
              <div>
                <label className={label} htmlFor="ps-weekday">每周截止日</label>
                <select id="ps-weekday" className={field} disabled={!canManage || archived || busy} value={policy.weekday} onChange={(e) => setPolicy({ ...policy, weekday: Number(e.target.value) })}>
                  {WEEKDAY_LABELS.map((d, i) => (
                    <option key={d} value={i + 1}>{d}</option>
                  ))}
                </select>
              </div>
            )}
            {policy.period === 'monthly' && (
              <div>
                <label className={label} htmlFor="ps-monthday">每月截止日</label>
                <select id="ps-monthday" className={field} disabled={!canManage || archived || busy} value={policy.month_day} onChange={(e) => setPolicy({ ...policy, month_day: Number(e.target.value) })}>
                  {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d} 日</option>
                  ))}
                </select>
              </div>
            )}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={policy.remind} disabled={!canManage || archived || busy} onChange={(e) => setPolicy({ ...policy, remind: e.target.checked })} />
            截止前提醒还没提交汇报的成员
          </label>
          <div className="flex justify-end">
            <button
              type="button"
              disabled={!canManage || archived || busy}
              onClick={() => void run(() => saveReportPolicy(projectId, policy), '汇报策略已保存，系统将按此周期提醒成员', false)}
              className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-40 cursor-pointer tabular-nums"
            >
              保存汇报策略
            </button>
          </div>
        </section>

        {canManage && (
          <section className="space-y-2 border-t border-outline-variant/30 pt-4">
            <h4 className="text-sm font-medium text-error tabular-nums">归档</h4>
            <p className="text-xs text-on-surface-variant">
              归档后项目变为只读：不能再改人轴、提交材料或生成汇报，历史内容完整保留，随时可以取消归档。
            </p>
            {archived ? (
              <button type="button" disabled={busy} onClick={() => void run(() => unarchiveProjectRequest(projectId), '已取消归档，项目恢复可编辑')} className="px-4 py-2 rounded-lg border border-outline-variant/50 text-sm font-medium cursor-pointer disabled:opacity-40 tabular-nums">
                取消归档
              </button>
            ) : confirmArchive ? (
              <div className="flex items-center gap-3">
                <span className="text-sm">确认归档「{project?.name}」？</span>
                <button type="button" disabled={busy} onClick={() => void run(() => archiveProjectRequest(projectId), '项目已归档，现在是只读状态')} className="px-4 py-2 rounded-lg bg-error text-on-error text-sm font-medium cursor-pointer disabled:opacity-40 tabular-nums">
                  确认归档
                </button>
                <button type="button" onClick={() => setConfirmArchive(false)} className="px-3 py-2 text-sm cursor-pointer">取消</button>
              </div>
            ) : (
              <button type="button" disabled={busy} onClick={() => setConfirmArchive(true)} className="px-4 py-2 rounded-lg border border-outline-variant text-error text-sm font-medium cursor-pointer disabled:opacity-40 tabular-nums">
                归档此项目
              </button>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
