import React, { useState } from 'react';
import { ViewMode, Language } from '../types';
import { getT } from '../i18n';

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
  const [showMoreSheet, setShowMoreSheet] = useState(false);
  const [showMoreGroup, setShowMoreGroup] = useState(false);

  /** 主项收口到 8 个：每天都会点的页面才留在一级导航 */
  const primaryNavItems: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'dashboard', label: t.dashboard, icon: 'dashboard' },
    { id: 'people-axis', label: t.peopleAxis || (lang === 'zh' ? '人轴责任链' : 'People-Axis Tree'), icon: 'hub' },
    { id: 'tasks', label: t.myTasks, icon: 'checklist' },
    { id: 'kanban', label: t.kanban, icon: 'view_kanban' },
    { id: 'calendar', label: t.calendar, icon: 'calendar_month' },
    { id: 'messages', label: t.messages, icon: 'forum' },
    { id: 'inbox', label: t.inbox, icon: 'all_inbox' },
    { id: 'settings', label: t.settings, icon: 'settings' },
  ];

  /** 次级入口：报表/团队/回收站 + 通知渠道（通知中心并入设置口径，此处仅留跳转） */
  const secondaryNavItems: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'reports', label: t.reports, icon: 'analytics' },
    { id: 'team', label: t.team, icon: 'groups' },
    { id: 'notifications', label: lang === 'zh' ? '通知渠道' : 'Notify channels', icon: 'notifications_active' },
    { id: 'trash', label: lang === 'zh' ? '回收站' : 'Trash', icon: 'delete' },
  ];

  const navItems = [...primaryNavItems, ...secondaryNavItems];

  const mobileNavItems: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'dashboard', label: t.dashboard, icon: 'dashboard' },
    { id: 'people-axis', label: lang === 'zh' ? '人轴' : 'People-Axis', icon: 'hub' },
    { id: 'tasks', label: t.myTasks, icon: 'checklist' },
    { id: 'kanban', label: t.kanban, icon: 'view_kanban' },
  ];

  // 底栏放不下的页面全部收进「更多」抽屉，清单跟桌面侧栏保持同源
  const mobileMoreItems = navItems.filter(
    (item) => !mobileNavItems.some((m) => m.id === item.id),
  );
  const isMoreActive = mobileMoreItems.some((item) => item.id === activeView);
  const isSecondaryActive = secondaryNavItems.some((item) => item.id === activeView);

  return (
    <>
      {/* Desktop Left Sidebar */}
      <aside className="fixed left-0 top-16 h-[calc(100vh-64px)] w-[280px] bg-surface dark:bg-[#191c1d] border-r border-surface-variant dark:border-outline-variant hidden md:flex flex-col py-6 px-4 gap-2 z-40 transition-colors duration-200 shadow-sm">
        <div className="mb-4 px-2">
          <h2 className="text-lg font-bold text-primary dark:text-[#adc6ff] tracking-tight">
            {t.projectSpace}
          </h2>
          <p className="text-xs text-on-surface-variant mt-0.5">{t.appSubtitle}</p>
        </div>

        <nav className="flex flex-col gap-1 flex-grow overflow-y-auto">
          {primaryNavItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onSelectView(item.id)}
                className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 font-semibold text-sm ${
                  isActive
                    ? 'text-primary dark:text-[#adc6ff] border-r-4 border-primary bg-primary-fixed/20 dark:bg-primary-container/30 shadow-sm'
                    : 'text-on-surface-variant hover:bg-surface-container-low dark:hover:bg-[#2e3132] hover:text-on-surface'
                }`}
              >
                <span
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
            className={`flex items-center gap-3 px-4 py-2.5 rounded-xl transition-all duration-200 font-semibold text-sm ${
              isSecondaryActive
                ? 'text-primary dark:text-[#adc6ff]'
                : 'text-on-surface-variant hover:bg-surface-container-low dark:hover:bg-[#2e3132] hover:text-on-surface'
            }`}
          >
            <span className="material-symbols-outlined text-[22px]">more_horiz</span>
            <span className="truncate">{lang === 'zh' ? '更多' : 'More'}</span>
            <span className="material-symbols-outlined text-[18px] ml-auto">
              {showMoreGroup || isSecondaryActive ? 'expand_less' : 'expand_more'}
            </span>
          </button>

          {(showMoreGroup || isSecondaryActive) &&
            secondaryNavItems.map((item) => {
              const isActive = activeView === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onSelectView(item.id)}
                  className={`flex items-center gap-3 pl-8 pr-4 py-2 rounded-xl transition-all duration-200 font-medium text-sm ${
                    isActive
                      ? 'text-primary dark:text-[#adc6ff] border-r-4 border-primary bg-primary-fixed/20 dark:bg-primary-container/30'
                      : 'text-on-surface-variant hover:bg-surface-container-low dark:hover:bg-[#2e3132] hover:text-on-surface'
                  }`}
                >
                  <span
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
            className="w-full flex items-center justify-center gap-2 bg-primary text-on-primary py-3 rounded-xl font-semibold text-sm shadow-md hover:opacity-90 active:scale-95 transition-all"
          >
            <span className="material-symbols-outlined text-xl">add</span>
            <span>{t.newTask}</span>
          </button>
        </div>
      </aside>

      {/* Mobile Bottom Navigation Bar */}
      <nav className="md:hidden fixed bottom-0 left-0 w-full bg-surface dark:bg-[#191c1d] border-t border-surface-variant dark:border-outline-variant flex justify-around items-center h-16 px-2 z-50 shadow-lg">
        {mobileNavItems.slice(0, 2).map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setShowMoreSheet(false);
                onSelectView(item.id);
              }}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 ${
                isActive ? 'text-primary dark:text-[#adc6ff]' : 'text-on-surface-variant'
              }`}
            >
              <span
                className="material-symbols-outlined text-xl"
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span className="text-[10px] font-medium">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}

        {/* Floating Center New Task Button */}
        <div className="relative -top-5">
          <button
            onClick={onOpenNewTask}
            className="w-13 h-13 bg-primary text-on-primary rounded-full shadow-xl flex items-center justify-center hover:scale-105 active:scale-95 transition-transform ring-4 ring-surface dark:ring-[#191c1d]"
          >
            <span className="material-symbols-outlined text-2xl">add</span>
          </button>
        </div>

        {mobileNavItems.slice(2).map((item) => {
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              onClick={() => {
                setShowMoreSheet(false);
                onSelectView(item.id);
              }}
              className={`flex flex-col items-center gap-0.5 px-2 py-1 ${
                isActive ? 'text-primary dark:text-[#adc6ff]' : 'text-on-surface-variant'
              }`}
            >
              <span
                className="material-symbols-outlined text-xl"
                style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
              >
                {item.icon}
              </span>
              <span className="text-[10px] font-medium">{item.label.split(' ')[0]}</span>
            </button>
          );
        })}

        {/* More: entry to remaining views (calendar / reports / team / ...) */}
        <button
          onClick={() => setShowMoreSheet(!showMoreSheet)}
          className={`flex flex-col items-center gap-0.5 px-2 py-1 ${
            isMoreActive || showMoreSheet
              ? 'text-primary dark:text-[#adc6ff]'
              : 'text-on-surface-variant'
          }`}
        >
          <span
            className="material-symbols-outlined text-xl"
            style={{
              fontVariationSettings: isMoreActive || showMoreSheet ? "'FILL' 1" : "'FILL' 0",
            }}
          >
            more_horiz
          </span>
          <span className="text-[10px] font-medium">{lang === 'zh' ? '更多' : 'More'}</span>
        </button>
      </nav>

      {/* Mobile "More" Bottom Sheet */}
      {showMoreSheet && (
        <div className="md:hidden fixed inset-0 z-[60]" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm animate-in fade-in duration-150"
            onClick={() => setShowMoreSheet(false)}
          ></div>
          <div className="absolute bottom-0 left-0 w-full bg-surface dark:bg-[#191c1d] rounded-t-2xl border-t border-surface-variant dark:border-outline-variant shadow-2xl pb-[env(safe-area-inset-bottom)] animate-in slide-in-from-bottom duration-200">
            <div className="flex justify-center pt-3 pb-1">
              <span className="w-10 h-1 rounded-full bg-outline-variant"></span>
            </div>
            <div className="px-5 pt-1 pb-2 flex items-center justify-between">
              <h3 className="text-sm font-bold text-on-surface dark:text-[#f0f1f2]">
                {lang === 'zh' ? '更多页面' : 'More views'}
              </h3>
              <button
                onClick={() => setShowMoreSheet(false)}
                className="p-1.5 rounded-full hover:bg-surface-container dark:hover:bg-[#2e3132] text-on-surface-variant"
                aria-label={lang === 'zh' ? '关闭' : 'Close'}
              >
                <span className="material-symbols-outlined text-xl">close</span>
              </button>
            </div>
            <div className="grid grid-cols-4 gap-2 px-4 pb-6 pt-1">
              {mobileMoreItems.map((item) => {
                const isActive = activeView === item.id;
                return (
                  <button
                    key={item.id}
                    onClick={() => {
                      onSelectView(item.id);
                      setShowMoreSheet(false);
                    }}
                    className={`flex flex-col items-center gap-1.5 py-3 px-1 rounded-xl transition-colors ${
                      isActive
                        ? 'text-primary dark:text-[#adc6ff] bg-primary-fixed/20 dark:bg-primary-container/30'
                        : 'text-on-surface-variant hover:bg-surface-container-low dark:hover:bg-[#2e3132]'
                    }`}
                  >
                    <span
                      className="material-symbols-outlined text-2xl"
                      style={{ fontVariationSettings: isActive ? "'FILL' 1" : "'FILL' 0" }}
                    >
                      {item.icon}
                    </span>
                    <span className="text-[11px] font-medium truncate max-w-full">
                      {item.label}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export const Sidebar = React.memo(SidebarImpl);
