import React, { useState } from 'react'
import { loginPassword } from '../api/auth'
import { ApiError } from '../api/client'

type Props = {
  onLoggedIn: () => void
  lang?: 'zh' | 'en'
}

export function LoginGate({ onLoggedIn, lang = 'zh' }: Props) {
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const zh = lang === 'zh'

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      await loginPassword(username.trim(), password)
      onLoggedIn()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : zh ? '登录失败' : 'Login failed')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-surface dark:bg-[#111314] px-4">
      <form
        onSubmit={submit}
        className="w-full max-w-md rounded-2xl border border-surface-variant bg-white dark:bg-[#191c1d] p-8 shadow-lg space-y-4"
      >
        <div>
          <h1 className="text-2xl font-bold text-primary">
            {zh ? '烂笔头PM' : 'Flow'}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {zh ? '登录后对接现有后端数据' : 'Sign in to sync with backend'}
          </p>
        </div>
        <label className="block text-sm">
          <span className="text-on-surface-variant">{zh ? '账号' : 'Username'}</span>
          <input
            className="mt-1 w-full rounded-xl border border-surface-variant px-3 py-2 bg-transparent"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            autoComplete="username"
            required
          />
        </label>
        <label className="block text-sm">
          <span className="text-on-surface-variant">{zh ? '密码' : 'Password'}</span>
          <input
            type="password"
            className="mt-1 w-full rounded-xl border border-surface-variant px-3 py-2 bg-transparent"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoComplete="current-password"
            required
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full rounded-xl bg-primary text-on-primary py-2.5 font-semibold disabled:opacity-50"
        >
          {busy ? (zh ? '登录中…' : 'Signing in…') : zh ? '登录' : 'Sign in'}
        </button>
        <p className="text-xs text-on-surface-variant">
          {zh
            ? 'API 默认代理到 http://127.0.0.1:8010/api/v1（见 vite.config）'
            : 'API proxies to http://127.0.0.1:8010/api/v1'}
        </p>
      </form>
    </div>
  )
}
