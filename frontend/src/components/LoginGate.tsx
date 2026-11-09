import React, { useEffect, useState } from 'react'
import {
  type AuthTokenPayload,
  DEFAULT_REGISTRATION_CONFIG,
  detectChannel,
  getRegistrationConfig,
  loginPassword,
  loginWithCode,
  type RegistrationConfig,
  register,
  resetPassword,
  sendLoginCode,
  sendResetCode,
  sendRegisterCode,
} from '../api/auth'
import { ApiError } from '../api/client'
import { getBrandName, getBrandTagline } from '../constants/brand'
import { clearInviteToken, readInviteToken } from '../utils/invite'

type Props = {
  onLoggedIn: (payload?: AuthTokenPayload) => void
  lang?: 'zh' | 'en'
  registrationConfig?: RegistrationConfig
}

type Mode = 'login' | 'register'
type LoginKind = 'password' | 'code' | 'reset'

function useCountdown() {
  const [countdown, setCountdown] = useState(0)
  useEffect(() => {
    if (countdown <= 0) return
    const t = window.setTimeout(() => setCountdown((c) => c - 1), 1000)
    return () => window.clearTimeout(t)
  }, [countdown])
  return { countdown, start: (sec = 60) => setCountdown(sec) }
}

const inputCls =
  'mt-1 w-full rounded-xl border border-outline-variant/50 px-3 py-2.5 bg-surface-container/40 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30'

