import React from 'react';
import { WorkContactPicker } from './WorkContactPicker';

export const WorkContactsPage: React.FC<{
  companyId: number | null; onBack: () => void;
  onCreated: (id: number, title: string) => void;
}> = ({companyId,onBack,onCreated}) => <section aria-label="工作联系人页面" className="flex flex-col w-full h-full min-h-0 bg-surface dark:bg-surface text-on-surface dark:text-on-surface">
  <header className="shrink-0 flex items-center gap-3 border-b border-outline-variant dark:border-outline-variant bg-surface-container-lowest dark:bg-surface-container-lowest px-3 py-1">
    <button type="button" aria-label="返回消息" onClick={onBack} className="min-h-[48px] px-2 text-sm text-primary dark:text-primary">‹ 返回</button>
    <h1 className="text-base font-medium">工作联系人</h1>
  </header>
  <div className="flex-1 overflow-y-auto w-full max-w-2xl mx-auto pb-4">
    {companyId ? <WorkContactPicker companyId={companyId} onCreated={onCreated} /> : <p className="p-4 text-sm text-on-surface-variant">请先加入公司和项目。</p>}
  </div>
</section>;
