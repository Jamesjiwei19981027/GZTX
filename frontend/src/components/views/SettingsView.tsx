import React, { useEffect, useState } from 'react';
import { AppSettings, UserProfile, Language, AccentColor } from '../../types';
import { getT } from '../../i18n';
import { getBrandName } from '../../constants/brand';
import { changePassword, deleteMyAccount, getBillingSummary, getPrivacySummary } from '../../api/auth';
import { getEmailStatus, getLlmConfig, getWechatSubscribeStatus, putWechatSubscribePreference, sendNotifyTest, listNotifyRecords, NotifyRecord } from '../../api/notifications';
import { getHealth } from '../../api/backend';
import { useToast } from '../toast/ToastProvider';

interface SettingsViewProps {
  user: UserProfile;
  onUpdateUser: (updated: Partial<UserProfile>) => Promise<void> | void;
  settings: AppSettings;
  onUpdateSettings: (updated: Partial<AppSettings>) => void;
  onResetDemo: () => void;
  onLogout?: () => Promise<void> | void;
  onUploadAvatar?: (file: File) => Promise<void> | void;
  onEnablePush?: () => Promise<void> | void;
  lang: Language;
}

export const SettingsView: React.FC<SettingsViewProps> = ({
  user,
  onUpdateUser,
  settings,
  onUpdateSettings,
  onResetDemo,
  onLogout,
  onUploadAvatar,
  onEnablePush,
  lang,
}) => {
  const t = getT(lang);
  const toast = useToast();
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
  const [billing, setBilling] = useState<{ plan_code?: string; status: string; company_name?: string } | null>(null);
  const [privacy, setPrivacy] = useState<{ retention: string; stored_data: Record<string, unknown> } | null>(null);
  const [deletePassword, setDeletePassword] = useState('');
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [wechatBound, setWechatBound] = useState(false);
  const [wechatEnabled, setWechatEnabled] = useState(settings.notifications.wechat);
  const [emailStatus, setEmailStatus] = useState<string>('');
  const [llmStatus, setLlmStatus] = useState<string>('');
  const [testSending, setTestSending] = useState<'email' | 'webpush' | null>(null);
  const [showNotifyRecords, setShowNotifyRecords] = useState(false);
  const [notifyRecords, setNotifyRecords] = useState<NotifyRecord[] | null>(null);
  const [notifyRecordsError, setNotifyRecordsError] = useState<string | null>(null);
  const [appVersion, setAppVersion] = useState<string>('');

  useEffect(() => {
    if (activeTab !== 'security' && activeTab !== 'notifications') return;
    void Promise.all([
      getBillingSummary().then((value) => setBilling(value)).catch(() => undefined),
      getPrivacySummary().then((value) => setPrivacy(value)).catch(() => undefined),
      getWechatSubscribeStatus().then((value) => { setWechatBound(value.wx_bound); setWechatEnabled(value.subscription_enabled); }).catch(() => undefined),
      getEmailStatus().then((value) => setEmailStatus(value.smtp_configured ? `SMTP: ${value.smtp_source}` : 'SMTP 未配置')).catch(() => undefined),
      getLlmConfig().then((value) => setLlmStatus(value.configured ? `LLM: ${value.provider}/${value.model}` : '个人 LLM 未配置')).catch(() => undefined),
    ]);
  }, [activeTab]);

  useEffect(() => {
    setNameInput(user.name);
    setEmailInput(user.email);
    setRoleInput(user.role);
    setAvatarInput(user.avatar);
  }, [user.name, user.email, user.role, user.avatar]);

  // 版本号（/health 免鉴权）：自托管用户升级后可在设置页确认版本
  useEffect(() => {
    void getHealth()
      .then((res) => setAppVersion(res.version || ''))
      .catch(() => setAppVersion(''));
  }, []);

  // 通知发送记录：展开折叠面板时拉取一次
  useEffect(() => {
    if (!showNotifyRecords) return;
    setNotifyRecordsError(null);
    void listNotifyRecords(50)
      .then((res) => setNotifyRecords(res.items || []))
      .catch((e) => setNotifyRecordsError(e instanceof Error ? e.message : '加载发送记录失败'));
  }, [showNotifyRecords]);

  const handleTestSend = async (channel: 'email' | 'webpush') => {
    setTestSending(channel);
    try {
      const res = await sendNotifyTest(channel);
      if (res.ok) {
        toast.success(
          lang === 'zh'
            ? `测试${channel === 'email' ? '邮件' : '推送'}已发送，请检查是否收到`
            : `Test ${channel} sent — check your inbox/device`,
        );
      } else {
        toast.error(
          lang === 'zh'
            ? `测试发送失败：${res.error || '未知原因'}`
            : `Test send failed: ${res.error || 'unknown'}`,
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : (lang === 'zh' ? '测试发送失败' : 'Test send failed'));
    } finally {
      setTestSending(null);
    }
  };

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

  const handleDeleteAccount = async () => {
    if (!window.confirm(lang === 'zh' ? '删除账号后将无法登录，确定继续吗？' : 'Delete this account permanently?')) return;
    setDeleteBusy(true);
    try {
      await deleteMyAccount(deletePassword);
      await onLogout?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : '账号删除失败');
    } finally {
      setDeleteBusy(false);
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
                {user.avatar ? (
                  <img
                    src={user.avatar}
                    alt={user.name}
                    className="w-20 h-20 rounded-full object-cover ring-4 ring-primary/20 shadow-md"
                  />
                ) : (
                  <span className="w-20 h-20 rounded-full bg-primary/10 text-primary text-2xl font-bold flex items-center justify-center ring-4 ring-primary/20 shadow-md">
                    {user.name ? user.name.slice(0, 1) : '?'}
                  </span>
                )}
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
                  {onUploadAvatar && (
                    <label className="inline-flex mt-2 px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold cursor-pointer">
                      {lang === 'zh' ? '上传头像文件' : 'Upload avatar'}
                      <input type="file" accept="image/png,image/jpeg,image/gif,image/webp" className="hidden" onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void onUploadAvatar(file);
                        event.currentTarget.value = '';
                      }} />
                    </label>
                  )}
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
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      data-testid="notify-test-email"
                      disabled={testSending !== null}
                      onClick={() => void handleTestSend('email')}
                      className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {testSending === 'email' ? (lang === 'zh' ? '发送中…' : 'Sending…') : (lang === 'zh' ? '发送测试' : 'Send test')}
                    </button>
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
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      data-testid="notify-test-webpush"
                      disabled={testSending !== null}
                      onClick={() => void handleTestSend('webpush')}
                      className="px-3 py-1.5 rounded-lg bg-primary/10 text-primary text-xs font-bold hover:bg-primary/20 transition-colors disabled:opacity-50"
                    >
                      {testSending === 'webpush' ? (lang === 'zh' ? '发送中…' : 'Sending…') : (lang === 'zh' ? '发送测试' : 'Send test')}
                    </button>
                    <input
                      type="checkbox"
                      checked={settings.notifications.push}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        if (checked && onEnablePush) {
                          void onEnablePush().then(() => onUpdateSettings({ notifications: { ...settings.notifications, push: true } })).catch((error) => {
                            toast.error(error instanceof Error ? error.message : 'Web Push 授权失败');
                          });
                        } else {
                          onUpdateSettings({ notifications: { ...settings.notifications, push: checked } });
                        }
                      }}
                      className="w-5 h-5 accent-primary rounded cursor-pointer"
                    />
                  </div>
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
                    checked={wechatEnabled}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setWechatEnabled(checked);
                      void putWechatSubscribePreference(checked).then(() => onUpdateSettings({ notifications: { ...settings.notifications, wechat: checked } })).catch((error) => {
                        setWechatEnabled(!checked);
                        toast.error(error instanceof Error ? error.message : '微信订阅设置失败');
                      });
                    }}
                    className="w-5 h-5 accent-primary rounded cursor-pointer"
                  />
                </div>
                <div className="p-3 rounded-xl border border-outline-variant/60 text-xs text-on-surface-variant">
                  <div className="flex justify-between"><span>{lang === 'zh' ? '微信绑定状态' : 'WeChat binding'}</span><span className={wechatBound ? 'text-secondary font-bold' : 'text-amber-600'}>{wechatBound ? (lang === 'zh' ? '已绑定' : 'Bound') : (lang === 'zh' ? '未绑定' : 'Not bound')}</span></div>
                  <p className="mt-1">{lang === 'zh' ? '开启微信提醒前，请先完成微信绑定。' : 'Bind WeChat before enabling template-message alerts.'}</p>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs text-on-surface-variant">
                  <div className="p-3 rounded-xl bg-surface-container-low">{emailStatus || 'SMTP 状态加载中…'}</div>
                  <div className="p-3 rounded-xl bg-surface-container-low">{llmStatus || '个人 LLM 状态加载中…'}</div>
                </div>

                {/* 通知发送记录（折叠）：失败行标红并展示原因 */}
                <div className="rounded-2xl border border-outline-variant/60 overflow-hidden">
                  <button
                    type="button"
                    data-testid="notify-records-toggle"
                    onClick={() => setShowNotifyRecords((v) => !v)}
                    className="w-full flex items-center justify-between px-4 py-3 text-sm font-bold text-on-surface dark:text-[#f0f1f2] hover:bg-surface-container-low transition-colors"
                  >
                    <span className="flex items-center gap-2">
                      <span className="material-symbols-outlined text-lg text-primary">history</span>
                      {lang === 'zh' ? '通知发送记录' : 'Delivery log'}
                    </span>
                    <span
                      className="material-symbols-outlined text-lg text-on-surface-variant transition-transform"
                      style={{ transform: showNotifyRecords ? 'rotate(180deg)' : 'none' }}
                    >
                      expand_more
                    </span>
                  </button>
                  {showNotifyRecords && (
                    <div className="border-t border-outline-variant/60 max-h-72 overflow-y-auto">
                      {notifyRecordsError ? (
                        <p className="px-4 py-3 text-xs text-error">{notifyRecordsError}</p>
                      ) : notifyRecords === null ? (
                        <p className="px-4 py-3 text-xs text-on-surface-variant">
                          {lang === 'zh' ? '加载中…' : 'Loading…'}
                        </p>
                      ) : notifyRecords.length === 0 ? (
                        <p className="px-4 py-3 text-xs text-on-surface-variant">
                          {lang === 'zh' ? '暂无发送记录。' : 'No delivery records yet.'}
                        </p>
                      ) : (
                        <ul className="divide-y divide-outline-variant/40">
                          {notifyRecords.map((record, i) => {
                            const failed = record.status !== 'sent' && record.status !== 'success' && record.status !== 'ok';
                            return (
                              <li key={i} className="px-4 py-2.5 flex items-start justify-between gap-3 text-xs">
                                <div className="min-w-0">
                                  <p className={`font-semibold truncate ${failed ? 'text-error' : 'text-on-surface dark:text-[#f0f1f2]'}`}>
                                    [{record.channel}] {record.task_title || (lang === 'zh' ? '（系统通知）' : '(system)')}
                                  </p>
                                  {failed && record.error && (
                                    <p className="text-error mt-0.5 break-words">{record.error}</p>
                                  )}
                                </div>
                                <div className="shrink-0 text-right">
                                  <span className={`font-bold ${failed ? 'text-error' : 'text-secondary'}`}>
                                    {failed ? (lang === 'zh' ? '失败' : 'Failed') : (lang === 'zh' ? '已发送' : 'Sent')}
                                  </span>
                                  <p className="text-on-surface-variant mt-0.5">
                                    {record.created_at ? record.created_at.slice(0, 16).replace('T', ' ') : '—'}
                                  </p>
                                </div>
                              </li>
                            );
                          })}
                        </ul>
                      )}
                    </div>
                  )}
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

              <div className="max-w-md">
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
                    <option value="High">{t.priorityHigh}</option>
                    <option value="Medium">{t.priorityMedium}</option>
                    <option value="Low">{t.priorityLow}</option>
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
                  {lang === 'zh' ? `退出当前设备上的 ${getBrandName(lang)} 会话。` : `Sign out of the current ${getBrandName(lang)} session.`}
                </p>
                {onLogout && (
                  <button type="button" onClick={() => void onLogout()} className="mt-3 px-4 py-2 rounded-xl border border-error/40 text-error text-xs font-bold hover:bg-error/10">
                    {t.signOut}
                  </button>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-6">
                  <div className="p-3 rounded-xl bg-surface-container-low text-xs">
                    <p className="font-bold text-on-surface">{lang === 'zh' ? '账单与订阅' : 'Billing & subscription'}</p>
                    <p className="mt-1 text-on-surface-variant">{billing ? `${billing.company_name || '个人'} · ${billing.plan_code || billing.status}` : '加载中…'}</p>
                  </div>
                  <div className="p-3 rounded-xl bg-surface-container-low text-xs">
                    <p className="font-bold text-on-surface">{lang === 'zh' ? '数据与隐私' : 'Data & privacy'}</p>
                    <p className="mt-1 text-on-surface-variant">{privacy ? `${privacy.retention} 任务 ${String(privacy.stored_data.tasks ?? 0)} 条` : '加载中…'}</p>
                  </div>
                </div>
                <div className="border-t border-error/30 pt-5 mt-5">
                  <h3 className="font-bold text-error">{lang === 'zh' ? '危险区：删除账号' : 'Danger zone: delete account'}</h3>
                  <p className="text-xs text-on-surface-variant mt-1">{lang === 'zh' ? '账号会被停用并保留必要审计记录。输入密码后点击删除。' : 'The account is disabled while required audit history is retained.'}</p>
                  <div className="flex gap-2 mt-3">
                    <input type="password" value={deletePassword} onChange={(e) => setDeletePassword(e.target.value)} placeholder={lang === 'zh' ? '当前密码' : 'Current password'} className="flex-1 px-3 py-2 rounded-xl border border-error/30 bg-surface text-xs" />
                    <button type="button" disabled={deleteBusy} onClick={() => void handleDeleteAccount()} className="px-3 py-2 rounded-xl bg-error text-on-error text-xs font-bold disabled:opacity-50">{deleteBusy ? '…' : (lang === 'zh' ? '删除账号' : 'Delete')}</button>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 版本号（来自 /health 的 APP_VERSION，构建注入）：自托管升级确认用 */}
      <p className="mt-8 text-center text-[11px] text-on-surface-variant" data-testid="app-version">
        {getBrandName(lang)} {appVersion ? `v${appVersion.replace(/^v/, '')}` : (lang === 'zh' ? '版本未知' : 'version unknown')}
      </p>
    </div>
  );
};
