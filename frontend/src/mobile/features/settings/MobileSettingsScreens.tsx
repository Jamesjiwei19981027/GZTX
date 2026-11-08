/**
 * 移动端设置中心 (Mobile Settings Screens)
 * 覆盖设计 ID:
 * - 53: 我的 (主入口)
 * - 54: 个人资料 (头像上传/昵称/已验证状态)
 * - 55: 账号安全 (密码修改/验证绑定/删除账号入口)
 * - 56: 外观与语言 (主题/字号/减少动态效果/多语言)
 * - 57: 通知与免打扰 (渠道开关/免打扰时间/测试发送)
 * - 58: 任务默认值 (默认优先级/分类/提醒时间)
 * - 62: 套餐、隐私与帮助 (套餐席位/隐私数据/桌面快捷键/统计说明)
 * - 63: 通知发送记录 (真实 listNotifyRecords 列表)
 * - 90: 第三方服务绑定 (微信/企微/钉钉真实绑定状态与合规提示)
 */

import { priorityLabel } from '../../../utils/taskLabels';
import React, { useState, useEffect, useTransition } from 'react';
import { useMobileNavigation } from '../../navigation/MobileNavigationProvider';
import { useNativeRuntime } from '../../runtime/NativeRuntimeProvider';
import {
  UserProfile,
  AppSettings,
  Language,
  Priority,
  Category,
} from '../../../types';
import {
  fetchMe,
  updateMe,
  uploadAvatar,
  changePassword,
  getVerificationStatus,
  sendBindCode,
  confirmBindCode,
  getBillingSummary,
  getPrivacySummary,
  VerificationStatus,
} from '../../../api/auth';
import {
  sendNotifyTest,
  listNotifyRecords,
  NotifyRecord,
} from '../../../api/notifications';
import { MobileTopBar } from '../../ui/MobileTopBar';
import { MobileListGroup, MobileListItem } from '../../ui/MobileList';
import { MobileField, MobileInput } from '../../ui/MobileField';
import { MobileLoadingState, MobileEmptyState } from '../../ui/MobileState';
import { AppIcon } from '../../ui/AppIcon';

export interface SettingsSharedProps {
  user: UserProfile;
  settings: AppSettings;
  companyId?: number | string | null;
  onUpdateUser: (updated: Partial<UserProfile>) => Promise<void>;
  onUploadAvatar?: (file: File) => Promise<void>;
  onUpdateSettings: (updated: Partial<AppSettings>) => void;
  onLogout: () => Promise<void>;
}

// 检查是否具备管理员权限
export function isUserAdmin(user: UserProfile): boolean {
  if (!user || !user.role) return false;
  const r = user.role.toLowerCase();
  return r.includes('admin') || r.includes('owner') || r === 'super_admin' || r.includes('管理员');
}

