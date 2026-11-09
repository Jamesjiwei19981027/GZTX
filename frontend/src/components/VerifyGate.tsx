import React, { useEffect, useState } from 'react'
import {
  confirmBindCode,
  getVerificationStatus,
  logout,
  sendBindCode,
  type VerificationStatus,
} from '../api/auth'
import { ApiError } from '../api/client'
import { AuthBrandPanel } from './AuthBrandPanel'

type Props = {
  lang?: 'zh' | 'en'
  onVerified: () => void
  onLogout: () => void
  /** email：个人待办只需邮箱；phone：协作功能需补验手机 */
  required?: 'email' | 'phone'
  phoneRequired?: boolean
}

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
  'w-full rounded-lg border border-outline-variant/50 px-3 py-2 bg-surface-container/40 text-on-surface focus:outline-none focus:ring-2 focus:ring-primary/30'

function ChannelBind({
  channel,
  initialTarget,
  verified,
  lang,
  onDone,
}: {
  channel: 'email' | 'sms'
  initialTarget?: string | null
  verified: boolean
  lang: 'zh' | 'en'
  onDone: (st: VerificationStatus) => void
}) {
  const zh = lang === 'zh'
  const isEmail = channel === 'email'
  const [target, setTarget] = useState(initialTarget || '')
  const [code, setCode] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [hint, setHint] = useState<string | null>(null)
  const cd = useCountdown()

  useEffect(() => {
    if (initialTarget) setTarget(initialTarget)
  }, [initialTarget])

  async function send() {
    setError(null)
    setHint(null)
    if (!target.trim()) {
      setError(isEmail ? (zh ? '请输入邮箱' : 'Enter email') : zh ? '请输入手机号' : 'Enter phone')
      return
    }
    try {
      const res = await sendBindCode(channel, target.trim())
      cd.start(res.cooldown_seconds || 60)
      setHint(
        res.debug_code
          ? zh
            ? `验证码已发送（开发调试码：${res.debug_code}）`
            : `Sent (debug: ${res.debug_code})`
          : zh
            ? '验证码已发送'
            : 'Code sent',
      )
    } catch (e) {
      setError(e instanceof ApiError ? e.message : zh ? '发送失败' : 'Failed')
    }
  }

  async function confirm() {
    setBusy(true)
    setError(null)
    try {
      const st = await confirmBindCode(channel, target.trim(), code.trim())
      onDone(st)
    } catch (e) {
      setError(e instanceof ApiError ? e.message : zh ? '验证失败' : 'Failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="border-b border-outline-variant py-5 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h3 className="font-medium text-on-surface tabular-nums">
          {isEmail ? (zh ? '邮箱验证' : 'Email') : zh ? '手机验证' : 'Phone'}
        </h3>
        {verified && (
          <span className="text-xs font-medium px-2 py-1 rounded-md bg-[#2f7d4f]/10 text-[#2f7d4f] tabular-nums">
            {zh ? '已验证' : 'Verified'}
          </span>
        )}
      </div>
      {verified ? (
        <p className="text-sm text-on-surface-variant">{initialTarget || (zh ? '已完成' : 'Done')}</p>
      ) : (
        <>
          <input
            className={inputCls}
            value={target}
            onChange={(e) => setTarget(e.target.value)}
            placeholder={isEmail ? (zh ? '邮箱地址' : 'Email') : zh ? '手机号' : 'Phone'}
          />
          <div className="flex gap-2">
            <input
              className={`${inputCls} flex-1`}
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={6}
              placeholder={zh ? '6 位验证码' : '6-digit code'}
            />
            <button
              type="button"
              disabled={cd.countdown > 0}
              onClick={() => void send()}
              className="px-3 rounded-lg border border-outline-variant/50 text-xs font-medium text-primary disabled:opacity-40 cursor-pointer whitespace-nowrap tabular-nums"
            >
              {cd.countdown > 0 ? `${cd.countdown}s` : zh ? '获取验证码' : 'Get code'}
            </button>
          </div>
          <button
            type="button"
            disabled={busy}
            onClick={() => void confirm()}
            className="w-full rounded-lg bg-primary text-on-primary py-2 font-medium disabled:opacity-50 cursor-pointer tabular-nums"
          >
            {busy ? (zh ? '验证中…' : 'Verifying…') : zh ? '确认验证' : 'Confirm'}
          </button>
          {hint && <p className="text-xs text-[#2f7d4f]">{hint}</p>}
          {error && <p className="text-xs text-error">{error}</p>}
        </>
      )}
    </div>
  )
}

export function VerifyGate({
  lang = 'zh',
  onVerified,
  onLogout,
  required = 'email',
  phoneRequired = false,
}: Props) {
  const zh = lang === 'zh'
  const [status, setStatus] = useState<VerificationStatus | null>(null)
  const [loadError, setLoadError] = useState<string | null>(null)

  const isSatisfied = (st: VerificationStatus | null) => {
    if (!st) return false
    if (required === 'phone' && phoneRequired) return Boolean(st.phone_verified && st.email_verified)
    return Boolean(st.email_verified)
  }

  useEffect(() => {
    void (async () => {
      try {
        const st = await getVerificationStatus()
        setStatus(st)
        if (isSatisfied(st)) onVerified()
      } catch (e) {
        setLoadError(e instanceof ApiError ? e.message : zh ? '加载失败' : 'Load failed')
      }
    })()
  }, [onVerified, zh, required, phoneRequired])

  async function handleDone(st: VerificationStatus) {
    setStatus(st)
    if (isSatisfied(st)) onVerified()
  }

  async function handleLogout() {
    await logout()
    onLogout()
  }

  return (
    <div className="min-h-screen flex bg-surface">
      <AuthBrandPanel lang={lang} />
      <div className="w-full md:w-1/2 flex items-center justify-center p-6">
      <div className="w-full max-w-lg rounded-[var(--radius-ink-panel)] border border-outline-variant/40 bg-surface-container-lowest dark:bg-surface-container p-7 shadow-sm dark:shadow-none space-y-5">
        <div>
          <h1 className="text-xl font-medium text-on-surface tabular-nums">
            {required === 'phone'
              ? zh
                ? '协作功能需要补验手机'
                : 'Phone verification required for collaboration'
              : zh
                ? '完成邮箱验证'
                : 'Verify your email'}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {required === 'phone'
              ? zh
                ? '个人待办只需邮箱；创建公司、项目或接受协作邀请需要手机号验证。'
                : 'Personal tasks only need email. Company, project, and invite actions also need a verified phone.'
              : zh
                ? '个人待办只需验证邮箱。手机号可稍后在协作时再补。'
                : 'Personal tasks only need a verified email. Phone can wait until you collaborate.'}
          </p>
        </div>

        {loadError && <p className="text-sm text-error">{loadError}</p>}

        {status && (
          <div className="space-y-4">
            <ChannelBind
              channel="email"
              initialTarget={status.email}
              verified={status.email_verified}
              lang={lang}
              onDone={handleDone}
            />
            {((required === 'phone' && phoneRequired) || status.phone_verified) && (
              <ChannelBind
                channel="sms"
                initialTarget={status.phone}
                verified={status.phone_verified}
                lang={lang}
                onDone={handleDone}
              />
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => void handleLogout()}
          className="w-full text-sm font-medium text-on-surface-variant hover:text-on-surface cursor-pointer tabular-nums"
        >
          {zh ? '退出登录' : 'Sign out'}
        </button>
      </div>
      </div>
    </div>
  )
}
