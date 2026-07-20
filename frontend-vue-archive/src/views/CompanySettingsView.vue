<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { ElMessage } from 'element-plus'
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
import { useCompanyContext } from '@/composables/useCompanyContext'
import type { CompanyDTO, OrgUnitDTO } from '@/types/collab'

const {
  companyId,
  companies,
  loading: ctxLoading,
  ensureCompanyContext,
  persist,
} = useCompanyContext()

const company = ref<CompanyDTO | null>(null)
const features = ref<{ features: Record<string, boolean>; unlocked: boolean; status: string } | null>(null)
const bindings = ref<{ storage: { provider_id: string }; asr: { provider_id: string }; model: { provider_id: string } } | null>(null)
const orgNodes = ref<OrgUnitDTO[]>([])
const login = ref<Record<string, boolean>>({})
const storageProvider = ref('local')
const asrProvider = ref('builtin')
const loading = ref(false)
const saving = ref(false)

const schemas = ref<Record<string, IntegrationSchema>>({})
const integrations = ref<IntegrationDTO[]>([])
const activeProvider = ref('wecom')
const credForm = ref<Record<string, string>>({})
const configForm = ref<Record<string, string | boolean>>({})
const syncing = ref(false)

/** 公司 SMTP（含密码，前端可配；密码不回显） */
const smtpForm = ref({
  smtp_host: 'smtp.qq.com',
  smtp_port: 465,
  smtp_user: '',
  smtp_password: '',
  smtp_from: '',
})
const smtpHasPassword = ref(false)
const smtpConfigured = ref(false)
const smtpSaving = ref(false)
const smtpTesting = ref(false)

/** 公司 LLM（含 API Key，前端可改） */
const llmForm = ref({
  provider: 'fake',
  base_url: '',
  model: 'fake',
  api_key: '',
  temperature: 0.2,
  max_tokens: 1024,
  enabled: true,
  use_for_judge: true,
  use_for_agent: true,
})
const llmPresets = ref<
  Record<string, { label: string; default_base_url?: string; default_model?: string; needs_key?: boolean }>
>({})
const llmHasKey = ref(false)
const llmConfigured = ref(false)
const llmSaving = ref(false)
const llmTesting = ref(false)

const llmProviderOptions = computed(() => {
  const p = llmPresets.value
  const keys = Object.keys(p).length
    ? Object.keys(p)
    : ['fake', 'openai', 'openai_compatible', 'azure_openai', 'ollama', 'custom']
  return keys.map((k) => ({
    key: k,
    label: p[k]?.label || k,
  }))
})

function onLlmProviderChange() {
  const preset = llmPresets.value[llmForm.value.provider]
  if (!preset) return
  if (preset.default_base_url !== undefined) {
    llmForm.value.base_url = preset.default_base_url || ''
  }
  if (preset.default_model !== undefined) {
    llmForm.value.model = preset.default_model || ''
  }
}

const providerTabs = computed(() =>
  Object.entries(schemas.value).map(([key, s]) => ({ key, label: s.label || key })),
)

const activeSchema = computed(() => schemas.value[activeProvider.value] || null)

