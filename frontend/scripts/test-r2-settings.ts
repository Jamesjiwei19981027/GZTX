import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { providerOptions, keyOnlyPayload, integrationBadge } from '../src/components/admin/enterpriseHelpers'
import { isNotifyRecordSent, isNotifyRecordFailed } from '../src/api/notifications'
import { pickOrgSyncProvider } from '../src/api/shell'

console.log('--- 第二轮：设置页修复 ---')

// A-02/A-12/WR-09：厂商 id 与后端预设一致，更新密钥只带密钥
const presets = {
  fake: { label: '本地桩', default_base_url: '', default_model: 'fake', needs_key: false },
  openai: { label: 'OpenAI', default_base_url: 'x', default_model: 'gpt', needs_key: true },
  openai_compatible: { label: 'OpenAI 兼容', default_base_url: 'y', default_model: 'ds', needs_key: true },
  custom: { label: '自定义', default_base_url: '', default_model: '', needs_key: true },
}
const opts = providerOptions(presets)
assert.deepEqual(opts.map((o) => o.id), ['openai', 'openai_compatible', 'custom'])
assert.ok(providerOptions(null).some((o) => o.id === 'openai_compatible'))
assert.ok(!providerOptions(null).some((o) => o.id === 'deepseek' || o.id === 'claude'))
assert.deepEqual(keyOnlyPayload('  abc '), { api_key: 'abc' })
assert.ok(!('provider' in keyOnlyPayload('k')))

// A-05/WR-06/07：后端只有 sent / failed
assert.equal(isNotifyRecordSent({ status: 'sent' }), true)
assert.equal(isNotifyRecordSent({ status: 'success' }), false)
assert.equal(isNotifyRecordFailed({ status: 'failed' }), true)
assert.equal(isNotifyRecordFailed({ status: 'sent' }), false)

// WR-11：集成状态按后端字段
assert.equal(integrationBadge(undefined).label, '未配置')
assert.equal(integrationBadge({ provider: 'wecom', has_credentials: false }).label, '未配置')
assert.equal(integrationBadge({ provider: 'wecom', has_credentials: true, enabled: true }).label, '已配置')
assert.match(integrationBadge({ provider: 'wecom', has_credentials: true, enabled: true }).detail, /尚未同步/)
assert.match(
  integrationBadge({ provider: 'wecom', has_credentials: true, last_sync_at: '2026-11-09T08:30:00Z' }).detail,
  /2026-11-09 08:30/,
)
assert.equal(integrationBadge({ provider: 'wecom', has_credentials: true, enabled: false }).tone, 'warn')

// A-03/WR-10：触发同步只会选到组织类集成
assert.equal(
  pickOrgSyncProvider([
    { provider: 'smtp', has_credentials: true },
    { provider: 'llm', has_credentials: true },
    { provider: 'feishu', has_credentials: true },
  ]),
  'feishu',
)
assert.equal(pickOrgSyncProvider([{ provider: 'smtp', has_credentials: true }]), undefined)

// 源码合同：企业管理里的集成卡片不再写死“已接入”，日志走公司接口
const sections = readFileSync(new URL('../src/components/admin/EnterpriseSettingsSections.tsx', import.meta.url), 'utf8')
assert.ok(!sections.includes('>已接入<') && !/^\s*已接入\s*$/m.test(sections), '不得写死已接入')
assert.ok(sections.includes('listCompanyNotifyRecords(companyId'))
assert.ok(!sections.includes("setSelectedProvider"))

console.log('OK')
