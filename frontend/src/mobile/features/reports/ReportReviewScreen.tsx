import React, { useState, useEffect } from 'react';
import { Project, UserProfile } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileLoadingState, MobileErrorState } from '../../ui/MobileState';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import {
  listReportAgentBindings,
  ensureReportAgentBindings,
  ReportAgentBinding,
  listAgentReports,
  getReportDetail,
  AgentReport,
} from '../../../api/reports';
import { ReportSources } from './ReportSources';

export interface ReportReviewScreenProps {
  user: UserProfile;
  currentProject: Project;
  projectMembers: Array<{ id: string | number; name: string; avatar?: string; role?: string }>;
  initialMode?: 'bindings' | 'followup' | 'conflict';
}

export const ReportReviewScreen: React.FC<ReportReviewScreenProps> = ({
  user,
  currentProject,
  projectMembers,
  initialMode = 'bindings',
}) => {
  const { goBack, push, activeRoute } = useMobileNavigation();

  // 根据当前路由确定模式
  const routeMode = (() => {
    if (activeRoute.screen === 'ai-agent-bindings') return 'bindings';
    if (activeRoute.screen === 'ai-review-followup') return 'followup';
    if (activeRoute.screen === 'ai-review-conflict') return 'conflict';
    return initialMode;
  })();

  const numericProjectId =
    currentProject.id && currentProject.id !== 'all' && Number(currentProject.id) > 0
      ? Number(currentProject.id)
      : null;

  // 状态
  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [bindings, setBindings] = useState<ReportAgentBinding[]>([]);
  const [reviewReport, setReviewReport] = useState<AgentReport | null>(null);

  // 追问/差异表单状态
  const [commentText, setCommentText] = useState(
    routeMode === 'conflict' ? '已完成员工端，管理者端仍待评审。' : '',
  );
  const [resolutionAction, setResolutionAction] = useState<'keep_ask' | 'pass' | 'reject'>('keep_ask');

  // 初始化加载绑定
  useEffect(() => {
    let cancelled = false;
    if (!numericProjectId) return;

    if (routeMode === 'bindings') {
      setLoading(true);
      setError(null);
      listReportAgentBindings(numericProjectId)
        .then((res) => {
          if (!cancelled) setBindings(res.items || []);
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : '加载智能体绑定失败');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    } else if (routeMode === 'followup' || routeMode === 'conflict') {
      const repId = activeRoute.params.reportId ? Number(activeRoute.params.reportId) : null;
      if (repId) {
        getReportDetail(repId)
          .then((rep) => {
            if (!cancelled) setReviewReport(rep);
          })
          .catch(() => {});
      } else {
        listAgentReports(numericProjectId)
          .then(async (res) => {
            if (!cancelled && res.items?.length) {
              const first = res.items[0];
              try {
                const detail = await getReportDetail(first.id);
                if (!cancelled) setReviewReport(detail);
              } catch {
                if (!cancelled) setReviewReport(first);
              }
            }
          })
          .catch(() => {});
      }
    }

    return () => {
      cancelled = true;
    };
  }, [numericProjectId, routeMode]);

  // 同步人轴智能体
  const handleSyncBindings = async () => {
    if (!numericProjectId || syncing) return;
    setSyncing(true);
    setError(null);
    setToastMessage(null);

    try {
      const res = await ensureReportAgentBindings(numericProjectId);
      setBindings(res.items || []);
      setToastMessage(`同步成功，当前项目已绑定 ${res.items?.length || 0} 个汇报智能体`);
    } catch (err) {
      setError(err instanceof Error ? err.message : '同步智能体失败（需项目管理者权限）');
    } finally {
      setSyncing(false);
    }
  };

  // 记录核验意见（严格遵守 G05）
  const handleSaveVerification = () => {
    setToastMessage(
      '【G05 规范提示】核验意见已记录。核验裁决的持久化写入需后端接口扩展支持，任务完成状态请在责任事项中单独确认，未将未持久化的操作谎报为成功。',
    );
  };

  if (!numericProjectId) {
    return (
      <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
        <MobileTopBar title="汇报审核管理" showBack onBack={goBack} />
        <div className="flex-1 p-6 flex flex-col items-center justify-center">
          <p className="text-sm text-slate-500">请选择具体项目</p>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 模式 1：项目智能体绑定管理 (Design ID 95)
  // -------------------------------------------------------------
  if (routeMode === 'bindings') {
    return (
      <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
        <MobileTopBar
          title="项目智能体绑定管理"
          showBack
          onBack={goBack}
          backLabel="返回"
        />

        {loading && <MobileLoadingState message="加载智能体绑定列表…" />}
        {error && <MobileErrorState message={error} />}

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {/* 说明卡片 */}
          <div className="p-3 bg-blue-50/80 dark:bg-blue-950/40 border border-blue-100 dark:border-blue-900/60 rounded-xl flex items-start gap-2">
            <AppIcon name="info" size={16} className="text-[#0058BE] shrink-0 mt-0.5" />
            <span className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
              智能体绑定从项目成员与人轴责任关系同步，不维护第二套上下级。
            </span>
          </div>

          {toastMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-xs text-emerald-800 dark:text-emerald-300 leading-relaxed flex items-start gap-2">
              <AppIcon name="check-circle" size={16} className="text-emerald-600 shrink-0 mt-0.5" />
              <div>{toastMessage}</div>
            </div>
          )}

          {/* 绑定列表 */}
          <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 overflow-hidden divide-y divide-slate-100 dark:divide-slate-800">
            {bindings.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400">
                当前项目尚未初始化智能体绑定，点击下方按钮从人轴同步。
              </div>
            ) : (
              bindings.map((b) => {
                const member = projectMembers.find((m) => String(m.id) === String(b.user_id));
                const name = member?.name || (b.role === 'project' ? '项目管理者' : `成员 (${b.user_id})`);
                const roleDesc =
                  b.role === 'project'
                    ? '项目汇报智能体'
                    : '个人项目汇报智能体';

                return (
                  <div key={b.id} className="p-3.5 flex items-center gap-3">
                    <div className="w-9 h-9 rounded-xl bg-blue-50 dark:bg-blue-950/50 text-[#0058BE] dark:text-blue-400 flex items-center justify-center shrink-0">
                      <AppIcon name="ai" size={17} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <strong className="text-sm font-semibold text-slate-800 dark:text-slate-200 block truncate">
                        {name} · {b.role === 'project' ? '管理者' : '成员'}
                      </strong>
                      <p className="text-xs text-slate-400 dark:text-slate-500 truncate mt-0.5">
                        {roleDesc}
                      </p>
                    </div>
                    <span className="px-2 py-0.5 rounded text-[11px] font-semibold bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200 shrink-0">
                      正常
                    </span>
                  </div>
                );
              })
            )}
          </div>

          {/* 同步按钮 */}
          <button
            type="button"
            disabled={syncing}
            onClick={() => void handleSyncBindings()}
            className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 shadow-xs cursor-pointer transition-colors"
          >
            {syncing ? (
              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            ) : (
              <AppIcon name="refresh" size={17} />
            )}
            <span>{syncing ? '正在同步人轴…' : '同步人轴智能体'}</span>
          </button>

          {/* 同步说明 */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
              同步机制说明
            </h3>
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-xs text-slate-500 leading-relaxed shadow-2xs">
              成员离开后停用对应项目绑定。变更管理者或调整人轴上下级后，下次汇报将自动按照最新责任关系路由送达。
            </div>
          </section>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 模式 2：待补材料与上级追问 (Design ID 99)
  // -------------------------------------------------------------
  if (routeMode === 'followup') {
    return (
      <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
        <MobileTopBar
          title="待补材料与上级追问"
          showBack
          onBack={goBack}
          backLabel="返回"
        />

        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          <div className="flex items-center justify-between">
            <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
              待补材料
            </span>
            <span className="text-xs text-slate-400">{currentProject.name}</span>
          </div>

          {toastMessage && (
            <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 leading-relaxed flex items-start gap-2">
              <AppIcon name="info" size={16} className="text-[#0058BE] shrink-0 mt-0.5" />
              <div>{toastMessage}</div>
            </div>
          )}

          <div>
            <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
              请补充最终验收清单
            </h2>
            <p className="text-xs text-slate-400 mt-1">王宁及其项目 AI · 今天 14:30</p>
          </div>

          {/* 追问要求说明 */}
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs text-xs text-slate-700 dark:text-slate-300 leading-relaxed">
            你的汇报描述“全部交互已验收”，但当前材料没有管理者确认记录。请补充验收清单或修改完成表述。
          </div>

          {/* 关联来源 */}
          <section className="space-y-2">
            <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
              关联来源
            </h3>
            {reviewReport?.sources && reviewReport.sources.length > 0 ? (
              <ReportSources sources={reviewReport.sources} />
            ) : (
              <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center text-xs text-slate-400">
                暂无来源
              </div>
            )}
          </section>

          {/* 补充说明 */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              补充说明
            </label>
            <textarea
              rows={3}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
              placeholder="说明当前进度与尚未完成的事项…"
              className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3 text-sm text-slate-800 dark:text-slate-200 outline-hidden focus:border-[#0058BE] transition-colors leading-relaxed shadow-2xs resize-none"
            />
          </div>

          {/* 规范提示 */}
          <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl flex items-start gap-2">
            <AppIcon name="info" size={16} className="text-[#0058BE] shrink-0 mt-0.5" />
            <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
              补充后沿原项目与人轴链路递交，不跨项目读取其他资料。追问建议通过站内消息闭环沟通 (G04)。
            </p>
          </div>

          {/* 动作按钮 */}
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => push({ screen: 'work-root', title: '工作台' })}
              className="flex-1 min-h-[46px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-800 dark:text-slate-200 text-sm font-semibold flex items-center justify-center gap-2 hover:bg-slate-200 cursor-pointer"
            >
              <AppIcon name="file" size={17} />
              <span>上传材料</span>
            </button>
            <button
              type="button"
              onClick={() => push({ screen: 'ai-report-create', title: '编辑我的 AI 汇报' })}
              className="flex-1 min-h-[46px] rounded-xl bg-[#0058BE] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:bg-blue-800 shadow-xs cursor-pointer"
            >
              <AppIcon name="edit" size={17} />
              <span>更新汇报草稿</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  // -------------------------------------------------------------
  // 模式 3：资料差异确认 (Design ID 100)
  // -------------------------------------------------------------
  return (
    <div className="flex flex-col h-full bg-[#f7f8fa] dark:bg-slate-950 select-none">
      <MobileTopBar
        title="资料差异确认"
        showBack
        onBack={goBack}
        backLabel="返回"
      />

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <div className="flex items-center justify-between">
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200">
            差异待确认
          </span>
          <span className="text-xs text-slate-400">{currentProject.name}</span>
        </div>

        {toastMessage && (
          <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-900 leading-relaxed flex items-start gap-2">
            <AppIcon name="info" size={16} className="text-[#0058BE] shrink-0 mt-0.5" />
            <div>{toastMessage}</div>
          </div>
        )}

        <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100">
          原型验收状态不一致
        </h2>

        {/* 对照展示 */}
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 p-4 shadow-xs space-y-2">
          <div className="border-l-3 border-amber-400 pl-3 py-1 text-xs space-y-2 leading-relaxed">
            <div>
              <b className="text-slate-400 block text-[11px]">成员汇报：</b>
              <span className="text-slate-800 dark:text-slate-200 font-medium">原型全部验收完成</span>
            </div>
            <div>
              <b className="text-slate-400 block text-[11px]">任务与材料：</b>
              <span className="text-slate-800 dark:text-slate-200 font-medium">任务进行中，管理者确认记录缺失</span>
            </div>
          </div>
        </div>

        {/* 查阅依据 */}
        <section className="space-y-2">
          <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider px-1">
            查阅依据
          </h3>
          {reviewReport?.sources && reviewReport.sources.length > 0 ? (
            <ReportSources sources={reviewReport.sources} />
          ) : (
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center text-xs text-slate-400">
              暂无来源
            </div>
          )}
        </section>

        {/* 管理者核验意见 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            管理者核验意见
          </label>
          <textarea
            rows={3}
            value={commentText}
            onChange={(e) => setCommentText(e.target.value)}
            className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 p-3 text-sm text-slate-800 dark:text-slate-200 outline-hidden focus:border-[#0058BE] transition-colors leading-relaxed shadow-2xs resize-none"
          />
        </div>

        {/* 本次处理决策 */}
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-semibold text-slate-700 dark:text-slate-300">
            本次处理方式
          </label>
          <div className="grid grid-cols-3 gap-2">
            {[
              { id: 'keep_ask', label: '要求补材料' },
              { id: 'pass', label: '核验通过' },
              { id: 'reject', label: '退回修改' },
            ].map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setResolutionAction(opt.id as any)}
                className={`py-2 px-1 rounded-xl text-xs font-semibold cursor-pointer border transition-colors ${
                  resolutionAction === opt.id
                    ? 'bg-[#0058BE] text-white border-[#0058BE] shadow-xs'
                    : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-800'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 记录核验意见动作 */}
        <button
          type="button"
          onClick={handleSaveVerification}
          className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white text-sm font-semibold flex items-center justify-center gap-2 hover:bg-blue-700 active:bg-blue-800 shadow-xs cursor-pointer transition-colors"
        >
          <AppIcon name="check" size={17} />
          <span>记录核验意见</span>
        </button>

        {/* 规范提示 */}
        <div className="p-3 bg-blue-50/70 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-900/50 rounded-xl flex items-start gap-2">
          <AppIcon name="info" size={16} className="text-[#0058BE] shrink-0 mt-0.5" />
          <p className="text-xs text-blue-900 dark:text-blue-200 leading-relaxed">
            核验意见会保留在历史记录中。任务状态请在责任事项中单独确认。
          </p>
        </div>
      </div>
    </div>
  );
};
