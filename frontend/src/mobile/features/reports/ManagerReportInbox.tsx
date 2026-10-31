import React, { useState, useEffect } from 'react';
import { Project, UserProfile } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileEmptyState, MobileLoadingState, MobileErrorState } from '../../ui/MobileState';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import {
  listReportInbox,
  markReportRead,
  listReportAgentBindings,
  AgentReport,
} from '../../../api/reports';

export interface ManagerReportInboxProps {
  user: UserProfile;
  currentProject: Project;
  projectMembers: Array<{ id: string | number; name: string; avatar?: string; role?: string }>;
}

export const ManagerReportInbox: React.FC<ManagerReportInboxProps> = ({
  user,
  currentProject,
  projectMembers,
}) => {
  const { goBack, push } = useMobileNavigation();

  const isAllProjects = !currentProject.id || currentProject.id === 'all';
  const numericProjectId = !isAllProjects && Number(currentProject.id) > 0 ? Number(currentProject.id) : null;

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [inboxReports, setInboxReports] = useState<AgentReport[]>([]);
  const [activeTab, setActiveTab] = useState<'direct' | 'all_tree'>('direct');
  const [filterChip, setFilterChip] = useState<'unread' | 'all' | 'need_evidence'>('unread');
  const [isManager, setIsManager] = useState<boolean | null>(null);

  // 初始化权限检查与加载
  useEffect(() => {
    let cancelled = false;
    if (!numericProjectId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      listReportInbox().catch(() => ({ items: [] as AgentReport[] })),
      listReportAgentBindings(numericProjectId).catch(() => ({ items: [] as any[] })),
    ])
      .then(([inboxRes, bindingsRes]) => {
        if (cancelled) return;

        // 判定是否是当前项目的管理者或有下属汇报
        const hasProjectBinding = (bindingsRes.items || []).some(
          (b: any) => b.role === 'project' && String(b.user_id) === String(user.id),
        );
        const hasInboxItems = (inboxRes.items || []).length > 0;
        const managerRole =
          hasProjectBinding ||
          hasInboxItems ||
          user.role === 'Admin' ||
          user.role === 'Owner' ||
          user.role === 'PM';

        setIsManager(managerRole);
        setInboxReports(inboxRes.items || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载收件箱失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [numericProjectId, user.id, user.role]);

  // 标为已读并查看
  const handleOpenReport = async (report: AgentReport) => {
    if (!report.read && !report.read_at) {
      try {
        await markReportRead(report.id);
        setInboxReports((prev) =>
          prev.map((r) =>
            r.id === report.id
              ? { ...r, read: true, read_at: new Date().toISOString() }
              : r,
          ),
        );
      } catch (err) {
        console.warn('markReportRead error', err);
      }
    }

    push({
      screen: 'ai-report-detail',
      title: '汇报详情与版本',
      params: { reportId: String(report.id), fromManager: '1' },
    });
  };

  // 过滤报告列表
  const filteredList = inboxReports.filter((r) => {
    // 依项目过滤（如果是单项目收件箱）
    if (numericProjectId && r.project_id && Number(r.project_id) !== numericProjectId) {
      return false;
    }
    const isUnread = !r.read && !r.read_at;
    if (filterChip === 'unread') return isUnread;
    if (filterChip === 'need_evidence') {
      const payload = r.payload_json || {};
      const conflicts = payload.conflicts ?? payload.conflict;
      return Array.isArray(conflicts) && conflicts.length > 0;
    }
    return true;
  });

  const unreadCount = inboxReports.filter((r) => !r.read && !r.read_at).length;
  const totalCount = inboxReports.length;

  // 普通成员越权防御
  if (isManager === false) {
    return (
      <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
        <MobileTopBar title="下属汇报收件箱" showBack onBack={goBack} />
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          <MobileEmptyState
            iconName="lock"
            title="无权访问管理者收件箱"
            description="根据人轴责任原则，下属汇报仅限项目管理者或直属领导查阅。普通项目成员不可越权查看。"
          />
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
      <MobileTopBar
        title="下属汇报收件箱"
        showBack
        onBack={goBack}
        backLabel="返回"
      />

      {loading && <MobileLoadingState message="加载下属汇报列表…" />}
      {error && <MobileErrorState message={error} />}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 直属下属 vs 全部下属 Tab */}
        <div className="flex border-b border-slate-200 dark:border-slate-800">
          <button
            type="button"
            onClick={() => setActiveTab('direct')}
            className={`flex-1 py-2.5 text-center text-sm font-semibold cursor-pointer border-b-2 transition-colors ${
              activeTab === 'direct'
                ? 'border-[#0058BE] text-[#0058BE] dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            直属下属
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('all_tree')}
            className={`flex-1 py-2.5 text-center text-sm font-semibold cursor-pointer border-b-2 transition-colors ${
              activeTab === 'all_tree'
                ? 'border-[#0058BE] text-[#0058BE] dark:text-blue-400'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            全部下属
          </button>
        </div>

        {/* 筛选 Chips */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setFilterChip('unread')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              filterChip === 'unread'
                ? 'bg-[#0058BE] text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            未读 {unreadCount}
          </button>
          <button
            type="button"
            onClick={() => setFilterChip('all')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              filterChip === 'all'
                ? 'bg-[#0058BE] text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            全部 ({totalCount})
          </button>
          <button
            type="button"
            onClick={() => setFilterChip('need_evidence')}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              filterChip === 'need_evidence'
                ? 'bg-[#0058BE] text-white shadow-xs'
                : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
            }`}
          >
            待补资料
          </button>
        </div>

        {/* 列表主体 */}
        {filteredList.length === 0 ? (
          <MobileEmptyState
            iconName="inbox"
            title="暂无待阅汇报"
            description={
              filterChip === 'unread'
                ? '所有下属提交的汇报均已阅读完成'
                : '当前筛选条件下暂无下属汇报记录'
            }
          />
        ) : (
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {filteredList.map((r) => {
              const isUnread = !r.read && !r.read_at;
              const author = projectMembers.find((m) => String(m.id) === String(r.author_user_id));
              const authorName = author?.name || `成员 (${r.author_user_id})`;
              const authorRole = author?.role || '项目成员';

              return (
                <div
                  key={r.id}
                  onClick={() => void handleOpenReport(r)}
                  className="p-4 flex items-center gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer active:bg-slate-100 transition-colors"
                >
                  <div className="w-10 h-10 rounded-full bg-blue-100 dark:bg-blue-900/50 text-[#0058BE] dark:text-blue-300 font-bold flex items-center justify-center shrink-0">
                    {authorName.slice(0, 1)}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {authorName} · {authorRole}
                      </strong>
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
                      {r.summary_text.slice(0, 26) || '提交了工作汇报'}
                    </p>
                    <span className="text-[11px] text-slate-400 block mt-1">
                      {r.submitted_at
                        ? new Date(r.submitted_at).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })
                        : '今天'}
                    </span>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <span
                      className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                        isUnread
                          ? 'bg-blue-100 text-[#0058BE] dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
                      }`}
                    >
                      {isUnread ? '未读' : '已读'}
                    </span>
                    <AppIcon name="chevron-right" size={16} className="text-slate-400" />
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* 汇报覆盖统计 */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            当前汇报覆盖
          </h3>
          <div className="grid grid-cols-3 gap-2 bg-[#edf4ff] dark:bg-slate-900/60 p-4 rounded-2xl border border-blue-100 dark:border-blue-900/40 text-center">
            <div>
              <b className="text-xl font-bold text-[#0058BE] dark:text-blue-400 block">
                {projectMembers.length > 0 ? projectMembers.length : 1}
              </b>
              <span className="text-xs text-slate-500">应汇报</span>
            </div>
            <div className="border-x border-blue-200/60 dark:border-slate-800">
              <b className="text-xl font-bold text-[#0058BE] dark:text-blue-400 block">
                {totalCount}
              </b>
              <span className="text-xs text-slate-500">已提交</span>
            </div>
            <div>
              <b className="text-xl font-bold text-amber-600 block">
                {Math.max(0, (projectMembers.length || 1) - totalCount)}
              </b>
              <span className="text-xs text-slate-500">待补充</span>
            </div>
          </div>
        </section>

        {/* 规范提示 */}
        <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl flex items-start gap-2">
          <AppIcon name="info" size={16} className="text-[#0058BE] shrink-0 mt-0.5" />
          <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
            你与项目智能体会同时收到汇报提醒，已读状态会通过服务端同步到其他设备。
          </p>
        </div>

        {/* 汇总项目汇报按钮 */}
        <button
          type="button"
          onClick={() => push({ screen: 'ai-project-aggregate', title: '项目汇总与发布' })}
          className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:bg-blue-800 shadow-xs cursor-pointer transition-colors"
        >
          <AppIcon name="ai" size={17} />
          <span>汇总项目汇报</span>
        </button>
      </div>
    </div>
  );
};