export function LoginGate({ onLoggedIn, lang = 'zh', registrationConfig }: Props) {
  const zh = lang === 'zh'
  const [config, setConfig] = useState<RegistrationConfig>(
    registrationConfig || DEFAULT_REGISTRATION_CONFIG,
  )

  useEffect(() => {
    if (registrationConfig) {
      setConfig(registrationConfig)
      return
    }
    let cancelled = false
    void getRegistrationConfig().then((cfg) => {
      if (!cancelled) setConfig(cfg)
    })
    return () => {
      cancelled = true
    }
  }, [registrationConfig])

  const inviteToken = readInviteToken()
  const isInviteOnly = config.mode === 'invite_only'
  const canRegister = !isInviteOnly || Boolean(inviteToken)

  const [mode, setMode] = useState<Mode>(() => {
    if (inviteToken) return 'register'
    return 'login'
  })
  const [loginKind, setLoginKind] = useState<LoginKind>('password')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)

  useEffect(() => {
    if (isInviteOnly && !inviteToken && mode === 'register') {
      setMode('login')
    } else if (inviteToken && mode !== 'register') {
      setMode('register')
    }
  }, [isInviteOnly, inviteToken])

  // password login
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  // code login
  const [loginTarget, setLoginTarget] = useState('')
  const [loginCode, setLoginCode] = useState('')
  const loginCd = useCountdown()

  // 忘记密码
  const [resetTarget, setResetTarget] = useState('')
  const [resetCode, setResetCode] = useState('')
  const [resetNew, setResetNew] = useState('')
  const [resetConfirm, setResetConfirm] = useState('')
  const resetCd = useCountdown()

  // register
  const [regUsername, setRegUsername] = useState('')
  const [regEmail, setRegEmail] = useState('')
  const [regEmailCode, setRegEmailCode] = useState('')
  const [regPhone, setRegPhone] = useState('')
  const [regPhoneCode, setRegPhoneCode] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regConfirm, setRegConfirm] = useState('')
  const emailCd = useCountdown()
  const phoneCd = useCountdown()

  function clearMsgs() {
    setError(null)
    setHint(null)
  }

  async function handlePasswordLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    clearMsgs()
    try {
      await loginPassword(username.trim(), password)
      onLoggedIn()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : zh ? '登录失败' : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  async function handleCodeLogin(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    clearMsgs()
    try {
      const ch = detectChannel(loginTarget)
      if (!ch) throw new ApiError(422, zh ? '请输入邮箱或手机号' : 'Enter email or phone')
      await loginWithCode(ch, loginTarget.trim(), loginCode.trim())
      onLoggedIn()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : zh ? '登录失败' : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  async function sendResetVerifyCode() {
    clearMsgs()
    const ch = detectChannel(resetTarget)
    if (!ch) {
      setError(zh ? '请输入注册时使用的邮箱或手机号' : 'Enter your registered email or phone')
      return
    }
    try {
      const res = await sendResetCode(ch, resetTarget.trim())
      resetCd.start(res.cooldown_seconds || 60)
      setHint(
        res.debug_code
          ? zh
            ? `验证码已发送（开发调试码：${res.debug_code}）`
            : `Code sent (debug: ${res.debug_code})`
          : zh
            ? '如果该账号存在，验证码已发送，请查收'
            : 'If the account exists, a code has been sent',
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : zh ? '发送失败' : 'Send failed')
    }
  }

  async function handleResetPassword(e: React.FormEvent) {
    e.preventDefault()
    clearMsgs()
    const ch = detectChannel(resetTarget)
    if (!ch) {
      setError(zh ? '请输入注册时使用的邮箱或手机号' : 'Enter your registered email or phone')
      return
    }
    if (resetNew.length < 6) {
      setError(zh ? '密码长度不能少于6个字符' : 'Password must be at least 6 characters')
      return
    }
    if (resetNew !== resetConfirm) {
      setError(zh ? '两次输入的密码不一致' : 'Passwords do not match')
      return
    }
    setBusy(true)
    try {
      await resetPassword({ channel: ch, target: resetTarget.trim(), code: resetCode.trim(), new_password: resetNew })
      setUsername(resetTarget.trim())
      setPassword('')
      setResetCode('')
      setResetNew('')
      setResetConfirm('')
      setLoginKind('password')
      setHint(zh ? '密码已重置，请使用新密码登录' : 'Password reset. Please sign in.')
    } catch (err) {
      setError(err instanceof ApiError ? err.message : zh ? '重置失败' : 'Reset failed')
    } finally {
      setBusy(false)
    }
  }

  async function sendLoginVerifyCode() {
    clearMsgs()
    const ch = detectChannel(loginTarget)
    if (!ch) {
      setError(zh ? '请输入已注册的邮箱或手机号' : 'Enter registered email or phone')
      return
    }
    try {
      const res = await sendLoginCode(ch, loginTarget.trim())
      loginCd.start(res.cooldown_seconds || 60)
      setHint(
        res.debug_code
          ? zh
            ? `验证码已发送（开发调试码：${res.debug_code}）`
            : `Code sent (debug: ${res.debug_code})`
          : zh
            ? '验证码已发送'
            : 'Code sent',
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : zh ? '发送失败' : 'Send failed')
    }
  }

  async function sendRegCode(channel: 'email' | 'sms') {
    clearMsgs()
    const target = channel === 'email' ? regEmail.trim() : regPhone.trim()
    if (!target) {
      setError(
        channel === 'email'
          ? zh
            ? '请先填写邮箱'
            : 'Enter email first'
          : zh
            ? '请先填写手机号'
            : 'Enter phone first',
      )
      return
    }
    try {
      const res = await sendRegisterCode(channel, target, inviteToken || undefined)
      if (channel === 'email') emailCd.start(res.cooldown_seconds || 60)
      else phoneCd.start(res.cooldown_seconds || 60)
      setHint(
        res.debug_code
          ? zh
            ? `${channel === 'email' ? '邮箱' : '短信'}验证码已发送（开发调试码：${res.debug_code}）`
            : `Code sent (debug: ${res.debug_code})`
          : zh
            ? '验证码已发送'
            : 'Code sent',
      )
    } catch (err) {
      setError(err instanceof ApiError ? err.message : zh ? '发送失败' : 'Send failed')
    }
  }

  async function handleRegister(e: React.FormEvent) {
    e.preventDefault()
    clearMsgs()
    if (regPassword !== regConfirm) {
      setError(zh ? '两次密码不一致' : 'Passwords do not match')
      return
    }
    if (!/^[A-Za-z0-9_]{3,50}$/.test(regUsername.trim())) {
      setError(zh ? '用户名需 3–50 位字母数字下划线' : 'Invalid username')
      return
    }
    setBusy(true)
    try {
      const payload = await register({
        username: regUsername.trim(),
        password: regPassword,
        email: regEmail.trim(),
        email_code: regEmailCode.trim(),
        phone: regPhone.trim() || undefined,
        phone_code: regPhoneCode.trim() || undefined,
        nickname: regUsername.trim(),
        invite_token: inviteToken || undefined,
      })
      if (payload?.project_id) {
        clearInviteToken()
      }
      onLoggedIn(payload)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : zh ? '注册失败' : 'Register failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex bg-surface dark:bg-[#111314]">
      <div className="hidden md:flex md:w-1/2 relative overflow-hidden items-center justify-center bg-gradient-to-br from-[#0058be] to-[#2170e4]">
        <div className="relative z-10 text-center px-10 text-white">
          <div className="w-16 h-16 rounded-2xl bg-white/15 flex items-center justify-center mx-auto mb-6">
            <span className="material-symbols-outlined text-4xl">bolt</span>
          </div>
          <h1 className="text-4xl font-bold tracking-tight mb-2">
            {getBrandName(lang)}
          </h1>
          <p className="text-white/80 text-lg">
            {getBrandTagline(lang)}
          </p>
        </div>
      </div>

      <div className="w-full md:w-1/2 flex items-center justify-center p-6">
        <div className="w-full max-w-md rounded-3xl border border-outline-variant/40 bg-white dark:bg-[#191c1d] p-7 shadow-xl space-y-5">
          {canRegister ? (
            <div className="flex p-1 rounded-2xl bg-surface-container dark:bg-[#282b2d]">
              {(['login', 'register'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m)
                    clearMsgs()
                  }}
                  className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-all cursor-pointer ${
                    mode === m
                      ? 'bg-primary text-on-primary shadow-sm'
                      : 'text-on-surface-variant hover:text-on-surface'
                  }`}
                >
                  {m === 'login' ? (zh ? '登录' : 'Sign in') : zh ? '注册' : 'Register'}
                </button>
              ))}
            </div>
          ) : (
            <div className="px-1 py-1 text-center font-bold text-lg text-on-surface">
              {zh ? '登录' : 'Sign in'}
            </div>
          )}

          {mode === 'login' ? (
            <>
              <div>
                <h2 className="text-xl font-bold text-on-surface">
                  {zh ? '欢迎回来' : 'Welcome back'}
                </h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  {loginKind === 'reset'
                    ? zh
                      ? '验证身份后设置新密码'
                      : 'Verify your identity to set a new password'
                    : loginKind === 'password'
                    ? zh
                      ? '用户名 / 邮箱 / 手机号 + 密码'
                      : 'Account + password'
                    : zh
                      ? '已注册邮箱或手机号 + 验证码'
                      : 'Email/phone + code'}
                </p>
              </div>

              {loginKind === 'password' ? (
                <form onSubmit={(e) => void handlePasswordLogin(e)} className="space-y-3">
                  <label className="block text-sm">
                    <span className="text-on-surface-variant font-semibold">
                      {zh ? '账号' : 'Account'}
                    </span>
                    <input
                      className={inputCls}
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder={zh ? '用户名 / 邮箱 / 手机号' : 'Username / email / phone'}
                      autoComplete="username"
                      required
                    />
                  </label>
                  <label className="block text-sm">
                    <span className="text-on-surface-variant font-semibold">
                      {zh ? '密码' : 'Password'}
                    </span>
                    <input
                      type="password"
                      className={inputCls}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete="current-password"
                      required
                      minLength={6}
                    />
                  </label>
                  <div className="flex justify-between">
                    <button
                      type="button"
                      data-testid="forgot-password-link"
                      className="text-xs font-bold text-on-surface-variant cursor-pointer"
                      onClick={() => {
                        setLoginKind('reset')
                        setResetTarget(username.includes('@') ? username.trim() : '')
                        clearMsgs()
                      }}
                    >
                      {zh ? '忘记密码' : 'Forgot password'}
                    </button>
                    <button
                      type="button"
                      className="text-xs font-bold text-primary cursor-pointer"
                      onClick={() => {
                        setLoginKind('code')
                        clearMsgs()
                      }}
                    >
                      {zh ? '验证码登录' : 'Code login'}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-xl bg-primary text-on-primary py-3 font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {busy ? (zh ? '登录中…' : 'Signing in…') : zh ? '登录' : 'Sign in'}
                  </button>
                </form>
              ) : loginKind === 'reset' ? (
                <form onSubmit={(e) => void handleResetPassword(e)} className="space-y-3" data-testid="reset-password-form">
                  <label className="block text-sm">
                    <span className="text-on-surface-variant font-semibold">{zh ? '邮箱 / 手机号' : 'Email / phone'}</span>
                    <input
                      className={inputCls}
                      value={resetTarget}
                      onChange={(e) => setResetTarget(e.target.value)}
                      placeholder={zh ? '注册时使用的邮箱或手机号' : 'Registered email or phone'}
                      required
                    />
                  </label>
                  <div>
                    <span className="text-sm text-on-surface-variant font-semibold">{zh ? '验证码' : 'Code'}</span>
                    <div className="mt-1 flex gap-2">
                      <input
                        className={`${inputCls} mt-0 flex-1`}
                        value={resetCode}
                        onChange={(e) => setResetCode(e.target.value)}
                        maxLength={6}
                        required
                      />
                      <button
                        type="button"
                        disabled={resetCd.countdown > 0}
                        onClick={() => void sendResetVerifyCode()}
                        className="px-3 rounded-xl border border-outline-variant/50 text-xs font-bold text-primary disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      >
                        {resetCd.countdown > 0 ? `${resetCd.countdown}s` : zh ? '获取验证码' : 'Get code'}
                      </button>
                    </div>
                  </div>
                  <label className="block text-sm">
                    <span className="text-on-surface-variant font-semibold">{zh ? '新密码' : 'New password'}</span>
                    <input type="password" className={inputCls} value={resetNew} onChange={(e) => setResetNew(e.target.value)} autoComplete="new-password" required minLength={6} />
                  </label>
                  <label className="block text-sm">
                    <span className="text-on-surface-variant font-semibold">{zh ? '确认新密码' : 'Confirm password'}</span>
                    <input type="password" className={inputCls} value={resetConfirm} onChange={(e) => setResetConfirm(e.target.value)} autoComplete="new-password" required minLength={6} />
                  </label>
                  <div className="flex justify-end">
                    <button type="button" className="text-xs font-bold text-primary cursor-pointer" onClick={() => { setLoginKind('password'); clearMsgs() }}>
                      {zh ? '返回登录' : 'Back to sign in'}
                    </button>
                  </div>
                  <button type="submit" disabled={busy} className="w-full rounded-xl bg-primary text-on-primary py-3 font-bold disabled:opacity-50 cursor-pointer">
                    {busy ? (zh ? '提交中…' : 'Submitting…') : zh ? '重置密码' : 'Reset password'}
                  </button>
                </form>
              ) : (
                <form onSubmit={(e) => void handleCodeLogin(e)} className="space-y-3">
                  <label className="block text-sm">
                    <span className="text-on-surface-variant font-semibold">
                      {zh ? '邮箱 / 手机号' : 'Email / phone'}
                    </span>
                    <input
                      className={inputCls}
                      value={loginTarget}
                      onChange={(e) => setLoginTarget(e.target.value)}
                      placeholder={zh ? '已注册的邮箱或手机号' : 'Registered email or phone'}
                      required
                    />
                  </label>
                  <div>
                    <span className="text-sm text-on-surface-variant font-semibold">
                      {zh ? '验证码' : 'Code'}
                    </span>
                    <div className="mt-1 flex gap-2">
                      <input
                        className={`${inputCls} mt-0 flex-1`}
                        value={loginCode}
                        onChange={(e) => setLoginCode(e.target.value)}
                        maxLength={6}
                        required
                      />
                      <button
                        type="button"
                        disabled={loginCd.countdown > 0}
                        onClick={() => void sendLoginVerifyCode()}
                        className="px-3 rounded-xl border border-outline-variant/50 text-xs font-bold text-primary disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      >
                        {loginCd.countdown > 0
                          ? `${loginCd.countdown}s`
                          : zh
                            ? '获取验证码'
                            : 'Get code'}
                      </button>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <button
                      type="button"
                      className="text-xs font-bold text-primary cursor-pointer"
                      onClick={() => {
                        setLoginKind('password')
                        clearMsgs()
                      }}
                    >
                      {zh ? '密码登录' : 'Password login'}
                    </button>
                  </div>
                  <button
                    type="submit"
                    disabled={busy}
                    className="w-full rounded-xl bg-primary text-on-primary py-3 font-bold disabled:opacity-50 cursor-pointer"
                  >
                    {busy ? (zh ? '登录中…' : 'Signing in…') : zh ? '登录' : 'Sign in'}
                  </button>
                </form>
              )}
              {!canRegister && (
                <p className="text-center text-xs text-on-surface-variant pt-2" data-testid="invite-only-notice">
                  {zh ? '仅限受邀注册，请向管理员索取邀请链接' : 'Registration is by invitation only. Please ask an administrator for an invite link.'}
                </p>
              )}
            </>
          ) : (
            <>
              <div>
                <h2 className="text-xl font-bold text-on-surface">
                  {zh ? '创建账户' : 'Create account'}
                </h2>
                <p className="text-sm text-on-surface-variant mt-1">
                  {zh
                    ? '邮箱验证码必填；手机号可注册时一并验证，或登录后补绑'
                    : 'Email code required; phone optional now or bind later'}
                </p>
              </div>
              <form onSubmit={(e) => void handleRegister(e)} className="space-y-3">
                <label className="block text-sm">
                  <span className="text-on-surface-variant font-semibold">
                    {zh ? '用户名' : 'Username'}
                  </span>
                  <input
                    className={inputCls}
                    value={regUsername}
                    onChange={(e) => setRegUsername(e.target.value)}
                    placeholder={zh ? '字母、数字或下划线' : 'Letters, numbers, _'}
                    required
                    minLength={3}
                    maxLength={50}
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-on-surface-variant font-semibold">
                    {zh ? '邮箱 *' : 'Email *'}
                  </span>
                  <input
                    type="email"
                    className={inputCls}
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    required
                    autoComplete="email"
                  />
                </label>
                <div>
                  <label htmlFor="register-email-code" className="text-sm text-on-surface-variant font-semibold">
                    {zh ? '邮箱验证码 *' : 'Email code *'}
                  </label>
                  <div className="mt-1 flex gap-2">
                    <input
                      id="register-email-code"
                      className={`${inputCls} mt-0 flex-1`}
                      value={regEmailCode}
                      onChange={(e) => setRegEmailCode(e.target.value)}
                      maxLength={6}
                      required
                    />
                    <button
                      type="button"
                      disabled={emailCd.countdown > 0}
                      onClick={() => void sendRegCode('email')}
                      className="px-3 rounded-xl border border-outline-variant/50 text-xs font-bold text-primary disabled:opacity-40 cursor-pointer whitespace-nowrap"
                    >
                      {emailCd.countdown > 0
                        ? `${emailCd.countdown}s`
                        : zh
                          ? '获取验证码'
                          : 'Get code'}
                    </button>
                  </div>
                </div>
                <label className="block text-sm">
                  <span className="text-on-surface-variant font-semibold">
                    {zh ? '手机号（可选）' : 'Phone (optional)'}
                  </span>
                  <input
                    className={inputCls}
                    value={regPhone}
                    onChange={(e) => setRegPhone(e.target.value)}
                    placeholder={zh ? '11 位手机号' : 'Mobile number'}
                    autoComplete="tel"
                  />
                </label>
                {regPhone.trim() && (
                  <div>
                    <span className="text-sm text-on-surface-variant font-semibold">
                      {zh ? '短信验证码' : 'SMS code'}
                    </span>
                    <div className="mt-1 flex gap-2">
                      <input
                        className={`${inputCls} mt-0 flex-1`}
                        value={regPhoneCode}
                        onChange={(e) => setRegPhoneCode(e.target.value)}
                        maxLength={6}
                      />
                      <button
                        type="button"
                        disabled={phoneCd.countdown > 0}
                        onClick={() => void sendRegCode('sms')}
                        className="px-3 rounded-xl border border-outline-variant/50 text-xs font-bold text-primary disabled:opacity-40 cursor-pointer whitespace-nowrap"
                      >
                        {phoneCd.countdown > 0
                          ? `${phoneCd.countdown}s`
                          : zh
                            ? '获取验证码'
                            : 'Get code'}
                      </button>
                    </div>
                  </div>
                )}
                <label className="block text-sm">
                  <span className="text-on-surface-variant font-semibold">
                    {zh ? '密码 *' : 'Password *'}
                  </span>
                  <input
                    type="password"
                    className={inputCls}
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </label>
                <label className="block text-sm">
                  <span className="text-on-surface-variant font-semibold">
                    {zh ? '确认密码 *' : 'Confirm *'}
                  </span>
                  <input
                    type="password"
                    className={inputCls}
                    value={regConfirm}
                    onChange={(e) => setRegConfirm(e.target.value)}
                    required
                    minLength={6}
                    autoComplete="new-password"
                  />
                </label>
                <button
                  type="submit"
                  disabled={busy}
                  className="w-full rounded-xl bg-primary text-on-primary py-3 font-bold disabled:opacity-50 cursor-pointer"
                >
                  {busy ? (zh ? '注册中…' : 'Creating…') : zh ? '注册并登录' : 'Register'}
                </button>
              </form>
            </>
          )}

          {hint && (
            <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
              {hint}
            </p>
          )}
          {error && (
            <p className="text-sm text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2">
              {error}
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
