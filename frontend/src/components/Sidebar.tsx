import React, { useState } from 'react';
import { ViewMode, Language } from '../types';
import { getT } from '../i18n';
import { BrandMark } from './BrandMark';

interface SidebarProps {
  activeView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  onOpenNewTask: () => void;
  lang: Language;
}

// memo：侧边栏一直挂着，但只依赖 activeView / lang；任务列表每次变化都重渲染它没意义
const SidebarImpl: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  onOpenNewTask,
  lang,
}) => {
  const t = getT(lang);
  const [showMoreGroup, setShowMoreGroup] = useState(false);

  // Five primary destinations match the APP; working tools stay reachable below.
  const primaryNavItems: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'dashboard', label: lang === 'zh' ? '工作' : 'Work', icon: 'dashboard' },
    { id: 'people-axis', label: lang === 'zh' ? '人轴' : 'People', icon: 'hub' },
    { id: 'knowledge', label: lang === 'zh' ? '知识' : 'Knowledge', icon: 'account_tree' },
    { id: 'messages', label: lang === 'zh' ? '消息' : 'Messages', icon: 'forum' },
    { id: 'settings', label: lang === 'zh' ? '我的' : 'Me', icon: 'person' },
  ];
  const secondaryNavItems: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'kanban', label: lang === 'zh' ? '任务管理' : 'Tasks', icon: 'view_kanban' },
    { id: 'reports', label: lang === 'zh' ? 'AI 汇报与助手' : 'AI reports & assistant', icon: 'analytics' },
    { id: 'inbox', label: t.inbox, icon: 'all_inbox' },
    { id: 'team', label: t.team, icon: 'groups' },
    { id: 'notifications', label: lang === 'zh' ? '通知渠道' : 'Notify channels', icon: 'notifications_active' },
  ];
  const isSecondaryActive = secondaryNavItems.some(item => item.id === activeView) || ['tasks', 'calendar', 'trash'].includes(activeView);
  const primaryActive = (id: ViewMode) => id === activeView
    || (id === 'dashboard' && ['tasks', 'kanban', 'calendar', 'reports', 'trash'].includes(activeView))
    || (id === 'messages' && activeView === 'inbox')
    || (id === 'settings' && ['team', 'notifications'].includes(activeView));

  return (
    <>
      {/* Desktop Left Sidebar */}
      <aside className="fixed left-0 top-16 h-[calc(100vh-64px)] w-[280px] bg-surface dark:bg-[#1c1a18] border-r border-surface-variant dark:border-outline-variant hidden md:flex flex-col py-6 px-4 gap-2 z-40 transition-ink-colors shadow-sm">
        <div className="mb-4 px-2 space-y-4">
          <BrandMark lang={lang} iconSize={24} className="text-base" />
          <h2 className="text-base font-medium text-on-surface tracking-tight">
            {t.projectSpace}
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">{t.appSubtitle}</p>
        </div>

        <nav className="flex flex-col gap-1 flex-grow overflow-y-auto">
          {primaryNavItems.map((item) => {
            const isActive = primaryActive(item.id);
            return (
              <button
                key={item.id}
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectView(item.id)}
                className={`flex items-center gap-3 px-3 h-9 rounded-[var(--radius-ink-control)] transition-ink-colors font-medium text-sm ${
                  isActive
                    ? 'text-primary dark:text-[#8fb0e8] bg-surface-container-high dark:bg-[#262421] ring-1 ring-inset ring-primary/20'
                    : 'text-on-surface-variant hover:bg-surface-container-low dark:hover:bg-[#262421] hover:text-on-surface'
                }`}
              >
                <span
                  aria-hidden="true"
                  className="material-symbols-outlined text-[22px]"
                  style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                >
                  {item.icon}
                </span>
                <span className="truncate">{item.label}</span>
              </button>
            );
          })}

          <button
            onClick={() => setShowMoreGroup((prev) => !prev)}
            aria-expanded={showMoreGroup || isSecondaryActive}
            className={`flex items-center gap-3 px-3 h-9 rounded-[var(--radius-ink-control)] transition-ink-colors font-medium text-sm ${
              isSecondaryActive
                ? 'text-primary dark:text-[#8fb0e8]'
                : 'text-on-surface-variant hover:bg-surface-container-low dark:hover:bg-[#262421] hover:text-on-surface'
            }`}
          >
            <span aria-hidden="true" className="material-symbols-outlined text-[22px]">more_horiz</span>
            <span className="truncate">{lang === 'zh' ? '工作工具与管理' : 'Tools & administration'}</span>
            <span aria-hidden="true" className="material-symbols-outlined text-[18px] ml-auto">
              {showMoreGroup || isSecondaryActive ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {(showMoreGroup || isSecondaryActive) &&
            secondaryNavItems.map((item) => {
              const isActive = activeView === item.id || item.id === 'kanban' && ['tasks', 'calendar', 'trash'].includes(activeView);
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectView(item.id)}
                className={`flex items-center gap-3 pl-8 pr-4 h-9 rounded-[var(--radius-ink-control)] transition-ink-colors font-medium text-sm ${
                    isActive
                      ? 'text-primary dark:text-[#8fb0e8] bg-surface-container-high dark:bg-[#262421] ring-1 ring-inset ring-primary/20'
                      : 'text-on-surface-variant hover:bg-surface-container-low dark:hover:bg-[#262421] hover:text-on-surface'
                  }`}
                >
                  <span
                    aria-hidden="true"
                    className="material-symbols-outlined text-[20px]"
                    style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                  >
                    {item.icon}
                  </span>
                  <span className="truncate">{item.label}</span>
                </button>
              );
            })}
        </nav>

        {/* New Task Button */}
        <div className="mt-auto pt-4">
          <button
            onClick={onOpenNewTask}
            className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary py-3 rounded-[var(--radius-ink-control)] font-medium text-sm shadow-md hover:opacity-90 active:scale-95 transition-ink"
          >
            <span aria-hidden="true" className="material-symbols-outlined text-xl">add</span>
            <span>{t.newTask}</span>
          </button>
        </div>
      </aside>

      <nav aria-label="主要页面导航" className="md:hidden fixed bottom-0 left-0 right-0 flex justify-around bg-surface dark:bg-[#1c1a18] border-t z-50 pb-[env(safe-area-inset-bottom)]">
        {primaryNavItems.map(item => <button key={item.id} type="button" onClick={() => onSelectView(item.id)}
          className={`min-h-[56px] flex-1 flex flex-col items-center justify-center gap-1 ${activeView === item.id ? 'text-primary' : 'text-on-surface-variant'}`}>
          <span aria-hidden="true" className="material-symbols-outlined">{item.icon}</span><span className="text-xs">{item.label}</span>
        </button>)}
      </nav>
    </>
  );
};

export const Sidebar = React.memo(SidebarImpl);
