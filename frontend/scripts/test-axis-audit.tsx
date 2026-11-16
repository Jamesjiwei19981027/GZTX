import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { mock } from 'node:test'
import * as api from '../src/api/shell'

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null }, configurable: true })
const requests: { url: string; method: string; body: unknown }[] = []
const sample: api.AuditRun = {
  id: 8, project_id: 3, scope: 'self', mode: 'rule', overall_risk: 'medium',
  generated_at: '2026-11-16T08:00:00Z', mode_message: '未配置 AI，以下为规则检查', restricted: true,
  nodes: [{ node_id: 2, title: '设计负责人', risk_level: 'medium', summary: '交付材料待核验',
    findings: [{ type: '言行不符', description: '标记完成但缺少材料', matter_ids: [15] }], suggested_actions: ['核验交付'] }],
}
globalThis.fetch = async (url, options) => {
  requests.push({ url: String(url), method: options?.method || 'GET', body: options?.body ? JSON.parse(String(options.body)) : undefined })
  return new Response(JSON.stringify({ code: 200, data: sample }), { status: 200, headers: { 'Content-Type': 'application/json' } })
}
await api.runAxisAudit(3)
assert.equal(requests[0].url, '/api/v1/projects/3/audits', '审计必须使用新 AI/规则存档接口')
assert.deepEqual(requests[0].body, { scope: 'self' })

// 新接口不能把管理范围、开关或历史详情留给客户端自行推断。
await api.getAuditOptions(3)
await api.listAuditRuns(3, 30)
await api.getAuditRun(3, 8)
await api.setAuditPermission(3, 2, null)
await api.runAxisAudit(3, { scope: 'node', node_id: 2, custom_instruction: '检查交付' })
assert.equal(requests[1].url, '/api/v1/projects/3/audit-options')
assert.ok(requests[2].url.includes('/audits?offset=30&limit=30'))
assert.equal(requests[3].url, '/api/v1/projects/3/audits/8')
assert.deepEqual(requests[4], { url: '/api/v1/projects/3/nodes/2/audit-permission', method: 'PUT', body: { allow_audit_subordinates: null } })
assert.deepEqual(requests[5].body, { scope: 'node', node_id: 2, custom_instruction: '检查交付' })

const { buildAuditRequest, latestAuditRun } = await import('../src/features/audits/model')
const scopes = [{ scope: 'self' as const, label: '本人信息' }, { scope: 'node' as const, node_id: 2, label: '设计及下属' }]
assert.deepEqual(buildAuditRequest('node:2', '  检查交付  ', scopes), { scope: 'node', node_id: 2, custom_instruction: '检查交付' })
assert.throws(() => buildAuditRequest('project', '', scopes), /范围/)
assert.throws(() => buildAuditRequest('self', '字'.repeat(501), scopes), /500/)
const { AuditResultView } = await import('../src/features/audits/AuditResultView')
const html = renderToStaticMarkup(<AuditResultView result={sample as unknown as api.AuditRun} />)
for (const text of ['未配置 AI，以下为规则检查', '针对本人的部分', '设计负责人', '言行不符', '标记完成但缺少材料', '#15', '核验交付']) assert.ok(html.includes(text), text)
assert.ok(!html.includes('保密管理要求'))

