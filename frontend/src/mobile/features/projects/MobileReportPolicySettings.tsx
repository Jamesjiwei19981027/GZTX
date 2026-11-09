import React, { useEffect, useState } from 'react';
import { REPORT_PERIOD_LABELS, WEEKDAY_LABELS, saveReportPolicy, type ReportPeriod, type ReportPolicySettings } from '../../../api/manage';
import { listProjectReportPolicies } from '../../../api/reports';

const defaults: Omit<ReportPolicySettings, 'id'> = {
  enabled: true, period: 'weekly', deadline_time: '18:00', weekday: 5, month_day: 25, remind: true,
};

/** 与电脑端使用相同策略接口；加载失败时不允许用默认值覆盖现有设置。 */
export const MobileReportPolicySettings: React.FC<{
  projectId: number;
  canManage: boolean;
  archived: boolean;
}> = ({ projectId, canManage, archived }) => {
  const [policy, setPolicy] = useState(defaults);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    let active = true;
    setLoaded(false);
    setNotice('');
    listProjectReportPolicies(projectId).then(({ items }) => {
      if (!active) return;
      const first = items.find(item => item.enabled) || items[0];
      setPolicy(first ? {
        enabled: first.enabled,
        period: first.period ?? defaults.period,
        deadline_time: first.deadline_time ?? defaults.deadline_time,
        weekday: first.weekday ?? defaults.weekday,
        month_day: first.month_day ?? defaults.month_day,
        remind: first.remind ?? defaults.remind,
      } : defaults);
      setLoaded(true);
    }).catch(error => { if (active) setNotice(error instanceof Error ? error.message : '汇报策略加载失败'); });
    return () => { active = false; };
  }, [projectId, attempt]);

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!canManage || archived || !loaded || busy) return;
    setBusy(true); setNotice('');
    try {
      await saveReportPolicy(projectId, policy);
      setNotice('汇报策略已保存');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : '汇报策略保存失败，请重试');
    } finally { setBusy(false); }
  };
  const field = 'w-full min-h-[44px] px-3 rounded-xl bg-surface-container dark:bg-surface-container-lowest text-sm disabled:opacity-50';
  return <section aria-label="汇报策略设置" className="p-4 rounded-xl bg-surface-container-lowest dark:bg-surface-container border border-outline-variant dark:border-outline-variant space-y-3">
    <h2 className="text-sm font-medium tabular-nums">汇报策略设置</h2>
    {notice && <p role="status" className="text-sm text-primary dark:text-primary">{notice}</p>}
    {!loaded && <button type="button" onClick={() => setAttempt(value => value + 1)} className="min-h-[44px] text-sm text-primary">重新加载策略</button>}
    <form onSubmit={save} className="space-y-3">
      <fieldset disabled={!canManage || archived || !loaded || busy} className="space-y-3 disabled:opacity-60">
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.enabled} onChange={event => setPolicy({ ...policy, enabled: event.target.checked })} />启用汇报策略</label>
        <label className="block text-sm space-y-1"><span>汇报周期</span><select className={field} value={policy.period} onChange={event => setPolicy({ ...policy, period: event.target.value as ReportPeriod })}>
          {(Object.keys(REPORT_PERIOD_LABELS) as ReportPeriod[]).map(period => <option key={period} value={period}>{REPORT_PERIOD_LABELS[period]}</option>)}
        </select></label>
        <label className="block text-sm space-y-1"><span>截止时间</span><input className={field} required type="time" value={policy.deadline_time} onChange={event => setPolicy({ ...policy, deadline_time: event.target.value })} /></label>
        {policy.period === 'weekly' && <label className="block text-sm space-y-1"><span>每周截止日</span><select className={field} value={policy.weekday} onChange={event => setPolicy({ ...policy, weekday: Number(event.target.value) })}>
          {WEEKDAY_LABELS.map((day, index) => <option key={day} value={index + 1}>{day}</option>)}
        </select></label>}
        {policy.period === 'monthly' && <label className="block text-sm space-y-1"><span>每月截止日</span><select className={field} value={policy.month_day} onChange={event => setPolicy({ ...policy, month_day: Number(event.target.value) })}>
          {Array.from({ length: 28 }, (_, index) => index + 1).map(day => <option key={day} value={day}>{day} 日</option>)}
        </select></label>}
        <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={policy.remind} onChange={event => setPolicy({ ...policy, remind: event.target.checked })} />截止前提醒未提交成员</label>
        <button type="submit" className="w-full min-h-[44px] px-4 rounded-lg bg-primary text-on-primary text-sm font-medium tabular-nums">{busy ? '正在保存…' : '保存汇报策略'}</button>
      </fieldset>
    </form>
    {archived && <p className="text-xs text-on-surface-variant">项目已归档，取消归档后可修改汇报策略。</p>}
  </section>;
};
