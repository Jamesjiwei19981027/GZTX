/**
 * 移动端全尺寸与异常场景适配中心 (Mobile Adaptation Screens)
 * 覆盖设计 ID:
 * - 66: 空状态与首次使用 (空列表/未选项目/空责任链/无材料)
 * - 67: 断网与启动恢复 (离线门禁、离线草稿恢复管理器)
 * - 68: 加载失败 / 模型不可用 (500 异常与 422 模型缺失降级)
 * - 69: 权限不足 / 角色变化 (ACL 403 / 移出项目 / 管理员降级)
 * - 70: 删除与高风险操作确认 (影响范围透明、双重防误触确认)
 * - 71: 窄屏适配 · 320 (320px 小屏防挤压、弹性多行与触控热区)
 * - 72: 宽屏手机 · 430 (430px Pro Max 宽屏边距与视距优化)
 * - 73: 系统大字体 · 150% (Dynamic Type 150% 多行折行与高度自适应)
 * - 74: 系统大字体 · 200% (Dynamic Type 200% 无障碍大字堆叠重排)
 * - 75: 深色模式 (高对比度深色模式与 WCAG AA 色彩合规)
 * - 76: 平板双栏 (Master-Detail 双栏联动与窗口自适应)
 * - 77: 横屏手机 (横向握持紧凑工具栏与避让系统安全岛)
 * - 78: 键盘弹出与输入 (visualViewport 避让、操作吸顶与可达性)
 * - 96: 删除账号确认 (密码校验 + 关键词 DELETE 确认与影响说明)
 * - 97: 启动与同步中 / 敏感操作二次验证 (启动状态机与 6 位 2FA 门禁)
 */

import React, { useState, useEffect, useRef } from 'react';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import { useNativeRuntime } from '../../runtime/NativeRuntimeProvider';
import { UserProfile, AppSettings, Task, Project } from '../../../types';
import { deleteMyAccount } from '../../../api/auth';
import {
  saveOfflineDraft,
  getOfflineDraft,
  listOfflineDrafts,
  clearOfflineDraft,
  clearUserOfflineDrafts,
  OfflineDraft,
} from './offlineDrafts';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileListGroup, MobileListItem } from '../../ui/MobileList';
import { MobileField, MobileInput } from '../../ui/MobileField';
import { MobileEmptyState, MobileErrorState, MobileLoadingState } from '../../ui/MobileState';
import { AppIcon, AppIconName } from '../../ui/AppIcon';

export interface AdaptationSharedProps {
  user: UserProfile;
  settings: AppSettings;
  companyId?: number | string | null;
  tasks?: Task[];
  projects?: Project[];
  currentProject?: Project;
  onSelectProject?: (p: Project) => void;
  onLogout?: () => Promise<void>;
}

