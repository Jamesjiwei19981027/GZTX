import React, { useState } from 'react';
import { AppSettings, UserProfile, Language, AccentColor } from '../../types';
import { getT } from '../../i18n';

interface SettingsViewProps {
  user: UserProfile;
  onUpdateUser: (updated: Partial<UserProfile>) => void;
  settings: AppSettings;
  onUpdateSettings: (updated: Partial<AppSettings>) => void;
  onResetDemo: () => void;
  lang: Language;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  onUpdateUser,
  settings,
  onUpdateSettings,
  onResetDemo,
  lang,
}) => {
  const t = getT(lang);
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'notifications' | 'defaults'>('profile');

  const [nameInput, setNameInput] = useState(user.name);
  const [emailInput, setEmailInput] = useState(user.email);
  const [roleInput, setRoleInput] = useState(user.role);
  const [savedSuccess, setSavedSuccess] = useState(false);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    onUpdateUser({ name: nameInput, email: emailInput, role: roleInput });
    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
  };

  const accentColors: { id: AccentColor; name: string; bgClass: string }[] = [
    { id: 'blue', name: lang === 'zh' ? '商务蓝' : 'Blue', bgClass: 'bg-[#0058be]' },
    { id: 'green', name: lang === 'zh' ? '森林绿' : 'Green', bgClass: 'bg-[#006c49]' },
    { id: 'amber', name: lang === 'zh' ? '活力橙' : 'Amber', bgClass: 'bg-[#924700]' },
    { id: 'red', name: lang === 'zh' ? '警示红' : 'Red', bgClass: 'bg-[#ba1a1a]' },
  ];

  return (
    <div className="max-w-[1100px] mx-auto w-full pb-20 md:pb-8 animate-in fade-in duration-300">
      {/* Settings Title Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-extrabold text-on-surface dark:text-[#f0f1f2] tracking-tight">
          {t.settings}
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {lang === 'zh' ? '管理您的个人信息、界面外观与系统通知选项。' : 'Manage your profile, theme appearance, and notification rules.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
        {/* Left Side Settings Navigation (4 cols) */}
        <div className="lg:col-span-4 bg-surface dark:bg-[#191c1d] rounded-2xl p-3 border border-surface-variant dark:border-outline-variant shadow-sm space-y-1">
          <button
            onClick={() => setActiveTab('profile')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'profile'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface dark:text-[#f0f1f2] hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-xl">person</span>
            <span>{t.profileInfo}</span>
          </button>

          <button
            onClick={() => setActiveTab('appearance')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'appearance'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface dark:text-[#f0f1f2] hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-xl">palette</span>
            <span>{t.appearance}</span>
          </button>

          <button
            onClick={() => setActiveTab('notifications')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'notifications'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface dark:text-[#f0f1f2] hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-xl">notifications</span>
            <span>{t.notifPrefs}</span>
          </button>

          <button
            onClick={() => setActiveTab('defaults')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'defaults'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface dark:text-[#f0f1f2] hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-xl">tune</span>
            <span>{t.taskDefaults}</span>
          </button>

          <div className="border-t border-surface-variant my-2 pt-2">
            <button
              onClick={onResetDemo}
              className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold text-secondary hover:bg-secondary/10 transition-colors"
            >
              <span className="material-symbols-outlined text-xl">restart_alt</span>
              <span>{t.resetDemo}</span>
            </button>
          </div>
        </div>

        {/* Right Side Tab Panels (8 cols) */}
        <div className="lg:col-span-8 bg-surface dark:bg-[#191c1d] rounded-2xl p-6 md:p-8 border border-surface-variant dark:border-outline-variant shadow-sm">
          {/* TAB 1: PROFILE INFORMATION */}
          {activeTab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-6 animate-in fade-in duration-200">
              <div className="flex items-center justify-between pb-4 border-b border-surface-variant">
                <h2 className="text-xl font-bold text-on-surface dark:text-[#f0f1f2]">
                  {t.profileInfo}
                </h2>
                {savedSuccess && (
                  <span className="text-xs bg-secondary-container text-on-secondary-container px-3 py-1 rounded-full font-bold animate-in zoom-in">
                    ✓ {lang === 'zh' ? '修改已保存！' : 'Saved successfully!'}
                  </span>
                )}
              </div>

              {/* Avatar section */}
              <div className="flex items-center gap-6 p-4 bg-surface-container-low dark:bg-[#2e3132] rounded-2xl">
                <img
                  src={user.avatar}
                  alt={user.name}
                  className="w-20 h-20 rounded-full object-cover ring-4 ring-primary/20 shadow-md"
                />
                <div>
                  <h3 className="font-bold text-base text-on-surface dark:text-[#f0f1f2]">
                    {user.name}
                  </h3>
                  <p className="text-xs text-on-surface-variant mt-0.5">{user.role} • {user.email}</p>
                  <button
                    type="button"
                    onClick={() => alert(lang === 'zh' ? '在演示模式下头像由系统分配保护' : 'Avatar is synced with your Google workspace icon in preview.')}
                    className="mt-3 px-3 py-1.5 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-xs font-semibold text-primary hover:bg-primary-fixed/20 transition-colors shadow-xs"
                  >
                    {lang === 'zh' ? '更换头像图片' : 'Change Avatar'}
                  </button>
                </div>
              </div>

              {/* Fields */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
                    {t.fullName}
                  </label>
                  <input
                    type="text"
                    value={nameInput}
                    onChange={(e) => setNameInput(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant dark:border-outline rounded-xl text-sm font-medium text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
                    {t.emailAddr}
                  </label>
                  <input
                    type="email"
                    value={emailInput}
                    onChange={(e) => setEmailInput(e.target.value)}
                    className="w-full px-4 py-2.5 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant dark:border-outline rounded-xl text-sm font-medium text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant mb-1.5">
                  {lang === 'zh' ? '职位角色' : 'Job Role'}
                </label>
                <input
                  type="text"
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value)}
                  className="w-full px-4 py-2.5 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant dark:border-outline rounded-xl text-sm font-medium text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
                  required
                />
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm shadow-md hover:opacity-90 transition-all active:scale-95"
                >
                  {t.updateProfile}
                </button>
              </div>

              {/* Danger Zone */}
              <div className="mt-8 pt-6 border-t border-error/30">
                <h3 className="text-base font-bold text-error flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-lg">warning</span>
                  <span>{t.dangerZone}</span>
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">{t.dangerZoneSub}</p>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm(lang === 'zh' ? '确认重置并删除当前会话的所有变更吗？' : 'Are you sure you want to delete all current data?')) {
                      onResetDemo();
                    }
                  }}
                  className="mt-4 px-4 py-2 bg-error-container text-on-error-container hover:bg-error hover:text-on-error rounded-xl text-xs font-bold transition-colors shadow-xs"
                >
                  {t.deleteAccount}
                </button>
              </div>
            </form>
          )}

          {/* TAB 2: APPEARANCE */}
          {activeTab === 'appearance' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="pb-4 border-b border-surface-variant">
                <h2 className="text-xl font-bold text-on-surface dark:text-[#f0f1f2]">
                  {t.appearance}
                </h2>
                <p className="text-xs text-on-surface-variant mt-1">
                  {lang === 'zh' ? '定制 Flow 工作台的明暗模式与主题重音色彩。' : 'Customize your visual workspace colors and contrast mode.'}
                </p>
              </div>

              {/* Theme Mode Toggles */}
              <div>
                <label className="block text-xs font-bold uppercase text-on-surface-variant mb-3">
                  {t.colorTheme}
                </label>
                <div className="grid grid-cols-2 gap-4">
                  <button
                    onClick={() => onUpdateSettings({ themeMode: 'light' })}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                      settings.themeMode === 'light'
                        ? 'border-primary bg-primary-fixed/20 shadow-sm'
                        : 'border-outline-variant hover:border-outline'
                    }`}
                  >
                    <span className="material-symbols-outlined text-2xl text-amber-500">
                      light_mode
                    </span>
                    <div className="text-left">
                      <p className="font-bold text-sm text-on-surface dark:text-[#f0f1f2]">
                        {t.lightMode}
                      </p>
                      <p className="text-[11px] text-on-surface-variant">{lang === 'zh' ? '清爽明亮' : 'Clean & crisp'}</p>
                    </div>
                  </button>

                  <button
                    onClick={() => onUpdateSettings({ themeMode: 'dark' })}
                    className={`flex items-center gap-3 p-4 rounded-2xl border-2 transition-all ${
                      settings.themeMode === 'dark'
                        ? 'border-primary bg-primary-fixed/20 shadow-sm'
                        : 'border-outline-variant hover:border-outline'
                    }`}
                  >
                    <span className="material-symbols-outlined text-2xl text-indigo-400">
                      dark_mode
                    </span>
                    <div className="text-left">
                      <p className="font-bold text-sm text-on-surface dark:text-[#f0f1f2]">
                        {t.darkMode}
                      </p>
                      <p className="text-[11px] text-on-surface-variant">{lang === 'zh' ? '护眼深邃' : 'Easy on eyes'}</p>
                    </div>
                  </button>
                </div>
              </div>

              {/* Accent Colors */}
              <div className="pt-4">
                <label className="block text-xs font-bold uppercase text-on-surface-variant mb-3">
                  {t.accentColor}
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {accentColors.map((col) => {
                    const isSelected = settings.accentColor === col.id;
                    return (
                      <button
                        key={col.id}
                        onClick={() => onUpdateSettings({ accentColor: col.id })}
                        className={`flex items-center gap-2.5 p-3 rounded-xl border-2 transition-all ${
                          isSelected
                            ? 'border-on-surface dark:border-[#f0f1f2] shadow-sm scale-105'
                            : 'border-transparent bg-surface-container-low dark:bg-[#2e3132] hover:bg-surface-container'
                        }`}
                      >
                        <span className={`w-5 h-5 rounded-full ${col.bgClass} flex items-center justify-center text-white text-xs`}>
                          {isSelected ? '✓' : ''}
                        </span>
                        <span className="font-bold text-xs text-on-surface dark:text-[#f0f1f2]">
                          {col.name}
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: NOTIFICATIONS */}
          {activeTab === 'notifications' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="pb-4 border-b border-surface-variant">
                <h2 className="text-xl font-bold text-on-surface dark:text-[#f0f1f2]">
                  {t.notifPrefs}
                </h2>
                <p className="text-xs text-on-surface-variant mt-1">
                  {lang === 'zh' ? '控制系统在合适的时间发出适当数量的提醒。' : 'Decide when and how Flow notifies you.'}
                </p>
              </div>

              <div className="space-y-4">
                {/* Email */}
                <div className="flex items-center justify-between p-4 bg-surface-container-low dark:bg-[#2e3132] rounded-2xl">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-primary text-2xl">mail</span>
                    <div>
                      <p className="font-bold text-sm text-on-surface dark:text-[#f0f1f2]">{t.emailNotif}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{t.emailNotifSub}</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications.email}
                    onChange={(e) =>
                      onUpdateSettings({
                        notifications: { ...settings.notifications, email: e.target.checked },
                      })
                    }
                    className="w-5 h-5 accent-primary rounded cursor-pointer"
                  />
                </div>

                {/* Push */}
                <div className="flex items-center justify-between p-4 bg-surface-container-low dark:bg-[#2e3132] rounded-2xl">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary text-2xl">notifications_active</span>
                    <div>
                      <p className="font-bold text-sm text-on-surface dark:text-[#f0f1f2]">{t.pushNotif}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{t.pushNotifSub}</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications.push}
                    onChange={(e) =>
                      onUpdateSettings({
                        notifications: { ...settings.notifications, push: e.target.checked },
                      })
                    }
                    className="w-5 h-5 accent-primary rounded cursor-pointer"
                  />
                </div>

                {/* Desktop */}
                <div className="flex items-center justify-between p-4 bg-surface-container-low dark:bg-[#2e3132] rounded-2xl">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-tertiary text-2xl">desktop_windows</span>
                    <div>
                      <p className="font-bold text-sm text-on-surface dark:text-[#f0f1f2]">{t.desktopReminders}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{t.desktopRemindersSub}</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications.desktop}
                    onChange={(e) =>
                      onUpdateSettings({
                        notifications: { ...settings.notifications, desktop: e.target.checked },
                      })
                    }
                    className="w-5 h-5 accent-primary rounded cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: DEFAULTS */}
          {activeTab === 'defaults' && (
            <div className="space-y-6 animate-in fade-in duration-200">
              <div className="pb-4 border-b border-surface-variant">
                <h2 className="text-xl font-bold text-on-surface dark:text-[#f0f1f2]">
                  {t.taskDefaults}
                </h2>
                <p className="text-xs text-on-surface-variant mt-1">
                  {lang === 'zh' ? '设置新建任务时自动预填的优先级和类别。' : 'Set default values when adding tasks.'}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant mb-2">
                    {t.defaultPriority}
                  </label>
                  <select
                    value={settings.taskDefaults.priority}
                    onChange={(e) =>
                      onUpdateSettings({
                        taskDefaults: { ...settings.taskDefaults, priority: e.target.value as any },
                      })
                    }
                    className="w-full px-4 py-3 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant rounded-xl text-sm font-semibold text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="Urgent">{t.priorityUrgent}</option>
                    <option value="High">{t.priorityHigh}</option>
                    <option value="Medium">{t.priorityMedium}</option>
                    <option value="Low">{t.priorityLow}</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-on-surface-variant mb-2">
                    {t.defaultCategory}
                  </label>
                  <select
                    value={settings.taskDefaults.category}
                    onChange={(e) =>
                      onUpdateSettings({
                        taskDefaults: { ...settings.taskDefaults, category: e.target.value as any },
                      })
                    }
                    className="w-full px-4 py-3 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant rounded-xl text-sm font-semibold text-on-surface dark:text-[#f0f1f2] focus:ring-2 focus:ring-primary focus:outline-none"
                  >
                    <option value="Work">{t.work}</option>
                    <option value="Health">{t.health}</option>
                    <option value="Personal">{t.personal}</option>
                    <option value="Shopping">{t.shopping}</option>
                    <option value="Documentation">{t.documentation}</option>
                  </select>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
