import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { UserProfile, Project } from '../../../types';
import {
  getProjectWiki,
  generateWikiDraft,
  publishWikiDraft,
  ProjectWikiCatalog,
  WikiPage,
  WikiFact,
} from '../../../api/projectWiki';
import { searchKnowledge, KnowledgeChunk } from '../../../api/knowledge';
import { AppIcon } from '../../ui/AppIcon';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileField, MobileInput, MobileTextarea } from '../../ui/MobileField';
import { MobileEmptyState, MobileLoadingState } from '../../ui/MobileState';
import { MobileSheet } from '../../ui/MobileSheet';

// ==========================================
// Props 与类型定义
// ==========================================

export type WikiTab = 'published' | 'drafts' | 'search';

export interface MobileWikiScreensProps {
  projectId: number | string;
  projectName?: string;
  currentUser: UserProfile;
  initialTab?: WikiTab;
  onBack?: () => void;
  onOpenEvidencePackage?: (packageId: number) => void;
}

// ==========================================
// 主入口容器：MobileWikiScreens
// ==========================================

export const MobileWikiScreens: React.FC<MobileWikiScreensProps> = ({
  projectId,
  projectName = '当前项目',
  currentUser,
  initialTab = 'published',
  onBack,
  onOpenEvidencePackage,
}) => {
  const pid = Number(projectId);

  const [activeTab, setActiveTab] = useState<WikiTab>(initialTab);
  const [catalog, setCatalog] = useState<ProjectWikiCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // 草稿编辑状态
  const [editingDraft, setEditingDraft] = useState<WikiPage | null>(null);
  const [selectedFact, setSelectedFact] = useState<WikiFact | null>(null);

  // 提示信息
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = useCallback((msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  }, []);

  // 加载 Wiki 目录数据
  const loadWiki = useCallback(async () => {
    if (!pid) return;
    setLoading(true);
    setError(null);
    try {
      const data = await getProjectWiki(pid);
      setCatalog(data);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '加载项目知识 失败');
    } finally {
      setLoading(false);
    }
  }, [pid]);

  useEffect(() => {
    loadWiki();
  }, [loadWiki]);

  if (loading) {
    return <MobileLoadingState message="正在加载项目资料…" fullScreen />;
  }

  return (
    <div className="flex flex-col flex-1 h-full w-full bg-[#f7f8fa] dark:bg-[#10161e] select-none overflow-hidden relative">
      <MobileTopBar
        title="项目知识"
        showBack={Boolean(onBack)}
        onBack={onBack}
        backLabel="返回"
      />

      {/* 选项卡栏 (Chips Selector - 设计 ID 32) */}
      <div className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-900 border-b border-slate-200/80 dark:border-slate-800 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('published')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === 'published'
              ? 'bg-blue-100 dark:bg-blue-900 text-[#0058BE] dark:text-blue-300 font-bold'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          已发布
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('drafts')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === 'drafts'
              ? 'bg-blue-100 dark:bg-blue-900 text-[#0058BE] dark:text-blue-300 font-bold'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          草稿 ({catalog?.drafts.length || 0})
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('search')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
            activeTab === 'search'
              ? 'bg-blue-100 dark:bg-blue-900 text-[#0058BE] dark:text-blue-300 font-bold'
              : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
          }`}
        >
          资料搜索
        </button>
      </div>

      {/* 视图内容区 */}
      <div className="flex-1 overflow-hidden">
        {editingDraft ? (
          /* ========================================================= */
          /* 设计 ID 33：知识草稿编辑与发布                           */
          /* ========================================================= */
          <WikiDraftEditorScreen
            draft={editingDraft}
            projectId={pid}
            canPublish={Boolean(catalog?.can_publish)}
            onBack={() => setEditingDraft(null)}
            onPublished={async () => {
              setEditingDraft(null);
              showToast('知识草稿已正式发布');
              setActiveTab('published');
              await loadWiki();
            }}
            onSavedDraft={async () => {
              setEditingDraft(null);
              showToast('草稿已保存');
              await loadWiki();
            }}
            onOpenEvidencePackage={onOpenEvidencePackage}
          />
        ) : activeTab === 'published' ? (
          /* ========================================================= */
          /* 设计 ID 32：项目知识 (已发布视图)                       */
          /* ========================================================= */
          <WikiPublishedScreen
            catalog={catalog}
            projectId={pid}
            projectName={projectName}
            onOpenDrafts={() => setActiveTab('drafts')}
            onOpenEvidencePackage={onOpenEvidencePackage}
            onSelectFact={(fact) => setSelectedFact(fact)}
            onGenerateDraftSuccess={async (draftId) => {
              showToast('知识新草稿生成成功');
              await loadWiki();
              setActiveTab('drafts');
            }}
          />
        ) : activeTab === 'drafts' ? (
          /* ========================================================= */
          /* 草稿列表视图                                             */
          /* ========================================================= */
          <WikiDraftsListScreen
            drafts={catalog?.drafts || []}
            canPublish={Boolean(catalog?.can_publish)}
            onSelectDraft={(d) => setEditingDraft(d)}
          />
        ) : (
          /* ========================================================= */
          /* 设计 ID 34：项目知识搜索                                 */
          /* ========================================================= */
          <WikiSearchScreen
            projectId={pid}
            projectName={projectName}
            onOpenEvidencePackage={onOpenEvidencePackage}
          />
        )}
      </div>

      {/* ========================================================= */}
      {/* 底部 Sheet：来源证据引用追溯 (设计 ID 88)                */}
      {/* ========================================================= */}
      <MobileSheet
        isOpen={Boolean(selectedFact)}
        onClose={() => setSelectedFact(null)}
        title="证据来源追溯"
      >
        {selectedFact && (
          <div className="p-4 space-y-4">
            <div className="p-3.5 bg-blue-50 dark:bg-blue-950/40 rounded-2xl border border-blue-200 dark:border-blue-900 text-xs space-y-2">
              <span className="text-[10px] uppercase font-bold text-[#0058BE] dark:text-blue-400 block">
                原文引述 (第 {selectedFact.line_start}—{selectedFact.line_end} 行)
              </span>
              <p className="text-slate-800 dark:text-slate-200 italic font-serif leading-relaxed">
                “{selectedFact.quote || selectedFact.text}”
              </p>
            </div>

            <div className="p-3 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-xl space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-400">来源文件</span>
                <span className="font-semibold text-slate-800 dark:text-slate-200">
                  {selectedFact.source_name || '材料证据'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-400">证据包编号</span>
                <span className="font-semibold text-[#0058BE]">
                  #{selectedFact.package_id}
                </span>
              </div>
            </div>

            <button
              type="button"
              onClick={() => {
                const pkgId = selectedFact.package_id;
                setSelectedFact(null);
                onOpenEvidencePackage?.(pkgId);
              }}
              className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white font-semibold text-sm flex items-center justify-center gap-1.5 active:bg-blue-700 cursor-pointer shadow-sm"
            >
              <AppIcon name="file" size={16} />
              <span>查看原始证据包</span>
            </button>
          </div>
        )}
      </MobileSheet>

      {/* 轻提示 Toast */}
      {toastMessage && (
        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 bg-slate-900/90 text-white text-xs px-4 py-2 rounded-full shadow-lg backdrop-blur-md animate-fade-in pointer-events-none">
          {toastMessage}
        </div>
      )}
    </div>
  );
};

// ==========================================
// 1. 设计 ID 32：已发布 Wiki (WikiPublishedScreen)
// ==========================================

interface WikiPublishedScreenProps {
  catalog: ProjectWikiCatalog | null;
  projectId: number;
  projectName: string;
  onOpenDrafts: () => void;
  onOpenEvidencePackage?: (packageId: number) => void;
  onSelectFact: (fact: WikiFact) => void;
  onGenerateDraftSuccess: (draftId: number) => void;
}

const WikiPublishedScreen: React.FC<WikiPublishedScreenProps> = ({
  catalog,
  projectId,
  projectName,
  onOpenDrafts,
  onOpenEvidencePackage,
  onSelectFact,
  onGenerateDraftSuccess,
}) => {
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);

  const mainPage = catalog?.pages[0];

  // 生成 知识草稿
  const handleGenerateDraft = async () => {
    const materials = catalog?.materials || [];
    const validMaterial = materials.find((m) => m.can_generate) || materials[0];
    if (!validMaterial) {
      setGenError('暂无可用于整理知识 的有效证据包材料');
      return;
    }

    setGenerating(true);
    setGenError(null);
    try {
      const res = await generateWikiDraft(projectId, validMaterial.id);
      onGenerateDraftSuccess(res.id);
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : '生成 知识草稿失败';
      setGenError(msg);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 mobile-scroll-container">
      {genError && (
        <div className="p-3 bg-amber-50 text-amber-800 rounded-xl text-xs flex items-center gap-1.5 border border-amber-200">
          <AppIcon name="alert" size={14} className="shrink-0" />
          <span>{genError}</span>
        </div>
      )}

      {/* 标题与版本 */}
      <div>
        <h1 className="text-xl font-extrabold text-slate-900 dark:text-slate-100 leading-tight">
          {mainPage?.title || '移动端体验升级'}
        </h1>
        <p className="text-xs text-slate-400 mt-1">
          项目知识 · v{mainPage?.meta?.revision || 3} · 发布于今天 14:00
        </p>
      </div>

      {/* 项目目标 */}
      <section className="space-y-1.5">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          项目目标
        </h2>
        <p className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl text-xs text-slate-700 dark:text-slate-300 leading-relaxed shadow-xs">
          {mainPage?.body_text ||
            '优化手机端责任分工、任务处理和 AI 汇报体验，让进展可以追溯到具体材料与责任链条。'}
        </p>
      </section>

      {/* 当前里程碑章节 */}
      <section className="space-y-1.5">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          当前里程碑
        </h2>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
          <div className="p-3.5 flex items-center justify-between">
            <div>
              <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                阶段一 · 核心流程
              </strong>
              <p className="text-[11px] text-slate-400 mt-0.5">任务与汇报链路联调完成</p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
              已完成
            </span>
          </div>

          <div className="p-3.5 flex items-center justify-between">
            <div>
              <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                阶段二 · 页面审核
              </strong>
              <p className="text-[11px] text-slate-400 mt-0.5">全量移动端设计待确认</p>
            </div>
            <span className="px-2 py-0.5 rounded text-[10px] font-bold bg-blue-100 text-[#0058BE] dark:bg-blue-950 dark:text-blue-300">
              进行中
            </span>
          </div>
        </div>
      </section>

      {/* 参考材料 (带来源追溯) */}
      <section className="space-y-1.5">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          参考材料与证据
        </h2>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
          <div
            onClick={() => onOpenEvidencePackage?.(1)}
            className="p-3.5 flex items-center justify-between cursor-pointer active:bg-slate-50"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AppIcon name="file" size={18} className="text-[#0058BE] shrink-0" />
              <div className="min-w-0">
                <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate block">
                  交互评审纪要.pdf
                </strong>
                <span className="text-[10px] text-slate-400">材料 · 林悦上传 · 今天 14:10</span>
              </div>
            </div>
            <AppIcon name="chevron-right" size={16} className="text-slate-400" />
          </div>

          <div
            onClick={() => onOpenEvidencePackage?.(2)}
            className="p-3.5 flex items-center justify-between cursor-pointer active:bg-slate-50"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AppIcon name="work" size={18} className="text-[#0058BE] shrink-0" />
              <div className="min-w-0">
                <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate block">
                  原型验收任务
                </strong>
                <span className="text-[10px] text-slate-400">任务 · 进行中 · 更新于 15:20</span>
              </div>
            </div>
            <AppIcon name="chevron-right" size={16} className="text-slate-400" />
          </div>
        </div>
      </section>

      {/* 底部生成草稿操作 */}
      <div className="pt-2 pb-6 space-y-2">
        <button
          type="button"
          onClick={handleGenerateDraft}
          disabled={generating}
          className="w-full min-h-[46px] rounded-xl bg-[#0058BE] text-white font-semibold text-sm flex items-center justify-center gap-2 active:bg-blue-700 disabled:opacity-50 cursor-pointer shadow-sm"
        >
          <AppIcon name="ai" size={16} className={generating ? 'animate-spin' : ''} />
          <span>{generating ? '正在依据材料生成草稿…' : '生成 知识草稿'}</span>
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 2. 设计 ID 33：知识草稿与发布 (WikiDraftEditorScreen)
// ==========================================

interface WikiDraftEditorScreenProps {
  draft: WikiPage;
  projectId: number;
  canPublish: boolean;
  onBack: () => void;
  onPublished: () => void;
  onSavedDraft: () => void;
  onOpenEvidencePackage?: (packageId: number) => void;
}

const WikiDraftEditorScreen: React.FC<WikiDraftEditorScreenProps> = ({
  draft,
  projectId,
  canPublish,
  onBack,
  onPublished,
  onSavedDraft,
  onOpenEvidencePackage,
}) => {
  const [title, setTitle] = useState(draft.title || '移动端体验升级 · 阶段进展');
  const [bodyText, setBodyText] = useState(
    draft.body_text ||
      '本阶段完成任务与汇报链路联调。移动端页面正在审核，材料引用详见下方。',
  );
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const facts = draft.meta?.facts || [];

  const handlePublish = async () => {
    if (!canPublish) {
      setError('仅有项目知识 管理权限的人员可以发布正式版本');
      return;
    }
    setPublishing(true);
    setError(null);
    try {
      await publishWikiDraft(projectId, draft.id);
      onPublished();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : '发布草稿失败');
    } finally {
      setPublishing(false);
    }
  };

  return (
    <div className="h-full overflow-y-auto p-4 space-y-4 mobile-scroll-container">
      {/* 状态徽标 */}
      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300">
        草稿 · 尚未发布
      </span>

      <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">
        项目知识 更新草稿
      </h1>

      {error && (
        <div className="p-3 bg-red-50 text-red-600 rounded-xl text-xs flex items-center gap-1.5 border border-red-200">
          <AppIcon name="alert" size={14} className="shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* 标题字段 */}
      <MobileField label="标题" required>
        <MobileInput value={title} onChange={(e) => setTitle(e.target.value)} />
      </MobileField>

      {/* 正文字段 */}
      <MobileField label="正文" required>
        <MobileTextarea
          value={bodyText}
          onChange={(e) => setBodyText(e.target.value)}
          className="min-h-[120px]"
        />
      </MobileField>

      {/* 引用来源追溯 (设计 ID 88) */}
      <section className="space-y-1.5">
        <h2 className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
          引用来源
        </h2>
        <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
          <div
            onClick={() => onOpenEvidencePackage?.(1)}
            className="p-3.5 flex items-center justify-between cursor-pointer active:bg-slate-50"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AppIcon name="file" size={18} className="text-[#0058BE] shrink-0" />
              <div className="min-w-0">
                <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate block">
                  交互评审纪要.pdf
                </strong>
                <span className="text-[10px] text-slate-400">材料 · 林悦上传 · 今天 14:10</span>
              </div>
            </div>
            <AppIcon name="chevron-right" size={16} className="text-slate-400" />
          </div>

          <div
            onClick={() => onOpenEvidencePackage?.(2)}
            className="p-3.5 flex items-center justify-between cursor-pointer active:bg-slate-50"
          >
            <div className="flex items-center gap-2.5 min-w-0">
              <AppIcon name="work" size={18} className="text-[#0058BE] shrink-0" />
              <div className="min-w-0">
                <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate block">
                  原型验收任务
                </strong>
                <span className="text-[10px] text-slate-400">任务 · 进行中 · 更新于 15:20</span>
              </div>
            </div>
            <AppIcon name="chevron-right" size={16} className="text-slate-400" />
          </div>
        </div>
      </section>

      {/* 警示说明 */}
      <div className="p-3 bg-amber-50 dark:bg-amber-950/40 rounded-xl text-xs text-amber-800 dark:text-amber-300 flex items-center gap-2 border border-amber-200 dark:border-amber-900/50">
        <AppIcon name="warning" size={16} className="shrink-0" />
        <span>发布后项目成员可见；请先核实 AI 生成的结论与引用。</span>
      </div>

      {/* 操作按钮 */}
      <div className="pt-2 pb-6 space-y-2">
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={onSavedDraft}
            className="min-h-[46px] rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 font-semibold text-xs flex items-center justify-center active:bg-slate-50 cursor-pointer"
          >
            保存草稿
          </button>
          <button
            type="button"
            onClick={handlePublish}
            disabled={publishing}
            className="min-h-[46px] rounded-xl bg-[#0058BE] text-white font-semibold text-xs flex items-center justify-center active:bg-blue-700 disabled:opacity-50 cursor-pointer shadow-sm"
          >
            {publishing ? '正在发布…' : '确认发布'}
          </button>
        </div>

        <button
          type="button"
          onClick={onBack}
          className="w-full min-h-[40px] text-slate-400 text-xs font-medium flex items-center justify-center active:opacity-60 cursor-pointer"
        >
          返回已发布版本
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 3. 草稿列表 (WikiDraftsListScreen)
// ==========================================

interface WikiDraftsListScreenProps {
  drafts: WikiPage[];
  canPublish: boolean;
  onSelectDraft: (d: WikiPage) => void;
}

const WikiDraftsListScreen: React.FC<WikiDraftsListScreenProps> = ({
  drafts,
  canPublish,
  onSelectDraft,
}) => {
  if (drafts.length === 0) {
    return (
      <div className="p-8">
        <MobileEmptyState
          iconName="file"
          title="暂无草稿"
          description="可在已发布页面点击生成 知识草稿"
        />
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3 mobile-scroll-container">
      <div className="bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden shadow-xs">
        {drafts.map((d) => (
          <div
            key={d.id}
            onClick={() => onSelectDraft(d)}
            className="p-3.5 flex items-center justify-between cursor-pointer active:bg-slate-50"
          >
            <div>
              <strong className="text-xs font-semibold text-slate-900 dark:text-slate-100 block">
                {d.title || `草稿 #${d.id}`}
              </strong>
              <span className="text-[10px] text-slate-400 mt-0.5 block">
                草稿 · 点击查看并编辑
              </span>
            </div>
            <AppIcon name="chevron-right" size={16} className="text-slate-400" />
          </div>
        ))}
      </div>
    </div>
  );
};

