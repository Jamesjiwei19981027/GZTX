import React from 'react';
import type { Language } from '../types';

export const WorkAssistantEntry: React.FC<{
  onOpen: (action: 'progress' | 'reports') => void;
  lang?: Language;
}> = ({ onOpen, lang = 'zh' }) => <section aria-label="AI 汇报与助手" className="rounded-2xl border border-blue-200 dark:border-blue-900 bg-blue-50 dark:bg-slate-900 p-4 text-slate-900 dark:text-slate-100">
  <div className="flex items-center gap-2 mb-1"><span className="material-symbols-outlined text-blue-700 dark:text-blue-300" aria-hidden="true">auto_awesome</span><h2 className="text-sm font-semibold">{lang === 'zh' ? 'AI 汇报与助手' : 'AI reports & assistant'}</h2></div>
  <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{lang === 'zh' ? '记录进展与材料，整理后沿人轴汇报给直属领导' : 'Capture progress and materials; prepare reports for your direct leader'}</p>
  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
    <button type="button" onClick={() => onOpen('progress')} className="min-h-[44px] rounded-xl px-3 bg-blue-700 text-white text-sm font-semibold">{lang === 'zh' ? '告诉 AI 最新进展' : 'Share progress with AI'}</button>
    <button type="button" onClick={() => onOpen('reports')} className="min-h-[44px] text-sm font-medium text-blue-700 dark:text-blue-300">{lang === 'zh' ? '查看汇报' : 'View reports'} <span aria-hidden="true">→</span></button>
  </div>
</section>;
