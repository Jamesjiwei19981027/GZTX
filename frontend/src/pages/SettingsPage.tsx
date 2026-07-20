import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input, Select, Switch, Spin } from 'antd'
import { message } from '@/utils/antdMessage'
import {
  getEmailStatus,
  getLlmConfig,
  getSmtpConfig,
  sendTestEmail,
  testLlmConfig,
  updateLlmConfig,
  updateSmtpConfig,
} from '@/api/notifications'
import { updateUser } from '@/api/auth'
import { getErrorMessage } from '@/api/request'
import { useAuthStore } from '@/stores/auth'
import { useTheme, type AccentColor, type ThemeMode } from '@/hooks/useTheme'
import type { SmtpConfigUpdate, UserLlmConfigUpdate } from '@/types'

type LlmPreset = {
  label: string
  default_base_url?: string
  default_model?: string
  needs_key?: boolean
}

const FALLBACK_LLM_PROVIDERS = [
  { key: 'fake', label: 'Fake（本地桩，无需密钥）' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'openai_compatible', label: 'OpenAI 兼容（DeepSeek / 通义 / 自建）' },
  { key: 'azure_openai', label: 'Azure OpenAI' },
  { key: 'ollama', label: 'Ollama（本地）' },
  { key: 'custom', label: '自定义' },
]

const ACCENT_COLORS: { value: AccentColor; colorClass: string; label: string }[] = [
  { value: 'blue', colorClass: 'bg-primary', label: '蓝色' },
  { value: 'green', colorClass: 'bg-secondary', label: '绿色' },
  { value: 'amber', colorClass: 'bg-tertiary', label: '琥珀' },
  { value: 'red', colorClass: 'bg-error', label: '红色' },
]

const THEME_OPTIONS: { value: ThemeMode; icon: string; label: string }[] = [
  { value: 'light', icon: 'light_mode', label: '浅色' },
  { value: 'dark', icon: 'dark_mode', label: '深色' },
  { value: 'system', icon: 'brightness_auto', label: '系统' },
]

