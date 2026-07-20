import { useCallback, useEffect, useMemo, useState } from 'react'
import { Input, Select, Spin, Switch } from 'antd'
import { message } from '@/utils/antdMessage'
import {
  getCompany,
  getCompanyBindings,
  getCompanyFeatures,
  getCompanyLlm,
  getCompanySmtp,
  getIntegrationSchemas,
  getOrgTree,
  listIntegrations,
  patchLoginMethods,
  putAsrBinding,
  putCompanyLlm,
  putCompanySmtp,
  putIntegration,
  putStorageBinding,
  testCompanyLlm,
  testCompanySmtp,
  triggerOrgSync,
  type CompanyLlmConfig,
  type IntegrationDTO,
  type IntegrationSchema,
} from '@/api/collab'
import { getErrorMessage } from '@/api/request'
import { useCompanyContext } from '@/hooks/useCompanyContext'
import type { CompanyDTO, OrgUnitDTO } from '@/types/collab'

const LOGIN_METHOD_KEYS = ['password', 'wechat', 'wecom', 'dingtalk', 'feishu', 'oidc'] as const

const SYNCABLE_PROVIDERS = new Set(['wecom', 'dingtalk', 'feishu', 'generic_scim'])

const FALLBACK_LLM_PROVIDERS = [
  { key: 'fake', label: 'Fake（本地桩，无需密钥）' },
  { key: 'openai', label: 'OpenAI' },
  { key: 'openai_compatible', label: 'OpenAI 兼容' },
  { key: 'azure_openai', label: 'Azure OpenAI' },
  { key: 'ollama', label: 'Ollama' },
  { key: 'custom', label: '自定义' },
]

type LlmPreset = {
  label: string
  default_base_url?: string
  default_model?: string
  needs_key?: boolean
}

function emptyLogin(): Record<string, boolean> {
  return Object.fromEntries(LOGIN_METHOD_KEYS.map((k) => [k, false]))
}