// ==========================================
// 53. 我的 (主页面)
// ==========================================
export const MobileMeScreen: React.FC<SettingsSharedProps> = ({
  user,
  settings,
  companyId,
  onLogout,
}) => {
  const { push } = useMobileNavigation();
  const isAdmin = isUserAdmin(user);
  const [logoutConfirmOpen, setLogoutConfirmOpen] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

  const handleLogout = async () => {
    setLoggingOut(true);
    try {
      await onLogout();
    } finally {
      setLoggingOut(false);
      setLogoutConfirmOpen(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-24 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="我的" />

      <div className="px-4 py-3 max-w-xl mx-auto w-full flex flex-col gap-4">
        {/* 用户个人资料卡片 */}
        <div
          role="button"
          tabIndex={0}
          onClick={() => push({ screen: 'me-profile', title: '个人资料' })}
          className="flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs cursor-pointer active:scale-[0.99] transition-transform"
        >
          <div className="relative">
            {user.avatar ? (
              <img
                src={user.avatar}
                alt={user.name}
                className="w-16 h-16 rounded-full object-cover border-2 border-slate-100 dark:border-slate-800"
              />
            ) : (
              <div className="w-16 h-16 rounded-full bg-blue-100 dark:bg-blue-950/60 text-[#0058BE] dark:text-blue-400 font-semibold text-2xl flex items-center justify-center">
                {user.name ? user.name.slice(0, 1).toUpperCase() : 'U'}
              </div>
            )}
            <div className="absolute -bottom-1 -right-1 p-1 bg-[#0058BE] rounded-full text-white">
              <AppIcon name="edit" size={12} />
            </div>
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              <h2 className="text-lg font-bold text-slate-900 dark:text-white truncate">
                {user.name || '未命名用户'}
              </h2>
              <span
                className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${
                  isAdmin
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-blue-100 text-blue-800 dark:bg-blue-950/60 dark:text-blue-300'
                }`}
              >
                {isAdmin ? '管理员' : '成员'}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 truncate mt-0.5">
              {user.email || '未绑定邮箱'}
            </p>
            {companyId && (
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1">
                <AppIcon name="work" size={12} />
                <span>企业 ID: {companyId}</span>
              </p>
            )}
          </div>

          <AppIcon name="chevron-right" size={18} className="text-slate-400 shrink-0" />
        </div>

        {/* 个人偏好分组 */}
        <MobileListGroup title="个人设置">
          <MobileListItem
            leading={<AppIcon name="file" size={18} className="text-indigo-600" />}
            title="我的知识空间"
            subtitle="个人知识、资料来源与知识关系图"
            onClick={() => push({ tab: 'knowledge', screen: 'knowledge-root', title: '知识' })}
          />
          <MobileListItem
            leading={<AppIcon name="user" size={18} className="text-[#0058BE]" />}
            title="个人资料"
            subtitle="头像、姓名与联系方式"
            onClick={() => push({ screen: 'me-profile', title: '个人资料' })}
          />
          <MobileListItem
            leading={<AppIcon name="shield" size={18} className="text-emerald-600" />}
            title="账号安全"
            subtitle="登录密码、安全验证与注销"
            onClick={() => push({ screen: 'me-security', title: '账号安全' })}
          />
          <MobileListItem
            leading={<AppIcon name="palette" size={18} className="text-purple-600" />}
            title="外观"
            subtitle={settings.themeMode === 'dark' ? '深色模式' : '浅色模式'}
            onClick={() => push({ screen: 'me-appearance', title: '外观' })}
          />
          <MobileListItem
            leading={<AppIcon name="bell" size={18} className="text-amber-500" />}
            title="通知与免打扰"
            subtitle="推送渠道、提醒时段与免打扰"
            onClick={() => push({ screen: 'me-notifications', title: '通知与免打扰' })}
          />
          <MobileListItem
            leading={<AppIcon name="sliders" size={18} className="text-sky-600" />}
            title="任务默认值"
            subtitle={`默认优先级: ${priorityLabel(settings.taskDefaults?.priority || 'Medium')}`}
            showDivider={false}
            onClick={() => push({ screen: 'me-defaults', title: '任务默认值' })}
          />
        </MobileListGroup>

        {/* 企业级管理与集成 */}
        <MobileListGroup
          title="企业集成与管理"
          footer={isAdmin ? '您拥有企业级管理员权限，可配置基础设施服务' : '普通成员视图仅供查看，修改配置需企业管理员权限'}
        >
          <MobileListItem
            leading={<AppIcon name="mail" size={18} className="text-blue-500" />}
            title="通知渠道配置"
            subtitle="SMTP 邮件服务器、WebPush 与微信"
            onClick={() => push({ screen: 'admin-notify-channels', title: '通知渠道配置' })}
          />
          <MobileListItem
            leading={<AppIcon name="cpu" size={18} className="text-indigo-600" />}
            title="AI 模型与语音配置"
            subtitle="LLM 提供商、API 连通性与 ASR 绑定"
            onClick={() => push({ screen: 'admin-llm-config', title: 'AI 模型配置' })}
          />
          <MobileListItem
            leading={<AppIcon name="globe" size={18} className="text-teal-600" />}
            title="组织与登录集成"
            subtitle="企业微信/钉钉/飞书组织架构与 SSO"
            onClick={() => push({ screen: 'admin-org-sso', title: '组织与登录集成' })}
          />
          <MobileListItem
            leading={<AppIcon name="share" size={18} className="text-emerald-500" />}
            title="第三方服务绑定"
            subtitle="微信提醒服务号、协同账号关联"
            onClick={() => push({ screen: 'me-integrations', title: '第三方服务绑定' })}
          />
          <MobileListItem
            leading={<AppIcon name="smartphone" size={18} className="text-orange-500" />}
            title="推送证书状态"
            subtitle="APNs (iOS) / FCM (Android) 证书诊断"
            onClick={() => push({ screen: 'admin-push-certs', title: '推送证书状态' })}
          />
          <MobileListItem
            leading={<AppIcon name="key" size={18} className="text-amber-600" />}
            title="模型密钥配置"
            subtitle="OpenAI / DeepSeek / Claude 密匙管理"
            onClick={() => push({ screen: 'admin-model-keys', title: '模型密钥配置' })}
          />
          <MobileListItem
            leading={<AppIcon name="mic" size={18} className="text-rose-500" />}
            title="语音识别配置 (ASR)"
            subtitle="Whisper 引擎、转写采样率与权限"
            onClick={() => push({ screen: 'admin-asr-config', title: '语音识别配置' })}
          />
          <MobileListItem
            leading={<AppIcon name="server" size={18} className="text-slate-600" />}
            title="单点登录配置 (SSO)"
            subtitle="OIDC 客户端凭据与 SAML 2.0"
            showDivider={false}
            onClick={() => push({ screen: 'admin-sso-config', title: '单点登录配置' })}
          />
        </MobileListGroup>

        {/* 服务与支持 */}
        <MobileListGroup title="支持与记录">
          <MobileListItem
            leading={<AppIcon name="card" size={18} className="text-cyan-600" />}
            title="套餐、隐私与帮助"
            subtitle="席位授权、数据导出与桌面快捷键"
            onClick={() => push({ screen: 'me-billing-help', title: '套餐、隐私与帮助' })}
          />
          <MobileListItem
            leading={<AppIcon name="clock" size={18} className="text-blue-500" />}
            title="通知发送记录"
            subtitle="最近 50 条消息送达状态与失败分析"
            showDivider={false}
            onClick={() => push({ screen: 'me-notify-logs', title: '通知发送记录' })}
          />
        </MobileListGroup>

        {/* 退出登录操作按钮 */}
        <div className="pt-2">
          <button
            type="button"
            onClick={() => setLogoutConfirmOpen(true)}
            className="w-full min-h-[48px] px-4 rounded-2xl bg-white dark:bg-slate-900 border border-red-200 dark:border-red-950 text-red-600 dark:text-red-400 font-medium text-base flex items-center justify-center gap-2 hover:bg-red-50 dark:hover:bg-red-950/30 active:scale-[0.99] transition-all cursor-pointer shadow-xs"
          >
            <AppIcon name="logout" size={18} />
            <span>退出当前账号</span>
          </button>
        </div>
      </div>

      {/* 退出登录确认弹窗 */}
      {logoutConfirmOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-end sm:items-center justify-center p-4">
          <div className="w-full max-w-sm bg-white dark:bg-slate-900 rounded-3xl p-6 shadow-2xl border border-slate-200/80 dark:border-slate-800 flex flex-col gap-4 text-center">
            <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-950/60 text-red-600 mx-auto flex items-center justify-center">
              <AppIcon name="logout" size={24} />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-900 dark:text-slate-100">确认退出登录？</h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 leading-relaxed">
                退出后本地草稿将被安全清理，下次登录需要重新输入身份凭据。
              </p>
            </div>
            <div className="flex flex-col gap-2 pt-2">
              <button
                type="button"
                disabled={loggingOut}
                onClick={handleLogout}
                className="w-full min-h-[48px] rounded-xl bg-red-600 text-white font-medium text-base hover:bg-red-700 active:bg-red-800 disabled:opacity-50 transition-colors cursor-pointer"
              >
                {loggingOut ? '正在退出…' : '确认退出'}
              </button>
              <button
                type="button"
                disabled={loggingOut}
                onClick={() => setLogoutConfirmOpen(false)}
                className="w-full min-h-[48px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 font-medium text-base hover:bg-slate-200 dark:hover:bg-slate-700 active:scale-[0.99] transition-colors cursor-pointer"
              >
                取消
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

// ==========================================
// 54. 个人资料 (Profile)
// ==========================================
export const MobileProfileScreen: React.FC<SettingsSharedProps> = ({
  user,
  onUpdateUser,
  onUploadAvatar,
}) => {
  const { goBack } = useMobileNavigation();
  const [nickname, setNickname] = useState(user.name || '');
  const [avatarUrl, setAvatarUrl] = useState(user.avatar || '');
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [vStatus, setVStatus] = useState<VerificationStatus | null>(null);

  useEffect(() => {
    getVerificationStatus()
      .then((st) => setVStatus(st))
      .catch(() => {});
  }, []);

  const handleAvatarFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 5 * 1024 * 1024) {
      setErrorMsg('头像文件大小不得超过 5MB');
      return;
    }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setErrorMsg('仅支持 JPG, PNG, WEBP, GIF 格式头像');
      return;
    }

    setUploading(true);
    setErrorMsg(null);
    try {
      if (onUploadAvatar) {
        await onUploadAvatar(file);
      } else {
        const res = await uploadAvatar(file);
        if (res.avatar_url) {
          setAvatarUrl(res.avatar_url);
          await onUpdateUser({ avatar: res.avatar_url });
        }
      }
      setSuccessMsg('头像已成功更新');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '头像上传失败，请重试');
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!nickname.trim()) {
      setErrorMsg('姓名/昵称不能为空');
      return;
    }
    setSaving(true);
    setErrorMsg(null);
    try {
      await updateMe({ nickname: nickname.trim() });
      await onUpdateUser({ name: nickname.trim(), avatar: avatarUrl });
      setSuccessMsg('个人资料已保存');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '保存失败，请检查网络后重试');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="个人资料" onBack={goBack} />

      <div className="px-4 py-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        {/* 头像更换卡片 */}
        <div className="p-6 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col items-center gap-3 text-center">
          <div className="relative group">
            {avatarUrl ? (
              <img
                src={avatarUrl}
                alt="头像"
                className="w-24 h-24 rounded-full object-cover border-4 border-slate-100 dark:border-slate-800"
              />
            ) : (
              <div className="w-24 h-24 rounded-full bg-blue-100 dark:bg-blue-950/60 text-[#0058BE] font-bold text-3xl flex items-center justify-center">
                {nickname ? nickname.slice(0, 1).toUpperCase() : 'U'}
              </div>
            )}
            {uploading && (
              <div className="absolute inset-0 rounded-full bg-black/50 flex items-center justify-center text-white">
                <div className="w-6 h-6 border-2 border-white border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            <label
              htmlFor="avatar-upload"
              className="absolute bottom-0 right-0 p-2 bg-[#0058BE] text-white rounded-full shadow-md cursor-pointer hover:bg-blue-700 active:scale-95 transition-all"
              aria-label="上传新头像"
            >
              <AppIcon name="edit" size={14} />
              <input
                id="avatar-upload"
                type="file"
                accept="image/jpeg,image/png,image/webp,image/gif"
                className="hidden"
                disabled={uploading}
                onChange={handleAvatarFile}
              />
            </label>
          </div>
          <div>
            <span className="text-xs text-slate-400 dark:text-slate-500">
              支持 JPG, PNG, WebP (上限 5MB)
            </span>
          </div>
        </div>

        {errorMsg && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400 text-xs">
            <AppIcon name="alert" size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs">
            <AppIcon name="check-circle" size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 字段列表 */}
        <MobileListGroup title="基本信息">
          <div className="p-4 flex flex-col gap-4">
            <MobileField label="姓名 / 昵称" required>
              <MobileInput
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder="请输入您的姓名"
                clearable
                onClear={() => setNickname('')}
              />
            </MobileField>

            <MobileField label="工作邮箱">
              <div className="flex items-center justify-between min-h-[48px] px-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-sm">
                <span className="text-slate-700 dark:text-slate-300">
                  {vStatus?.email || user.email || '未绑定'}
                </span>
                <span className="text-[11px] font-medium px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300">
                  {vStatus?.email_verified ? '已验证' : '已绑定'}
                </span>
              </div>
            </MobileField>

            <MobileField label="手机号码">
              <div className="flex items-center justify-between min-h-[48px] px-3.5 bg-slate-50 dark:bg-slate-800/60 rounded-xl border border-slate-200 dark:border-slate-700 text-sm">
                <span className="text-slate-700 dark:text-slate-300">
                  {vStatus?.phone || '未绑定手机'}
                </span>
                <span className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${vStatus?.phone_verified ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300' : 'bg-slate-100 text-slate-500 dark:bg-slate-800 dark:text-slate-400'}`}>
                  {vStatus?.phone_verified ? '已验证' : '未验证'}
                </span>
              </div>
            </MobileField>
          </div>
        </MobileListGroup>

        <button
          type="button"
          disabled={saving || uploading}
          onClick={handleSave}
          className="w-full min-h-[48px] rounded-xl bg-[#0058BE] text-white font-medium text-base hover:bg-blue-700 active:bg-blue-800 disabled:opacity-50 transition-colors shadow-sm cursor-pointer"
        >
          {saving ? '正在保存…' : '保存修改'}
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 55. 账号安全 (Security)
// ==========================================
export const MobileSecurityScreen: React.FC<SettingsSharedProps> = ({ user }) => {
  const { goBack, push } = useMobileNavigation();
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [changing, setChanging] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  const [vStatus, setVStatus] = useState<VerificationStatus | null>(null);
  const [bindingChannel, setBindingChannel] = useState<'email' | 'sms' | null>(null);
  const [bindTarget, setBindTarget] = useState('');
  const [bindCode, setBindCode] = useState('');
  const [sendingCode, setSendingCode] = useState(false);
  const [confirmingCode, setConfirmingCode] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    getVerificationStatus().then(setVStatus).catch(() => {});
  }, []);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setInterval(() => setCooldown((c) => c - 1), 1000);
    return () => clearInterval(timer);
  }, [cooldown]);

  const handleChangePassword = async () => {
    if (!oldPassword) {
      setErrorMsg('请输入当前原密码');
      return;
    }
    if (newPassword.length < 6) {
      setErrorMsg('新密码长度不能少于 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('两次输入的新密码不一致');
      return;
    }

    setChanging(true);
    setErrorMsg(null);
    try {
      await changePassword(oldPassword, newPassword);
      setSuccessMsg('密码修改成功，下次请使用新密码登录');
      setOldPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setTimeout(() => setSuccessMsg(null), 4000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '密码修改失败，请核对原密码');
    } finally {
      setChanging(false);
    }
  };

  const handleSendCode = async () => {
    if (!bindingChannel || !bindTarget.trim()) {
      setErrorMsg('请输入有效的手机号或邮箱');
      return;
    }
    setSendingCode(true);
    setErrorMsg(null);
    try {
      const res = await sendBindCode(bindingChannel, bindTarget.trim());
      setCooldown(res.cooldown_seconds || 60);
      setSuccessMsg(`验证码已发送至 ${bindTarget}`);
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '发送验证码失败');
    } finally {
      setSendingCode(false);
    }
  };

  const handleConfirmBind = async () => {
    if (!bindingChannel || !bindTarget.trim() || !bindCode.trim()) {
      setErrorMsg('请输入完整的目标与验证码');
      return;
    }
    setConfirmingCode(true);
    setErrorMsg(null);
    try {
      const updated = await confirmBindCode(bindingChannel, bindTarget.trim(), bindCode.trim());
      setVStatus(updated);
      setSuccessMsg('绑定验证成功！');
      setBindingChannel(null);
      setBindTarget('');
      setBindCode('');
      setTimeout(() => setSuccessMsg(null), 3000);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '验证码校验失败');
    } finally {
      setConfirmingCode(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="账号安全" onBack={goBack} />

      <div className="px-4 py-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        {errorMsg && (
          <div className="p-3.5 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl flex items-center gap-2 text-red-600 dark:text-red-400 text-xs">
            <AppIcon name="alert" size={16} />
            <span>{errorMsg}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs">
            <AppIcon name="check-circle" size={16} />
            <span>{successMsg}</span>
          </div>
        )}

        {/* 密码修改分组 */}
        <MobileListGroup title="登录密码">
          <div className="p-4 flex flex-col gap-3.5">
            <MobileField label="当前原密码" required>
              <MobileInput
                type={showPassword ? 'text' : 'password'}
                value={oldPassword}
                onChange={(e) => setOldPassword(e.target.value)}
                placeholder="请输入原密码"
                trailing={
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
                    aria-label={showPassword ? '隐藏明文' : '显示明文'}
                  >
                    <AppIcon name={showPassword ? 'eye-off' : 'eye'} size={18} />
                  </button>
                }
              />
            </MobileField>

            <MobileField label="新密码" helperText="至少 6 位字符，推荐包含数字和英文字母" required>
              <MobileInput
                type={showPassword ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="请输入新密码"
              />
            </MobileField>

            <MobileField label="确认新密码" required>
              <MobileInput
                type={showPassword ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="请再次输入新密码"
              />
            </MobileField>

            <button
              type="button"
              disabled={changing || !oldPassword || !newPassword}
              onClick={handleChangePassword}
              className="mt-2 w-full min-h-[44px] rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-medium text-sm hover:opacity-90 active:opacity-80 disabled:opacity-40 transition-opacity cursor-pointer"
            >
              {changing ? '正在修改…' : '更新密码'}
            </button>
          </div>
        </MobileListGroup>

        {/* 多重安全验证绑定 */}
        <MobileListGroup title="安全验证与绑定">
          <MobileListItem
            leading={<AppIcon name="mail" size={18} className="text-blue-500" />}
            title="工作邮箱验证"
            subtitle={vStatus?.email ? `${vStatus.email} (${vStatus.email_verified ? '已认证' : '未认证'})` : '尚未绑定邮箱'}
            trailing={
              <button
                type="button"
                onClick={() => {
                  setBindingChannel('email');
                  setBindTarget(vStatus?.email || user.email || '');
                }}
                className="text-xs font-medium text-[#0058BE] px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 cursor-pointer"
              >
                {vStatus?.email_verified ? '换绑' : '验证'}
              </button>
            }
          />
          <MobileListItem
            leading={<AppIcon name="phone" size={18} className={vStatus?.phone_verified ? 'text-emerald-500' : 'text-slate-400'} />}
            title="手机安全验证"
            subtitle={<span className={vStatus?.phone_verified ? 'text-emerald-600 dark:text-emerald-400' : 'text-slate-400'}>{vStatus?.phone || '尚未绑定手机'} · {vStatus?.phone_verified ? '已验证' : '未验证'}</span>}
            showDivider={false}
            trailing={
              <button
                type="button"
                onClick={() => {
                  setBindingChannel('sms');
                  setBindTarget(vStatus?.phone || '');
                }}
                className="text-xs font-medium text-[#0058BE] px-2.5 py-1 rounded-lg bg-blue-50 dark:bg-blue-950/60 cursor-pointer"
              >
                {vStatus?.phone_verified ? '换绑' : '验证'}
              </button>
            }
          />
        </MobileListGroup>

        {/* 绑定弹层 Sheet 模式 */}
        {bindingChannel && (
          <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-blue-200 dark:border-blue-900 shadow-sm flex flex-col gap-3">
            <div className="flex items-center justify-between">
              <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                {bindingChannel === 'email' ? '绑定/验证邮箱' : '绑定/验证手机'}
              </h4>
              <button
                type="button"
                onClick={() => setBindingChannel(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <AppIcon name="close" size={16} />
              </button>
            </div>

            <MobileField label={bindingChannel === 'email' ? '邮箱地址' : '手机号'}>
              <MobileInput
                value={bindTarget}
                onChange={(e) => setBindTarget(e.target.value)}
                placeholder={bindingChannel === 'email' ? 'name@company.com' : '13800000000'}
              />
            </MobileField>

            <MobileField label="验证码">
              <div className="flex gap-2">
                <MobileInput
                  value={bindCode}
                  onChange={(e) => setBindCode(e.target.value)}
                  placeholder="6 位数字验证码"
                  className="flex-1"
                />
                <button
                  type="button"
                  disabled={sendingCode || cooldown > 0 || !bindTarget.trim()}
                  onClick={handleSendCode}
                  className="px-4 min-h-[48px] rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {cooldown > 0 ? `${cooldown}s` : sendingCode ? '发送中…' : '获取验证码'}
                </button>
              </div>
            </MobileField>

            <button
              type="button"
              disabled={confirmingCode || !bindCode.trim()}
              onClick={handleConfirmBind}
              className="mt-1 w-full min-h-[44px] rounded-xl bg-[#0058BE] text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50 cursor-pointer"
            >
              {confirmingCode ? '验证中…' : '确认绑定'}
            </button>
          </div>
        )}

        {/* 危险区：删除账号入口 (ID 96) */}
        <div className="pt-4">
          <MobileListGroup title="高风险操作" footer="注销账号将永久清除所有个人数据与权限，操作不可逆。">
            <MobileListItem
              destructive
              leading={<AppIcon name="alert" size={18} className="text-red-500" />}
              title="注销此账号"
              subtitle="删除账号并吊销所有访问凭证"
              showDivider={false}
              onClick={() => push({ screen: 'adapt-account-delete', title: '注销账号确认' })}
            />
          </MobileListGroup>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 56. 外观 (Appearance)
// ==========================================
export const MobileAppearanceScreen: React.FC<SettingsSharedProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { goBack } = useMobileNavigation();
  const { runtime } = useNativeRuntime();

  const handleTheme = (mode: 'light' | 'dark') => {
    onUpdateSettings({ themeMode: mode });
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="外观" onBack={goBack} />

      <div className="px-4 py-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        {/* 主题选择卡片 */}
        <MobileListGroup title="主题模式" footer="深色模式遵循 iOS 标准高对比度规范，保障弱光下的可读性。">
          <div className="p-4 grid grid-cols-2 gap-3">
            <div
              role="button"
              tabIndex={0}
              onClick={() => handleTheme('light')}
              className={`p-3.5 rounded-xl border-2 flex flex-col items-center gap-2 cursor-pointer transition-all ${
                settings.themeMode === 'light'
                  ? 'border-[#0058BE] bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-600 flex items-center justify-center">
                <AppIcon name="info" size={20} />
              </div>
              <span className="text-sm font-medium">浅色模式</span>
              {settings.themeMode === 'light' && (
                <span className="text-[11px] text-[#0058BE] font-bold">当前生效</span>
              )}
            </div>

            <div
              role="button"
              tabIndex={0}
              onClick={() => handleTheme('dark')}
              className={`p-3.5 rounded-xl border-2 flex flex-col items-center gap-2 cursor-pointer transition-all ${
                settings.themeMode === 'dark'
                  ? 'border-[#0058BE] bg-blue-50/50 dark:bg-blue-950/30'
                  : 'border-slate-200 dark:border-slate-700 bg-slate-900 text-white'
              }`}
            >
              <div className="w-10 h-10 rounded-full bg-slate-800 text-blue-400 flex items-center justify-center">
                <AppIcon name="lock" size={20} />
              </div>
              <span className="text-sm font-medium">深色模式</span>
              {settings.themeMode === 'dark' && (
                <span className="text-[11px] text-[#0058BE] font-bold">当前生效</span>
              )}
            </div>
          </div>
        </MobileListGroup>

        {/* 动态字号说明与状态 */}
        <MobileListGroup
          title="系统动态字体 (Dynamic Type)"
          footer="字号遵循宿主系统设置自动缩放（支持标准、150%、200% 大字模式），排版自适应多行不截断。"
        >
          <div className="p-4 flex flex-col gap-2 text-xs">
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">当前宿主平台</span>
              <span className="font-semibold uppercase">{runtime.platform}</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">正文字号 (Body)</span>
              <span className="font-semibold">{runtime.textSizes.body}px</span>
            </div>
            <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
              <span className="text-slate-500">顶栏标题 (Nav Title)</span>
              <span className="font-semibold">{runtime.textSizes.navTitle}px</span>
            </div>
            <div className="flex justify-between py-1">
              <span className="text-slate-500">减少动态效果 (Reduce Motion)</span>
              <span className="font-semibold">{runtime.reduceMotion ? '已启用' : '未启用'}</span>
            </div>
          </div>
        </MobileListGroup>
      </div>
    </div>
  );
};

// ==========================================
// 57. 通知与免打扰 (Notifications & DND)
// ==========================================
export const MobileNotificationSettingsScreen: React.FC<SettingsSharedProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { goBack, push } = useMobileNavigation();
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; msg: string } | null>(null);

  const notifications = settings.notifications || {
    email: true,
    push: true,
    desktop: true,
    wechat: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    weekendMute: true,
  };

  const updateNotify = (field: keyof typeof notifications, value: boolean | string) => {
    onUpdateSettings({
      notifications: {
        ...notifications,
        [field]: value,
      },
    });
  };

  const handleTestSend = async (channel: 'email' | 'webpush') => {
    setTesting(true);
    setTestResult(null);
    try {
      const res = await sendNotifyTest(channel);
      if (res.ok) {
        setTestResult({ ok: true, msg: `测试通知已成功推送到 ${channel} 渠道` });
      } else {
        setTestResult({ ok: false, msg: res.error || '测试发送失败，请检查服务配置' });
      }
    } catch (err) {
      setTestResult({ ok: false, msg: err instanceof Error ? err.message : '发送异常' });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="通知与免打扰" onBack={goBack} />

      <div className="px-4 py-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        {testResult && (
          <div
            className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs ${
              testResult.ok
                ? 'bg-emerald-50 dark:bg-emerald-950/50 border-emerald-200 dark:border-emerald-800 text-emerald-700 dark:text-emerald-300'
                : 'bg-red-50 dark:bg-red-950/50 border-red-200 dark:border-red-800 text-red-600 dark:text-red-400'
            }`}
          >
            <AppIcon name={testResult.ok ? 'check-circle' : 'alert'} size={16} />
            <span>{testResult.msg}</span>
          </div>
        )}

        {/* 接收渠道开关 */}
        <MobileListGroup title="接收渠道" footer="移动端通知需要系统通知权限；可在系统设置中随时调整。">
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <div className="flex items-center justify-between p-4">
              <div className="flex flex-col">
                <span className="text-base text-slate-900 dark:text-slate-100">邮件通知</span>
                <span className="text-xs text-slate-500">重要任务逾期、项目里程碑与审计报告</span>
              </div>
              <input
                type="checkbox"
                checked={notifications.email}
                onChange={(e) => updateNotify('email', e.target.checked)}
                className="w-5 h-5 accent-[#0058BE] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex flex-col">
                <span className="text-base text-slate-900 dark:text-slate-100">系统推送 (Push)</span>
                <span className="text-xs text-slate-500">任务分配、即时会话提及与紧急提醒</span>
              </div>
              <input
                type="checkbox"
                checked={notifications.push}
                onChange={(e) => updateNotify('push', e.target.checked)}
                className="w-5 h-5 accent-[#0058BE] cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between p-4">
              <div className="flex flex-col">
                <span className="text-base text-slate-900 dark:text-slate-100">微信服务号提醒</span>
                <span className="text-xs text-slate-500">关注企业服务号并完成账号绑定后推送</span>
              </div>
              <input
                type="checkbox"
                checked={notifications.wechat}
                onChange={(e) => updateNotify('wechat', e.target.checked)}
                className="w-5 h-5 accent-[#0058BE] cursor-pointer"
              />
            </div>
          </div>
        </MobileListGroup>

        {/* 免打扰时段 */}
        <MobileListGroup title="免打扰模式 (DND)" footer="在免打扰时段内，除加急严重任务外，将静默接收消息并不发出声音提示。">
          <div className="p-4 flex flex-col gap-4">
            <div className="grid grid-cols-2 gap-3">
              <MobileField label="开始静音时间">
                <MobileInput
                  type="time"
                  value={notifications.quietHoursStart}
                  onChange={(e) => updateNotify('quietHoursStart', e.target.value)}
                />
              </MobileField>
              <MobileField label="恢复提醒时间">
                <MobileInput
                  type="time"
                  value={notifications.quietHoursEnd}
                  onChange={(e) => updateNotify('quietHoursEnd', e.target.value)}
                />
              </MobileField>
            </div>

            <div className="flex items-center justify-between pt-1">
              <div className="flex flex-col">
                <span className="text-sm font-medium text-slate-800 dark:text-slate-200">周末全天静音</span>
                <span className="text-xs text-slate-400">周六与周日不主动发送工作类推送</span>
              </div>
              <input
                type="checkbox"
                checked={notifications.weekendMute}
                onChange={(e) => updateNotify('weekendMute', e.target.checked)}
                className="w-5 h-5 accent-[#0058BE] cursor-pointer"
              />
            </div>
          </div>
        </MobileListGroup>

        {/* 快速通道测试与记录直达 */}
        <div className="flex gap-2">
          <button
            type="button"
            disabled={testing}
            onClick={() => handleTestSend('email')}
            className="flex-1 min-h-[44px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 active:bg-slate-100 cursor-pointer shadow-xs"
          >
            <AppIcon name="mail" size={14} />
            <span>测试邮件发送</span>
          </button>
          <button
            type="button"
            disabled={testing}
            onClick={() => handleTestSend('webpush')}
            className="flex-1 min-h-[44px] rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs font-semibold text-slate-800 dark:text-slate-200 flex items-center justify-center gap-1.5 active:bg-slate-100 cursor-pointer shadow-xs"
          >
            <AppIcon name="bell" size={14} />
            <span>测试推送发送</span>
          </button>
        </div>

        <button
          type="button"
          onClick={() => push({ screen: 'me-notify-logs', title: '通知发送记录' })}
          className="w-full min-h-[44px] rounded-xl bg-blue-50 dark:bg-blue-950/40 text-[#0058BE] dark:text-blue-300 text-xs font-semibold flex items-center justify-center gap-1.5 cursor-pointer hover:bg-blue-100 transition-colors"
        >
          <AppIcon name="clock" size={14} />
          <span>前往查看历史通知发送记录 (最近 50 条)</span>
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 58. 任务默认值 (Task Defaults)
// ==========================================
export const MobileTaskDefaultsScreen: React.FC<SettingsSharedProps> = ({
  settings,
  onUpdateSettings,
}) => {
  const { goBack } = useMobileNavigation();
  const [priority, setPriority] = useState<Priority>(settings.taskDefaults?.priority || 'Medium');
  const [savedMsg, setSavedMsg] = useState(false);

  const handleSave = () => {
    onUpdateSettings({
      taskDefaults: {
        ...settings.taskDefaults,
        priority,
      },
    });
    setSavedMsg(true);
    setTimeout(() => {
      setSavedMsg(false);
      goBack();
    }, 1200);
  };

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="任务默认值" onBack={goBack} />

      <div className="px-4 py-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        {savedMsg && (
          <div className="p-3.5 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 rounded-xl flex items-center gap-2 text-emerald-600 dark:text-emerald-400 text-xs">
            <AppIcon name="check-circle" size={16} />
            <span>任务默认值已保存并应用</span>
          </div>
        )}

        <MobileListGroup title="默认优先级" footer="快速创建任务或从 AI 聊天提取时默认赋给的新任务优先级。">
          {(['High', 'Medium', 'Low'] as Priority[]).map((p) => (
            <MobileListItem
              key={p}
              title={p === 'High' ? '高优先级' : p === 'Medium' ? '中优先级' : '低优先级'}
              selected={priority === p}
              trailing={priority === p ? <AppIcon name="check" size={18} className="text-[#0058BE]" /> : null}
              onClick={() => setPriority(p)}
            />
          ))}
        </MobileListGroup>

        <button
          type="button"
          onClick={handleSave}
          className="w-full min-h-[48px] rounded-xl bg-[#0058BE] text-white font-medium text-base hover:bg-blue-700 active:bg-blue-800 transition-colors shadow-sm cursor-pointer"
        >
          保存任务默认配置
        </button>
      </div>
    </div>
  );
};

