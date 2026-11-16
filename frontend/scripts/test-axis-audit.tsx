import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import * as api from '../src/api/shell'

Object.defineProperty(globalThis, 'localStorage', { value: { getItem: () => null }, configurable: true })
const requests: { url: string; method: string; body: unknown }[] = []
const sample = {
  id: 8, project_id: 3, scope: 'self', mode: 'rule', overall_risk: 'medium',
  generated_at: '2026-11-16T08:00:00Z', mode_message: '未配置 AI，以下为规则检查', restricted: true,
  nodes: [{ node_id: 2, title: '设计负责人', risk_level: 'medium', summary: '交付材料待核验',
    findings: [{ type: '言行不符', description: '标记完成但缺少材料', matter_ids: [15] }], suggested_actions: ['核验交付'] }],
} as const
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

const { buildAuditRequest } = await import('../src/features/audits/model')
const scopes = [{ scope: 'self' as const, label: '本人信息' }, { scope: 'node' as const, node_id: 2, label: '设计及下属' }]
assert.deepEqual(buildAuditRequest('node:2', '  检查交付  ', scopes), { scope: 'node', node_id: 2, custom_instruction: '检查交付' })
assert.throws(() => buildAuditRequest('project', '', scopes), /范围/)
assert.throws(() => buildAuditRequest('self', '字'.repeat(501), scopes), /500/)
const { AuditResultView } = await import('../src/features/audits/AuditResultView')
const html = renderToStaticMarkup(<AuditResultView result={sample as unknown as api.AuditRun} />)
for (const text of ['未配置 AI，以下为规则检查', '针对本人的部分', '设计负责人', '言行不符', '标记完成但缺少材料', '#15', '核验交付']) assert.ok(html.includes(text), text)
assert.ok(!html.includes('保密管理要求'))
console.log('AI 审计：新接口、范围约束、自定义要求、历史、权限与收件人结果渲染通过')
