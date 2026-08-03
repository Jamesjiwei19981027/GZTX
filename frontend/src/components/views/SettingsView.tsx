import React, { useEffect, useState } from 'react';
import { AppSettings, UserProfile, Language, AccentColor } from '../../types';
import { getT } from '../../i18n';
import { changePassword } from '../../api/auth';

interface SettingsViewProps {
  user: UserProfile;
  onUpdateUser: (updated: Partial<UserProfile>) => Promise<void> | void;
  settings: AppSettings;
  onUpdateSettings: (updated: Partial<AppSettings>) => void;
  onResetDemo: () => void;
  onLogout?: () => Promise<void> | void;
  lang: Language;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  onUpdateUser,
  settings,
  onUpdateSettings,
  onResetDemo,
  onLogout,
  lang,
}) => {
  const t = getT(lang);
  const [activeTab, setActiveTab] = useState<'profile' | 'appearance' | 'notifications' | 'defaults' | 'security'>('profile');

  const [nameInput, setNameInput] = useState(user.name);
  const [emailInput, setEmailInput] = useState(user.email);
  const [roleInput, setRoleInput] = useState(user.role);
  const [avatarInput, setAvatarInput] = useState(user.avatar);
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingProfile, setSavingProfile] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordMessage, setPasswordMessage] = useState<string | null>(null);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  useEffect(() => {
    setNameInput(user.name);
    setEmailInput(user.email);
    setRoleInput(user.role);
    setAvatarInput(user.avatar);
  }, [user.name, user.email, user.role, user.avatar]);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingProfile(true);
    setSaveError(null);
    try {
      await onUpdateUser({ name: nameInput, avatar: avatarInput.trim() });
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : '保存失败');
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordMessage(null);
    setPasswordError(null);
    if (newPassword.length < 6) {
      setPasswordError(lang === 'zh' ? '新密码至少需要 6 个字符。' : 'The new password must be at least 6 characters.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError(lang === 'zh' ? '两次输入的新密码不一致。' : 'The new passwords do not match.');
      return;
    }
    setSavingPassword(true);
    try {
      await changePassword(oldPassword, newPassword);
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordMessage(lang === 'zh' ? '密码已更新。' : 'Password updated.');
    } catch (error) {
      setPasswordError(error instanceof Error ? error.message : (lang === 'zh' ? '密码修改失败。' : 'Unable to change password.'));
    } finally {
      setSavingPassword(false);
    }
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
            onClick={() => setActiveTab('security')}
            className={`w-full flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-semibold transition-all ${
              activeTab === 'security'
                ? 'bg-primary text-on-primary shadow-sm'
                : 'text-on-surface dark:text-[#f0f1f2] hover:bg-surface-container-low'
            }`}
          >
            <span className="material-symbols-outlined text-xl">lock</span>
            <span>{t.securitySettings}</span>
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
                {saveError && <span className="text-xs text-error">{saveError}</span>}
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
                  <label className="block mt-3 text-[11px] font-semibold text-on-surface-variant">
                    {lang === 'zh' ? '头像地址（可选）' : 'Avatar URL (optional)'}
                    <input
                      type="url"
                      value={avatarInput}
                      onChange={(e) => setAvatarInput(e.target.value)}
                      placeholder="https://…"
                      className="mt-1 w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-xs text-on-surface dark:text-[#f0f1f2]"
                    />
                  </label>
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
                    readOnly
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
                  readOnly
                  title={lang === 'zh' ? '职位由公司成员权限决定' : 'Role is managed by company membership'}
                  />
              </div>

              <div className="pt-4 flex justify-end">
                <button
                  type="submit"
                  className="px-6 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-sm shadow-md hover:opacity-90 transition-all active:scale-95"
                >
                  {savingProfile ? (lang === 'zh' ? '保存中…' : 'Saving…') : t.updateProfile}
                </button>
              </div>

              <div className="mt-8 pt-6 border-t border-surface-variant">
                <h3 className="text-base font-bold text-on-surface dark:text-[#f0f1f2]">
                  {lang === 'zh' ? '数据同步' : 'Data sync'}
                </h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  {lang === 'zh' ? '重新从服务器加载任务、项目和个人设置。' : 'Reload tasks, projects, and profile settings from the server.'}
                </p>
                <button
                  type="button"
                  onClick={onResetDemo}
                  className="mt-4 px-4 py-2 bg-primary/10 text-primary hover:bg-primary/20 rounded-xl text-xs font-bold transition-colors shadow-xs"
                >
                  {lang === 'zh' ? '重新同步' : 'Sync again'}
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

                {/* WeChat */}
                <div className="flex items-center justify-between p-4 bg-surface-container-low dark:bg-[#2e3132] rounded-2xl">
                  <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-secondary text-2xl">chat</span>
                    <div>
                      <p className="font-bold text-sm text-on-surface dark:text-[#f0f1f2]">{lang === 'zh' ? '微信提醒' : 'WeChat alerts'}</p>
                      <p className="text-xs text-on-surface-variant mt-0.5">{lang === 'zh' ? '通过已绑定的微信渠道提醒' : 'Use the linked WeChat channel'}</p>
                    </div>
                  </div>
                  <input
                    type="checkbox"
                    checked={settings.notifications.wechat}
                    onChange={(e) => onUpdateSettings({ notifications: { ...settings.notifications, wechat: e.target.checked } })}
                    className="w-5 h-5 accent-primary rounded cursor-pointer"
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <label className="text-xs font-bold text-on-surface-variant">
                    {lang === 'zh' ? '静音开始' : 'Quiet hours start'}
                    <input
                      type="time"
                      value={settings.notifications.quietHoursStart}
                      onChange={(e) => onUpdateSettings({ notifications: { ...settings.notifications, quietHoursStart: e.target.value } })}
                      className="mt-1 w-full px-3 py-2 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant rounded-xl text-sm text-on-surface dark:text-[#f0f1f2]"
                    />
                  </label>
                  <label className="text-xs font-bold text-on-surface-variant">
                    {lang === 'zh' ? '静音结束' : 'Quiet hours end'}
                    <input
                      type="time"
                      value={settings.notifications.quietHoursEnd}
                      onChange={(e) => onUpdateSettings({ notifications: { ...settings.notifications, quietHoursEnd: e.target.value } })}
                      className="mt-1 w-full px-3 py-2 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant rounded-xl text-sm text-on-surface dark:text-[#f0f1f2]"
                    />
                  </label>
                </div>

                <label className="flex items-center gap-3 text-sm font-semibold text-on-surface dark:text-[#f0f1f2]">
                  <input
                    type="checkbox"
                    checked={settings.notifications.weekendMute}
                    onChange={(e) => onUpdateSettings({ notifications: { ...settings.notifications, weekendMute: e.target.checked } })}
                    className="w-5 h-5 accent-primary rounded cursor-pointer"
                  />
                  {lang === 'zh' ? '周末全天免打扰' : 'Mute all weekend'}
                </label>
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

          {/* TAB 5: SECURITY */}
          {activeTab === 'security' && (
            <div className="space-y-8 animate-in fade-in duration-200">
              <div className="pb-4 border-b border-surface-variant">
                <h2 className="text-xl font-bold text-on-surface dark:text-[#f0f1f2]">{t.securitySettings}</h2>
                <p className="text-xs text-on-surface-variant mt-1">
                  {lang === 'zh' ? '使用当前密码验证后设置新的登录密码。' : 'Verify your current password before setting a new sign-in password.'}
                </p>
              </div>
              <form onSubmit={handleChangePassword} className="space-y-4 max-w-lg">
                <label className="block text-xs font-bold text-on-surface-variant">
                  {lang === 'zh' ? '当前密码' : 'Current password'}
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={oldPassword}
                    onChange={(e) => setOldPassword(e.target.value)}
                    required
                    className="mt-1 w-full px-4 py-2.5 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant rounded-xl text-sm text-on-surface dark:text-[#f0f1f2]"
                  />
                </label>
                <label className="block text-xs font-bold text-on-surface-variant">
                  {lang === 'zh' ? '新密码' : 'New password'}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    required
                    minLength={6}
                    className="mt-1 w-full px-4 py-2.5 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant rounded-xl text-sm text-on-surface dark:text-[#f0f1f2]"
                  />
                </label>
                <label className="block text-xs font-bold text-on-surface-variant">
                  {lang === 'zh' ? '确认新密码' : 'Confirm new password'}
                  <input
                    type="password"
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                    minLength={6}
                    className="mt-1 w-full px-4 py-2.5 bg-surface-container-low dark:bg-[#2e3132] border border-outline-variant rounded-xl text-sm text-on-surface dark:text-[#f0f1f2]"
                  />
                </label>
                {passwordError && <p className="text-xs text-error">{passwordError}</p>}
                {passwordMessage && <p className="text-xs text-secondary">{passwordMessage}</p>}
                <button type="submit" disabled={savingPassword} className="px-5 py-2.5 bg-primary text-on-primary rounded-xl font-bold text-xs disabled:opacity-60">
                  {savingPassword ? (lang === 'zh' ? '更新中…' : 'Updating…') : (lang === 'zh' ? '更新密码' : 'Update password')}
                </button>
              </form>
              <div className="border-t border-surface-variant pt-6">
                <h3 className="font-bold text-on-surface dark:text-[#f0f1f2]">{t.account}</h3>
                <p className="text-xs text-on-surface-variant mt-1">
                  {lang === 'zh' ? '退出当前设备上的 WorkTodo 会话。' : 'Sign out of the current WorkTodo session.'}
                </p>
                {onLogout && (
                  <button type="button" onClick={() => void onLogout()} className="mt-3 px-4 py-2 rounded-xl border border-error/40 text-error text-xs font-bold hover:bg-error/10">
                    {t.signOut}
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
