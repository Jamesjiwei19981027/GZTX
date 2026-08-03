import React from 'react';
import { ViewMode, Language } from '../types';
import { getT } from '../i18n';

interface SidebarProps {
  activeView: ViewMode;
  onSelectView: (view: ViewMode) => void;
  onOpenNewTask: () => void;
  lang: Language;
}

export const Sidebar: React.FC<SidebarProps> = ({
  activeView,
  onSelectView,
  onOpenNewTask,
  lang,
}) => {
  const t = getT(lang);

  const navItems: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'dashboard', label: t.dashboard, icon: 'dashboard' },
    { id: 'people-axis', label: t.peopleAxis || (lang === 'zh' ? '人轴责任链' : 'People-Axis Tree'), icon: 'hub' },
    { id: 'tasks', label: t.myTasks, icon: 'checklist' },
    { id: 'kanban', label: t.kanban, icon: 'view_kanban' },
    { id: 'calendar', label: t.calendar, icon: 'calendar_month' },
    { id: 'reports', label: t.reports, icon: 'analytics' },
    { id: 'team', label: t.team, icon: 'groups' },
    { id: 'messages', label: t.messages, icon: 'forum' },
    { id: 'inbox', label: t.inbox, icon: 'all_inbox' },
    { id: 'notifications', label: lang === 'zh' ? '通知中心' : 'Notifications', icon: 'notifications_active' },
    { id: 'settings', label: t.settings, icon: 'settings' },
  ];

  const mobileNavItems: { id: ViewMode; label: string; icon: string }[] = [
    { id: 'dashboard', label: t.dashboard, icon: 'dashboard' },
    { id: 'people-axis', label: lang === 'zh' ? '人轴' : 'People-Axis', icon: 'hub' },
    { id: 'tasks', label: t.myTasks, icon: 'checklist' },
    { id: 'kanban', label: t.kanban, icon: 'view_kanban' },
  ];

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

        <nav className="flex flex-col gap-1 flex-grow">
          {navItems.map((item) => {
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
              onClick={() => onSelectView(item.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 ${
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
              onClick={() => onSelectView(item.id)}
              className={`flex flex-col items-center gap-0.5 px-3 py-1 ${
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
      </nav>
    </>
  );
};
