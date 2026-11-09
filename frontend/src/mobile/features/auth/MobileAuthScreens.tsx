import React, { useEffect, useState } from 'react';
import {
  detectChannel,
  loginPassword,
  loginWithCode,
  register,
  sendLoginCode,
  sendRegisterCode,
  sendBindCode,
  confirmBindCode,
  type VerificationStatus,
  type RegistrationConfig,
  type AuthTokenPayload,
  DEFAULT_REGISTRATION_CONFIG,
  getRegistrationConfig,
} from '../../../api/auth';
import { ApiError } from '../../../api/client';
import { BRAND, getBrandName, getBrandTagline } from '../../../constants/brand';
import { clearInviteToken, readInviteToken } from '../../../utils/invite';
import { AppIcon } from '../../ui/AppIcon';
import { MobileField, MobileInput } from '../../ui/MobileField';
import { Language } from '../../../types';
import { SsoLoginButtons } from '../../../components/SsoLoginButtons';

export function useCountdown() {
  const [countdown, setCountdown] = useState(0);
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = window.setTimeout(() => setCountdown((c) => c - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [countdown]);
  return { countdown, start: (sec = 60) => setCountdown(sec) };
}

export type AuthMode = 'login' | 'register' | 'verify-email' | 'verify-phone' | 'forgot-help';

export interface MobileAuthScreenProps {
  initialMode?: AuthMode;
  initialLoginKind?: 'password' | 'code';
  lang?: Language;
  onLoggedIn?: (payload?: AuthTokenPayload) => void;
  onVerified?: (status?: VerificationStatus) => void;
  onCancel?: () => void;
  /** 承接外部动作传递的预设手机或邮箱 */
  initialTarget?: string;
  /** 验证成功后的原操作草稿提示 */
  preservedContextHint?: string;
  registrationConfig?: RegistrationConfig;
}

export const MobileAuthScreens: React.FC<MobileAuthScreenProps> = ({
  initialMode = 'login',
  initialLoginKind = 'password',
  lang = 'zh',
  onLoggedIn,
  onVerified,
  onCancel,
  initialTarget = '',
  preservedContextHint,
  registrationConfig,
}) => {
  const [config, setConfig] = useState<RegistrationConfig>(
    registrationConfig || DEFAULT_REGISTRATION_CONFIG,
  );

  useEffect(() => {
    if (registrationConfig) {
      setConfig(registrationConfig);
      return;
    }
    let cancelled = false;
    void getRegistrationConfig().then((cfg) => {
      if (!cancelled) setConfig(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, [registrationConfig]);

  const inviteToken = readInviteToken();
  const isInviteOnly = config.mode === 'invite_only';
  const canRegister = !isInviteOnly || Boolean(inviteToken);

  const [mode, setMode] = useState<AuthMode>(() => {
    if (inviteToken) return 'register';
    return initialMode;
  });

  useEffect(() => {
    if (isInviteOnly && !inviteToken && mode === 'register') {
      setMode('login');
    } else if (inviteToken && mode !== 'register') {
      setMode('register');
    }
  }, [isInviteOnly, inviteToken]);

  const [loginKind, setLoginKind] = useState<'password' | 'code'>(initialLoginKind);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hint, setHint] = useState<string | null>(null);

  // 表单状态保留（即使提交失败，严禁清空用户输入）
  // 密码登录
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // 验证码登录 (01 & 79)
  const [loginTarget, setLoginTarget] = useState(initialTarget);
  const [loginCode, setLoginCode] = useState('');
  const loginCd = useCountdown();

  // 注册 (02)
  const [regUsername, setRegUsername] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regEmailCode, setRegEmailCode] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPhoneCode, setRegPhoneCode] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirm, setRegConfirm] = useState('');
  const [showRegPassword, setShowRegPassword] = useState(false);
  const emailCd = useCountdown();
  const phoneCd = useCountdown();

  // 独立邮箱验证 (03)
  const [verifyEmailTarget, setVerifyEmailTarget] = useState(initialTarget);
  const [verifyEmailCode, setVerifyEmailCode] = useState('');
  const verifyEmailCd = useCountdown();

  // 独立手机验证 (04)
  const [verifyPhoneTarget, setVerifyPhoneTarget] = useState(initialTarget);
  const [verifyPhoneCode, setVerifyPhoneCode] = useState('');
  const verifyPhoneCd = useCountdown();

  const safeLang: Language = lang === 'en' ? 'en' : 'zh';
  const brandName = getBrandName(safeLang);
  const brandTagline = getBrandTagline(safeLang);

  const clearMessages = () => {
    setError(null);
    setHint(null);
  };

  // 01 账号密码登录
  const handlePasswordLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!username.trim() || !password) {
      setError(lang === 'zh' ? '请输入账号和密码' : 'Please enter username and password');
      return;
    }
    setBusy(true);
    clearMessages();
    try {
      await loginPassword(username.trim(), password);
      onLoggedIn?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : lang === 'zh' ? '登录失败，请检查账号密码' : 'Login failed');
    } finally {
      setBusy(false);
    }
  };

  // 79 验证码登录
  const handleCodeLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const ch = detectChannel(loginTarget);
    if (!ch) {
      setError(lang === 'zh' ? '请输入有效的手机号或工作邮箱' : 'Enter valid phone or email');
      return;
    }
    if (!loginCode.trim()) {
      setError(lang === 'zh' ? '请输入验证码' : 'Enter verification code');
      return;
    }
    setBusy(true);
    clearMessages();
    try {
      await loginWithCode(ch, loginTarget.trim(), loginCode.trim());
      onLoggedIn?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : lang === 'zh' ? '验证码登录失败' : 'Code login failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSendLoginCode = async () => {
    clearMessages();
    const ch = detectChannel(loginTarget);
    if (!ch) {
      setError(lang === 'zh' ? '请输入有效的手机号或邮箱后再获取验证码' : 'Enter valid phone or email first');
      return;
    }
    setBusy(true);
    try {
      const res = await sendLoginCode(ch, loginTarget.trim());
      loginCd.start(res.cooldown_seconds || 60);
      setHint(
        res.debug_code
          ? `${lang === 'zh' ? '验证码已发送' : 'Code sent'}（调试码: ${res.debug_code}）`
          : lang === 'zh'
            ? '验证码已发送至您的手机/邮箱'
            : 'Verification code sent',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : lang === 'zh' ? '发送验证码失败' : 'Failed to send code');
    } finally {
      setBusy(false);
    }
  };

  // 02 注册账号
  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!regUsername.trim() || !regPassword) {
      setError(lang === 'zh' ? '请输入用户名和密码' : 'Please enter username and password');
      return;
    }
    if (regPassword !== regConfirm) {
      setError(lang === 'zh' ? '两次输入的密码不一致' : 'Passwords do not match');
      return;
    }
    setBusy(true);
    clearMessages();
    try {
      const payload = await register({
        username: regUsername.trim(),
        password: regPassword,
        email: regEmail.trim() || undefined,
        email_code: regEmailCode.trim() || undefined,
        phone: regPhone.trim() || undefined,
        phone_code: regPhoneCode.trim() || undefined,
        invite_token: inviteToken || undefined,
      });
      if (payload?.project_id) {
        clearInviteToken();
      }
      setHint(lang === 'zh' ? '注册成功，正在进入工作台…' : 'Registration successful');
      onLoggedIn?.(payload);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : lang === 'zh' ? '注册失败' : 'Registration failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSendRegisterCode = async (channel: 'email' | 'sms') => {
    clearMessages();
    const target = channel === 'email' ? regEmail.trim() : regPhone.trim();
    if (!target) {
      setError(
        channel === 'email'
          ? lang === 'zh'
            ? '请输入工作邮箱'
            : 'Enter email'
          : lang === 'zh'
            ? '请输入手机号'
            : 'Enter phone',
      );
      return;
    }
    setBusy(true);
    try {
      const res = await sendRegisterCode(channel, target, inviteToken || undefined);
      if (channel === 'email') emailCd.start(res.cooldown_seconds || 60);
      else phoneCd.start(res.cooldown_seconds || 60);
      setHint(
        res.debug_code
          ? `${lang === 'zh' ? '验证码已发送' : 'Code sent'}（调试码: ${res.debug_code}）`
          : lang === 'zh'
            ? '验证码已发送'
            : 'Code sent',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : lang === 'zh' ? '发送验证码失败' : 'Failed to send code');
    } finally {
      setBusy(false);
    }
  };

  // 03 验证工作邮箱
  const handleVerifyEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyEmailTarget.trim() || !verifyEmailCode.trim()) {
      setError(lang === 'zh' ? '请输入邮箱与验证码' : 'Enter email and code');
      return;
    }
    setBusy(true);
    clearMessages();
    try {
      const st = await confirmBindCode('email', verifyEmailTarget.trim(), verifyEmailCode.trim());
      setHint(lang === 'zh' ? '邮箱验证成功！' : 'Email verified!');
      onVerified?.(st);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : lang === 'zh' ? '邮箱验证失败' : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSendEmailBindCode = async () => {
    clearMessages();
    if (!verifyEmailTarget.trim() || !verifyEmailTarget.includes('@')) {
      setError(lang === 'zh' ? '请输入有效的邮箱地址' : 'Enter a valid email');
      return;
    }
    setBusy(true);
    try {
      const res = await sendBindCode('email', verifyEmailTarget.trim());
      verifyEmailCd.start(res.cooldown_seconds || 60);
      setHint(
        res.debug_code
          ? `${lang === 'zh' ? '验证码已发送' : 'Code sent'}（调试码: ${res.debug_code}）`
          : lang === 'zh'
            ? '验证码已发送至该邮箱'
            : 'Verification code sent',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : lang === 'zh' ? '发送失败' : 'Failed to send');
    } finally {
      setBusy(false);
    }
  };

  // 04 验证手机号
  const handleVerifyPhone = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!verifyPhoneTarget.trim() || !verifyPhoneCode.trim()) {
      setError(lang === 'zh' ? '请输入手机号与验证码' : 'Enter phone and code');
      return;
    }
    setBusy(true);
    clearMessages();
    try {
      const st = await confirmBindCode('sms', verifyPhoneTarget.trim(), verifyPhoneCode.trim());
      setHint(lang === 'zh' ? '手机号验证成功！' : 'Phone verified!');
      onVerified?.(st);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : lang === 'zh' ? '手机号验证失败' : 'Verification failed');
    } finally {
      setBusy(false);
    }
  };

  const handleSendPhoneBindCode = async () => {
    clearMessages();
    const cleaned = verifyPhoneTarget.trim().replace(/[\s-]/g, '');
    if (!cleaned || cleaned.length < 7) {
      setError(lang === 'zh' ? '请输入有效的手机号' : 'Enter a valid phone number');
      return;
    }
    setBusy(true);
    try {
      const res = await sendBindCode('sms', verifyPhoneTarget.trim());
      verifyPhoneCd.start(res.cooldown_seconds || 60);
      setHint(
        res.debug_code
          ? `${lang === 'zh' ? '验证码已发送' : 'Code sent'}（调试码: ${res.debug_code}）`
          : lang === 'zh'
            ? '短信验证码已发送'
            : 'SMS code sent',
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : lang === 'zh' ? '发送失败' : 'Failed to send');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="min-h-[100dvh] w-full flex flex-col bg-white dark:bg-black text-slate-900 dark:text-slate-100 select-none">
      {/* 顶部安全栏与关闭按钮 */}
      <header className="h-14 px-4 flex items-center justify-between border-b border-slate-100 dark:border-slate-800">
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-600 dark:text-slate-300"
            aria-label="返回或关闭"
          >
            <AppIcon name="back" size={22} />
          </button>
        ) : (
          <div className="w-10" />
        )}
        <span className="text-sm font-semibold tracking-wide text-slate-500 dark:text-slate-400">
          {brandName}
        </span>
        <div className="w-10" />
      </header>

      {/* 主体滚动区 */}
      <main className="flex-1 overflow-y-auto px-6 py-6 flex flex-col max-w-md mx-auto w-full">
        {/* 品牌标识 */}
        <div className="text-center mb-6">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-[#0058BE]/10 text-[#0058BE] mb-3 shadow-xs">
            <AppIcon name="work" size={30} />
          </div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
            {brandName}
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {brandTagline}
          </p>
        </div>

        {/* 消息与提示 Banner */}
        {error && (
          <div
            role="alert"
            className="mb-4 p-3.5 rounded-xl bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900/60 text-red-600 dark:text-red-400 text-sm flex items-start gap-2.5 animate-in fade-in duration-200"
          >
            <AppIcon name="alert" size={18} className="shrink-0 mt-0.5 text-red-500" />
            <span className="flex-1 leading-snug">{error}</span>
          </div>
        )}

        {hint && (
          <div
            role="status"
            className="mb-4 p-3.5 rounded-xl bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900/60 text-[#0058BE] dark:text-blue-300 text-sm flex items-start gap-2.5 animate-in fade-in duration-200"
          >
            <AppIcon name="info" size={18} className="shrink-0 mt-0.5 text-[#0058BE]" />
            <span className="flex-1 leading-snug">{hint}</span>
          </div>
        )}

        {preservedContextHint && (
          <div className="mb-4 p-3 rounded-xl bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 text-amber-800 dark:text-amber-300 text-xs flex items-center gap-2">
            <AppIcon name="warning" size={16} />
            <span>{preservedContextHint}</span>
          </div>
        )}

        {/* ---------------- 模式 01 / 79: 登录 ---------------- */}
        {mode === 'login' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
              欢迎回来
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              登录后继续管理你的项目与任务
            </p>

            <SsoLoginButtons onLoggedIn={onLoggedIn} />
            {/* 登录方式切换 Tab: 账号登录 vs 验证码登录 */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 mb-5">
              <button
                type="button"
                onClick={() => {
                  setLoginKind('password');
                  clearMessages();
                }}
                className={`flex-1 min-h-[44px] text-sm font-semibold transition-colors border-b-2 ${
                  loginKind === 'password'
                    ? 'border-[#0058BE] text-[#0058BE]'
                    : 'border-transparent text-slate-500 dark:text-slate-400'
                }`}
              >
                账号密码登录
              </button>
              <button
                type="button"
                onClick={() => {
                  setLoginKind('code');
                  clearMessages();
                }}
                className={`flex-1 min-h-[44px] text-sm font-semibold transition-colors border-b-2 ${
                  loginKind === 'code'
                    ? 'border-[#0058BE] text-[#0058BE]'
                    : 'border-transparent text-slate-500 dark:text-slate-400'
                }`}
              >
                验证码免密登录
              </button>
            </div>

            {/* 账号密码表单 (01) */}
            {loginKind === 'password' && (
              <form onSubmit={handlePasswordLogin} className="flex flex-col gap-4">
                <MobileField label="用户名 / 邮箱" required>
                  <MobileInput
                    type="text"
                    placeholder="请输入用户名或登录邮箱"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoCapitalize="none"
                    autoCorrect="off"
                    clearable
                    onClear={() => setUsername('')}
                    leading={<AppIcon name="user" size={18} />}
                  />
                </MobileField>

                <MobileField label="登录密码" required>
                  <MobileInput
                    type={showPassword ? 'text' : 'password'}
                    placeholder="请输入登录密码"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    leading={<AppIcon name="lock" size={18} />}
                    trailing={
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="p-1 text-slate-400 hover:text-slate-600"
                        aria-label={showPassword ? '隐藏密码' : '显示密码'}
                      >
                        <AppIcon name={showPassword ? 'eye-off' : 'eye'} size={18} />
                      </button>
                    }
                  />
                </MobileField>

                <div className="flex items-center justify-between text-xs text-slate-500 pt-1">
                  <span>记住此设备状态</span>
                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setMode('forgot-help');
                    }}
                    className="min-h-[44px] flex items-center text-[#0058BE] hover:underline"
                  >
                    找回密码帮助
                  </button>
                </div>

                <button
                  type="submit"
                  disabled={busy || !username.trim() || !password}
                  className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-base shadow-sm active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 mt-2"
                >
                  {busy ? '正在登录…' : '登 录'}
                </button>
              </form>
            )}

            {/* 验证码表单 (79) */}
            {loginKind === 'code' && (
              <form onSubmit={handleCodeLogin} className="flex flex-col gap-4">
                <MobileField label="手机号 / 工作邮箱" required helperText="自动识别国内手机号或有效工作邮箱">
                  <MobileInput
                    type="text"
                    placeholder="例如 13800000000 或 work@corp.com"
                    value={loginTarget}
                    onChange={(e) => setLoginTarget(e.target.value)}
                    autoCapitalize="none"
                    clearable
                    onClear={() => setLoginTarget('')}
                    leading={<AppIcon name="mail" size={18} />}
                  />
                </MobileField>

                <MobileField label="动态验证码" required>
                  <div className="flex gap-2">
                    <MobileInput
                      type="text"
                      placeholder="6 位数字验证码"
                      value={loginCode}
                      onChange={(e) => setLoginCode(e.target.value)}
                      maxLength={8}
                      className="flex-1 font-mono tracking-wider"
                      leading={<AppIcon name="lock" size={18} />}
                    />
                    <button
                      type="button"
                      disabled={busy || loginCd.countdown > 0 || !loginTarget.trim()}
                      onClick={handleSendLoginCode}
                      className="min-h-[48px] px-3.5 rounded-xl border border-[#0058BE] text-[#0058BE] dark:border-blue-500 dark:text-blue-400 font-medium text-xs shrink-0 disabled:opacity-40 disabled:border-slate-300 disabled:text-slate-400 transition-colors"
                    >
                      {loginCd.countdown > 0 ? `${loginCd.countdown}s 重新获取` : '获取验证码'}
                    </button>
                  </div>
                </MobileField>

                <button
                  type="submit"
                  disabled={busy || !loginTarget.trim() || !loginCode.trim()}
                  className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-base shadow-sm active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 mt-3"
                >
                  {busy ? '验证中…' : '验证并登录'}
                </button>
              </form>
            )}

            <div className="mt-6 text-center text-xs text-slate-500 dark:text-slate-400" data-testid="mobile-register-entry">
              {canRegister ? (
                <>
                  还没有账号？{' '}
                  <button
                    type="button"
                    onClick={() => {
                      clearMessages();
                      setMode('register');
                    }}
                    className="min-h-[44px] text-[#0058BE] dark:text-blue-400 font-semibold inline-flex items-center hover:underline"
                  >
                    立即注册新账号
                  </button>
                </>
              ) : (
                <span>
                  {safeLang === 'zh'
                    ? '仅限受邀注册，请向管理员索取邀请链接'
                    : 'Registration is by invitation only. Please ask an administrator for an invite link.'}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ---------------- 模式 02: 注册 ---------------- */}
        {mode === 'register' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-1">
              注册新账号
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400 mb-5">
              创建账号开启项目敏捷协同与智能汇报
            </p>

            <form onSubmit={handleRegister} className="flex flex-col gap-3.5">
              <MobileField label="用户名" required helperText="字母、数字或下划线">
                <MobileInput
                  type="text"
                  placeholder="请输入用户名"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  autoCapitalize="none"
                  leading={<AppIcon name="user" size={18} />}
                />
              </MobileField>

              <MobileField label="工作邮箱" helperText="推荐使用企业邮箱接收汇报">
                <div className="flex gap-2">
                  <MobileInput
                    type="email"
                    placeholder="name@company.com"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    autoCapitalize="none"
                    className="flex-1"
                    leading={<AppIcon name="mail" size={18} />}
                  />
                  <button
                    type="button"
                    disabled={busy || emailCd.countdown > 0 || !regEmail.trim()}
                    onClick={() => handleSendRegisterCode('email')}
                    className="min-h-[48px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 shrink-0 disabled:opacity-40"
                  >
                    {emailCd.countdown > 0 ? `${emailCd.countdown}s` : '发验证码'}
                  </button>
                </div>
              </MobileField>

              {regEmail && (
                <MobileField label="邮箱验证码">
                  <MobileInput
                    type="text"
                    placeholder="输入 6 位验证码"
                    value={regEmailCode}
                    onChange={(e) => setRegEmailCode(e.target.value)}
                    maxLength={8}
                    leading={<AppIcon name="lock" size={18} />}
                  />
                </MobileField>
              )}

              <MobileField label="手机号 (可选)">
                <div className="flex gap-2">
                  <MobileInput
                    type="tel"
                    placeholder="手机号"
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    className="flex-1"
                    leading={<AppIcon name="phone" size={18} />}
                  />
                  <button
                    type="button"
                    disabled={busy || phoneCd.countdown > 0 || !regPhone.trim()}
                    onClick={() => handleSendRegisterCode('sms')}
                    className="min-h-[48px] px-3 rounded-xl border border-slate-300 dark:border-slate-700 text-xs font-medium text-slate-700 dark:text-slate-300 shrink-0 disabled:opacity-40"
                  >
                    {phoneCd.countdown > 0 ? `${phoneCd.countdown}s` : '发验证码'}
                  </button>
                </div>
              </MobileField>

              {regPhone && (
                <MobileField label="短信验证码">
                  <MobileInput
                    type="text"
                    placeholder="输入短信验证码"
                    value={regPhoneCode}
                    onChange={(e) => setRegPhoneCode(e.target.value)}
                    maxLength={8}
                    leading={<AppIcon name="lock" size={18} />}
                  />
                </MobileField>
              )}

              <MobileField label="设置密码" required>
                <MobileInput
                  type={showRegPassword ? 'text' : 'password'}
                  placeholder="至少 6 位密码"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  leading={<AppIcon name="lock" size={18} />}
                  trailing={
                    <button
                      type="button"
                      onClick={() => setShowRegPassword(!showRegPassword)}
                      className="p-1 text-slate-400"
                    >
                      <AppIcon name={showRegPassword ? 'eye-off' : 'eye'} size={18} />
                    </button>
                  }
                />
              </MobileField>

              <MobileField label="确认密码" required>
                <MobileInput
                  type={showRegPassword ? 'text' : 'password'}
                  placeholder="再次输入密码"
                  value={regConfirm}
                  onChange={(e) => setRegConfirm(e.target.value)}
                  leading={<AppIcon name="lock" size={18} />}
                />
              </MobileField>

              <button
                type="submit"
                disabled={busy || !regUsername.trim() || !regPassword || regPassword !== regConfirm}
                className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-base shadow-sm active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 mt-4"
              >
                {busy ? '正在创建账号…' : '立即注册'}
              </button>
            </form>

            <div className="mt-5 text-center text-xs text-slate-500">
              已有账号？{' '}
              <button
                type="button"
                onClick={() => {
                  clearMessages();
                  setMode('login');
                }}
                className="min-h-[44px] text-[#0058BE] font-semibold inline-flex items-center hover:underline"
              >
                直接登录
              </button>
            </div>
          </div>
        )}

        {/* ---------------- 模式 03: 验证工作邮箱 ---------------- */}
        {mode === 'verify-email' && (
          <div className="flex-1 flex flex-col">
            <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-[#0058BE] mx-auto mb-3">
              <AppIcon name="mail" size={24} />
            </div>
            <h2 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-1">
              验证工作邮箱
            </h2>
            <p className="text-xs text-center text-slate-500 dark:text-slate-400 mb-6">
              根据安全策略，个人待办与汇报需先完成工作邮箱验证
            </p>

            <form onSubmit={handleVerifyEmail} className="flex flex-col gap-4">
              <MobileField label="工作邮箱地址" required>
                <MobileInput
                  type="email"
                  placeholder="请输入您的企业或工作邮箱"
                  value={verifyEmailTarget}
                  onChange={(e) => setVerifyEmailTarget(e.target.value)}
                  autoCapitalize="none"
                  leading={<AppIcon name="mail" size={18} />}
                />
              </MobileField>

              <MobileField label="邮箱验证码" required>
                <div className="flex gap-2">
                  <MobileInput
                    type="text"
                    placeholder="输入 6 位验证码"
                    value={verifyEmailCode}
                    onChange={(e) => setVerifyEmailCode(e.target.value)}
                    maxLength={8}
                    className="flex-1 font-mono tracking-wider"
                    leading={<AppIcon name="lock" size={18} />}
                  />
                  <button
                    type="button"
                    disabled={busy || verifyEmailCd.countdown > 0 || !verifyEmailTarget.trim()}
                    onClick={handleSendEmailBindCode}
                    className="min-h-[48px] px-3.5 rounded-xl border border-[#0058BE] text-[#0058BE] dark:border-blue-500 dark:text-blue-400 font-medium text-xs shrink-0 disabled:opacity-40 disabled:border-slate-300 disabled:text-slate-400"
                  >
                    {verifyEmailCd.countdown > 0 ? `${verifyEmailCd.countdown}s 重新获取` : '发送验证码'}
                  </button>
                </div>
              </MobileField>

              <button
                type="submit"
                disabled={busy || !verifyEmailTarget.trim() || !verifyEmailCode.trim()}
                className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-base shadow-sm active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 mt-3"
              >
                {busy ? '正在验证…' : '确认绑定邮箱'}
              </button>
            </form>
          </div>
        )}

        {/* ---------------- 模式 04: 验证手机号 ---------------- */}
        {mode === 'verify-phone' && (
          <div className="flex-1 flex flex-col">
            <div className="w-12 h-12 rounded-full bg-blue-50 dark:bg-blue-950 flex items-center justify-center text-[#0058BE] mx-auto mb-3">
              <AppIcon name="phone" size={24} />
            </div>
            <h2 className="text-xl font-bold text-center text-slate-900 dark:text-white mb-1">
              验证手机号
            </h2>
            <p className="text-xs text-center text-slate-500 dark:text-slate-400 mb-6">
              协作与项目邀请需要校验手机号，验证后将继续您先前的操作
            </p>

            <form onSubmit={handleVerifyPhone} className="flex flex-col gap-4">
              <MobileField label="手机号码" required>
                <MobileInput
                  type="tel"
                  placeholder="请输入手机号码"
                  value={verifyPhoneTarget}
                  onChange={(e) => setVerifyPhoneTarget(e.target.value)}
                  leading={<AppIcon name="phone" size={18} />}
                />
              </MobileField>

              <MobileField label="短信验证码" required>
                <div className="flex gap-2">
                  <MobileInput
                    type="text"
                    placeholder="输入短信验证码"
                    value={verifyPhoneCode}
                    onChange={(e) => setVerifyPhoneCode(e.target.value)}
                    maxLength={8}
                    className="flex-1 font-mono tracking-wider"
                    leading={<AppIcon name="lock" size={18} />}
                  />
                  <button
                    type="button"
                    disabled={busy || verifyPhoneCd.countdown > 0 || !verifyPhoneTarget.trim()}
                    onClick={handleSendPhoneBindCode}
                    className="min-h-[48px] px-3.5 rounded-xl border border-[#0058BE] text-[#0058BE] dark:border-blue-500 dark:text-blue-400 font-medium text-xs shrink-0 disabled:opacity-40 disabled:border-slate-300 disabled:text-slate-400"
                  >
                    {verifyPhoneCd.countdown > 0 ? `${verifyPhoneCd.countdown}s 重新获取` : '获取短信验证码'}
                  </button>
                </div>
              </MobileField>

              <button
                type="submit"
                disabled={busy || !verifyPhoneTarget.trim() || !verifyPhoneCode.trim()}
                className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-base shadow-sm active:opacity-90 disabled:opacity-40 transition-opacity flex items-center justify-center gap-2 mt-3"
              >
                {busy ? '正在验证…' : '确认验证手机号'}
              </button>
            </form>
          </div>
        )}

        {/* ---------------- 找回密码帮助 ---------------- */}
        {mode === 'forgot-help' && (
          <div className="flex-1 flex flex-col">
            <h2 className="text-xl font-bold text-slate-900 dark:text-white mb-2">
              找回密码说明
            </h2>
            <div className="p-4 rounded-2xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-600 dark:text-slate-300 space-y-3 leading-relaxed">
              <p className="font-semibold text-slate-800 dark:text-slate-200">
                当前系统支持以下重置或登录渠道：
              </p>
              <ul className="list-disc pl-4 space-y-2">
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">免密验证码登录：</strong>
                  如果您的账号已绑定手机号或工作邮箱，可直接通过「验证码登录」快捷进入工作区。
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">管理员密码重置：</strong>
                  企业或私有化部署环境下，系统管理员可在管理后台为您重置登录凭证。
                </li>
                <li>
                  <strong className="text-slate-800 dark:text-slate-200">安全提示：</strong>
                  平台不会通过不可信链接请求您提供明文密码。
                </li>
              </ul>
            </div>

            <button
              type="button"
              onClick={() => {
                setMode('login');
                setLoginKind('code');
              }}
              className="min-h-[48px] w-full rounded-xl bg-[#0058BE] text-white font-semibold text-sm shadow-sm active:opacity-90 transition-opacity flex items-center justify-center gap-2 mt-5"
            >
              使用验证码直接登录
            </button>

            <button
              type="button"
              onClick={() => setMode('login')}
              className="min-h-[48px] w-full rounded-xl border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-semibold text-sm mt-3"
            >
              返回账号密码登录
            </button>
          </div>
        )}

        {/* 底部法律与服务条款 */}
        <footer className="mt-auto pt-6 pb-2 text-center text-[11px] text-slate-400 dark:text-slate-500">
          继续操作即代表您已同意使用规范与工作数据保护声明
        </footer>
      </main>
    </div>
  );
};
