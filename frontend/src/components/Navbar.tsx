import React, { useState } from 'react';
import { Project, UserProfile, Language } from '../types';
import { getT } from '../i18n';
import { getBrandName } from '../constants/brand';
import { useToast } from './toast/ToastProvider';
import { BrandMark } from './BrandMark';

interface NavbarProps {
  currentProject: Project;
  projects: Project[];
  onSelectProject: (project: Project) => void;
  user: UserProfile;
  searchQuery: string;
  onSearchChange: (query: string) => void;
  lang: Language;
  onToggleLang: () => void;
  onOpenSettings: () => void;
  onResetDemo: () => void;
  onOpenNewTask?: () => void;
  onOpenQuickAdd?: () => void;
  onOpenNotifications?: () => void;
  onLogout?: () => void;
}

const NavbarImpl: React.FC<NavbarProps> = ({
  currentProject,
  projects,
  onSelectProject,
  user,
  searchQuery,
  onSearchChange,
  lang,
  onToggleLang,
  onOpenSettings,
  onResetDemo,
  onOpenNewTask,
  onOpenQuickAdd,
  onOpenNotifications,
  onLogout,
}) => {
  const t = getT(lang);
  const toast = useToast();
  const [showProjectDropdown, setShowProjectDropdown] = useState(false);
  const [showUserDropdown, setShowUserDropdown] = useState(false);
  const [showHelpModal, setShowHelpModal] = useState(false);

  return (
    <>
      <header className="bg-surface dark:bg-surface-container-lowest border-b border-surface-variant dark:border-outline-variant flex justify-between items-center w-full px-4 lg:px-6 h-16 fixed top-0 z-50 shadow-sm dark:shadow-none transition-ink-colors">
        {/* Left Section: Brand & Workspace */}
        <div className="flex items-center gap-3 md:gap-4">
          <div className="flex items-center gap-2 cursor-pointer" onClick={() => setShowProjectDropdown(!showProjectDropdown)}>
            <BrandMark lang={lang} iconSize={28} className="text-lg" />
          </div>

          <div className="h-6 w-[1px] bg-outline-variant dark:bg-outline mx-1 md:mx-2 hidden sm:block"></div>

          {/* Project Selector Dropdown */}
          <div className="relative group hidden sm:block">
            <button
              onClick={() => setShowProjectDropdown(!showProjectDropdown)}
              className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-surface-container dark:hover:bg-surface-container-high transition-ink-colors border border-transparent hover:border-outline-variant"
            >
              <span className="w-2 h-2 rounded-full bg-secondary"></span>
              <span className="font-medium text-sm text-on-surface dark:text-on-surface max-w-[160px] md:max-w-[220px] truncate tabular-nums">
                {currentProject.name}
              </span>
              <span className="material-symbols-outlined text-inherit text-[18px]">
                expand_more
              </span>
            </button>

            {showProjectDropdown && (
              <div className="absolute left-0 mt-1 w-72 bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-sm dark:shadow-none border border-surface-variant dark:border-outline p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="text-xs font-medium text-on-surface-variant px-3 py-2   tabular-nums">
                  {t.projectSpace}
                </div>
                <div className="space-y-1 max-h-[min(60vh,28rem)] overflow-y-auto overscroll-contain pr-1" data-testid="project-menu-scroll">
                  {projects.map((proj) => (
                    <button
                      key={proj.id}
                      onClick={() => {
                        onSelectProject(proj);
                        setShowProjectDropdown(false);
                      }}
                      className={`w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left transition-ink-colors ${
                        proj.id === currentProject.id
                          ? 'bg-primary-fixed/30 text-primary dark:text-primary font-medium'
                          : 'hover:bg-surface-container-low dark:hover:bg-surface-container-lowest text-on-surface dark:text-on-surface'
                      }`}
                    >
                      <span
                        className="w-3 h-3 rounded-full flex-shrink-0"
                        style={{ backgroundColor: proj.color }}
                      ></span>
                      <div className="flex flex-col truncate">
                        <span className="text-sm truncate">{proj.name}</span>
                        <span className="text-xs text-on-surface-variant truncate">
                          {proj.description}
                        </span>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Global Search Bar */}
          <div className="hidden md:flex ml-2 lg:ml-6 items-center bg-surface-container dark:bg-surface-container-high rounded-lg px-3 py-2 w-48 lg:w-64 border border-transparent focus-within:border-primary focus-within:ring-1 focus-within:ring-primary transition-ink-colors">
            <span className="material-symbols-outlined text-inherit mr-1 text-[18px]">
              search
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => onSearchChange(e.target.value)}
              placeholder={lang === 'zh' ? '搜索' : 'Search'}
              className="bg-transparent border-none focus:outline-none focus:ring-0 text-sm w-full text-on-surface dark:text-on-surface placeholder-on-surface-variant"
            />
            {searchQuery && (
              <button
                onClick={() => onSearchChange('')}
                className="text-on-surface-variant hover:text-on-surface text-xs"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Right Section: Actions & Avatar */}
        <div className="flex items-center gap-2 md:gap-3">
          {/* Quick Add Button (single-line NL input, Alt+N) */}
          {onOpenQuickAdd && (
            <button
              onClick={onOpenQuickAdd}
              className="flex items-center gap-2 px-3 py-2 rounded-[var(--radius-ink-control)] bg-primary text-on-primary font-medium text-xs shadow-sm dark:shadow-none hover:opacity-90 active:scale-95 transition-ink-colors cursor-pointer tabular-nums"
              title={lang === 'zh' ? '快速添加 (Alt+N)' : 'Quick Add (Alt+N)'}
            >
              <span className="material-symbols-outlined text-[18px]">add</span>
              <span>{t.quickAdd}</span>
            </button>
          )}

          {/* Full Create Task Button */}
          {onOpenNewTask && (
            <button
              onClick={onOpenNewTask}
              className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-[var(--radius-ink-control)] border border-outline-variant text-primary dark:text-primary font-medium text-xs shadow-sm dark:shadow-none hover:bg-surface-container dark:hover:bg-surface-container-high active:scale-95 transition-ink-colors cursor-pointer tabular-nums"
              title={lang === 'zh' ? '完整创建任务' : 'Create Task (full form)'}
            >
              <span className="material-symbols-outlined text-[18px]">add_task</span>
              <span>{lang === 'zh' ? '新建任务' : 'New Task'}</span>
            </button>
          )}


          {/* Notifications Button */}
          <div className="relative">
            <button
            onClick={() => {
                onOpenNotifications?.();
                setShowUserDropdown(false);
              }}
              className="p-2 rounded-lg hover:bg-surface-container dark:hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-ink-colors relative cursor-pointer"
            >
              <span className="material-symbols-outlined">notifications</span>
            </button>
          </div>

          {/* Help Button */}
          <button
            onClick={() => setShowHelpModal(true)}
            className="p-2 rounded-lg hover:bg-surface-container dark:hover:bg-surface-container-high text-on-surface-variant hover:text-primary transition-ink-colors hidden sm:block"
          >
            <span className="material-symbols-outlined">help_outline</span>
          </button>

          {/* User Avatar */}
          <div className="relative">
            <button
              data-testid="user-menu-button"
              onClick={() => {
                setShowUserDropdown(!showUserDropdown);
              }}
              className="flex items-center gap-2 p-1 rounded-lg hover:bg-surface-container dark:hover:bg-surface-container-high transition-ink-colors border border-outline-variant"
            >
              {user.avatar ? (
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-8 h-8 rounded-full object-cover"
                  onError={(e) => {
                    // Fallback if image fails
                    (e.target as HTMLElement).style.display = 'none';
                  }}
                />
              ) : (
                <span className="w-8 h-8 rounded-full bg-primary/10 text-primary text-xs font-medium flex items-center justify-center tabular-nums">
                  {user.name ? user.name.slice(0, 1) : '?'}
                </span>
              )}
              <span className="w-2 h-2 rounded-full bg-secondary absolute bottom-1 right-1 ring-2 ring-surface"></span>
            </button>

            {showUserDropdown && (
              <div className="absolute right-0 mt-2 w-64 bg-surface-container-lowest dark:bg-surface-container rounded-xl shadow-sm dark:shadow-none border border-surface-variant dark:border-outline p-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                <div className="px-3 py-3 border-b border-surface-variant mb-1 flex items-center gap-3">
                  {user.avatar ? (
                    <img src={user.avatar} alt="" className="w-10 h-10 rounded-full object-cover" />
                  ) : (
                    <span className="w-10 h-10 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center tabular-nums">
                      {user.name ? user.name.slice(0, 1) : '?'}
                    </span>
                  )}
                  <div className="overflow-hidden">
                    <p className="font-medium text-sm text-on-surface dark:text-on-surface truncate tabular-nums">
                      {user.name}
                    </p>
                    <p className="text-xs text-on-surface-variant truncate">{user.email}</p>
                  </div>
                </div>

                <button
                  onClick={() => {
                    onOpenSettings();
                    setShowUserDropdown(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-surface-container-lowest text-sm text-on-surface dark:text-on-surface transition-ink-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">settings</span>
                  <span>{t.settings}</span>
                </button>

                <button
                  onClick={() => {
                    onResetDemo();
                    setShowUserDropdown(false);
                  }}
                  className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-surface-container-low dark:hover:bg-surface-container-lowest text-sm text-secondary transition-ink-colors"
                >
                  <span className="material-symbols-outlined text-[18px]">restart_alt</span>
                  <span>{t.resetDemo}</span>
                </button>

                <div className="border-t border-surface-variant my-1 pt-1">
                  <button
                    onClick={() => {
                      setShowUserDropdown(false);
                      if (onLogout) onLogout();
                      else toast.info(lang === 'zh' ? '已安全退出登录演示' : 'Signed out of demo session');
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-error-container/20 text-sm text-error transition-ink-colors font-medium tabular-nums"
                  >
                    <span className="material-symbols-outlined text-[18px]">logout</span>
                    <span>{t.signOut}</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Help Modal */}
      {showHelpModal && (
        <div className="fixed inset-0 bg-black/50  z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-surface-container-lowest dark:bg-surface-container rounded-[var(--radius-ink-panel)] max-w-md w-full p-6 shadow-sm dark:shadow-none border border-surface-variant">
            <div className="flex justify-between items-center mb-4">
              <h3 className="font-medium text-lg text-on-surface dark:text-on-surface flex items-center gap-2 tabular-nums">
                <span className="material-symbols-outlined text-inherit">lightbulb</span>
                {lang === 'zh'
                  ? `${getBrandName(lang)} 使用指导与快捷键`
                  : `${getBrandName(lang)} Shortcuts & Tips`}
              </h3>
              <button
                onClick={() => setShowHelpModal(false)}
                className="p-1 rounded-lg hover:bg-surface-container text-on-surface-variant"
              >
                ✕
              </button>
            </div>
            <div className="space-y-3 text-sm text-on-surface-variant">
              <div className="p-3 bg-surface-container-lowest dark:bg-surface-container rounded-xl flex justify-between items-center">
                <span>{t.quickAdd}</span>
                <kbd className="px-2 py-1 bg-surface border border-outline-variant rounded text-xs font-mono">
                  Alt + N
                </kbd>
              </div>
              <div className="p-3 bg-surface-container-lowest dark:bg-surface-container rounded-xl flex justify-between items-center">
                <span>{lang === 'zh' ? '看板卡片拖拽' : 'Kanban Card Drag'}</span>
                <span className="text-xs text-primary font-medium tabular-nums">{lang === 'zh' ? '支持直接按住拖移' : 'Drag & drop supported'}</span>
              </div>
              <div className="p-3 bg-surface-container-lowest dark:bg-surface-container rounded-xl flex justify-between items-center">
                <span>{lang === 'zh' ? '双语一键切换' : 'Bilingual Toggle'}</span>
                <span className="text-xs font-medium tabular-nums">EN / 中文</span>
              </div>
            </div>
            <button
              onClick={() => setShowHelpModal(false)}
              className="mt-6 w-full py-2 bg-primary text-on-primary rounded-lg font-medium text-sm shadow-sm dark:shadow-none hover:opacity-90 transition-opacity tabular-nums"
            >
              {lang === 'zh' ? '知道了' : 'Got it'}
            </button>
          </div>
        </div>
      )}
    </>
  );
};

// memo：顶栏与任务数据无关，靠 props 浅比较挡掉任务列表引起的重渲染
export const Navbar = React.memo(NavbarImpl);
