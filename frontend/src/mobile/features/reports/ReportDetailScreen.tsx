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
import { ReportReviewPanel } from '../../../components/ReportReviewPanel';

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
      <div className="flex flex-col h-full bg-surface dark:bg-surface-container-lowest select-none">
        <MobileTopBar
          title="汇报提交与送达"
          showBack
          onBack={() => push({ screen: 'ai-root', title: '汇报' })}
          backLabel="汇报"
        />

        <div className="flex-1 overflow-y-auto p-4 space-y-6">
          {/* 成功 Hero 图标 */}
          <div className="pt-6 pb-2 flex flex-col items-center text-center">
            <div className="w-16 h-16 rounded-full bg-surface-container dark:bg-surface-container text-[#2f7d4f] dark:text-[#6bbf8a] flex items-center justify-center mb-3">
              <AppIcon name="check-circle" size={18} />
            </div>
            <h2 className="text-xl font-medium text-on-surface dark:text-on-surface tabular-nums">汇报已提交</h2>
            <p className="text-xs text-outline dark:text-on-surface-variant mt-1">
              {currentProject.name} · {displayReport?.submitted_at ? parseApiDateTime(displayReport.submitted_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '刚刚'}
            </p>
          </div>

          {/* 真实多节点时间线 */}
          <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant/80 dark:border-outline-variant p-4 shadow-sm dark:shadow-none">
            <h3 className="text-xs font-medium text-on-surface-variant   mb-4 px-1 tabular-nums">
              流转与送达节点
            </h3>

            <div className="relative pl-6 space-y-6 before:absolute before:left-2 before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-container dark:before:bg-surface-container-lowest">
              {/* 节点 1：提交成功 */}
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-[#2f7d4f] text-on-primary flex items-center justify-center text-xs">
                  ✓
                </div>
                <strong className="text-sm font-medium text-on-surface dark:text-outline block tabular-nums">
                  提交成功
                </strong>
                <p className="text-xs text-outline mt-1 leading-relaxed">
                  已生成正式记录。当前报告不可被静默覆盖，完整保留历史版本依据。
                </p>
              </div>

              {/* 节点 2：已送达直属领导 */}
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-[#2f7d4f] text-on-primary flex items-center justify-center text-xs">
                  ✓
                </div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-medium text-on-surface dark:text-outline tabular-nums">
                    已送达直属领导
                  </strong>
                  <span className={`px-2 py-1 rounded-md text-xs font-medium ${
                    deliveryStatus.leaderDelivery.status === '已读'
                      ? 'bg-surface-container text-[#2f7d4f]'
                      : 'bg-surface-container text-[#a86412]'
                  }`}>
                    {deliveryStatus.leaderDelivery.status}
                  </span>
                </div>
                <p className="text-xs text-outline mt-1 leading-relaxed">
                  {supervisor.name} · 人轴责任链实时路由确定
                  {deliveryStatus.leaderDelivery.readAt && ` · 已于 ${new Date(deliveryStatus.leaderDelivery.readAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit' })} 阅读`}
                </p>
              </div>

              {/* 节点 3：已送达领导 AI (依据 G01 提示暂不可确认) */}
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-surface-container-high dark:bg-surface-container-high text-on-surface-variant flex items-center justify-center text-xs">
                  ·
                </div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-medium text-on-surface-variant dark:text-outline tabular-nums">
                    送达领导智能体
                  </strong>
                  <span className="px-2 py-1 rounded-md text-xs font-medium bg-surface-container dark:bg-surface-container-lowest text-on-surface-variant tabular-nums">
                    {deliveryStatus.aiReceipt.statusText}
                  </span>
                </div>
                <p className="text-xs text-outline mt-1 leading-relaxed">
                  {deliveryStatus.aiReceipt.description}
                </p>
              </div>

              {/* 节点 4：等待阅读与汇总 */}
              <div className="relative">
                <div className="absolute -left-6 top-0.5 w-4 h-4 rounded-full bg-surface-container-high dark:bg-surface-container-high text-on-surface-variant flex items-center justify-center text-xs">
                  ·
                </div>
                <div className="flex items-center gap-2">
                  <strong className="text-sm font-medium text-on-surface-variant dark:text-outline tabular-nums">
                    项目汇报汇总
                  </strong>
                  <span className="px-2 py-1 rounded-md text-xs font-medium bg-surface-container text-primary tabular-nums">
                    {deliveryStatus.rollupStatus}
                  </span>
                </div>
                <p className="text-xs text-outline mt-1 leading-relaxed">
                  管理者收件箱与项目对照页面将同步展示最新进展与冲突比对。
                </p>
              </div>
            </div>
          </div>

          {/* 规范提示 */}
          <div className="p-3 bg-surface-container-lowest dark:bg-surface-container border border-primary dark:border-primary rounded-xl flex items-start gap-2">
            <AppIcon name="info" size={18} className="text-inherit shrink-0 mt-1" />
            <p className="text-xs text-primary dark:text-primary leading-relaxed">
              个人提交的汇报不等于项目验收完成。项目验收状态请以责任链事项中的确认结果为准。
            </p>
          </div>

          {/* 快捷跳转按钮 */}
          <div className="space-y-3 pt-2">
            <button
              type="button"
              onClick={() => setMode('detail')}
              className="w-full min-h-[48px] rounded-lg bg-primary text-on-primary text-sm font-medium flex items-center justify-center gap-2 hover:bg-primary/90 active:bg-primary/90 shadow-sm dark:shadow-none cursor-pointer transition-ink-colors tabular-nums"
            >
              <AppIcon name="file" size={18} />
              <span>查看汇报详情与来源</span>
            </button>
            <button
              type="button"
              onClick={() => push({ screen: 'axis-root', title: '人轴责任链' })}
              className="w-full min-h-[48px] rounded-lg bg-surface-container-lowest dark:bg-surface-container-lowest border border-outline-variant dark:border-outline-variant text-on-surface dark:text-outline text-sm font-medium flex items-center justify-center gap-2 hover:bg-surface cursor-pointer shadow-2xs transition-ink-colors tabular-nums"
            >
              <AppIcon name="axis" size={18} />
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
    <div className="flex flex-col h-full bg-surface dark:bg-surface-container-lowest select-none">
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
                  className={`px-4 py-2 rounded-lg text-xs font-medium cursor-pointer transition-ink-colors ${
                    filterTab === tab
                      ? 'bg-primary text-on-primary shadow-sm dark:shadow-none'
                      : 'bg-surface-container-lowest dark:bg-surface-container-lowest text-on-surface-variant dark:text-outline border border-outline-variant dark:border-outline-variant'
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
              <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant/80 dark:border-outline-variant overflow-hidden divide-y divide-outline-variant dark:divide-outline-variant">
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
                      className="p-4 flex items-center justify-between hover:bg-surface dark:hover:bg-surface-container-lowest/50 cursor-pointer active:bg-surface-container transition-ink-colors"
                    >
                      <div className="flex-1 min-w-0 pr-3">
                        <div className="flex items-center gap-2 mb-1">
                          <strong className="text-sm font-medium text-on-surface dark:text-outline truncate tabular-nums">
                            {r.summary_text.slice(0, 24) || '工作进展汇报'}
                          </strong>
                          <span className="text-xs font-mono text-outline">v{verNumber}</span>
                        </div>
                        <p className="text-xs text-outline dark:text-on-surface-variant truncate">
                          {r.submitted_at
                            ? parseApiDateTime(r.submitted_at).toLocaleDateString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })
                            : '草稿'} · {isSubmitted ? `已送达直属领导` : '未提交'}
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {isSubmitted ? (
                          <span
                            className={`px-2 py-1 rounded text-xs font-medium ${
                              isRead
                                ? 'bg-surface-container text-[#2f7d4f] dark:bg-surface-container dark:text-[#6bbf8a]'
                                : 'bg-surface-container text-[#a86412] dark:bg-surface-container dark:text-[#d9a35b]'
                            }`}
                          >
                            {isRead ? '已读' : '未读'}
                          </span>
                        ) : (
                          <span className="px-2 py-1 rounded text-xs font-medium bg-surface-container text-on-surface-variant dark:bg-surface-container-lowest dark:text-outline tabular-nums">
                            草稿
                          </span>
                        )}
                        <AppIcon name="chevron-right" size={18} className="text-inherit" />
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
              <div className="p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant/80 dark:border-outline-variant shadow-sm dark:shadow-none">
                <div className="flex items-center justify-between mb-2">
                  <span
                    className={`px-2 py-1 rounded-md text-xs font-medium ${
                      displayReport.status === 'submitted' || displayReport.status === 'aggregated'
                        ? 'bg-surface-container text-[#2f7d4f] border border-outline-variant'
                        : 'bg-surface-container text-[#a86412] border border-outline-variant'
                    }`}
                  >
                    {displayReport.status === 'aggregated' ? '已聚合到项目汇报' : displayReport.status === 'submitted' ? '已正式提交' : '草稿'}
                  </span>
                  <span className="text-xs text-outline">
                    提交时间：{displayReport.submitted_at ? parseApiDateTime(displayReport.submitted_at).toLocaleString('zh-CN') : '未提交'}
                  </span>
                </div>

                <div className="pt-2 border-t border-outline-variant dark:border-outline-variant text-xs text-on-surface-variant space-y-1">
                  <p>项目归属：<strong className="font-medium">{currentProject.name}</strong></p>
                  <p>直属接收：<strong className="font-medium">{supervisor.name}</strong>（{deliveryStatus.leaderDelivery.status}）</p>
                  <p>不可变版本：报告 ID #{displayReport.id}（系统严格归档）</p>
                </div>
              </div>

              {/* 汇报内容主体 */}
              <section className="space-y-2">
                <h3 className="text-xs font-medium text-on-surface-variant   px-1 tabular-nums">
                  汇报内容摘要
                </h3>
                <div className="p-4 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant/80 dark:border-outline-variant shadow-sm dark:shadow-none leading-relaxed text-sm text-on-surface dark:text-outline whitespace-pre-wrap">
                  {displayReport.summary_text}
                </div>
              </section>

              {/* 来源依据明细 */}
              <ReportReviewPanel key={displayReport.id} report={displayReport} onSaved={setSelectedReport} />
              <section className="space-y-2">
                <h3 className="text-xs font-medium text-on-surface-variant   px-1 tabular-nums">
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