export default function SettingsPage() {
  const fetchCurrentUser = useAuthStore((s) => s.fetchCurrentUser)
  const user = useAuthStore((s) => s.user)
  const { theme, accent, setTheme, setAccent } = useTheme()

  // ── Profile ───────────────────────────────────────────────────────────────
  const [nickname, setNickname] = useState('')
  const [email, setEmail] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  // ── SMTP ──────────────────────────────────────────────────────────────────
  const [smtpHost, setSmtpHost] = useState('smtp.qq.com')
  const [smtpPort, setSmtpPort] = useState(465)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpHasPassword, setSmtpHasPassword] = useState(false)
  const [smtpConfigured, setSmtpConfigured] = useState(false)
  const [smtpSource, setSmtpSource] = useState('none')
  const [smtpLoading, setSmtpLoading] = useState(false)
  const [smtpSaving, setSmtpSaving] = useState(false)
  const [smtpTesting, setSmtpTesting] = useState(false)

  // ── LLM ───────────────────────────────────────────────────────────────────
  const [llmProvider, setLlmProvider] = useState('fake')
  const [llmBaseUrl, setLlmBaseUrl] = useState('')
  const [llmModel, setLlmModel] = useState('fake')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmTemperature, setLlmTemperature] = useState(0.2)
  const [llmMaxTokens, setLlmMaxTokens] = useState(1024)
  const [llmEnabled, setLlmEnabled] = useState(false)
  const [llmUseForJudge, setLlmUseForJudge] = useState(false)
  const [llmUseForAgent, setLlmUseForAgent] = useState(true)
  const [llmHasKey, setLlmHasKey] = useState(false)
  const [llmConfigured, setLlmConfigured] = useState(false)
  const [llmPresets, setLlmPresets] = useState<Record<string, LlmPreset>>({})
  const [llmLoading, setLlmLoading] = useState(false)
  const [llmSaving, setLlmSaving] = useState(false)
  const [llmTesting, setLlmTesting] = useState(false)

  const llmProviderOptions = useMemo(() => {
    const keys = Object.keys(llmPresets)
    if (keys.length) {
      return keys.map((key) => ({ value: key, label: llmPresets[key]?.label || key }))
    }
    return FALLBACK_LLM_PROVIDERS.map((o) => ({ value: o.key, label: o.label }))
  }, [llmPresets])

  const loadSmtp = useCallback(async () => {
    setSmtpLoading(true)
    try {
      const data = await getSmtpConfig()
      if (data) {
        setSmtpHost(data.smtp_host || 'smtp.qq.com')
        setSmtpPort(data.smtp_port || 465)
        setSmtpUser(data.smtp_user || '')
        setSmtpFrom(data.smtp_from || '')
        setSmtpHasPassword(!!data.has_password)
        setSmtpConfigured(!!(data.has_password && data.smtp_host))
      }
      const status = await getEmailStatus()
      if (status) {
        setSmtpSource(status.smtp_source || 'none')
      }
    } catch (e) {
      console.error('Failed to load SMTP config:', e)
    } finally {
      setSmtpLoading(false)
    }
  }, [])

  const loadLlm = useCallback(async () => {
    setLlmLoading(true)
    try {
      const data = await getLlmConfig()
      if (data) {
        setLlmProvider(data.provider || 'fake')
        setLlmBaseUrl(data.base_url || '')
        setLlmModel(data.model || 'fake')
        setLlmTemperature(data.temperature ?? 0.2)
        setLlmMaxTokens(data.max_tokens ?? 1024)
        setLlmEnabled(!!data.enabled)
        setLlmUseForJudge(!!data.use_for_judge)
        setLlmUseForAgent(data.use_for_agent !== false)
        setLlmApiKey('')
        setLlmHasKey(!!data.has_api_key)
        setLlmConfigured(!!data.configured)
        if (data.presets) setLlmPresets(data.presets)
      }
    } catch (e) {
      console.error('Failed to load LLM config:', e)
    } finally {
      setLlmLoading(false)
    }
  }, [])

  useEffect(() => {
    void loadSmtp()
    void loadLlm()
    void (async () => {
      const u = user ?? (await fetchCurrentUser())
      if (u) {
        setNickname(u.nickname || u.username || '')
        setEmail(u.email || '')
      }
    })()
    // Initial hydrate only (archive onMounted)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- avoid clobbering edits on user store updates
  }, [loadSmtp, loadLlm])

  async function handleSaveProfile() {
    setProfileSaving(true)
    try {
      await updateUser({ nickname, email })
      message.success('个人资料已更新')
      await fetchCurrentUser()
    } catch (e) {
      message.error(getErrorMessage(e, '更新失败'))
    } finally {
      setProfileSaving(false)
    }
  }

  function onProviderChange(value: string) {
    setLlmProvider(value)
    const preset = llmPresets[value]
    if (!preset) return
    if (preset.default_base_url !== undefined) {
      setLlmBaseUrl(preset.default_base_url || '')
    }
    if (preset.default_model !== undefined) {
      setLlmModel(preset.default_model || '')
    }
  }

  async function handleSaveSmtp() {
    setSmtpSaving(true)
    try {
      const payload: SmtpConfigUpdate = {
        smtp_host: smtpHost,
        smtp_port: Number(smtpPort) || 465,
        smtp_user: smtpUser,
        smtp_from: smtpFrom,
      }
      // Empty secret = do not overwrite existing password
      if (smtpPassword.trim()) {
        payload.smtp_password = smtpPassword
      }
      const result = await updateSmtpConfig(payload)
      setSmtpHasPassword(result?.has_password || !!smtpPassword.trim())
      setSmtpPassword('')
      setSmtpConfigured(true)
      setSmtpSource('user')
      message.success('邮件服务器配置已保存')
    } catch (e) {
      message.error(getErrorMessage(e, '保存失败'))
    } finally {
      setSmtpSaving(false)
    }
  }

  async function handleTestEmail() {
    setSmtpTesting(true)
    try {
      await sendTestEmail()
      message.success('测试邮件已发送，请检查邮箱')
    } catch (e) {
      message.error(getErrorMessage(e, '发送失败'))
    } finally {
      setSmtpTesting(false)
    }
  }

  async function handleSaveLlm() {
    setLlmSaving(true)
    try {
      const payload: UserLlmConfigUpdate = {
        provider: llmProvider,
        base_url: llmBaseUrl,
        model: llmModel,
        temperature: Number(llmTemperature),
        max_tokens: Number(llmMaxTokens),
        enabled: llmEnabled,
        use_for_judge: llmUseForJudge,
        use_for_agent: llmUseForAgent,
      }
      // Empty api_key = do not overwrite
      if (llmApiKey.trim()) {
        payload.api_key = llmApiKey
      }
      const result = await updateLlmConfig(payload)
      setLlmHasKey(result?.has_api_key || !!llmApiKey.trim())
      setLlmConfigured(!!result?.configured)
      setLlmApiKey('')
      message.success('个人 LLM 配置已保存')
    } catch (e) {
      message.error(getErrorMessage(e, '保存失败'))
    } finally {
      setLlmSaving(false)
    }
  }

  async function handleTestLlm() {
    setLlmTesting(true)
    try {
      const r = await testLlmConfig()
      const snippet = r?.content ? `：${String(r.content).slice(0, 80)}` : ''
      message.success(`连通性测试成功${snippet}`)
    } catch (e) {
      message.error(getErrorMessage(e, 'LLM 测试失败'))
    } finally {
      setLlmTesting(false)
    }
  }

  return (
    <div className="flex-1 overflow-y-auto p-md md:p-lg">
      <div className="max-w-[900px] mx-auto">
        <header className="mb-xl">
          <h1 className="font-headline text-headline-lg text-on-surface mb-xs">设置</h1>
          <p className="font-body text-body-md text-on-surface-variant">
            管理个人资料、外观、邮件服务器与个人 LLM 配置。
          </p>
        </header>

        <div className="space-y-lg">
          {/* ── Profile ───────────────────────────────────────────────────── */}
          <section className="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <h3 className="font-headline text-headline-sm text-on-surface mb-lg">个人资料</h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
              <div className="flex flex-col gap-xs">
                <label className="font-label text-label-md text-on-surface-variant">全名</label>
                <Input
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  placeholder="输入全名"
                />
              </div>
              <div className="flex flex-col gap-xs">
                <label className="font-label text-label-md text-on-surface-variant">邮箱地址</label>
                <Input
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="输入邮箱（用于接收通知）"
                />
              </div>
            </div>
            <div className="flex justify-end mt-lg">
              <button
                type="button"
                className="px-lg py-sm bg-primary text-on-primary rounded-lg font-label text-label-md hover:opacity-90 transition-all disabled:opacity-50"
                disabled={profileSaving}
                onClick={() => void handleSaveProfile()}
              >
                {profileSaving ? '保存中...' : '更新资料'}
              </button>
            </div>
          </section>

          {/* ── Appearance ────────────────────────────────────────────────── */}
          <section className="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <h3 className="font-headline text-headline-sm text-on-surface mb-lg">外观</h3>
            <div className="flex flex-col gap-md">
              <div className="flex items-center justify-between flex-wrap gap-sm">
                <span className="font-label text-label-md text-on-surface">颜色主题</span>
                <div className="flex bg-surface-container rounded-lg p-xs">
                  {THEME_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      className={[
                        'px-md py-xs rounded-md font-label text-label-sm flex items-center gap-xs transition-colors',
                        theme === opt.value
                          ? 'bg-surface shadow-sm text-primary'
                          : 'text-on-surface-variant hover:bg-surface-container-high',
                      ].join(' ')}
                      onClick={() => setTheme(opt.value)}
                    >
                      <span className="material-symbols-outlined text-[18px]">{opt.icon}</span>
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="pt-md border-t border-outline-variant">
                <p className="font-label text-label-sm text-on-surface-variant mb-sm">主题色</p>
                <div className="flex gap-sm">
                  {ACCENT_COLORS.map((color) => (
                    <button
                      key={color.value}
                      type="button"
                      title={color.label}
                      aria-label={color.label}
                      className={[
                        'w-8 h-8 rounded-full cursor-pointer transition-transform',
                        color.colorClass,
                        accent === color.value
                          ? 'ring-2 ring-offset-2 ring-primary'
                          : 'hover:scale-110',
                      ].join(' ')}
                      onClick={() => setAccent(color.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </section>

          {/* ── Personal SMTP ─────────────────────────────────────────────── */}
          <section className="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <div className="flex items-center justify-between mb-lg flex-wrap gap-sm">
              <div>
                <h3 className="font-headline text-headline-sm text-on-surface">个人邮件服务器</h3>
                <p className="font-body text-body-sm text-on-surface-variant mt-xs">
                  个人任务提醒等优先用此处 SMTP。密码留空表示不修改已保存的授权码。
                </p>
              </div>
              {smtpConfigured ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-sm bg-secondary/10 text-secondary font-label">
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                  已配置
                </span>
              ) : smtpSource === 'global' ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-sm bg-primary/10 text-primary font-label">
                  系统默认
                </span>
              ) : null}
            </div>

            <Spin spinning={smtpLoading}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <div className="flex flex-col gap-xs">
                  <label className="font-label text-label-md text-on-surface-variant">SMTP 服务器</label>
                  <Input value={smtpHost} onChange={(e) => setSmtpHost(e.target.value)} placeholder="smtp.qq.com" />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-label text-label-md text-on-surface-variant">端口</label>
                  <Input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value) || 0)}
                    placeholder="465"
                  />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-label text-label-md text-on-surface-variant">邮箱账号</label>
                  <Input value={smtpUser} onChange={(e) => setSmtpUser(e.target.value)} placeholder="your@qq.com" />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-label text-label-md text-on-surface-variant">发件人地址</label>
                  <Input
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    placeholder="与邮箱账号相同（可留空）"
                  />
                </div>
                <div className="flex flex-col gap-xs md:col-span-2">
                  <label className="font-label text-label-md text-on-surface-variant">
                    授权码
                    {smtpHasPassword && (
                      <span className="text-secondary ml-1">(已设置，留空保持不变)</span>
                    )}
                  </label>
                  <Input.Password
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    placeholder={smtpHasPassword ? '已保存，留空不修改' : 'SMTP 授权码 / 密码'}
                    autoComplete="new-password"
                  />
                </div>
              </div>

              <div className="flex items-center gap-sm mt-lg justify-end flex-wrap">
                <button
                  type="button"
                  className="px-md py-sm border border-outline text-on-surface rounded-lg font-label text-label-md hover:bg-surface-container-low transition-all disabled:opacity-50"
                  disabled={smtpTesting}
                  onClick={() => void handleTestEmail()}
                >
                  {smtpTesting ? '发送中...' : '发送测试邮件'}
                </button>
                <button
                  type="button"
                  className="px-lg py-sm bg-primary text-on-primary rounded-lg font-label text-label-md hover:opacity-90 transition-all disabled:opacity-50"
                  disabled={smtpSaving}
                  onClick={() => void handleSaveSmtp()}
                >
                  {smtpSaving ? '保存中...' : '保存配置'}
                </button>
              </div>
            </Spin>
          </section>

          {/* ── Personal LLM ──────────────────────────────────────────────── */}
          <section className="bg-surface rounded-xl p-lg shadow-sm border border-surface-variant">
            <div className="flex items-center justify-between mb-lg flex-wrap gap-sm">
              <div>
                <h3 className="font-headline text-headline-sm text-on-surface">个人 LLM</h3>
                <p className="font-body text-body-sm text-on-surface-variant mt-xs">
                  智能体对话优先用此处配置。API Key 留空表示不修改已保存密钥。Fake 提供商可直接测连通。
                </p>
              </div>
              {llmEnabled && llmConfigured ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-sm bg-secondary/10 text-secondary font-label">
                  <span className="material-symbols-outlined text-[14px]" style={{ fontVariationSettings: "'FILL' 1" }}>
                    check_circle
                  </span>
                  已启用
                </span>
              ) : llmEnabled ? (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-sm bg-tertiary/10 text-tertiary font-label">
                  未就绪
                </span>
              ) : (
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-label-sm bg-surface-container-high text-on-surface-variant font-label">
                  未启用
                </span>
              )}
            </div>

            <Spin spinning={llmLoading}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-md">
                <div className="flex flex-col gap-xs md:col-span-2">
                  <label className="font-label text-label-md text-on-surface-variant">Provider</label>
                  <Select
                    className="w-full"
                    value={llmProvider}
                    options={llmProviderOptions}
                    onChange={onProviderChange}
                  />
                </div>
                <div className="flex flex-col gap-xs md:col-span-2">
                  <label className="font-label text-label-md text-on-surface-variant">Base URL（OpenAI 兼容 /v1）</label>
                  <Input
                    value={llmBaseUrl}
                    onChange={(e) => setLlmBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-label text-label-md text-on-surface-variant">Model</label>
                  <Input value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder="gpt-4o-mini" />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-label text-label-md text-on-surface-variant">
                    API Key
                    {llmHasKey && <span className="text-secondary ml-1">(已设置，留空保持不变)</span>}
                  </label>
                  <Input.Password
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    placeholder={llmHasKey ? '已保存，留空不修改' : 'sk-…'}
                    autoComplete="new-password"
                  />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-label text-label-md text-on-surface-variant">Temperature</label>
                  <Input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={llmTemperature}
                    onChange={(e) => setLlmTemperature(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-xs">
                  <label className="font-label text-label-md text-on-surface-variant">Max tokens</label>
                  <Input
                    type="number"
                    min={64}
                    max={32000}
                    value={llmMaxTokens}
                    onChange={(e) => setLlmMaxTokens(Number(e.target.value))}
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-lg mt-md">
                <label className="inline-flex items-center gap-sm font-label text-label-md text-on-surface cursor-pointer">
                  <Switch checked={llmEnabled} onChange={setLlmEnabled} size="small" />
                  启用个人 LLM
                </label>
                <label className="inline-flex items-center gap-sm font-label text-label-md text-on-surface cursor-pointer">
                  <Switch checked={llmUseForAgent} onChange={setLlmUseForAgent} size="small" />
                  用于智能体
                </label>
                <label className="inline-flex items-center gap-sm font-label text-label-md text-on-surface cursor-pointer">
                  <Switch checked={llmUseForJudge} onChange={setLlmUseForJudge} size="small" />
                  用于材料判定
                </label>
              </div>

              <div className="flex items-center gap-sm mt-lg justify-end flex-wrap">
                <button
                  type="button"
                  className="px-md py-sm border border-outline text-on-surface rounded-lg font-label text-label-md hover:bg-surface-container-low transition-all disabled:opacity-50"
                  disabled={llmTesting}
                  onClick={() => void handleTestLlm()}
                >
                  {llmTesting ? '测试中...' : '测试连通性'}
                </button>
                <button
                  type="button"
                  className="px-lg py-sm bg-primary text-on-primary rounded-lg font-label text-label-md hover:opacity-90 transition-all disabled:opacity-50"
                  disabled={llmSaving}
                  onClick={() => void handleSaveLlm()}
                >
                  {llmSaving ? '保存中...' : '保存配置'}
                </button>
              </div>
            </Spin>
          </section>
        </div>
      </div>
    </div>
  )
}
