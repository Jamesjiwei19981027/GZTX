import React from 'react';
import { WorkContactPicker } from './WorkContactPicker';

export const WorkContactsPage: React.FC<{
  companyId: number | null; onBack: () => void;
  onCreated: (id: number, title: string) => void;
}> = ({companyId,onBack,onCreated}) => <section aria-label="工作联系人页面" className="flex flex-col w-full h-full min-h-0 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
  <header className="shrink-0 flex items-center gap-3 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 px-3 py-1">
    <button type="button" aria-label="返回消息" onClick={onBack} className="min-h-[48px] px-2 text-sm text-blue-700 dark:text-blue-300">‹ 返回</button>
    <h1 className="text-base font-semibold">工作联系人</h1>
  </header>
  <div className="flex-1 overflow-y-auto w-full max-w-2xl mx-auto pb-4">
    {companyId ? <WorkContactPicker companyId={companyId} onCreated={onCreated} /> : <p className="p-4 text-sm text-slate-500">请先加入公司和项目。</p>}
  </div>
</section>;