function resetIntegrationForms(provider: string) {
  const sch = schemas.value[provider]
  const existing = integrations.value.find((i) => i.provider === provider)
  const nextCred: Record<string, string> = {}
  const nextCfg: Record<string, string | boolean> = {}
  if (sch) {
    for (const f of sch.credential_fields || []) {
      const v = existing?.credentials?.[f.key]
      // secret 已配置显示占位，未配置空
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
  credForm.value = nextCred
  configForm.value = nextCfg
}

function selectProvider(p: string) {
  activeProvider.value = p
  resetIntegrationForms(p)
}

async function load() {
  if (!companyId.value || companyId.value <= 0) {
    company.value = null
    if (!ctxLoading.value) {
      ElMessage.warning('尚未加入公司，或请从下方选择公司')
    }
    return
  }
  loading.value = true
  try {
    persist(companyId.value)
    company.value = await getCompany(companyId.value)
    login.value = { ...(company.value.login_methods || {}) }
    try {
      features.value = await getCompanyFeatures(companyId.value)
    } catch {
      features.value = null
    }
    try {
      bindings.value = await getCompanyBindings(companyId.value)
      storageProvider.value = bindings.value.storage?.provider_id || 'local'
      asrProvider.value = bindings.value.asr?.provider_id || 'builtin'
    } catch {
      bindings.value = null
    }
    try {
      const tree = await getOrgTree(companyId.value)
      orgNodes.value = tree.nodes || []
    } catch {
      orgNodes.value = []
    }
    try {
      const sch = await getIntegrationSchemas(companyId.value)
      schemas.value = sch.providers || {}
      const list = await listIntegrations(companyId.value)
      integrations.value = list.items || []
      if (!schemas.value[activeProvider.value]) {
        activeProvider.value = Object.keys(schemas.value)[0] || 'wecom'
      }
      resetIntegrationForms(activeProvider.value)
    } catch {
      schemas.value = {}
      integrations.value = []
    }
    try {
      const smtp = await getCompanySmtp(companyId.value)
      smtpForm.value.smtp_host = smtp.smtp_host || 'smtp.qq.com'
      smtpForm.value.smtp_port = smtp.smtp_port || 465
      smtpForm.value.smtp_user = smtp.smtp_user || ''
      smtpForm.value.smtp_from = smtp.smtp_from || ''
      smtpForm.value.smtp_password = ''
      smtpHasPassword.value = !!smtp.has_password
      smtpConfigured.value = !!(smtp.configured || (smtp.has_password && smtp.smtp_host && smtp.smtp_user))
    } catch {
      smtpConfigured.value = false
      smtpHasPassword.value = false
    }
    try {
      const llm: CompanyLlmConfig = await getCompanyLlm(companyId.value)
      llmForm.value.provider = llm.provider || 'fake'
      llmForm.value.base_url = llm.base_url || ''
      llmForm.value.model = llm.model || ''
      llmForm.value.temperature = llm.temperature ?? 0.2
      llmForm.value.max_tokens = llm.max_tokens ?? 1024
      llmForm.value.enabled = llm.enabled !== false
      llmForm.value.use_for_judge = llm.use_for_judge !== false
      llmForm.value.use_for_agent = llm.use_for_agent !== false
      llmForm.value.api_key = ''
      llmHasKey.value = !!llm.has_api_key
      llmConfigured.value = !!llm.configured
      llmPresets.value = llm.presets || {}
    } catch {
      llmConfigured.value = false
      llmHasKey.value = false
    }
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '加载公司失败'))
  } finally {
    loading.value = false
  }
}

async function saveSmtp() {
  if (!companyId.value) return
  smtpSaving.value = true
  try {
    const body: {
      smtp_host: string
      smtp_port: number
      smtp_user: string
      smtp_from: string
      smtp_password?: string
    } = {
      smtp_host: smtpForm.value.smtp_host,
      smtp_port: smtpForm.value.smtp_port,
      smtp_user: smtpForm.value.smtp_user,
      smtp_from: smtpForm.value.smtp_from,
    }
    if (smtpForm.value.smtp_password) {
      body.smtp_password = smtpForm.value.smtp_password
    }
    const r = await putCompanySmtp(companyId.value, body)
    smtpHasPassword.value = !!r.has_password
    smtpConfigured.value = !!(r.configured || r.has_password)
    smtpForm.value.smtp_password = ''
    ElMessage.success('公司 SMTP 已保存（密码加密存储）')
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '保存 SMTP 失败（需超管）'))
  } finally {
    smtpSaving.value = false
  }
}