export default function CompanySettingsPage() {
  const {
    companyId,
    companies,
    loading: ctxLoading,
    ensureCompanyContext,
    persist,
  } = useCompanyContext()

  const [company, setCompany] = useState<CompanyDTO | null>(null)
  const [features, setFeatures] = useState<{
    features: Record<string, boolean>
    unlocked: boolean
    status: string
  } | null>(null)
  const [bindings, setBindings] = useState<{
    storage: { provider_id: string }
    asr: { provider_id: string }
    model: { provider_id: string }
  } | null>(null)
  const [orgNodes, setOrgNodes] = useState<OrgUnitDTO[]>([])
  const [login, setLogin] = useState<Record<string, boolean>>(emptyLogin)
  const [storageProvider, setStorageProvider] = useState('local')
  const [asrProvider, setAsrProvider] = useState('builtin')
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)

  const [schemas, setSchemas] = useState<Record<string, IntegrationSchema>>({})
  const [integrations, setIntegrations] = useState<IntegrationDTO[]>([])
  const [activeProvider, setActiveProvider] = useState('wecom')
  const [credForm, setCredForm] = useState<Record<string, string>>({})
  const [configForm, setConfigForm] = useState<Record<string, string | boolean>>({})
  const [syncing, setSyncing] = useState(false)

  // ── Company SMTP ──────────────────────────────────────────────────────────
  const [smtpHost, setSmtpHost] = useState('smtp.qq.com')
  const [smtpPort, setSmtpPort] = useState(465)
  const [smtpUser, setSmtpUser] = useState('')
  const [smtpFrom, setSmtpFrom] = useState('')
  const [smtpPassword, setSmtpPassword] = useState('')
  const [smtpHasPassword, setSmtpHasPassword] = useState(false)
  const [smtpConfigured, setSmtpConfigured] = useState(false)
  const [smtpSaving, setSmtpSaving] = useState(false)
  const [smtpTesting, setSmtpTesting] = useState(false)

  // ── Company LLM ───────────────────────────────────────────────────────────
  const [llmProvider, setLlmProvider] = useState('fake')
  const [llmBaseUrl, setLlmBaseUrl] = useState('')
  const [llmModel, setLlmModel] = useState('fake')
  const [llmApiKey, setLlmApiKey] = useState('')
  const [llmTemperature, setLlmTemperature] = useState(0.2)
  const [llmMaxTokens, setLlmMaxTokens] = useState(1024)
  const [llmEnabled, setLlmEnabled] = useState(true)
  const [llmUseForJudge, setLlmUseForJudge] = useState(true)
  const [llmUseForAgent, setLlmUseForAgent] = useState(true)
  const [llmHasKey, setLlmHasKey] = useState(false)
  const [llmConfigured, setLlmConfigured] = useState(false)
  const [llmPresets, setLlmPresets] = useState<Record<string, LlmPreset>>({})
  const [llmSaving, setLlmSaving] = useState(false)
  const [llmTesting, setLlmTesting] = useState(false)

  const llmProviderOptions = useMemo(() => {
    const keys = Object.keys(llmPresets)
    if (keys.length) {
      return keys.map((key) => ({ value: key, label: llmPresets[key]?.label || key }))
    }
    return FALLBACK_LLM_PROVIDERS.map((o) => ({ value: o.key, label: o.label }))
  }, [llmPresets])

  const providerTabs = useMemo(
    () => Object.entries(schemas).map(([key, s]) => ({ key, label: s.label || key })),
    [schemas],
  )

  const activeSchema = schemas[activeProvider] || null

  const resetIntegrationForms = useCallback(
    (
      provider: string,
      nextSchemas: Record<string, IntegrationSchema>,
      nextIntegrations: IntegrationDTO[],
    ) => {
      const sch = nextSchemas[provider]
      const existing = nextIntegrations.find((i) => i.provider === provider)
      const nextCred: Record<string, string> = {}
      const nextCfg: Record<string, string | boolean> = {}
      if (sch) {
        for (const f of sch.credential_fields || []) {
          const v = existing?.credentials?.[f.key]
          if (f.secret) {
            nextCred[f.key] =
              existing?.credentials?.[`${f.key}_configured`] || (v && v !== '')
                ? '********'
                : ''
          } else {
            nextCred[f.key] = v != null && v !== '********' ? String(v) : ''
          }
        }
        for (const f of sch.config_fields || []) {
          const raw = existing?.config?.[f.key]
          if (f.type === 'boolean') {
            nextCfg[f.key] = Boolean(raw)
          } else if (f.type === 'json') {
            nextCfg[f.key] =
              raw != null ? (typeof raw === 'string' ? raw : JSON.stringify(raw, null, 2)) : ''
          } else {
            nextCfg[f.key] = raw != null ? String(raw) : ''
          }
        }
      }
      setCredForm(nextCred)
      setConfigForm(nextCfg)
    },
    [],
  )

  const load = useCallback(
    async (cid: number) => {
      if (!cid || cid <= 0) {
        setCompany(null)
        if (!ctxLoading) {
          message.warning('尚未加入公司，或请从下方选择公司')
        }
        return
      }
      setLoading(true)
      try {
        persist(cid)
        const c = await getCompany(cid)
        setCompany(c)
        setLogin({ ...emptyLogin(), ...(c.login_methods || {}) })

        try {
          setFeatures(await getCompanyFeatures(cid))
        } catch {
          setFeatures(null)
        }

        try {
          const b = await getCompanyBindings(cid)
          setBindings(b)
          setStorageProvider(b.storage?.provider_id || 'local')
          setAsrProvider(b.asr?.provider_id || 'builtin')
        } catch {
          setBindings(null)
        }

        try {
          const tree = await getOrgTree(cid)
          setOrgNodes(tree.nodes || [])
        } catch {
          setOrgNodes([])
        }

        // 集成配置接口仅超管可读，非超管不请求（避免必然的 403）
        if (c.my_membership?.is_super_admin) {
          try {
            const sch = await getIntegrationSchemas(cid)
            const nextSchemas = sch.providers || {}
            const list = await listIntegrations(cid)
            const nextIntegrations = list.items || []
            setSchemas(nextSchemas)
            setIntegrations(nextIntegrations)
            let nextProvider = activeProvider
            if (!nextSchemas[nextProvider]) {
              nextProvider = Object.keys(nextSchemas)[0] || 'wecom'
              setActiveProvider(nextProvider)
            }
            resetIntegrationForms(nextProvider, nextSchemas, nextIntegrations)
          } catch {
            setSchemas({})
            setIntegrations([])
          }
        } else {
          setSchemas({})
          setIntegrations([])
        }

        try {
          const smtp = await getCompanySmtp(cid)
          setSmtpHost(smtp.smtp_host || 'smtp.qq.com')
          setSmtpPort(smtp.smtp_port || 465)
          setSmtpUser(smtp.smtp_user || '')
          setSmtpFrom(smtp.smtp_from || '')
          setSmtpPassword('')
          setSmtpHasPassword(!!smtp.has_password)
          setSmtpConfigured(
            !!(smtp.configured || (smtp.has_password && smtp.smtp_host && smtp.smtp_user)),
          )
        } catch {
          setSmtpConfigured(false)
          setSmtpHasPassword(false)
        }

        try {
          const llm: CompanyLlmConfig = await getCompanyLlm(cid)
          setLlmProvider(llm.provider || 'fake')
          setLlmBaseUrl(llm.base_url || '')
          setLlmModel(llm.model || '')
          setLlmTemperature(llm.temperature ?? 0.2)
          setLlmMaxTokens(llm.max_tokens ?? 1024)
          setLlmEnabled(llm.enabled !== false)
          setLlmUseForJudge(llm.use_for_judge !== false)
          setLlmUseForAgent(llm.use_for_agent !== false)
          setLlmApiKey('')
          setLlmHasKey(!!llm.has_api_key)
          setLlmConfigured(!!llm.configured)
          setLlmPresets(llm.presets || {})
        } catch {
          setLlmConfigured(false)
          setLlmHasKey(false)
        }
      } catch (e) {
        message.error(getErrorMessage(e, '加载公司失败'))
      } finally {
        setLoading(false)
      }
    },
    [activeProvider, ctxLoading, persist, resetIntegrationForms],
  )

  useEffect(() => {
    void (async () => {
      const id = await ensureCompanyContext()
      await load(id)
    })()
    // Mount bootstrap only; company changes go through onCompanyChange / refresh.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onCompanyChange(nextId: number) {
    persist(nextId)
    void load(nextId)
  }

  function selectProvider(p: string) {
    setActiveProvider(p)
    resetIntegrationForms(p, schemas, integrations)
  }

  function onLlmProviderChange(value: string) {
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

  async function saveSmtp() {
    if (!companyId) return
    setSmtpSaving(true)
    try {
      const body: {
        smtp_host: string
        smtp_port: number
        smtp_user: string
        smtp_from: string
        smtp_password?: string
      } = {
        smtp_host: smtpHost,
        smtp_port: Number(smtpPort) || 465,
        smtp_user: smtpUser,
        smtp_from: smtpFrom,
      }
      // Empty secret = do not overwrite
      if (smtpPassword.trim()) {
        body.smtp_password = smtpPassword
      }
      const r = await putCompanySmtp(companyId, body)
      setSmtpHasPassword(!!r.has_password)
      setSmtpConfigured(!!(r.configured || r.has_password))
      setSmtpPassword('')
      message.success('公司 SMTP 已保存（密码加密存储）')
    } catch (e) {
      message.error(getErrorMessage(e, '保存 SMTP 失败（需超管）'))
    } finally {
      setSmtpSaving(false)
    }
  }

  async function sendSmtpTest() {
    if (!companyId) return
    setSmtpTesting(true)
    try {
      await testCompanySmtp(companyId)
      message.success('测试邮件已发送，请查收')
    } catch (e) {
      message.error(getErrorMessage(e, '测试发送失败'))
    } finally {
      setSmtpTesting(false)
    }
  }

  async function saveLlm() {
    if (!companyId) return
    setLlmSaving(true)
    try {
      const body: Parameters<typeof putCompanyLlm>[1] = {
        provider: llmProvider,
        base_url: llmBaseUrl,
        model: llmModel,
        temperature: Number(llmTemperature),
        max_tokens: Number(llmMaxTokens),
        enabled: llmEnabled,
        use_for_judge: llmUseForJudge,
        use_for_agent: llmUseForAgent,
      }
      if (llmApiKey.trim()) {
        body.api_key = llmApiKey
      }
      const r = await putCompanyLlm(companyId, body)
      setLlmHasKey(!!r.has_api_key)
      setLlmConfigured(!!r.configured)
      setLlmApiKey('')
      if (r.presets) setLlmPresets(r.presets)
      message.success('公司 LLM 已保存（密钥加密存储）')
    } catch (e) {
      message.error(getErrorMessage(e, '保存 LLM 失败（需超管）'))
    } finally {
      setLlmSaving(false)
    }
  }

  async function sendLlmTest() {
    if (!companyId) return
    setLlmTesting(true)
    try {
      const r = await testCompanyLlm(companyId)
      const snippet = r?.content ? String(r.content).slice(0, 120) : ''
      message.success(snippet ? `连通成功：${snippet}` : 'LLM 连通性测试成功')
    } catch (e) {
      message.error(getErrorMessage(e, 'LLM 测试失败'))
    } finally {
      setLlmTesting(false)
    }
  }

  async function saveLogin() {
    if (!companyId) return
    setSaving(true)
    try {
      const next = await patchLoginMethods(companyId, login)
      setLogin({ ...emptyLogin(), ...next })
      message.success('登录方式已更新')
    } catch (e) {
      message.error(getErrorMessage(e, '保存失败（需超管）'))
    } finally {
      setSaving(false)
    }
  }

  async function saveBindings() {
    if (!companyId) return
    setSaving(true)
    try {
      await putStorageBinding(companyId, { provider_id: storageProvider })
      await putAsrBinding(companyId, { provider_id: asrProvider })
      message.success('绑定已保存')
      await load(companyId)
    } catch (e) {
      message.error(getErrorMessage(e, '保存绑定失败（需超管）'))
    } finally {
      setSaving(false)
    }
  }

  async function saveIntegration() {
    if (!companyId || !activeProvider) return
    setSaving(true)
    try {
      const sch = activeSchema
      const credentials: Record<string, unknown> = { ...credForm }
      const config: Record<string, unknown> = {}
      for (const f of sch?.config_fields || []) {
        let v: unknown = configForm[f.key]
        if (f.type === 'json' && typeof v === 'string' && v.trim()) {
          try {
            v = JSON.parse(v)
          } catch {
            message.error(`${f.label} 不是合法 JSON`)
            setSaving(false)
            return
          }
        }
        config[f.key] = v
      }
      await putIntegration(companyId, activeProvider, {
        provider: activeProvider,
        credentials,
        config,
      })
      message.success('集成配置已保存（密钥已加密）')
      await load(companyId)
    } catch (e) {
      message.error(getErrorMessage(e, '保存集成失败（需超管）'))
    } finally {
      setSaving(false)
    }
  }

  async function runSync() {
    if (!companyId) return
    if (!SYNCABLE_PROVIDERS.has(activeProvider)) {
      message.warning('当前类型不支持组织同步（OIDC 仅登录）')
      return
    }
    setSyncing(true)
    try {
      const r = await triggerOrgSync(companyId, activeProvider)
      message.success(
        `同步完成：部门 ${r.report?.dept_upserted ?? 0} · 匹配用户 ${r.report?.users_matched ?? 0}`,
      )
      await load(companyId)
    } catch (e) {
      message.error(getErrorMessage(e, '同步失败'))
    } finally {
      setSyncing(false)
    }
  }

  const busy = loading || ctxLoading

  return (
    <div className="flex-1 overflow-y-auto p-md md:p-lg">
      <div className="max-w-3xl mx-auto space-y-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <h1 className="font-headline text-headline-lg text-on-surface">公司设置</h1>
            <p className="font-body text-body-sm text-on-surface-variant mt-1">
              策略 · 登录 · 企微/OIDC 集成 · 存储 · 组织
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <label className="text-on-surface-variant">当前公司</label>
            {companies.length ? (
              <select
                value={companyId || ''}
                className="min-w-[12rem] border border-surface-variant rounded-lg px-2 py-1.5 bg-surface"
                onChange={(e) => onCompanyChange(Number(e.target.value))}
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（#{c.id}）
                  </option>
                ))}
              </select>
            ) : !ctxLoading ? (
              <span className="text-on-surface-variant">无所属公司</span>
            ) : null}
            <button
              type="button"
              className="text-primary underline"
              onClick={() =>
                void ensureCompanyContext(true).then((id) => load(id || companyId))
              }
            >
              刷新
            </button>
          </div>
        </div>

        {busy ? (
          <div className="py-12 flex flex-col items-center gap-sm">
            <Spin />
            <span className="text-sm text-on-surface-variant">加载中…</span>
          </div>
        ) : (
          <>
            {/* 基本信息 */}
            <section className="p-4 rounded-2xl border border-surface-variant bg-surface space-y-2">
              <h2 className="font-semibold text-on-surface">基本信息</h2>
              <p className="text-sm text-on-surface">
                {company?.name}
                {company?.slug ? `（${company.slug}）` : ''}
              </p>
              <p className="text-sm text-on-surface">
                状态：
                <span className="font-medium">
                  {company?.status || features?.status || '-'}
                </span>
                {' · 预设 '}
                {company?.policy_preset || '-'}
              </p>
              <p className="text-xs text-on-surface-variant">
                License 解锁：{features?.unlocked ? '是' : '否'}
              </p>
            </section>

            {/* 公司 SMTP */}
            <section className="p-4 rounded-2xl border border-surface-variant bg-surface space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-on-surface">公司 SMTP（含密码）</h2>
                  <p className="text-xs text-on-surface-variant mt-1">
                    欢迎信、协作通知优先用此处配置；密码加密存储，接口永不回显明文。优先级：个人设置
                    SMTP → 公司 SMTP → 服务器环境变量。
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                    smtpConfigured
                      ? 'bg-green-100 text-green-800'
                      : 'bg-surface-variant text-on-surface-variant'
                  }`}
                >
                  {smtpConfigured ? '已配置' : '未配置'}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="flex flex-col gap-1">
                  <label className="text-on-surface-variant text-xs">SMTP 主机</label>
                  <Input
                    value={smtpHost}
                    onChange={(e) => setSmtpHost(e.target.value)}
                    placeholder="smtp.qq.com"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-on-surface-variant text-xs">端口</label>
                  <Input
                    type="number"
                    value={smtpPort}
                    onChange={(e) => setSmtpPort(Number(e.target.value) || 0)}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-on-surface-variant text-xs">账号</label>
                  <Input
                    value={smtpUser}
                    onChange={(e) => setSmtpUser(e.target.value)}
                    placeholder="notify@example.com"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-on-surface-variant text-xs">发件人 From</label>
                  <Input
                    value={smtpFrom}
                    onChange={(e) => setSmtpFrom(e.target.value)}
                    placeholder="可选，默认同账号"
                  />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-on-surface-variant text-xs">
                    密码 / 授权码
                    {smtpHasPassword ? '（已保存，留空不修改）' : ''}
                  </label>
                  <Input.Password
                    value={smtpPassword}
                    onChange={(e) => setSmtpPassword(e.target.value)}
                    autoComplete="new-password"
                    placeholder={smtpHasPassword ? '已保存，留空不修改' : 'QQ邮箱授权码等'}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-xl bg-primary text-white text-sm disabled:opacity-50"
                  disabled={smtpSaving || !companyId}
                  onClick={() => void saveSmtp()}
                >
                  {smtpSaving ? '保存中…' : '保存公司 SMTP'}
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-xl border border-surface-variant text-sm disabled:opacity-50"
                  disabled={smtpTesting || !smtpConfigured || !companyId}
                  onClick={() => void sendSmtpTest()}
                >
                  {smtpTesting ? '发送中…' : '发测试邮件'}
                </button>
              </div>
            </section>

            {/* 公司 LLM */}
            <section className="p-4 rounded-2xl border border-surface-variant bg-surface space-y-3">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h2 className="font-semibold text-on-surface">公司 LLM</h2>
                  <p className="text-xs text-on-surface-variant mt-1">
                    可随时切换 OpenAI / 兼容接口 / Ollama / Fake。API Key 加密存储，接口不回显。用于智能体对话与材料判定（可分别开关）。
                  </p>
                </div>
                <span
                  className={`text-xs px-2 py-1 rounded-full shrink-0 ${
                    llmConfigured && llmEnabled
                      ? 'bg-green-100 text-green-800'
                      : 'bg-surface-variant text-on-surface-variant'
                  }`}
                >
                  {llmEnabled ? (llmConfigured ? '已启用' : '未就绪') : '已禁用'}
                </span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 text-sm">
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-on-surface-variant text-xs">Provider</label>
                  <Select
                    className="w-full"
                    value={llmProvider}
                    options={llmProviderOptions}
                    onChange={onLlmProviderChange}
                  />
                </div>
                <div className="flex flex-col gap-1 sm:col-span-2">
                  <label className="text-on-surface-variant text-xs">Base URL（OpenAI 兼容 /v1）</label>
                  <Input
                    value={llmBaseUrl}
                    onChange={(e) => setLlmBaseUrl(e.target.value)}
                    placeholder="https://api.openai.com/v1"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-on-surface-variant text-xs">Model</label>
                  <Input
                    value={llmModel}
                    onChange={(e) => setLlmModel(e.target.value)}
                    placeholder="gpt-4o-mini"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-on-surface-variant text-xs">
                    API Key
                    {llmHasKey ? '（已保存，留空不修改）' : ''}
                  </label>
                  <Input.Password
                    value={llmApiKey}
                    onChange={(e) => setLlmApiKey(e.target.value)}
                    autoComplete="new-password"
                    placeholder={llmHasKey ? '已保存，留空不修改' : 'sk-…'}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-on-surface-variant text-xs">Temperature</label>
                  <Input
                    type="number"
                    min={0}
                    max={2}
                    step={0.1}
                    value={llmTemperature}
                    onChange={(e) => setLlmTemperature(Number(e.target.value))}
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-on-surface-variant text-xs">Max tokens</label>
                  <Input
                    type="number"
                    min={64}
                    max={32000}
                    value={llmMaxTokens}
                    onChange={(e) => setLlmMaxTokens(Number(e.target.value))}
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <Switch checked={llmEnabled} onChange={setLlmEnabled} size="small" />
                  启用
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <Switch checked={llmUseForAgent} onChange={setLlmUseForAgent} size="small" />
                  用于智能体
                </label>
                <label className="inline-flex items-center gap-2 cursor-pointer">
                  <Switch checked={llmUseForJudge} onChange={setLlmUseForJudge} size="small" />
                  用于材料判定
                </label>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-xl bg-primary text-white text-sm disabled:opacity-50"
                  disabled={llmSaving || !companyId}
                  onClick={() => void saveLlm()}
                >
                  {llmSaving ? '保存中…' : '保存公司 LLM'}
                </button>
                <button
                  type="button"
                  className="px-3 py-1.5 rounded-xl border border-surface-variant text-sm disabled:opacity-50"
                  disabled={llmTesting || !llmEnabled || !companyId}
                  onClick={() => void sendLlmTest()}
                >
                  {llmTesting ? '测试中…' : '连通性测试'}
                </button>
              </div>
            </section>

            {/* 登录方式 */}
            <section className="p-4 rounded-2xl border border-surface-variant bg-surface space-y-3">
              <h2 className="font-semibold text-on-surface">登录方式</h2>
              <p className="text-xs text-on-surface-variant">
                内测可先只开 password；企微/OIDC 配好域名与密钥后再打开对应开关。
              </p>
              <div className="flex flex-wrap gap-4 text-sm">
                {LOGIN_METHOD_KEYS.map((k) => (
                  <label key={k} className="flex items-center gap-1 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!login[k]}
                      onChange={(e) => setLogin((prev) => ({ ...prev, [k]: e.target.checked }))}
                    />
                    {k}
                  </label>
                ))}
              </div>
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl bg-primary text-white text-sm disabled:opacity-50"
                disabled={saving || !companyId}
                onClick={() => void saveLogin()}
              >
                保存登录开关
              </button>
            </section>

            {/* 企业集成 */}
            <section className="p-4 rounded-2xl border border-surface-variant bg-surface space-y-4">
              <div>
                <h2 className="font-semibold text-on-surface">企业集成（前端可配置）</h2>
                <p className="text-xs text-on-surface-variant mt-1">
                  域名、回调 URL、corpId/Secret 等保存在服务端加密库中；当前没有企微资质时可先空着，以后在管理后台直接填写，无需改代码发版。
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                {providerTabs.map((t) => (
                  <button
                    key={t.key}
                    type="button"
                    className={`px-3 py-1 rounded-full text-sm border ${
                      activeProvider === t.key
                        ? 'bg-primary text-white border-primary'
                        : 'bg-surface border-surface-variant'
                    }`}
                    onClick={() => selectProvider(t.key)}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {activeSchema ? (
                <div className="space-y-3">
                  {activeSchema.note ? (
                    <p className="text-xs text-on-surface-variant">{activeSchema.note}</p>
                  ) : null}

                  {(activeSchema.credential_fields?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-on-surface">凭证</h3>
                      {activeSchema.credential_fields.map((f) => (
                        <div
                          key={`c-${f.key}`}
                          className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-3 items-center text-sm"
                        >
                          <label className="text-on-surface-variant">{f.label}</label>
                          {f.secret ? (
                            <Input.Password
                              value={credForm[f.key] || ''}
                              onChange={(e) =>
                                setCredForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                              }
                              autoComplete="off"
                              placeholder="已配置则显示 ********，留空/占位不覆盖"
                            />
                          ) : (
                            <Input
                              value={credForm[f.key] || ''}
                              onChange={(e) =>
                                setCredForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                              }
                              autoComplete="off"
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  {(activeSchema.config_fields?.length ?? 0) > 0 && (
                    <div className="space-y-2">
                      <h3 className="text-sm font-medium text-on-surface">配置（域名 / 回调等）</h3>
                      {activeSchema.config_fields.map((f) => (
                        <div
                          key={`cfg-${f.key}`}
                          className="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-3 items-start text-sm"
                        >
                          <label className="text-on-surface-variant pt-1.5">{f.label}</label>
                          {f.type === 'boolean' ? (
                            <label className="flex items-center gap-2 py-1.5 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={!!configForm[f.key]}
                                onChange={(e) =>
                                  setConfigForm((prev) => ({
                                    ...prev,
                                    [f.key]: e.target.checked,
                                  }))
                                }
                              />
                              启用
                            </label>
                          ) : f.type === 'json' ? (
                            <Input.TextArea
                              rows={4}
                              className="font-mono text-xs"
                              value={String(configForm[f.key] ?? '')}
                              onChange={(e) =>
                                setConfigForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                              }
                              placeholder={f.placeholder || ''}
                            />
                          ) : (
                            <Input
                              value={String(configForm[f.key] ?? '')}
                              onChange={(e) =>
                                setConfigForm((prev) => ({ ...prev, [f.key]: e.target.value }))
                              }
                              placeholder={f.placeholder || ''}
                            />
                          )}
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-xl bg-primary text-white text-sm disabled:opacity-50"
                      disabled={saving || !companyId}
                      onClick={() => void saveIntegration()}
                    >
                      保存 {activeSchema.label} 配置
                    </button>
                    {SYNCABLE_PROVIDERS.has(activeProvider) && (
                      <button
                        type="button"
                        className="px-3 py-1.5 rounded-xl border border-primary text-primary text-sm disabled:opacity-50"
                        disabled={syncing || !companyId}
                        onClick={() => void runSync()}
                      >
                        {syncing ? '同步中…' : '立即组织同步'}
                      </button>
                    )}
                  </div>

                  {integrations.find((i) => i.provider === activeProvider) && (
                    <p className="text-xs text-on-surface-variant">
                      已保存 · 上次同步：
                      {integrations.find((i) => i.provider === activeProvider)?.last_sync_at ||
                        '从未'}
                    </p>
                  )}
                </div>
              ) : (
                <div className="text-sm text-on-surface-variant">无表单 schema（需超管权限）</div>
              )}
            </section>

            {/* 存储 / ASR */}
            <section className="p-4 rounded-2xl border border-surface-variant bg-surface space-y-3">
              <h2 className="font-semibold text-on-surface">存储 / ASR 绑定</h2>
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-1">
                  存储
                  <select
                    value={storageProvider}
                    className="ml-1 border border-surface-variant rounded px-2 py-1 bg-surface"
                    onChange={(e) => setStorageProvider(e.target.value)}
                  >
                    <option value="local">local</option>
                    <option value="s3">s3</option>
                    <option value="customer">customer</option>
                  </select>
                </label>
                <label className="flex items-center gap-1">
                  ASR
                  <select
                    value={asrProvider}
                    className="ml-1 border border-surface-variant rounded px-2 py-1 bg-surface"
                    onChange={(e) => setAsrProvider(e.target.value)}
                  >
                    <option value="builtin">builtin</option>
                    <option value="cloud:default">cloud:default</option>
                    <option value="customer">customer</option>
                  </select>
                </label>
              </div>
              <p className="text-xs text-on-surface-variant">
                当前：存储 {bindings?.storage?.provider_id || 'local'} · ASR{' '}
                {bindings?.asr?.provider_id || 'builtin'}
              </p>
              <button
                type="button"
                className="px-3 py-1.5 rounded-xl bg-primary text-white text-sm disabled:opacity-50"
                disabled={saving || !companyId}
                onClick={() => void saveBindings()}
              >
                保存绑定
              </button>
            </section>

            {/* 组织树 */}
            <section className="p-4 rounded-2xl border border-surface-variant bg-surface">
              <h2 className="font-semibold text-on-surface mb-2">组织树</h2>
              {!orgNodes.length ? (
                <div className="text-sm text-on-surface-variant">
                  暂无部门（保存企微/快照后点「立即组织同步」）
                </div>
              ) : (
                <ul className="text-sm space-y-1">
                  {orgNodes.map((n) => (
                    <li key={n.id} className="text-on-surface">
                      {n.path || ''} {n.name}{' '}
                      <span className="text-xs text-on-surface-variant">{n.source}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </div>
    </div>
  )
}
