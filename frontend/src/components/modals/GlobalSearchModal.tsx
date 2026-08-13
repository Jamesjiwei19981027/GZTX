import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Task, Project, Language } from '../../types';
import { searchKnowledge, KnowledgeChunk } from '../../api/knowledge';

interface GlobalSearchModalProps {
  isOpen: boolean;
  onClose: () => void;
  tasks: Task[];
  projects: Project[];
  lang: Language;
  onSelectTask: (task: Task) => void;
  onSelectProject: (project: Project) => void;
}

type ResultItem =
  | { type: 'task'; task: Task }
  | { type: 'project'; project: Project }
  | { type: 'knowledge'; chunk: KnowledgeChunk; project: Project };

const MAX_TASKS = 8;
const MAX_PROJECTS = 5;
const MAX_KNOWLEDGE = 6;
/** 知识检索最多并发查前 N 个项目（「全部项目」时） */
const MAX_KNOWLEDGE_PROJECTS = 5;

export const GlobalSearchModal: React.FC<GlobalSearchModalProps> = ({
  isOpen,
  onClose,
  tasks,
  projects,
  lang,
  onSelectTask,
  onSelectProject,
}) => {
  const zh = lang === 'zh';
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const [knowledgeItems, setKnowledgeItems] = useState<
    { chunk: KnowledgeChunk; project: Project }[]
  >([]);
  const [searchingKnowledge, setSearchingKnowledge] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setQuery('');
      setActiveIndex(0);
      setKnowledgeItems([]);
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [isOpen]);

  const q = query.trim().toLowerCase();

  const taskResults = useMemo(() => {
    if (!q) return [];
    return tasks
      .filter(
        (t) =>
          t.title.toLowerCase().includes(q) ||
          (t.description && t.description.toLowerCase().includes(q)) ||
          (t.tag && t.tag.toLowerCase().includes(q)),
      )
      .slice(0, MAX_TASKS);
  }, [tasks, q]);

  const projectResults = useMemo(() => {
    if (!q) return [];
    return projects
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)),
      )
      .slice(0, MAX_PROJECTS);
  }, [projects, q]);

  // 知识检索：防抖 300ms，「全部项目」时并发查前几个项目后按分数合并
  useEffect(() => {
    if (!isOpen || !q) {
      setKnowledgeItems([]);
      return;
    }
    const targets = projects
      .filter((p) => Number.isFinite(Number(p.id)) && Number(p.id) > 0)
      .slice(0, MAX_KNOWLEDGE_PROJECTS);
    if (targets.length === 0) return;
    let cancelled = false;
    const timer = setTimeout(async () => {
      setSearchingKnowledge(true);
      try {
        const settled = await Promise.allSettled(
          targets.map(async (p) => {
            const items = await searchKnowledge(Number(p.id), query.trim(), 5);
            return items.map((chunk) => ({ chunk, project: p }));
          }),
        );
        if (cancelled) return;
        const merged = settled
          .flatMap((r) => (r.status === 'fulfilled' ? r.value : []))
          .sort((a, b) => (b.chunk.score ?? 0) - (a.chunk.score ?? 0))
          .slice(0, MAX_KNOWLEDGE);
        setKnowledgeItems(merged);
      } finally {
        if (!cancelled) setSearchingKnowledge(false);
      }
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [isOpen, q, query, projects]);

  const results: ResultItem[] = useMemo(
    () => [
      ...taskResults.map((task) => ({ type: 'task' as const, task })),
      ...projectResults.map((project) => ({ type: 'project' as const, project })),
      ...knowledgeItems.map(({ chunk, project }) => ({
        type: 'knowledge' as const,
        chunk,
        project,
      })),
    ],
    [taskResults, projectResults, knowledgeItems],
  );

  useEffect(() => {
    setActiveIndex(0);
  }, [q, results.length]);

  const handleSelect = (item: ResultItem) => {
    onClose();
    if (item.type === 'task') onSelectTask(item.task);
    else if (item.type === 'project') onSelectProject(item.project);
    else onSelectProject(item.project);
  };

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, results.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && results[activeIndex]) {
        e.preventDefault();
        handleSelect(results[activeIndex]);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, results, activeIndex, onClose]);

  if (!isOpen) return null;

  const sectionLabel = (type: ResultItem['type']) =>
    type === 'task'
      ? zh ? '任务' : 'Tasks'
      : type === 'project'
        ? zh ? '项目' : 'Projects'
        : zh ? '知识' : 'Knowledge';

  let lastType: ResultItem['type'] | null = null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[12vh] bg-black/40 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl mx-4 rounded-2xl bg-surface dark:bg-[#1d2021] shadow-2xl border border-outline-variant/40 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 px-4 py-3 border-b border-outline-variant/40">
          <span className="material-symbols-outlined text-on-surface-variant">search</span>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={zh ? '搜索任务 / 项目 / 知识…' : 'Search tasks / projects / knowledge…'}
            className="flex-1 bg-transparent outline-none text-on-surface placeholder:text-on-surface-variant/60"
          />
          <kbd className="text-[10px] px-1.5 py-0.5 rounded border border-outline-variant/60 text-on-surface-variant">
            Esc
          </kbd>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1">
          {!q && (
            <div className="px-4 py-8 text-center text-sm text-on-surface-variant">
              {zh
                ? '输入关键词，Enter 打开，↑↓ 选择'
                : 'Type to search. Enter to open, ↑↓ to navigate.'}
            </div>
          )}
          {q && results.length === 0 && !searchingKnowledge && (
            <div className="px-4 py-8 text-center text-sm text-on-surface-variant">
              {zh ? '没有匹配结果' : 'No results'}
            </div>
          )}
          {results.map((item, idx) => {
            const showHeader = item.type !== lastType;
            lastType = item.type;
            const isActive = idx === activeIndex;
            return (
              <React.Fragment
                key={
                  item.type === 'task'
                    ? `t_${item.task.id}`
                    : item.type === 'project'
                      ? `p_${item.project.id}`
                      : `k_${item.chunk.chunk_id}`
                }
              >
                {showHeader && (
                  <div className="px-4 pt-2 pb-1 text-[11px] font-semibold uppercase tracking-wide text-on-surface-variant/70">
                    {sectionLabel(item.type)}
                  </div>
                )}
                <button
                  type="button"
                  onMouseEnter={() => setActiveIndex(idx)}
                  onClick={() => handleSelect(item)}
                  className={`w-full flex items-start gap-3 px-4 py-2 text-left ${
                    isActive ? 'bg-primary/10' : ''
                  }`}
                >
                  <span className="material-symbols-outlined text-lg text-on-surface-variant mt-0.5">
                    {item.type === 'task' ? 'task_alt' : item.type === 'project' ? 'hub' : 'description'}
                  </span>
                  <span className="flex-1 min-w-0">
                    {item.type === 'task' && (
                      <>
                        <span className="block text-sm text-on-surface truncate">{item.task.title}</span>
                        {item.task.description && (
                          <span className="block text-xs text-on-surface-variant truncate">
                            {item.task.description}
                          </span>
                        )}
                      </>
                    )}
                    {item.type === 'project' && (
                      <span className="block text-sm text-on-surface truncate">{item.project.name}</span>
                    )}
                    {item.type === 'knowledge' && (
                      <>
                        <span className="block text-xs text-on-surface-variant truncate">
                          {item.project.name}
                        </span>
                        <span className="block text-sm text-on-surface line-clamp-2">
                          {item.chunk.chunk_text}
                        </span>
                      </>
                    )}
                  </span>
                </button>
              </React.Fragment>
            );
          })}
          {searchingKnowledge && (
            <div className="px-4 py-2 text-xs text-on-surface-variant">
              {zh ? '正在检索知识库…' : 'Searching knowledge…'}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
