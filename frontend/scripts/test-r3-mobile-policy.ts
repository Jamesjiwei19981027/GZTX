import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const source = readFileSync(new URL('../src/mobile/features/projects/MobileProjectScreens.tsx', import.meta.url), 'utf8')
assert.match(source, /MobileReportPolicySettings/)
const policySource = readFileSync(new URL('../src/mobile/features/projects/MobileReportPolicySettings.tsx', import.meta.url), 'utf8')
assert.match(policySource, /listProjectReportPolicies\(projectId\)/)
assert.match(policySource, /saveReportPolicy\(projectId, policy\)/)
assert.match(policySource, /disabled=\{[^}]*!canManage[^}]*archived/)
assert.match(policySource, /汇报周期/)
assert.match(policySource, /截止时间/)
assert.match(policySource, /每周截止日/)
assert.match(policySource, /每月截止日/)
assert.match(policySource, /截止前提醒/)

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { value: { getItem: (key: string) => storage.get(key) ?? null }, configurable: true })
const calls: { url: string; init?: RequestInit }[] = []
globalThis.fetch = async (input, init) => {
  calls.push({ url: String(input), init })
  return new Response(JSON.stringify({ code: 200, data: { id: 1, ...JSON.parse(String(init?.body || '{}')) } }), { status: 200 })
}
const { saveReportPolicy } = await import('../src/api/manage')
const body = { enabled: false, period: 'monthly' as const, deadline_time: '17:30', weekday: 3, month_day: 28, remind: false }
const result = await saveReportPolicy(42, body)
assert.equal(calls[0].url.endsWith('/projects/42/report-policy'), true)
assert.equal(calls[0].init?.method, 'PUT')
assert.deepEqual(JSON.parse(String(calls[0].init?.body)), body)
assert.equal(result.period, 'monthly')
console.log('R3 手机汇报策略：读取、权限、周期与 PUT 契约通过')
