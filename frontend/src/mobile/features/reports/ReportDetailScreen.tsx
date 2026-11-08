import React, { useState, useEffect } from 'react';
import { parseApiDateTime } from '../../../utils/datetime';
import { Project, UserProfile } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileEmptyState, MobileLoadingState, MobileErrorState } from '../../ui/MobileState';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import {
  getReportDetail,
  listMyReports,
  AgentReport,
} from '../../../api/reports';
import {
  resolveDirectSupervisor,
  getAiDeliveryStatus,
} from './reportCapabilities';
import { ReportSources } from './ReportSources';

export interface ReportDetailScreenProps {
  user: UserProfile;
  currentProject: Project;
  projectMembers: Array<{ id: string | number; name: string; avatar?: string; role?: string }>;
  reportId?: string | number | null;
  initialMode?: 'submitted' | 'history' | 'detail';
}

export const ReportDetailScreen: React.FC<ReportDetailScreenProps> = ({
  user,
  currentProject,
  projectMembers,
  reportId: propReportId,
  initialMode = 'history',
}) => {
  const { goBack, push, activeRoute } = useMobileNavigation();

  // 路由参数中可能有 reportId
  const activeReportId = propReportId || activeRoute.params?.reportId;
  const isSubmissionFlow = initialMode === 'submitted' || activeRoute.screen === 'ai-report-submitted';

  const [mode, setMode] = useState<'submitted' | 'history' | 'detail'>(
    isSubmissionFlow ? 'submitted' : activeReportId ? 'detail' : initialMode,
  );

  const numericProjectId =
    currentProject.id && currentProject.id !== 'all' && Number(currentProject.id) > 0
      ? Number(currentProject.id)
      : null;

  // 历史报告与详情状态
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [myReports, setMyReports] = useState<AgentReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<AgentReport | null>(null);
  const [filterTab, setFilterTab] = useState<'all' | 'draft' | 'submitted'>('all');

  // 加载数据
  useEffect(() => {
    let cancelled = false;
    if (!numericProjectId) return;

    setLoading(true);
    setError(null);

    Promise.all([
      listMyReports(numericProjectId).catch(() => ({ items: [] as AgentReport[] })),
      activeReportId ? getReportDetail(Number(activeReportId)).catch(() => null) : Promise.resolve(null),
    ])
      .then(([myRes, detail]) => {
        if (cancelled) return;
        setMyReports(myRes.items || []);
        if (detail) {
          setSelectedReport(detail);
        } else if (activeReportId) {
          const found = (myRes.items || []).find((r) => String(r.id) === String(activeReportId));
          if (found) setSelectedReport(found);
        } else if ((myRes.items || []).length > 0 && mode === 'detail') {
          setSelectedReport(myRes.items[0]);
        }
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : '加载汇报详情失败');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [numericProjectId, activeReportId, mode]);

  // 过滤后的报告历史
  const filteredReports = myReports.filter((r) => {
    if (filterTab === 'draft') return r.status === 'draft';
    if (filterTab === 'submitted') return r.status === 'submitted' || r.status === 'aggregated';
    return true;
  });

  const displayReport = selectedReport || (myReports.length > 0 ? myReports[0] : null);
  const supervisor = resolveDirectSupervisor(
    projectMembers,
    user.id,
    displayReport?.parent_user_id,
  );
  const deliveryStatus = getAiDeliveryStatus(displayReport);

  // -------------------------------------------------------------
  // 模式 1：汇报提交与送达状态 (Design ID 38)
  // -------------------------------------------------------------
  if (mode === 'submitted') {
    return (
      <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
        <MobileTopBar
          title="汇报提交与送达"
          showBack
          onBack={() => push({ screen: 'ai-root', title: '汇报' })}
          backLabel="汇报"
        />

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* 成功 Hero 图标 */}
          <div className="pt-6 pb-2 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
              <AppIcon name="check-circle" size={36} />
            </div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">汇报已提交</h2>
            <p className="text-xs text-slate-400 dark:text-slate-500 mt-1">
              {currentProject.name} · {displayReport?.submitted_at ? parseApiDateTime(displayReport.submitted_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '刚刚'}
            </p>
          </div>

          {/* 真实多节点时间线 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-4 px-1">
              流转与送达节点
            </h3>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-slate-200 dark:before:bg-slate-800">
              {/* 节点 1：提交成功 */}
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">
                  ✓
                </div>
                <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block">
                  提交成功
                </strong>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  已生成正式记录。当前报告不可被静默覆盖，完整保留历史版本依据。
                </p>
              </div>

              {/* 节点 2：已送达直属领导 */}
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-emerald-500 text-white flex items-center justify-center text-[10px]">
                  ✓
                </div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200">
                    已送达直属领导
                  </strong>
                  <span className={`px-2 py-0.5 rounded-md text-[10px] font-semibold ${
                    deliveryStatus.leaderDelivery.status === '已读'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-amber-100 text-amber-700'
                  }`}>
                    {deliveryStatus.leaderDelivery.status}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  {supervisor.name} · 人轴责任链实时路由确定
                  {deliveryStatus.leaderDelivery.readAt && ` · 已于 ${new Date(deliveryStatus.leaderDelivery.readAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 阅读`}
                </p>
              </div>

              {/* 节点 3：已送达领导 AI (依据 G01 提示暂不可确认) */}
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-600 flex items-center justify-center text-[10px]">
                  ·
                </div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    送达领导智能体
                  </strong>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-slate-100 dark:bg-slate-800 text-slate-500">
                    {deliveryStatus.aiReceipt.statusText}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  {deliveryStatus.aiReceipt.description}
                </p>
              </div>

              {/* 节点 4：等待阅读与汇总 */}
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-slate-300 dark:bg-slate-700 text-slate-600 flex items-center justify-center text-[10px]">
                  ·
                </div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-semibold text-slate-600 dark:text-slate-300">
                    项目汇报汇总
                  </strong>
                  <span className="px-2 py-0.5 rounded-md text-[10px] font-semibold bg-blue-50 text-blue-600">
                    {deliveryStatus.rollupStatus}
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
                  管理者收件箱与项目对照页面将同步展示最新进展与冲突比对。
                </p>
              </div>
            </div>
          </div>

          {/* 规范提示 */}
          <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl flex items-start gap-2">
            <AppIcon name="info" size={16} className="text-[#0058BE] shrink-0 mt-0.5" />
            <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
              个人提交的汇报不等于项目验收完成。项目验收状态请以责任链事项中的确认结果为准。
            </p>
          </div>

          {/* 快捷跳转按钮 */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => setMode('detail')}
              className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:bg-blue-800 shadow-xs cursor-pointer transition-colors"
            >
              <AppIcon name="file" size={17} />
              <span>查看汇报详情与来源</span>
            </button>
            <button
              type="button"
              onClick={() => push({ screen: 'axis-root', title: '人轴责任链' })}
              className="w-full min-h-[46px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-800 dark:text-slate-200 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-50 cursor-pointer shadow-2xs transition-colors"
            >
              <AppIcon name="axis" size={17} />
              <span>返回我的责任链</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 模式 2 & 3：汇报历史列表与详情 (Design ID 39)
  // -------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
      <MobileTopBar
        title={mode === 'detail' ? '汇报详情与版本' : '汇报历史与版本'}
        showBack
        onBack={() => {
          if (mode === 'detail' && activeRoute.params.fromManager === '1') goBack();
          else if (mode === 'detail') setMode('history');
          else goBack();
        }}
        backLabel={mode === 'detail' && activeRoute.params.fromManager !== '1' ? '列表' : '返回'}
      />

      {loading && <MobileLoadingState message="加载汇报历史…" />}
      {error && <MobileErrorState message={error} />}

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {mode === 'history' ? (
          <>
            {/* 顶部过滤 Chips */}
            <div className="flex items-center gap-2 pb-1">
              {(['all', 'submitted', 'draft'] as const).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setFilterTab(tab)}
                  className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
                    filterTab === tab
                      ? 'bg-[#0058BE] text-white shadow-xs'
                      : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-800'
                  }`}
                >
                  {tab === 'all' ? '全部' : tab === 'submitted' ? '已提交' : '草稿'}
                </button>
              ))}
            </div>

            {/* 报告卡片列表 */}
            {filteredReports.length === 0 ? (
              <MobileEmptyState
                iconName="file"
                title="暂无汇报记录"
                description="您在当前项目中尚未提交任何汇报。可以在项目 AI 入口整理本周进展。"
                action={{
                  label: '写汇报',
                  onClick: () => push({ screen: 'ai-report-create', title: '写汇报' }),
                }}
              />
            ) : (
              <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
                {filteredReports.map((r, index) => {
                  const isSubmitted = r.status === 'submitted' || r.status === 'aggregated';
                  const isRead = Boolean(r.read || r.read_at);
                  const verNumber = filteredReports.length - index;

                  return (
                    <div
                      key={r.id}
                      onClick={() => {
                        setSelectedReport(r);
                        setMode('detail');
                      }}
                      className="p-4 flex items-center justify-between hover:bg-slate-50 dark:hover:bg-slate-800/50 cursor-pointer active:bg-slate-100 transition-colors"
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center gap-2 mb-1">
                          <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">
                            {r.summary_text.slice(0, 24) || '工作进展汇报'}
                          </strong>
                          <span className="text-[11px] font-mono text-slate-400">v{verNumber}</span>
                        </div>
                        <p className="text-xs text-slate-400 dark:text-slate-500 truncate">
                          {r.submitted_at
                            ? parseApiDateTime(r.submitted_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '草稿'} · {isSubmitted ? `已送达直属领导` : '未提交'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isSubmitted ? (
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                              isRead
                                ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300'
                                : 'bg-amber-100 text-amber-700 dark:bg-amber-950 dark:text-amber-300'
                            }`}
                          >
                            {isRead ? '已读' : '未读'}
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400">
                            草稿
                          </span>
                        )}
                        <AppIcon name="chevron-right" size={16} className="text-slate-400" />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        ) : (
          /* 单份报告详细视图 */
          displayReport && (
            <div className="space-y-4">
              {/* 状态与元信息 */}
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs">
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-md text-xs font-semibold ${
                      displayReport.status === 'submitted' || displayReport.status === 'aggregated'
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-700 border border-amber-200'
                    }`}
                  >
                    {displayReport.status === 'aggregated' ? '已聚合到项目汇报' : displayReport.status === 'submitted' ? '已正式提交' : '草稿'}
                  </span>
                  <span className="text-xs text-slate-400">
                    提交时间：{displayReport.submitted_at ? parseApiDateTime(displayReport.submitted_at).toLocaleString('zh-CN') : '未提交'}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 space-y-1">
                  <p>项目归属：<strong>{currentProject.name}</strong></p>
                  <p>直属接收：<strong>{supervisor.name}</strong>（{deliveryStatus.leaderDelivery.status}）</p>
                  <p>不可变版本：报告 ID #{displayReport.id}（系统严格归档）</p>
                </div>
              </div>

              {/* 汇报内容主体 */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
                  汇报内容摘要
                </h3>
                <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs leading-relaxed text-sm text-slate-800 dark:text-slate-200 whitespace-pre-wrap">
                  {displayReport.summary_text}
                </div>
              </section>

              {/* 来源依据明细 */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
                  引用材料与依据
                </h3>
                <ReportSources
                  sources={displayReport.sources}
                  taskSnapshot={(displayReport.payload_json?.task_snapshot as any) || []}
                  evidenceSnapshot={(displayReport.payload_json?.evidence_snapshot as any) || []}
                />
              </section>
            </div>
          )
        )}
      </div>
    </div>
  );
};