async function sendSmtpTest() {
  if (!companyId.value) return
  smtpTesting.value = true
  try {
    await testCompanySmtp(companyId.value)
    ElMessage.success('测试邮件已发送，请查收')
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '测试发送失败'))
  } finally {
    smtpTesting.value = false
  }
}

async function saveLlm() {
  if (!companyId.value) return
  llmSaving.value = true
  try {
    const body: Parameters<typeof putCompanyLlm>[1] = {
      provider: llmForm.value.provider,
      base_url: llmForm.value.base_url,
      model: llmForm.value.model,
      temperature: llmForm.value.temperature,
      max_tokens: llmForm.value.max_tokens,
      enabled: llmForm.value.enabled,
      use_for_judge: llmForm.value.use_for_judge,
      use_for_agent: llmForm.value.use_for_agent,
    }
    if (llmForm.value.api_key) {
      body.api_key = llmForm.value.api_key
    }
    const r = await putCompanyLlm(companyId.value, body)
    llmHasKey.value = !!r.has_api_key
    llmConfigured.value = !!r.configured
    llmForm.value.api_key = ''
    if (r.presets) llmPresets.value = r.presets
    ElMessage.success('公司 LLM 已保存（密钥加密存储）')
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '保存 LLM 失败（需超管）'))
  } finally {
    llmSaving.value = false
  }
}

async function sendLlmTest() {
  if (!companyId.value) return
  llmTesting.value = true
  try {
    const r = await testCompanyLlm(companyId.value)
    const snippet = r?.content ? String(r.content).slice(0, 120) : ''
    ElMessage.success(snippet ? `连通成功：${snippet}` : 'LLM 连通性测试成功')
  } catch (e) {
    ElMessage.error(getErrorMessage(e, 'LLM 测试失败'))
  } finally {
    llmTesting.value = false
  }
}

async function saveLogin() {
  saving.value = true
  try {
    login.value = await patchLoginMethods(companyId.value, login.value)
    ElMessage.success('登录方式已更新')
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '保存失败（需超管）'))
  } finally {
    saving.value = false
  }
}

async function saveBindings() {
  saving.value = true
  try {
    await putStorageBinding(companyId.value, { provider_id: storageProvider.value })
    await putAsrBinding(companyId.value, { provider_id: asrProvider.value })
    ElMessage.success('绑定已保存')
    await load()
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '保存绑定失败（需超管）'))
  } finally {
    saving.value = false
  }
}

async function saveIntegration() {
  if (!activeProvider.value) return
  saving.value = true
  try {
    const sch = activeSchema.value
    const credentials: Record<string, unknown> = { ...credForm.value }
    const config: Record<string, unknown> = {}
    for (const f of sch?.config_fields || []) {
      let v = configForm.value[f.key]
      if (f.type === 'json' && typeof v === 'string' && v.trim()) {
        try {
          v = JSON.parse(v) as unknown as string
        } catch {
          ElMessage.error(`${f.label} 不是合法 JSON`)
          saving.value = false
          return
        }
      }
      config[f.key] = v
    }
    await putIntegration(companyId.value, activeProvider.value, {
      provider: activeProvider.value,
      credentials,
      config,
    })
    ElMessage.success('集成配置已保存（密钥已加密）')
    await load()
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '保存集成失败（需超管）'))
  } finally {
    saving.value = false
  }
}

async function runSync() {
  if (!['wecom', 'dingtalk', 'feishu', 'generic_scim'].includes(activeProvider.value)) {
    ElMessage.warning('当前类型不支持组织同步（OIDC 仅登录）')
    return
  }
  syncing.value = true
  try {
    const r = await triggerOrgSync(companyId.value, activeProvider.value)
    ElMessage.success(
      `同步完成：部门 ${r.report?.dept_upserted ?? 0} · 匹配用户 ${r.report?.users_matched ?? 0}`,
    )
    await load()
  } catch (e) {
    ElMessage.error(getErrorMessage(e, '同步失败'))
  } finally {
    syncing.value = false
  }
}