// ==========================================
// 62. 套餐、隐私与帮助 (Billing, Privacy & Help)
// ==========================================
export const MobileBillingHelpScreen: React.FC<SettingsSharedProps> = () => {
  const { goBack } = useMobileNavigation();
  const [billing, setBilling] = useState<{ plan_code?: string; status: string; managed_by: string } | null>(null);
  const [privacy, setPrivacy] = useState<{ retention: string; export_endpoint: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [shortcutOpen, setShortcutOpen] = useState(false);

  useEffect(() => {
    Promise.all([getBillingSummary().catch(() => null), getPrivacySummary().catch(() => null)])
      .then(([b, p]) => {
        setBilling(b);
        setPrivacy(p);
      })
      .finally(() => setLoading(false));
  }, []);

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="套餐、隐私与帮助" onBack={goBack} />

      <div className="px-4 py-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        {loading ? (
          <MobileLoadingState message="正在加载套餐与合规信息…" />
        ) : (
          <>
            {/* 套餐信息卡片 */}
            <div className="p-5 bg-gradient-to-br from-blue-900 to-[#0058BE] text-white rounded-2xl shadow-sm flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-xs uppercase tracking-wider text-blue-200 font-semibold">
                  当前授权状态
                </span>
                <span className="text-[11px] px-2 py-0.5 rounded-full bg-white/20 text-white font-medium">
                  {billing?.status === 'active' ? '正常履约' : '基础免费'}
                </span>
              </div>
              <div>
                <h3 className="text-xl font-bold">
                  {billing?.plan_code || '企业专业版 · 多端协同'}
                </h3>
                <p className="text-xs text-blue-100 mt-1">
                  服务管理方: {billing?.managed_by || '工作梯协作平台系统运维'}
                </p>
              </div>
            </div>

            {/* 隐私与数据安全 */}
            <MobileListGroup title="数据安全与隐私合规" footer="个人数据严格遵照 GDPR 与本地合规要求，敏感凭据使用 AES-256 加密。">
              <div className="p-4 flex flex-col gap-3 text-xs">
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">审计数据保留周期</span>
                  <span className="font-semibold">{privacy?.retention || '180 天 (按企业合规归档)'}</span>
                </div>
                <div className="flex justify-between py-1 border-b border-slate-100 dark:border-slate-800">
                  <span className="text-slate-500">个人数据导出通道</span>
                  <span className="font-semibold text-[#0058BE] underline">
                    {privacy?.export_endpoint || '/api/v1/users/me/export'}
                  </span>
                </div>
              </div>
            </MobileListGroup>

            {/* 帮助中心与快捷键 */}
            <MobileListGroup title="系统指引与快捷说明">
              <MobileListItem
                leading={<AppIcon name="help" size={18} className="text-indigo-500" />}
                title="桌面键盘快捷键清单"
                subtitle="查看 Web/桌面客户端全套快捷键"
                onClick={() => setShortcutOpen(!shortcutOpen)}
              />
              {shortcutOpen && (
                <div className="px-4 py-3 bg-slate-50 dark:bg-slate-800/50 text-xs flex flex-col gap-2.5">
                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-300">全局智能搜索</span>
                    <kbd className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border text-[11px] font-mono">⌘ + K / Ctrl + K</kbd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-300">快速新建任务</span>
                    <kbd className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border text-[11px] font-mono">C / N</kbd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-300">切换工作台与责任链</span>
                    <kbd className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border text-[11px] font-mono">1 ~ 5</kbd>
                  </div>
                  <div className="flex justify-between py-1 border-b border-slate-200 dark:border-slate-700">
                    <span className="font-medium text-slate-700 dark:text-slate-300">关闭弹层 / 返回</span>
                    <kbd className="px-2 py-0.5 rounded bg-white dark:bg-slate-900 border text-[11px] font-mono">Esc</kbd>
                  </div>
                </div>
              )}

              <MobileListItem
                leading={<AppIcon name="reports" size={18} className="text-emerald-500" />}
                title="统计报表计算口径"
                subtitle="已完成任务比率、周期负荷与责任链节点分布说明"
              />
              <MobileListItem
                leading={<AppIcon name="axis" size={18} className="text-[#0058BE]" />}
                title="人轴责任链协同规则"
                subtitle="人挂到人上、事项归集、逐级 AI 报告与材料证明"
                showDivider={false}
              />
            </MobileListGroup>

            {/* 应用版本与诊断开关 */}
            <div className="p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 text-center flex flex-col gap-1 text-xs text-slate-400">
              <span className="font-semibold text-slate-600 dark:text-slate-300">
                工作梯 APP V2.0.0 (Build 20261019)
              </span>
            </div>
          </>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 63. 通知发送记录 (Notification Logs)
// ==========================================
export const MobileNotificationLogsScreen: React.FC<SettingsSharedProps> = () => {
  const { goBack } = useMobileNavigation();
  const [items, setItems] = useState<NotifyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchRecords = async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      const res = await listNotifyRecords(50);
      setItems(res.items || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '获取通知记录失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRecords();
  }, []);

  const filteredItems = items.filter((item) => {
    if (filter === 'success') return item.status === 'success' || item.status === 'delivered';
    if (filter === 'failed') return item.status === 'failed' || Boolean(item.error);
    return true;
  });

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar
        title="通知发送记录"
        onBack={goBack}
        rightAction={
          <button
            type="button"
            onClick={fetchRecords}
            className="p-2 text-slate-600 dark:text-slate-300 active:opacity-60 cursor-pointer"
            aria-label="刷新"
          >
            <AppIcon name="refresh" size={18} />
          </button>
        }
      />

      <div className="px-4 py-3 max-w-xl mx-auto w-full flex flex-col gap-3">
        {/* 过滤 Tabs */}
        <div className="flex p-1 bg-slate-200/80 dark:bg-slate-800 rounded-xl text-xs">
          <button
            type="button"
            onClick={() => setFilter('all')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              filter === 'all'
                ? 'bg-white dark:bg-slate-900 text-slate-900 dark:text-white shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            全部 ({items.length})
          </button>
          <button
            type="button"
            onClick={() => setFilter('success')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              filter === 'success'
                ? 'bg-white dark:bg-slate-900 text-emerald-600 dark:text-emerald-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            成功
          </button>
          <button
            type="button"
            onClick={() => setFilter('failed')}
            className={`flex-1 py-1.5 rounded-lg font-medium transition-all cursor-pointer ${
              filter === 'failed'
                ? 'bg-white dark:bg-slate-900 text-red-600 dark:text-red-400 shadow-xs'
                : 'text-slate-600 dark:text-slate-400'
            }`}
          >
            失败
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-800 rounded-xl text-red-600 text-xs">
            {errorMsg}
          </div>
        )}

        {loading ? (
          <MobileLoadingState message="加载发送日志中…" />
        ) : filteredItems.length === 0 ? (
          <MobileEmptyState
            iconName="inbox"
            title="暂无通知记录"
            description="当前筛选条件下没有产生通知发送日志"
          />
        ) : (
          <div className="flex flex-col gap-2.5">
            {filteredItems.map((record, idx) => {
              const isFailed = record.status === 'failed' || Boolean(record.error);
              return (
                <div
                  key={`${record.created_at}-${idx}`}
                  className="p-3.5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-800 shadow-xs flex flex-col gap-1.5"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                        {record.channel}
                      </span>
                      <span
                        className={`text-[11px] font-semibold px-2 py-0.5 rounded-md ${
                          isFailed
                            ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        }`}
                      >
                        {isFailed ? '发送失败' : '送达成功'}
                      </span>
                    </div>
                    <span className="text-[11px] text-slate-400 dark:text-slate-500 font-mono">
                      {record.created_at ? new Date(record.created_at).toLocaleTimeString() : ''}
                    </span>
                  </div>

                  {record.task_title && (
                    <p className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                      事项: {record.task_title}
                    </p>
                  )}

                  {isFailed && record.error && (
                    <p className="text-[11px] text-red-500 dark:text-red-400 font-normal leading-relaxed break-words bg-red-50/50 dark:bg-red-950/20 p-2 rounded-lg">
                      错误详情: {record.error}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 90. 第三方服务绑定 (Third Party Services)
// ==========================================
export const MobileThirdPartyBindingsScreen: React.FC<SettingsSharedProps> = () => {
  const { goBack } = useMobileNavigation();
  const [bindInfo, setBindInfo] = useState({
    wechat: false,
    wecom: false,
    dingtalk: false,
    feishu: false,
    github: false,
  });
  const [bindNotice, setBindNotice] = useState<string | null>(null);

  return (
    <div className="flex-1 flex flex-col w-full h-full overflow-y-auto pb-16 bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <MobileTopBar title="第三方服务绑定" onBack={goBack} />

      <div className="px-4 py-4 max-w-xl mx-auto w-full flex flex-col gap-4">
        <MobileListGroup
          title="移动与协同渠道"
          footer={bindNotice || '绑定微信服务号可接收微信模板消息提醒；企业微信与飞书需通过企业管理中心统一接入。'}
        >
          <MobileListItem
            leading={<AppIcon name="messages" size={18} className="text-emerald-500" />}
            title="微信公众服务号"
            subtitle={bindInfo.wechat ? '已绑定专属微信 OpenID' : '未绑定 (支持任务提醒通知)'}
            trailing={
              <button
                type="button"
                onClick={() => setBindNotice('微信绑定需通过微信移动端打开专属授权回调链接，不支持在当前页面内完成。')}
                className="text-xs font-medium text-[#0058BE] px-3 py-1.5 rounded-lg bg-blue-50 dark:bg-blue-950 cursor-pointer"
              >
                {bindInfo.wechat ? '解绑' : '前往绑定'}
              </button>
            }
          />
          <MobileListItem
            leading={<AppIcon name="work" size={18} className="text-blue-600" />}
            title="企业微信 (WeCom)"
            subtitle={bindInfo.wecom ? '已关联企业组织架构' : '未关联企业微信工作台'}
            showDivider={false}
          />
        </MobileListGroup>

        <MobileListGroup title="办公生态账号">
          <MobileListItem
            leading={<AppIcon name="send" size={18} className="text-blue-500" />}
            title="钉钉 (DingTalk)"
            subtitle="协同考勤与群机器人通知"
          />
          <MobileListItem
            leading={<AppIcon name="share" size={18} className="text-cyan-500" />}
            title="飞书 (Feishu)"
            subtitle="飞书消息卡片与日历同步"
          />
          <MobileListItem
            leading={<AppIcon name="shield" size={18} className="text-slate-800 dark:text-slate-200" />}
            title="GitHub / GitLab"
            subtitle="代码提交证据链与 Webhook 关联"
            showDivider={false}
          />
        </MobileListGroup>
      </div>
    </div>
  );
};