// 将 running 错当成规则检查完成，会让用户以为 AI 已结束。
const running = { ...sample, status: 'running', started_at: null, finished_at: null } as unknown as api.AuditRun
const done = { ...running, status: 'done', mode: 'ai', mode_message: 'AI 审计已完成', nodes: [{ ...sample.nodes[0], summary: 'AI 已核验交付材料' }] } as api.AuditRun
const fallback = { ...running, status: 'done', mode: 'rule', fallback_reason: '模型响应超时，已保留规则检查结果' } as api.AuditRun
const interrupted = { ...fallback, status: 'failed', fallback_reason: '审计服务重启，已保留规则检查结果' } as api.AuditRun
assert.equal(latestAuditRun(done, running).mode, 'ai', '晚到的进行中响应不能覆盖已经完成的 AI 结果')
assert.equal(latestAuditRun(running, interrupted).status, 'failed', '运行中必须接受服务中断后的规则回退')
const runningHtml = renderToStaticMarkup(<AuditResultView result={running} />)
assert.ok(runningHtml.includes('AI 正在审计，通常需要 1～3 分钟，可以离开此页，完成后在历史里查看'), '运行中必须明确告知可离页及预计耗时')
assert.ok(runningHtml.includes('规则检查结果'), '等待 AI 时仍可查看完整规则结果')
assert.ok(!runningHtml.includes('未配置 AI'), '运行中不能误称未配置 AI')
for (const [row, status, reason] of [
  [done, '已完成', 'AI 已核验交付材料'],
  [fallback, '已退回规则检查', '模型响应超时'],
  [interrupted, '已退回规则检查', '审计服务重启'],
] as const) {
  const rendered = renderToStaticMarkup(<AuditResultView result={row} />)
  assert.ok(rendered.includes(status), status)
  assert.ok(rendered.includes(reason), reason)
}
const { AuditHistory } = await import('../src/features/audits/AuditHistory')
const historyHtml = renderToStaticMarkup(<AuditHistory records={[running, done, interrupted, sample as unknown as api.AuditRun]} busy={false} onOpen={() => {}} />)
for (const status of ['进行中', '已完成', '已退回规则检查']) assert.ok(historyHtml.includes(status), `历史展示${status}`)

// 真正执行生产轮询器，仅替换外部网络和时钟；删掉更新/清理/去重均会失败。
const { startAuditPolling } = await import('../src/features/audits/polling')
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve() }
mock.timers.enable({ apis: ['setTimeout'] })
try {
  let records = [running, { ...running, id: 9 }, { ...sample, id: 10 } as unknown as api.AuditRun]
  const updates: api.AuditRun[] = []
  const polls: number[] = []
  let release!: (value: api.AuditRun) => void
  const stop = startAuditPolling({
    projectId: 3,
    getRuns: () => [...records, records[0]], // 详情与历史里的同一 running 只请求一次。
    fetchRun: async id => {
      polls.push(id)
      if (id === 8) return await new Promise<api.AuditRun>(resolve => { release = resolve })
      return { ...done, id }
    },
    onUpdate: row => { updates.push(row); records = records.map(record => record.id === row.id ? row : record) },
  })
  mock.timers.tick(4999); await flush()
  assert.deepEqual(polls, [], '未到五秒不请求详情')
  mock.timers.tick(1); await flush()
  assert.ok(polls.includes(8), '从历史恢复 running 的轮询')
  mock.timers.tick(20000); await flush()
  assert.equal(polls.filter(id => id === 8).length, 1, '慢请求期间不重叠轮询')
  release(done); await flush()
  assert.equal(updates.find(row => row.id === 8)?.nodes[0].summary, 'AI 已核验交付材料', '完成后用 AI 详情替换规则快照')
  assert.ok(updates.some(row => row.id === 9), '历史中的其他 running 也更新')
  stop()
  const stoppedCount = polls.length
  mock.timers.tick(10000); await flush()
  assert.equal(polls.length, stoppedCount, '离页清理定时器')

  let oldResponse!: (value: api.AuditRun) => void
  const stale: api.AuditRun[] = []
  const stopOldProject = startAuditPolling({ projectId: 3, getRuns: () => [running], fetchRun: () => new Promise(resolve => { oldResponse = resolve }), onUpdate: row => stale.push(row) })
  mock.timers.tick(5000); await flush()
  stopOldProject()
  oldResponse(done); await flush()
  assert.deepEqual(stale, [], '切项目或卸载后忽略未结束的详情响应')

  let retryCount = 0
  let current = [running]
  const retryUpdates: api.AuditRun[] = []
  const stopRetry = startAuditPolling({ projectId: 3, getRuns: () => current, fetchRun: async () => { if (++retryCount === 1) throw new Error('网络中断'); return interrupted }, onUpdate: row => { retryUpdates.push(row); current = [row] } })
  mock.timers.tick(5000); await flush()
  mock.timers.tick(5000); await flush()
  assert.equal(retryUpdates[0]?.status, 'failed', '临时网络错误后继续轮询并接收规则回退')
  mock.timers.tick(10000); await flush()
  assert.equal(retryCount, 2, '终态停止请求详情')
  stopRetry()
} finally { mock.timers.reset() }
console.log('AI 审计：新接口、范围约束、自定义要求、状态渲染、五秒轮询、历史恢复、去重、终态停止与旧响应隔离通过')
