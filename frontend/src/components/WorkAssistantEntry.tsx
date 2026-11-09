import React from 'react';
import type { Language } from '../types';

export const WorkAssistantEntry: React.FC<{
  onOpen: (action: 'progress' | 'reports') => void;
  lang?: Language;
}> = ({ onOpen, lang = 'zh' }) => <section aria-label="AI 汇报与助手" className="rounded-[var(--radius-ink-card)] border border-outline-variant bg-surface-container-lowest dark:bg-surface-container p-4 text-on-surface">
  <div className="flex items-center gap-2 mb-1"><span className="material-symbols-outlined text-inherit" aria-hidden="true">description</span><h2 className="text-sm font-medium tabular-nums">{lang === 'zh' ? 'AI 汇报与助手' : 'AI reports & assistant'}</h2></div>
  <p className="text-xs text-on-surface-variant mb-2">{lang === 'zh' ? '记录进展与材料，整理后沿人轴汇报给直属领导' : 'Capture progress and materials; prepare reports for your direct leader'}</p>
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
    <button type="button" onClick={() => onOpen('progress')} className="min-h-[44px] rounded-[var(--radius-ink-control)] px-3 bg-primary text-on-primary text-sm font-medium transition-ink-colors tabular-nums">{lang === 'zh' ? '记录进展' : 'Record progress'}</button>
    <button type="button" onClick={() => onOpen('reports')} className="min-h-[44px] text-sm font-medium text-primary tabular-nums">{lang === 'zh' ? '查看汇报' : 'View reports'} <span aria-hidden="true">→</span></button>
  </div>
</section>;