// ==========================================
// 66. 空状态与首次使用 (Empty States)
// ==========================================
export const AdaptEmptyStateScreen: React.FC<AdaptationSharedProps> = () => {
  const { goBack, push } = useMobileNavigation();
  const [tab, setTab] = useState<'tasks' | 'project' | 'axis' | 'evidence'>('tasks');

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="空状态与首次使用" onBack={goBack} />

      <div className="px-4 py-3 max-w-xl mx-auto w-full flex flex-col gap-4">
        {/* 场景切换器 */}
        <div className="flex p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl text-xs overflow-x-auto">
          {[
            { id: 'tasks', label: '暂无任务' },
            { id: 'project', label: '未选项目' },
            { id: 'axis', label: '空责任链' },
            { id: 'evidence', label: '无证据材料' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setTab(item.id as typeof tab)}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer ${
                tab === item.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 呈现卡片 */}
        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs min-h-[380px] flex items-center justify-center">
          {tab === 'tasks' && (
            <MobileEmptyState
              iconName="work"
              title="暂无待办任务"
              description="当前视图下没有任何未完成的任务。点击下方按钮或在右上角快捷创建新任务。"
              action={{
                label: '创建新任务',
                iconName: 'plus',
                onClick: () => push({ screen: 'work-root', title: '工作台' }),
              }}
            />
          )}

          {tab === 'project' && (
            <MobileEmptyState
              iconName="folder"
              title="尚未选择所属项目"
              description="您尚未选择活跃工作项目。请先选择一个既有项目或新建项目以加载责任链。"
              action={{
                label: '切换/选择项目',
                iconName: 'arrow-right',
                onClick: () => push({ screen: 'work-root', title: '项目选择' }),
              }}
            />
          )}

          {tab === 'axis' && (
            <MobileEmptyState
              iconName="axis"
              title="人轴责任链尚未配置"
              description="当前项目未建立人轴树状结构。从添加核心责任人开始，构建上下级汇报网络。"
              action={{
                label: '添加首个责任人',
                iconName: 'plus',
                onClick: () => push({ screen: 'axis-root', title: '人轴责任链' }),
              }}
            />
          )}

          {tab === 'evidence' && (
            <MobileEmptyState
              iconName="file"
              title="暂未提交交付物证据"
              description="当前节点未关联任何代码提交、验收单或交付文档。提交证据包可供 AI 智能审计。"
              action={{
                label: '提交证据包',
                iconName: 'plus',
                onClick: () => push({ screen: 'axis-root', title: '提交证据' }),
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 67. 断网与启动恢复 (Offline & Recovery)
// ==========================================
export const AdaptOfflineRecoveryScreen: React.FC<AdaptationSharedProps> = ({ user, currentProject }) => {
  const { goBack } = useMobileNavigation();
  const userId = user.id || 'default_user';
  const projectId = currentProject?.id || 'all';

  const [simulatedOffline, setSimulatedOffline] = useState(false);
  const [drafts, setDrafts] = useState<OfflineDraft<unknown>[]>([]);
  const [testTitle, setTestTitle] = useState('离线周报拟制');
  const [testContent, setTestContent] = useState('今天完成了 APP V2 设置中心核心功能适配…');
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const refreshDrafts = () => {
    setDrafts(listOfflineDrafts(userId, projectId));
  };

  useEffect(() => {
    refreshDrafts();
  }, [userId, projectId]);

  const handleSaveTestDraft = () => {
    saveOfflineDraft({
      userId,
      projectId,
      formKind: 'report',
      entityId: 'weekly_draft_1',
      title: testTitle,
      data: { content: testContent },
    });
    setStatusMsg('离线草稿已成功隔离暂存到本地！');
    refreshDrafts();
    setTimeout(() => setStatusMsg(null), 3000);
  };

  const handleClearDraft = (draft: OfflineDraft<unknown>) => {
    clearOfflineDraft({
      userId: draft.userId,
      projectId: draft.projectId,
      formKind: draft.formKind,
      entityId: draft.entityId,
    });
    refreshDrafts();
  };

  const handleClearAll = () => {
    clearUserOfflineDrafts(userId);
    refreshDrafts();
    setStatusMsg('当前用户的所有本地草稿已安全清理');
    setTimeout(() => setStatusMsg(null), 3000);
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="断网与启动恢复" onBack={goBack} />

      <div className="px-4 py-3 max-w-xl mx-auto w-full flex flex-col gap-4">
        {/* 离线状态模拟开关 */}
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 flex items-center justify-between">
          <div className="flex flex-col">
            <span className="text-sm font-semibold">模拟离线断网模式</span>
            <span className="text-xs text-slate-500 mt-0.5">测试网络中断时的门禁提示与离线草稿拦截</span>
          </div>
          <input
            type="checkbox"
            checked={simulatedOffline}
            onChange={(e) => setSimulatedOffline(e.target.checked)}
            className="w-5 h-5 accent-red-600 cursor-pointer"
          />
        </div>

        {/* 模拟断网横幅 */}
        {simulatedOffline && (
          <div className="p-4 bg-amber-50 dark:bg-amber-950/50 border border-amber-300 dark:border-amber-800 rounded-2xl flex items-center justify-between gap-3 text-amber-900 dark:text-amber-200">
            <div className="flex items-center gap-3">
              <AppIcon name="wifi-off" size={22} className="text-amber-600 shrink-0" />
              <div className="flex flex-col">
                <span className="text-xs font-bold">网络连接已中断</span>
                <span className="text-[11px] text-amber-800 dark:text-amber-300">
                  当前处于离线暂存模式，您的编辑将安全保存在本地。
                </span>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setSimulatedOffline(false)}
              className="px-3 py-1.5 rounded-lg bg-amber-600 text-white text-xs font-semibold hover:bg-amber-700 cursor-pointer shrink-0"
            >
              重新连接
            </button>
          </div>
        )}

        {statusMsg && (
          <div className="p-3 bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-200 text-emerald-700 text-xs rounded-xl flex items-center gap-2">
            <AppIcon name="check-circle" size={16} />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* 离线草稿隔离保存测试 */}
        <MobileListGroup
          title="新建/更新草稿测试"
          footer="草稿严格按照 userId + projectId + formKind + entityId 隔离，不与其他用户或项目混淆。"
        >
          <div className="p-4 flex flex-col gap-3">
            <MobileField label="草稿标题">
              <MobileInput value={testTitle} onChange={(e) => setTestTitle(e.target.value)} />
            </MobileField>
            <MobileField label="编辑内容">
              <textarea
                value={testContent}
                onChange={(e) => setTestContent(e.target.value)}
                rows={3}
                className="w-full p-3 text-sm bg-white dark:bg-slate-900 border border-slate-300 dark:border-slate-700 rounded-xl"
              />
            </MobileField>
            <button
              type="button"
              onClick={handleSaveTestDraft}
              className="w-full min-h-[44px] rounded-xl bg-[#0058BE] text-white font-medium text-sm hover:bg-blue-700 cursor-pointer shadow-xs"
            >
              暂存离线草稿
            </button>
          </div>
        </MobileListGroup>

        {/* 本地草稿恢复列表 */}
        <MobileListGroup
          title={`当前项目本地草稿 (${drafts.length})`}
          footer="恢复草稿将重填到编辑表单；退出登录时将自动安全清理以防泄密。"
        >
          {drafts.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">暂无离线草稿记录</div>
          ) : (
            drafts.map((d, idx) => (
              <MobileListItem
                key={`${d.formKind}-${d.entityId}-${idx}`}
                leading={<AppIcon name="file" size={18} className="text-[#0058BE]" />}
                title={d.title}
                subtitle={`保存于: ${new Date(d.savedAt).toLocaleTimeString()} · 类型: ${d.formKind}`}
                trailing={
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => alert(`成功从离线草稿恢复内容:\n${JSON.stringify(d.data)}`)}
                      className="px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950 text-[#0058BE] text-xs font-semibold cursor-pointer"
                    >
                      恢复
                    </button>
                    <button
                      type="button"
                      onClick={() => handleClearDraft(d)}
                      className="px-2.5 py-1 rounded-lg bg-red-50 dark:bg-red-950 text-red-600 text-xs font-semibold cursor-pointer"
                    >
                      丢弃
                    </button>
                  </div>
                }
              />
            ))
          )}
        </MobileListGroup>

        {drafts.length > 0 && (
          <button
            type="button"
            onClick={handleClearAll}
            className="w-full min-h-[44px] rounded-xl border border-red-200 dark:border-red-900 text-red-600 dark:text-red-400 text-xs font-semibold hover:bg-red-50 dark:hover:bg-red-950/30 cursor-pointer"
          >
            清空当前用户全部离线草稿
          </button>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 68. 加载失败 / 模型不可用 (Load Failure & Model 422)
// ==========================================
export const AdaptLoadFailScreen: React.FC<AdaptationSharedProps> = () => {
  const { goBack, push } = useMobileNavigation();
  const [kind, setKind] = useState<'network' | 'model422'>('network');

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="加载失败与模型异常" onBack={goBack} />

      <div className="px-4 py-3 max-w-xl mx-auto w-full flex flex-col gap-4">
        <div className="flex p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setKind('network')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              kind === 'network'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            服务 500 / 网络异常
          </button>
          <button
            type="button"
            onClick={() => setKind('model422')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              kind === 'model422'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            AI 模型未配置 (422)
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs min-h-[380px] flex items-center justify-center">
          {kind === 'network' ? (
            <MobileErrorState
              title="服务数据加载失败"
              message="服务端响应超时 (HTTP 500 Internal Server Error)。请检查您的网络连接或稍后重试。"
              retryLabel="重新加载数据"
              onRetry={() => alert('已触发重新拉取数据请求')}
            />
          ) : (
            <div className="flex flex-col items-center justify-center text-center p-4">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mb-4">
                <AppIcon name="cpu" size={30} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
                AI 模型服务未配置 (422)
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed mb-6">
                当前项目或企业未绑定有效的 LLM 大模型提供商。系统已安全降级，您可以切换到纯手动撰写汇报或联系管理员配置密钥。
              </p>
              <div className="flex flex-col gap-2 w-full max-w-xs">
                <button
                  type="button"
                  onClick={() => push({ screen: 'admin-llm-config', title: 'AI 模型配置' })}
                  className="w-full min-h-[44px] rounded-xl bg-[#0058BE] text-white text-sm font-semibold hover:bg-blue-700 cursor-pointer"
                >
                  前往配置企业 AI 模型
                </button>
                <button
                  type="button"
                  onClick={() => alert('已进入手动草稿编辑模式')}
                  className="w-full min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
                >
                  降级为手动编辑
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 69. 权限不足 / 角色变化 (ACL 403 & Role Changes)
// ==========================================
export const AdaptPermissionDeniedScreen: React.FC<AdaptationSharedProps> = () => {
  const { goBack, push } = useMobileNavigation();
  const [reason, setReason] = useState<'403' | 'removed' | 'downgraded'>('403');

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="权限与角色变化" onBack={goBack} />

      <div className="px-4 py-3 max-w-xl mx-auto w-full flex flex-col gap-4">
        <div className="flex p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl text-xs overflow-x-auto">
          {[
            { id: '403', label: 'ACL 403 越权' },
            { id: 'removed', label: '被移出项目' },
            { id: 'downgraded', label: '管理员权限变更' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setReason(item.id as typeof reason)}
              className={`flex-1 py-1.5 px-2 rounded-lg font-medium whitespace-nowrap transition-all cursor-pointer ${
                reason === item.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs min-h-[380px] flex items-center justify-center text-center">
          {reason === '403' && (
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 flex items-center justify-center mb-4">
                <AppIcon name="lock" size={28} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
                无访问权限 (HTTP 403)
              </h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed mb-6">
                您当前的成员身份未被授权查看该责任节点或管理数据。请联系项目负责人提升权限。
              </p>
              <button
                type="button"
                onClick={() => push({ screen: 'work-root', title: '工作台' })}
                className="px-6 min-h-[44px] rounded-xl bg-[#0058BE] text-white text-xs font-semibold cursor-pointer"
              >
                返回工作台
              </button>
            </div>
          )}

          {reason === 'removed' && (
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-amber-100 dark:bg-amber-950/60 text-amber-600 flex items-center justify-center mb-4">
                <AppIcon name="warning" size={28} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
                已被移出该项目
              </h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed mb-6">
                该项目的管理成员已调整了项目人员名单，当前上下文已自动失效。
              </p>
              <button
                type="button"
                onClick={() => push({ screen: 'work-root', title: '切换项目' })}
                className="px-6 min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 text-xs font-semibold cursor-pointer"
              >
                切换至其他活跃项目
              </button>
            </div>
          )}

          {reason === 'downgraded' && (
            <div className="flex flex-col items-center">
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-950/60 text-[#0058BE] flex items-center justify-center mb-4">
                <AppIcon name="shield" size={28} />
              </div>
              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
                角色变更：已转为普通成员
              </h3>
              <p className="text-xs text-slate-500 max-w-xs leading-relaxed mb-6">
                您的企业管理员角色已被调整，企业级配置中心已转为只读预览模式。
              </p>
              <button
                type="button"
                onClick={() => push({ screen: 'me-root', title: '我的' })}
                className="px-6 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                前往个人设置
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 70. 删除与高风险操作确认 (High Risk Confirm)
// ==========================================
export const AdaptDangerConfirmScreen: React.FC<AdaptationSharedProps> = () => {
  const { goBack } = useMobileNavigation();
  const [agreed, setAgreed] = useState(false);
  const [actionType, setActionType] = useState<'task' | 'project' | 'axis'>('task');
  const [executed, setExecuted] = useState(false);

  const getImpacts = () => {
    switch (actionType) {
      case 'task':
        return [
          '该任务及其 3 个子任务将立即移入回收站，保留 30 天可恢复。',
          '人轴责任链中关联的事项进度将被同步冻结。',
          '与该任务关联的即时消息提及和通知仍保留只读历史。',
        ];
      case 'project':
        return [
          '归档项目后，所有成员将失去写入权限，整个项目转为只读。',
          '相关的 AI 汇报与自动化审计任务将暂停执行。',
          '仅企业超级管理员可在 90 天内解冻归档项目。',
        ];
      case 'axis':
        return [
          '重置责任链布局将清除当前所有拖拽自定义坐标，恢复默认拓扑图。',
          '人员之间的上下级从属关系保持不变。',
          '操作不可撤销，若此前有精细布局调整建议先截屏留底。',
        ];
    }
  };

  const handleExecute = () => {
    if (!agreed) return;
    setExecuted(true);
    setTimeout(() => {
      setExecuted(false);
      setAgreed(false);
      alert('已执行高风险操作，业务数据已同步处理。');
    }, 1000);
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="删除与高风险操作确认" onBack={goBack} />

      <div className="px-4 py-3 max-w-xl mx-auto w-full flex flex-col gap-4">
        {/* 操作类型切换 */}
        <div className="flex p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl text-xs">
          {[
            { id: 'task', label: '删除任务' },
            { id: 'project', label: '归档项目' },
            { id: 'axis', label: '重置人轴布局' },
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setActionType(item.id as typeof actionType);
                setAgreed(false);
              }}
              className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
                actionType === item.id
                  ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                  : 'text-slate-600 dark:text-slate-400'
              }`}
            >
              {item.label}
            </button>
          ))}
        </div>

        {/* 拟态高风险确认弹层卡片 */}
        <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-red-200 dark:border-red-950 shadow-lg flex flex-col gap-4">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950 text-red-600 mx-auto flex items-center justify-center">
            <AppIcon name="alert" size={28} />
          </div>

          <div className="text-center">
            <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">
              {actionType === 'task' ? '确认删除核心任务？' : actionType === 'project' ? '确认归档整个项目？' : '确认重置人轴画布布局？'}
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
              请仔细阅读以下影响范围，确认后继续执行。
            </p>
          </div>

          {/* 明确影响范围列表 */}
          <div className="p-4 bg-red-50/60 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900 flex flex-col gap-2">
            <span className="text-xs font-bold text-red-700 dark:text-red-300">操作直接影响：</span>
            {getImpacts().map((impact, i) => (
              <p key={i} className="text-xs text-red-900 dark:text-red-200 leading-relaxed flex items-start gap-1.5">
                <span className="text-red-500 font-bold shrink-0">•</span>
                <span>{impact}</span>
              </p>
            ))}
          </div>

          {/* 明确确认勾选框 */}
          <label className="flex items-center gap-3 p-3 bg-slate-50 dark:bg-slate-800/60 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={agreed}
              onChange={(e) => setAgreed(e.target.checked)}
              className="w-5 h-5 accent-red-600"
            />
            <span className="text-xs font-medium text-slate-800 dark:text-slate-200">
              我已完整阅读并充分知晓上述影响，确认执行操作
            </span>
          </label>

          <div className="flex flex-col gap-2 pt-2">
            <button
              type="button"
              disabled={!agreed || executed}
              onClick={handleExecute}
              className="w-full min-h-[48px] rounded-xl bg-red-600 text-white font-medium text-base hover:bg-red-700 active:bg-red-800 disabled:opacity-40 transition-colors cursor-pointer"
            >
              {executed ? '正在执行…' : '确认并执行高风险操作'}
            </button>
            <button
              type="button"
              onClick={goBack}
              className="w-full min-h-[48px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-sm hover:bg-slate-200 cursor-pointer"
            >
              取消并返回
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 71. 窄屏适配 · 320 (320px Viewport)
// ==========================================
export const AdaptNarrow320Screen: React.FC<AdaptationSharedProps> = () => {
  const { goBack } = useMobileNavigation();

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="窄屏适配 (320px)" onBack={goBack} />

      <div className="p-4 max-w-xl mx-auto w-full flex flex-col items-center gap-4">
        <p className="text-xs text-slate-500 text-center max-w-sm">
          以下演示在 320px 极窄屏幕（如 iPhone SE 1st Gen）下的布局响应，严格保证触控热区至少 48px，长文字自适应换行，无水平截断。
        </p>

        {/* 320px 实体容器 */}
        <div className="w-[320px] bg-white dark:bg-slate-900 border-2 border-dashed border-[#0058BE] rounded-3xl p-3.5 shadow-md flex flex-col gap-3">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-blue-100 text-[#0058BE] font-bold text-xs flex items-center justify-center">
                320
              </div>
              <span className="text-xs font-bold truncate">320px 窄屏基准</span>
            </div>
            <span className="text-[10px] bg-blue-50 text-[#0058BE] px-2 py-0.5 rounded font-mono">
              W: 320px
            </span>
          </div>

          {/* 窄屏任务项 */}
          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-xl flex flex-col gap-2">
            <div className="flex items-start gap-2">
              <input type="checkbox" className="w-5 h-5 accent-[#0058BE] mt-0.5" />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug break-words">
                  关于生产集群高可用双活部署方案与责任链节点确认评审
                </p>
                <div className="flex flex-wrap gap-1 mt-1.5">
                  <span className="text-[10px] bg-red-100 text-red-800 px-1.5 py-0.5 rounded font-medium">高优先级</span>
                  <span className="text-[10px] bg-blue-100 text-blue-800 px-1.5 py-0.5 rounded font-medium">架构部</span>
                  <span className="text-[10px] bg-slate-200 text-slate-700 px-1.5 py-0.5 rounded font-medium">今天 18:00</span>
                </div>
              </div>
            </div>
          </div>

          {/* 操作按钮不截断 */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              className="flex-1 min-h-[44px] rounded-xl bg-[#0058BE] text-white text-xs font-semibold flex items-center justify-center gap-1 active:scale-95"
            >
              <AppIcon name="check" size={14} />
              <span>完成</span>
            </button>
            <button
              type="button"
              className="flex-1 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold flex items-center justify-center gap-1"
            >
              <AppIcon name="edit" size={14} />
              <span>编辑</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 72. 宽屏手机 · 430 (430px Viewport)
// ==========================================
export const AdaptWide430Screen: React.FC<AdaptationSharedProps> = () => {
  const { goBack } = useMobileNavigation();

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="宽屏手机 (430px)" onBack={goBack} />

      <div className="p-4 max-w-xl mx-auto w-full flex flex-col items-center gap-4">
        <p className="text-xs text-slate-500 text-center max-w-sm">
          以下演示在 430px 大屏手机（如 iPhone 16 Pro Max）下的多列信息组织与更宽松舒适的排版视距。
        </p>

        {/* 430px 实体容器 */}
        <div className="w-[430px] max-w-full bg-white dark:bg-slate-900 border-2 border-dashed border-emerald-500 rounded-3xl p-5 shadow-md flex flex-col gap-4">
          <div className="flex items-center justify-between pb-2 border-b border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-emerald-100 text-emerald-700 font-bold text-xs flex items-center justify-center">
                430
              </div>
              <span className="text-sm font-bold">430px Pro Max 宽屏模式</span>
            </div>
            <span className="text-[10px] bg-emerald-50 text-emerald-700 px-2 py-0.5 rounded font-mono">
              W: 430px
            </span>
          </div>

          {/* 宽屏指标卡片双列并排 */}
          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 bg-blue-50/60 dark:bg-blue-950/40 rounded-2xl flex flex-col">
              <span className="text-xs text-blue-700 dark:text-blue-300 font-medium">待我处理任务</span>
              <span className="text-2xl font-black text-[#0058BE] mt-1">14</span>
              <span className="text-[10px] text-slate-400 mt-0.5">本周累计完成 28 项</span>
            </div>
            <div className="p-3 bg-emerald-50/60 dark:bg-emerald-950/40 rounded-2xl flex flex-col">
              <span className="text-xs text-emerald-700 dark:text-emerald-300 font-medium">责任链健康度</span>
              <span className="text-2xl font-black text-emerald-600 mt-1">98%</span>
              <span className="text-[10px] text-slate-400 mt-0.5">证据材料已完整对齐</span>
            </div>
          </div>

          <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-2xl flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-700 dark:text-slate-300">
              宽屏留白与视距测试：边距对称，文本行长舒适
            </span>
            <AppIcon name="arrow-right" size={16} className="text-slate-400" />
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 73. 系统大字体 · 150% (Dynamic Type 150%)
// ==========================================
export const AdaptFont150Screen: React.FC<AdaptationSharedProps> = () => {
  const { goBack } = useMobileNavigation();

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="系统大字体 150%" onBack={goBack} />

      <div className="p-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 rounded-xl text-xs text-[#0058BE] dark:text-blue-300">
          模拟 iOS Dynamic Type 150% 放大比例：正文由 17px 放大至 25.5px，按钮自动增高并支持折行。
        </div>

        {/* 150% 模拟卡片 */}
        <div
          className="p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-4"
          style={{ fontSize: '24px', lineHeight: 1.4 }}
        >
          <h3 className="font-bold text-slate-900 dark:text-white" style={{ fontSize: '28px' }}>
            任务标题放大展示
          </h3>
          <p className="text-slate-600 dark:text-slate-300 leading-relaxed break-words" style={{ fontSize: '22px' }}>
            系统检测到大字体偏好。所有标签和辅助说明均自动折行，绝不通过截断隐藏关键内容。
          </p>

          <div className="flex flex-wrap gap-2 pt-2">
            <span className="px-3 py-1 bg-amber-100 text-amber-900 rounded-xl font-medium" style={{ fontSize: '18px' }}>
              加急事项
            </span>
            <span className="px-3 py-1 bg-blue-100 text-blue-900 rounded-xl font-medium" style={{ fontSize: '18px' }}>
              产品交付
            </span>
          </div>

          <button
            type="button"
            className="w-full min-h-[60px] rounded-2xl bg-[#0058BE] text-white font-bold flex items-center justify-center gap-2 cursor-pointer mt-2"
            style={{ fontSize: '22px' }}
          >
            <AppIcon name="check" size={24} />
            <span>确认并提交 (自适应高度)</span>
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 74. 系统大字体 · 200% (Dynamic Type 200%)
// ==========================================
export const AdaptFont200Screen: React.FC<AdaptationSharedProps> = () => {
  const { goBack } = useMobileNavigation();

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="系统大字体 200%" onBack={goBack} />

      <div className="p-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        <div className="p-3.5 bg-amber-50 dark:bg-amber-950/40 border border-amber-300 dark:border-amber-800 rounded-xl text-xs text-amber-900 dark:text-amber-200">
          模拟极高无障碍字号 200% 模式：水平工具条全部转为纵向单列堆叠，避免横向溢出。
        </div>

        {/* 200% 模拟卡片 */}
        <div
          className="p-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col gap-4"
          style={{ fontSize: '32px', lineHeight: 1.35 }}
        >
          <h2 className="font-extrabold text-slate-900 dark:text-white" style={{ fontSize: '34px' }}>
            200% 无障碍模式
          </h2>

          <p className="text-slate-700 dark:text-slate-200 break-words" style={{ fontSize: '26px' }}>
            文字保持高对比度与高易读性，多操作按钮竖直平铺。
          </p>

          <div className="flex flex-col gap-3 pt-2">
            <button
              type="button"
              className="w-full min-h-[64px] rounded-2xl bg-[#0058BE] text-white font-bold flex items-center justify-center gap-2 cursor-pointer"
              style={{ fontSize: '24px' }}
            >
              <AppIcon name="check" size={28} />
              <span>主要确认操作</span>
            </button>
            <button
              type="button"
              className="w-full min-h-[64px] rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-bold flex items-center justify-center gap-2 cursor-pointer"
              style={{ fontSize: '24px' }}
            >
              <AppIcon name="close" size={28} />
              <span>次要取消操作</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 75. 深色模式 (Dark Mode & WCAG AA)
// ==========================================
export const AdaptDarkModeScreen: React.FC<AdaptationSharedProps> = () => {
  const { goBack } = useMobileNavigation();

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-black text-white">
      <MobileTopBar title="深色模式 (WCAG AA)" onBack={goBack} />

      <div className="px-4 py-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        {/* WCAG 合规指标卡片 */}
        <div className="p-5 bg-[#1C1C1E] border border-white/10 rounded-3xl flex flex-col gap-3">
          <div className="flex items-center justify-between">
            <span className="text-xs uppercase tracking-wider text-emerald-400 font-bold">
              WCAG 2.1 AA 认证合规
            </span>
            <span className="text-[11px] px-2 py-0.5 rounded-full bg-emerald-950 text-emerald-300 font-mono">
              7.2:1 对比度
            </span>
          </div>
          <h3 className="text-lg font-bold text-white">纯黑与层级灰色规范</h3>
          <p className="text-xs text-slate-300 leading-relaxed">
            APP V2 采用 OLED 纯黑背景 (#000000)，卡片底色采用系统暗灰 (#1C1C1E)，次要文本采用 60% 白，保障夜间护眼与省电。
          </p>
        </div>

        {/* 深色列表项展示 */}
        <div className="bg-[#1C1C1E] rounded-3xl border border-white/10 overflow-hidden divide-y divide-white/10">
          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-600/30 text-blue-400 flex items-center justify-center">
                <AppIcon name="shield" size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-medium text-white">系统安全审计</span>
                <span className="text-xs text-slate-400">已启用端到端数据传输加密</span>
              </div>
            </div>
            <span className="text-xs text-emerald-400 font-medium">正常</span>
          </div>

          <div className="p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-purple-600/30 text-purple-400 flex items-center justify-center">
                <AppIcon name="ai" size={20} />
              </div>
              <div className="flex flex-col">
                <span className="text-base font-medium text-white">AI 智能分析引擎</span>
                <span className="text-xs text-slate-400">DeepSeek 汇报模型就绪</span>
              </div>
            </div>
            <span className="text-xs text-blue-400 font-medium">活跃</span>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 76. 平板双栏 (Tablet Master-Detail Split)
// ==========================================
export const AdaptTabletSplitScreen: React.FC<AdaptationSharedProps> = ({ tasks = [] }) => {
  const { goBack } = useMobileNavigation();
  const [selectedId, setSelectedId] = useState<string>('task_1');

  const demoItems = [
    { id: 'task_1', title: '完成 APP V2 界面全量测试用例编写', time: '10:30', pri: 'High' },
    { id: 'task_2', title: '人轴责任链画布与节点拖拽性能优化', time: '14:00', pri: 'Medium' },
    { id: 'task_3', title: '验证多端 Web 与小程序数据同步一致性', time: '17:30', pri: 'Low' },
  ];

  const currentItem = demoItems.find((x) => x.id === selectedId) || demoItems[0];

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-hidden bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="平板双栏适配 (Master-Detail)" onBack={goBack} />

      <div className="flex-1 flex w-full h-[calc(100%-56px)] overflow-hidden">
        {/* 左侧 Master 列表栏 (320px) */}
        <div className="w-[320px] shrink-0 border-r border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex flex-col overflow-y-auto">
          <div className="p-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-slate-500">事项列表 (Master)</span>
            <span className="text-[11px] bg-blue-100 text-[#0058BE] px-2 py-0.5 rounded-full font-bold">3 项</span>
          </div>

          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            {demoItems.map((item) => (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                onClick={() => setSelectedId(item.id)}
                className={`p-3.5 flex flex-col gap-1 cursor-pointer transition-colors ${
                  selectedId === item.id
                    ? 'bg-blue-50 dark:bg-blue-950/50 border-l-4 border-[#0058BE]'
                    : 'hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                    {item.title}
                  </span>
                </div>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-[10px] text-slate-400">{item.time}</span>
                  <span className="text-[10px] bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded font-medium">
                    {item.pri}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* 右侧 Detail 工作区详情 */}
        <div className="flex-1 bg-[#F2F2F7] dark:bg-black p-6 overflow-y-auto flex flex-col gap-4">
          <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/80 dark:border-slate-800 shadow-sm flex flex-col gap-4">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-blue-600 bg-blue-50 dark:bg-blue-950 px-2.5 py-1 rounded-lg">
                详情面板 (Detail Panel)
              </span>
              <span className="text-xs text-slate-400 font-mono">ID: {currentItem.id}</span>
            </div>

            <h2 className="text-xl font-bold text-slate-900 dark:text-white">
              {currentItem.title}
            </h2>

            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              平板双栏模式充分利用 iPad / 平板横屏宽度，左侧保持导航和列表可达，右侧沉浸查看详情与进行编辑，无需频繁前进后退。
            </p>

            <div className="flex gap-2 pt-4">
              <button
                type="button"
                onClick={() => alert('已在平板双栏中保存当前项')}
                className="px-5 min-h-[44px] rounded-xl bg-[#0058BE] text-white text-xs font-semibold cursor-pointer"
              >
                保存变更
              </button>
              <button
                type="button"
                className="px-5 min-h-[44px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-semibold cursor-pointer"
              >
                查看审计记录
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 77. 横屏手机 (Landscape Phone Adaptation)
// ==========================================
export const AdaptLandscapeScreen: React.FC<AdaptationSharedProps> = () => {
  const { goBack } = useMobileNavigation();

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      {/* 紧凑顶栏 (高度 40px) */}
      <div className="h-10 px-6 bg-white/90 dark:bg-slate-900/90 backdrop-blur-md border-b border-slate-200 dark:border-slate-800 flex items-center justify-between">
        <button type="button" onClick={goBack} className="flex items-center gap-1 text-xs text-[#0058BE]">
          <AppIcon name="back" size={14} />
          <span>返回</span>
        </button>
        <span className="text-xs font-bold">横屏模式 · 844×390</span>
        <span className="text-[10px] text-slate-400">Safe Area 左右避让</span>
      </div>

      <div className="px-8 py-3 max-w-4xl mx-auto w-full grid grid-cols-2 gap-4">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-2">
          <span className="text-xs font-bold text-[#0058BE]">横屏左侧：人轴与统计</span>
          <p className="text-xs text-slate-500 leading-relaxed">
            手机横握时垂直空间有限，顶栏与底栏自动转为紧凑尺寸（36-40px），确保内容区纵向可见高度 &gt; 300px。
          </p>
        </div>

        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-2">
          <span className="text-xs font-bold text-emerald-600">横屏右侧：操作与编辑</span>
          <p className="text-xs text-slate-500 leading-relaxed">
            左右两侧自动应用 env(safe-area-inset-left) 与 env(safe-area-inset-right) 边距，完全避开灵动岛和刘海区域。
          </p>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 78. 键盘弹出与输入 (Keyboard Inset Simulator)
// ==========================================
export const AdaptKeyboardInsetScreen: React.FC<AdaptationSharedProps> = () => {
  const { goBack } = useMobileNavigation();
  const [keyboardOpen, setKeyboardOpen] = useState(false);
  const [inputText, setInputText] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  const toggleKeyboard = () => {
    setKeyboardOpen(!keyboardOpen);
    if (!keyboardOpen) {
      setTimeout(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      }, 100);
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-hidden bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="键盘弹出与输入避让" onBack={goBack} />

      <div className="flex-1 flex flex-col overflow-y-auto px-4 py-3 max-w-xl mx-auto w-full">
        <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 flex flex-col gap-2 mb-4">
          <span className="text-xs font-bold text-[#0058BE]">视口避让原理 (visualViewport)</span>
          <p className="text-xs text-slate-500 leading-relaxed">
            点击下方切换按钮模拟移动端软键盘弹出（高度 280px）。输入框与底部提交操作栏自动抬高，始终保持在键盘上方可见，防止被遮挡。
          </p>
          <button
            type="button"
            onClick={toggleKeyboard}
            className="mt-2 w-full min-h-[40px] rounded-xl bg-slate-100 dark:bg-slate-800 text-xs font-semibold hover:bg-slate-200 cursor-pointer"
          >
            {keyboardOpen ? '收起软键盘' : '模拟键盘弹出 (280px)'}
          </button>
        </div>

        <div className="flex-1 min-h-[120px] flex items-center justify-center text-xs text-slate-400">
          聊天会话或长表单内容区…
        </div>

        <div ref={bottomRef} className="pt-2">
          {/* 吸底输入条 */}
          <div className="p-3 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-lg flex items-center gap-2">
            <input
              type="text"
              value={inputText}
              onChange={(e) => setInputText(e.target.value)}
              placeholder="请输入工作汇报或消息…"
              className="flex-1 min-h-[44px] px-3.5 bg-slate-50 dark:bg-slate-800 rounded-xl text-sm border-none outline-none"
            />
            <button
              type="button"
              className="px-4 min-h-[44px] rounded-xl bg-[#0058BE] text-white text-xs font-semibold cursor-pointer shrink-0"
            >
              发送
            </button>
          </div>
        </div>

        {/* 模拟软键盘实体 */}
        {keyboardOpen && (
          <div className="h-[280px] bg-slate-300 dark:bg-slate-800 rounded-t-3xl mt-2 p-4 flex flex-col items-center justify-center text-slate-500 font-mono text-xs select-none animate-in slide-in-from-bottom duration-200">
            <div className="w-12 h-1 bg-slate-400 rounded-full mb-3" />
            <span>[ 虚拟键盘区域 · 高度 280px ]</span>
            <span className="text-[10px] mt-1 text-slate-400">操作栏吸顶于键盘上方，保持可达</span>
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 96. 删除账号确认 (Delete Account Confirmation)
// ==========================================
export const AdaptAccountDeleteScreen: React.FC<AdaptationSharedProps> = ({ onLogout }) => {
  const { goBack } = useMobileNavigation();
  const [password, setPassword] = useState('');
  const [keyword, setKeyword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const canSubmit = password.length > 0 && keyword.trim() === 'DELETE';

  const handleDelete = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      await deleteMyAccount(password, 'DELETE');
      alert('账号已注销成功，感谢您的使用。');
      if (onLogout) {
        await onLogout();
      }
    } catch (err) {
      setErrMsg(err instanceof Error ? err.message : '注销申请失败，请核对密码');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="注销账号确认" onBack={goBack} />

      <div className="px-4 py-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        <div className="p-6 bg-white dark:bg-slate-900 rounded-3xl border border-red-200 dark:border-red-950 shadow-md flex flex-col gap-4">
          <div className="w-14 h-14 rounded-full bg-red-100 dark:bg-red-950 text-red-600 mx-auto flex items-center justify-center">
            <AppIcon name="alert" size={28} />
          </div>

          <div className="text-center">
            <h3 className="text-lg font-bold text-red-600 dark:text-red-400">
              永久注销此账号
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              账号删除为最终不可逆操作，所有关联数据将即刻销毁。
            </p>
          </div>

          {errMsg && (
            <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 rounded-xl text-red-600 text-xs">
              {errMsg}
            </div>
          )}

          <div className="p-4 bg-red-50/60 dark:bg-red-950/20 rounded-2xl border border-red-100 dark:border-red-900 text-xs text-red-900 dark:text-red-200 flex flex-col gap-1.5 leading-relaxed">
            <span className="font-bold">销毁内容包括：</span>
            <span>• 个人创建的所有私有待办任务与未同步离线草稿</span>
            <span>• 在所有项目人轴责任链中的责任人身份将被解除</span>
            <span>• 所有已签发的 API Token、会话凭证将立即吊销失效</span>
          </div>

          <MobileField label="输入当前账号密码" required>
            <MobileInput
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码进行身份核验"
            />
          </MobileField>

          <MobileField label="键入确认词" helperText="必须输入大写字母 DELETE 确认" required>
            <MobileInput
              value={keyword}
              onChange={(e) => setKeyword(e.target.value)}
              placeholder="DELETE"
            />
          </MobileField>

          <button
            type="button"
            disabled={!canSubmit || submitting}
            onClick={handleDelete}
            className="w-full min-h-[48px] rounded-xl bg-red-600 text-white font-medium text-base hover:bg-red-700 active:bg-red-800 disabled:opacity-40 transition-colors cursor-pointer shadow-sm mt-2"
          >
            {submitting ? '正在注销…' : '永久注销此账号'}
          </button>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 97. 启动与同步中 / 二次验证 (Bootstrap & 2FA)
// ==========================================
export const AdaptBootSyncScreen: React.FC<AdaptationSharedProps> = () => {
  const { goBack } = useMobileNavigation();
  const [mode, setMode] = useState<'boot' | '2fa'>('boot');
  const [pin, setPin] = useState(['', '', '', '', '', '']);
  const [cooldown, setCooldown] = useState(45);

  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handlePinChange = (idx: number, val: string) => {
    if (val.length > 1) val = val.slice(-1);
    const updated = [...pin];
    updated[idx] = val;
    setPin(updated);
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="启动与二次验证" onBack={goBack} />

      <div className="px-4 py-3 max-w-xl mx-auto w-full flex flex-col gap-4">
        <div className="flex p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setMode('boot')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              mode === 'boot'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            启动状态与同步中
          </button>
          <button
            type="button"
            onClick={() => setMode('2fa')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              mode === '2fa'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            敏感操作二次验证
          </button>
        </div>

        <div className="bg-white dark:bg-slate-900 rounded-3xl p-6 border border-slate-200/80 dark:border-slate-800 shadow-xs min-h-[380px] flex items-center justify-center">
          {mode === 'boot' ? (
            <div className="flex flex-col items-center text-center max-w-xs">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-blue-700 to-[#0058BE] text-white flex items-center justify-center shadow-lg mb-6">
                <AppIcon name="work" size={32} />
              </div>

              <div className="w-8 h-8 rounded-full border-3 border-slate-200 dark:border-slate-700 border-t-[#0058BE] animate-spin mb-4" />

              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
                正在同步企业协同数据…
              </h3>
              <p className="text-xs text-slate-400 mb-6">
                正在校验离线令牌与拉取人轴责任网络，请稍候。
              </p>

              {/* 进度步进条 */}
              <div className="w-full flex flex-col gap-2 text-xs text-left">
                <div className="flex items-center gap-2 text-emerald-600">
                  <AppIcon name="check-circle" size={14} />
                  <span>认证凭据有效性校验通过</span>
                </div>
                <div className="flex items-center gap-2 text-emerald-600">
                  <AppIcon name="check-circle" size={14} />
                  <span>企业配置与角色权限对齐</span>
                </div>
                <div className="flex items-center gap-2 text-[#0058BE] font-medium animate-pulse">
                  <AppIcon name="refresh" size={14} />
                  <span>正在增量同步最新任务与证据材料…</span>
                </div>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center text-center w-full max-w-xs">
              <div className="w-14 h-14 rounded-full bg-blue-50 dark:bg-blue-950/60 text-[#0058BE] flex items-center justify-center mb-3">
                <AppIcon name="shield" size={26} />
              </div>

              <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 mb-1">
                敏感操作二次安全验证
              </h3>
              <p className="text-xs text-slate-500 mb-6">
                验证码已发送至绑定的安全邮箱/手机，请输入 6 位动态验证码确认：
              </p>

              {/* 6 位数字验证码输入方格 */}
              <div className="flex justify-between w-full mb-6 gap-2">
                {pin.map((digit, i) => (
                  <input
                    key={i}
                    type="text"
                    maxLength={1}
                    value={digit}
                    onChange={(e) => handlePinChange(i, e.target.value)}
                    className="w-11 h-13 text-center text-xl font-bold bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl focus:border-[#0058BE] focus:ring-2 focus:ring-[#0058BE] outline-none"
                  />
                ))}
              </div>

              <button
                type="button"
                onClick={() => alert('安全二次验证通过！')}
                className="w-full min-h-[44px] rounded-xl bg-[#0058BE] text-white text-sm font-semibold hover:bg-blue-700 cursor-pointer shadow-xs mb-3"
              >
                确认授权并继续
              </button>

              <button
                type="button"
                disabled={cooldown > 0}
                onClick={() => setCooldown(60)}
                className="text-xs text-[#0058BE] disabled:text-slate-400 font-medium cursor-pointer"
              >
                {cooldown > 0 ? `重新获取 (${cooldown}s)` : '重新发送验证码'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