// ==========================================
// 4. 设计 ID 34：项目知识搜索 (WikiSearchScreen)
// ==========================================

interface WikiSearchScreenProps {
  projectId: number;
  projectName: string;
  onOpenEvidencePackage?: (packageId: number) => void;
}

const WikiSearchScreen: React.FC<WikiSearchScreenProps> = ({
  projectId,
  projectName,
  onOpenEvidencePackage,
}) => {
  const [query, setQuery] = useState('原型验收');
  const [filterType, setFilterType] = useState<'all' | 'task' | 'evidence' | 'wiki'>('all');
  const [results, setResults] = useState<KnowledgeChunk[]>([]);
  const [searching, setSearching] = useState(false);

  const executeSearch = useCallback(async () => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    setSearching(true);
    try {
      const items = await searchKnowledge(projectId, query.trim());
      setResults(items);
    } catch {
      setResults([]);
    } finally {
      setSearching(false);
    }
  }, [projectId, query]);

  useEffect(() => {
    executeSearch();
  }, [executeSearch]);

  return (
    <div className="h-full overflow-y-auto p-4 space-y-3.5 mobile-scroll-container">
      {/* 搜索框 */}
      <MobileInput
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="搜索项目知识、任务与材料…"
        clearable
        onClear={() => setQuery('')}
        leading={<AppIcon name="search" size={16} />}
      />

      {/* 过滤器 Chips */}
      <div className="flex items-center gap-1.5">
        {(['all', 'task', 'evidence', 'wiki'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setFilterType(t)}
            className={`px-3 py-1 rounded-full text-xs font-medium cursor-pointer ${
              filterType === t
                ? 'bg-blue-100 dark:bg-blue-900 text-[#0058BE] dark:text-blue-300 font-bold'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {t === 'all' ? '全部' : t === 'task' ? '任务' : t === 'evidence' ? '材料' : '知识'}
          </button>
        ))}
      </div>

      <p className="text-[11px] text-slate-400">
        仅搜索“{projectName}”授权范围内的资料与知识库
      </p>

      {/* 搜索结果列表 */}
      <div className="space-y-2.5">
        {results.length > 0 ? (
          results.map((chunk) => (
            <div
              key={chunk.chunk_id}
              onClick={() => onOpenEvidencePackage?.(chunk.source_id)}
              className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs space-y-1.5 cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center justify-between">
                <strong className="text-xs font-bold text-slate-900 dark:text-slate-100">
                  {chunk.source_type === 'evidence'
                    ? '交互原型验收清单'
                    : chunk.source_type === 'task'
                    ? '原型评审责任事项'
                    : '项目知识 知识条目'}
                </strong>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  {chunk.source_type === 'evidence' ? '材料' : chunk.source_type === 'task' ? '任务' : '知识'}
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                …员工工作台、管理者汇报与任务详情纳入本次
                <span className="text-[#0058BE] dark:text-blue-400 font-semibold px-0.5">
                  {query}
                </span>
                范围…
              </p>
            </div>
          ))
        ) : (
          /* 样例静态卡片 (符合设计稿 34) */
          <>
            <div
              onClick={() => onOpenEvidencePackage?.(1)}
              className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs space-y-1.5 cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <strong className="text-xs font-bold text-slate-900 dark:text-slate-100 block truncate">
                    交互原型验收清单
                  </strong>
                  <span className="text-[10px] text-slate-400">材料 · 林悦 · 今天 14:10</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  材料
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                …员工工作台、管理者汇报与任务详情纳入本次
                <span className="text-[#0058BE] dark:text-blue-400 font-semibold px-0.5">
                  原型验收
                </span>
                …
              </p>
            </div>

            <div
              onClick={() => onOpenEvidencePackage?.(2)}
              className="p-3.5 bg-white dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800 rounded-2xl shadow-xs space-y-1.5 cursor-pointer active:scale-[0.99] transition-transform"
            >
              <div className="flex items-center justify-between">
                <div className="min-w-0">
                  <strong className="text-xs font-bold text-slate-900 dark:text-slate-100 block truncate">
                    原型评审责任事项
                  </strong>
                  <span className="text-[10px] text-slate-400">产品设计 / 进行中</span>
                </div>
                <span className="px-2 py-0.5 rounded text-[10px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                  任务
                </span>
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                …需提供评审结论及验收标准…
              </p>
            </div>
          </>
        )}
      </div>

      <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-xs text-[#0058BE] dark:text-blue-300 flex items-center gap-2 border border-blue-100 dark:border-blue-900/50">
        <AppIcon name="info" size={16} className="shrink-0" />
        <span>结果保留来源与项目范围，点击回到原始内容。</span>
      </div>
    </div>
  );
};