function onCompanyChange() {
  persist(companyId.value)
  load()
}

onMounted(async () => {
  await ensureCompanyContext()
  await load()
})
</script>

<template>
  <div class="p-6 max-w-3xl mx-auto space-y-6">
    <div class="flex items-center justify-between flex-wrap gap-3">
      <div>
        <h1 class="text-2xl font-bold">公司设置</h1>
        <p class="text-sm text-on-surface-variant mt-1">策略 · 登录 · 企微/OIDC 集成 · 存储 · 组织</p>
      </div>
      <div class="flex items-center gap-2 text-sm">
        <label class="text-on-surface-variant">当前公司</label>
        <select
          v-if="companies.length"
          v-model.number="companyId"
          class="min-w-[12rem] border rounded-lg px-2 py-1.5 bg-surface"
          @change="onCompanyChange"
        >
          <option v-for="c in companies" :key="c.id" :value="c.id">
            {{ c.name }}（#{{ c.id }}）
          </option>
        </select>
        <span v-else-if="!ctxLoading" class="text-on-surface-variant">无所属公司</span>
        <button
          class="text-primary underline"
          @click="ensureCompanyContext(true).then(load)"
        >
          刷新
        </button>
      </div>
    </div>

    <div v-if="loading || ctxLoading" class="text-on-surface-variant">加载中…</div>

    <template v-else>
      <section class="p-4 rounded-2xl border border-surface-variant bg-surface space-y-2">
        <h2 class="font-semibold">基本信息</h2>
        <p class="text-sm">{{ company?.name }}（{{ company?.slug }}）</p>
        <p class="text-sm">
          状态：
          <span class="font-medium">{{ company?.status || features?.status || '-' }}</span>
          · 预设 {{ company?.policy_preset || '-' }}
        </p>
        <p class="text-xs text-on-surface-variant">
          License 解锁：{{ features?.unlocked ? '是' : '否' }}
        </p>
      </section>

      <section class="p-4 rounded-2xl border border-surface-variant bg-surface space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold">公司 SMTP（含密码）</h2>
            <p class="text-xs text-on-surface-variant mt-1">
              欢迎信、协作通知优先用此处配置；密码加密存储，接口永不回显明文。
              优先级：个人设置 SMTP → 公司 SMTP → 服务器环境变量。
            </p>
          </div>
          <span
            class="text-xs px-2 py-1 rounded-full shrink-0"
            :class="smtpConfigured ? 'bg-green-100 text-green-800' : 'bg-surface-variant text-on-surface-variant'"
          >
            {{ smtpConfigured ? '已配置' : '未配置' }}
          </span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 text-sm">
          <label class="block">
            <span class="text-on-surface-variant text-xs">SMTP 主机</span>
            <input
              v-model="smtpForm.smtp_host"
              class="mt-1 w-full border rounded-lg px-3 py-2 bg-surface"
              placeholder="smtp.qq.com"
            />
          </label>
          <label class="block">
            <span class="text-on-surface-variant text-xs">端口</span>
            <input
              v-model.number="smtpForm.smtp_port"
              type="number"
              class="mt-1 w-full border rounded-lg px-3 py-2 bg-surface"
            />
          </label>
          <label class="block">
            <span class="text-on-surface-variant text-xs">账号</span>
            <input
              v-model="smtpForm.smtp_user"
              class="mt-1 w-full border rounded-lg px-3 py-2 bg-surface"
              placeholder="notify@example.com"
            />
          </label>
          <label class="block">
            <span class="text-on-surface-variant text-xs">发件人 From</span>
            <input
              v-model="smtpForm.smtp_from"
              class="mt-1 w-full border rounded-lg px-3 py-2 bg-surface"
              placeholder="可选，默认同账号"
            />
          </label>
          <label class="block sm:col-span-2">
            <span class="text-on-surface-variant text-xs">
              密码 / 授权码
              <template v-if="smtpHasPassword">（已保存，留空不修改）</template>
            </span>
            <input
              v-model="smtpForm.smtp_password"
              type="password"
              autocomplete="new-password"
              class="mt-1 w-full border rounded-lg px-3 py-2 bg-surface"
              :placeholder="smtpHasPassword ? '已保存，留空不修改' : 'QQ邮箱授权码等'"
            />
          </label>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="px-3 py-1.5 rounded-xl bg-primary text-white text-sm disabled:opacity-50"
            :disabled="smtpSaving"
            @click="saveSmtp"
          >
            {{ smtpSaving ? '保存中…' : '保存公司 SMTP' }}
          </button>
          <button
            class="px-3 py-1.5 rounded-xl border border-surface-variant text-sm disabled:opacity-50"
            :disabled="smtpTesting || !smtpConfigured"
            @click="sendSmtpTest"
          >
            {{ smtpTesting ? '发送中…' : '发测试邮件' }}
          </button>
        </div>
      </section>

      <section class="p-4 rounded-2xl border border-surface-variant bg-surface space-y-3">
        <div class="flex items-start justify-between gap-2">
          <div>
            <h2 class="font-semibold">公司 LLM</h2>
            <p class="text-xs text-on-surface-variant mt-1">
              可随时切换 OpenAI / 兼容接口 / Ollama / Fake。API Key 加密存储，接口不回显。
              用于智能体对话与材料判定（可分别开关）。
            </p>
          </div>
          <span
            class="text-xs px-2 py-1 rounded-full shrink-0"
            :class="llmConfigured && llmForm.enabled ? 'bg-green-100 text-green-800' : 'bg-surface-variant text-on-surface-variant'"
          >
            {{ llmForm.enabled ? (llmConfigured ? '已启用' : '未就绪') : '已禁用' }}
          </span>
        </div>
        <div class="grid gap-3 sm:grid-cols-2 text-sm">
          <label class="block sm:col-span-2">
            <span class="text-on-surface-variant text-xs">Provider</span>
            <select
              v-model="llmForm.provider"
              class="mt-1 w-full border rounded-lg px-3 py-2 bg-surface"
              @change="onLlmProviderChange"
            >
              <option v-for="o in llmProviderOptions" :key="o.key" :value="o.key">
                {{ o.label }}
              </option>
            </select>
          </label>
          <label class="block sm:col-span-2">
            <span class="text-on-surface-variant text-xs">Base URL（OpenAI 兼容 /v1）</span>
            <input
              v-model="llmForm.base_url"
              class="mt-1 w-full border rounded-lg px-3 py-2 bg-surface"
              placeholder="https://api.openai.com/v1"
            />
          </label>
          <label class="block">
            <span class="text-on-surface-variant text-xs">Model</span>
            <input
              v-model="llmForm.model"
              class="mt-1 w-full border rounded-lg px-3 py-2 bg-surface"
              placeholder="gpt-4o-mini"
            />
          </label>
          <label class="block">
            <span class="text-on-surface-variant text-xs">
              API Key
              <template v-if="llmHasKey">（已保存，留空不修改）</template>
            </span>
            <input
              v-model="llmForm.api_key"
              type="password"
              autocomplete="new-password"
              class="mt-1 w-full border rounded-lg px-3 py-2 bg-surface"
              :placeholder="llmHasKey ? '已保存，留空不修改' : 'sk-…'"
            />
          </label>
          <label class="block">
            <span class="text-on-surface-variant text-xs">Temperature</span>
            <input
              v-model.number="llmForm.temperature"
              type="number"
              step="0.1"
              min="0"
              max="2"
              class="mt-1 w-full border rounded-lg px-3 py-2 bg-surface"
            />
          </label>
          <label class="block">
            <span class="text-on-surface-variant text-xs">Max tokens</span>
            <input
              v-model.number="llmForm.max_tokens"
              type="number"
              min="64"
              max="32000"
              class="mt-1 w-full border rounded-lg px-3 py-2 bg-surface"
            />
          </label>
        </div>
        <div class="flex flex-wrap gap-4 text-sm">
          <label class="flex items-center gap-1">
            <input v-model="llmForm.enabled" type="checkbox" />
            启用
          </label>
          <label class="flex items-center gap-1">
            <input v-model="llmForm.use_for_agent" type="checkbox" />
            用于智能体
          </label>
          <label class="flex items-center gap-1">
            <input v-model="llmForm.use_for_judge" type="checkbox" />
            用于材料判定
          </label>
        </div>
        <div class="flex flex-wrap gap-2">
          <button
            class="px-3 py-1.5 rounded-xl bg-primary text-white text-sm disabled:opacity-50"
            :disabled="llmSaving"
            @click="saveLlm"
          >
            {{ llmSaving ? '保存中…' : '保存公司 LLM' }}
          </button>
          <button
            class="px-3 py-1.5 rounded-xl border border-surface-variant text-sm disabled:opacity-50"
            :disabled="llmTesting || !llmForm.enabled"
            @click="sendLlmTest"
          >
            {{ llmTesting ? '测试中…' : '连通性测试' }}
          </button>
        </div>
      </section>

      <section class="p-4 rounded-2xl border border-surface-variant bg-surface space-y-3">
        <h2 class="font-semibold">登录方式</h2>
        <p class="text-xs text-on-surface-variant">
          内测可先只开 password；企微/OIDC 配好域名与密钥后再打开对应开关。
        </p>
        <div class="flex flex-wrap gap-4 text-sm">
          <label
            v-for="k in ['password', 'wechat', 'wecom', 'dingtalk', 'feishu', 'oidc']"
            :key="k"
            class="flex items-center gap-1"
          >
            <input v-model="login[k]" type="checkbox" />
            {{ k }}
          </label>
        </div>
        <button class="px-3 py-1.5 rounded-xl bg-primary text-white text-sm" :disabled="saving" @click="saveLogin">
          保存登录开关
        </button>
      </section>

      <!-- 前端可配置：企微域名 / 密钥 / OIDC 等 -->
      <section class="p-4 rounded-2xl border border-surface-variant bg-surface space-y-4">
        <div>
          <h2 class="font-semibold">企业集成（前端可配置）</h2>
          <p class="text-xs text-on-surface-variant mt-1">
            域名、回调 URL、corpId/Secret 等保存在服务端加密库中；当前没有企微资质时可先空着，
            以后在管理后台直接填写，无需改代码发版。
          </p>
        </div>

        <div class="flex flex-wrap gap-2">
          <button
            v-for="t in providerTabs"
            :key="t.key"
            type="button"
            class="px-3 py-1 rounded-full text-sm border"
            :class="
              activeProvider === t.key
                ? 'bg-primary text-white border-primary'
                : 'bg-surface border-surface-variant'
            "
            @click="selectProvider(t.key)"
          >
            {{ t.label }}
          </button>
        </div>

        <div v-if="activeSchema" class="space-y-3">
          <p class="text-xs text-on-surface-variant">{{ activeSchema.note }}</p>

          <div v-if="activeSchema.credential_fields?.length" class="space-y-2">
            <h3 class="text-sm font-medium">凭证</h3>
            <div
              v-for="f in activeSchema.credential_fields"
              :key="'c-' + f.key"
              class="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-3 items-center text-sm"
            >
              <label class="text-on-surface-variant">{{ f.label }}</label>
              <input
                v-model="credForm[f.key]"
                :type="f.secret ? 'password' : 'text'"
                class="border rounded-lg px-3 py-1.5 w-full"
                :placeholder="f.secret ? '已配置则显示 ********，留空/占位不覆盖' : ''"
                autocomplete="off"
              />
            </div>
          </div>

          <div v-if="activeSchema.config_fields?.length" class="space-y-2">
            <h3 class="text-sm font-medium">配置（域名 / 回调等）</h3>
            <div
              v-for="f in activeSchema.config_fields"
              :key="'cfg-' + f.key"
              class="grid grid-cols-1 sm:grid-cols-[140px_1fr] gap-1 sm:gap-3 items-start text-sm"
            >
              <label class="text-on-surface-variant pt-1.5">{{ f.label }}</label>
              <label v-if="f.type === 'boolean'" class="flex items-center gap-2 py-1.5">
                <input v-model="configForm[f.key]" type="checkbox" />
                启用
              </label>
              <textarea
                v-else-if="f.type === 'json'"
                v-model="configForm[f.key] as string"
                rows="4"
                class="border rounded-lg px-3 py-1.5 w-full font-mono text-xs"
                :placeholder="f.placeholder || ''"
              />
              <input
                v-else
                v-model="configForm[f.key] as string"
                type="text"
                class="border rounded-lg px-3 py-1.5 w-full"
                :placeholder="f.placeholder || ''"
              />
            </div>
          </div>

          <div class="flex flex-wrap gap-2">
            <button
              class="px-3 py-1.5 rounded-xl bg-primary text-white text-sm"
              :disabled="saving"
              @click="saveIntegration"
            >
              保存 {{ activeSchema.label }} 配置
            </button>
            <button
              v-if="['wecom', 'dingtalk', 'feishu', 'generic_scim'].includes(activeProvider)"
              class="px-3 py-1.5 rounded-xl border border-primary text-primary text-sm"
              :disabled="syncing"
              @click="runSync"
            >
              {{ syncing ? '同步中…' : '立即组织同步' }}
            </button>
          </div>

          <p
            v-if="integrations.find((i) => i.provider === activeProvider)"
            class="text-xs text-on-surface-variant"
          >
            已保存 · 上次同步：
            {{ integrations.find((i) => i.provider === activeProvider)?.last_sync_at || '从未' }}
          </p>
        </div>
        <div v-else class="text-sm text-on-surface-variant">无表单 schema（需超管权限）</div>
      </section>

      <section class="p-4 rounded-2xl border border-surface-variant bg-surface space-y-3">
        <h2 class="font-semibold">存储 / ASR 绑定</h2>
        <div class="flex flex-wrap gap-4 text-sm">
          <label>
            存储
            <select v-model="storageProvider" class="ml-1 border rounded px-2 py-1">
              <option value="local">local</option>
              <option value="s3">s3</option>
              <option value="customer">customer</option>
            </select>
          </label>
          <label>
            ASR
            <select v-model="asrProvider" class="ml-1 border rounded px-2 py-1">
              <option value="builtin">builtin</option>
              <option value="cloud:default">cloud:default</option>
              <option value="customer">customer</option>
            </select>
          </label>
        </div>
        <p class="text-xs text-on-surface-variant">
          当前：存储 {{ bindings?.storage?.provider_id || 'local' }} · ASR
          {{ bindings?.asr?.provider_id || 'builtin' }}
        </p>
        <button class="px-3 py-1.5 rounded-xl bg-primary text-white text-sm" :disabled="saving" @click="saveBindings">
          保存绑定
        </button>
      </section>

      <section class="p-4 rounded-2xl border border-surface-variant bg-surface">
        <h2 class="font-semibold mb-2">组织树</h2>
        <div v-if="!orgNodes.length" class="text-sm text-on-surface-variant">
          暂无部门（保存企微/快照后点「立即组织同步」）
        </div>
        <ul v-else class="text-sm space-y-1">
          <li v-for="n in orgNodes" :key="n.id">
            {{ n.path || '' }} {{ n.name }}
            <span class="text-xs text-on-surface-variant">{{ n.source }}</span>
          </li>
        </ul>
      </section>
    </template>
  </div>
</template>
