/** 第二轮网页主流程修复：契约 + 纯函数测试 */
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { mapEvidenceStatus, EVIDENCE_STATUS_LABEL } from '../src/api/mappers'
import { effectiveNodeId, saveRecordProgress } from '../src/api/recordProgress'
import { notificationTarget, notificationTitle } from '../src/utils/notificationText'

const read = (p: string) => fs.readFileSync(p, 'utf8')
let n = 0
const ok = (cond: unknown, label: string) => { assert.ok(cond, label); n += 1 }

// D-2：App 的完成处理函数同时接受任务对象（手机端）与 id+事件（桌面端），事件可省略
const app = read('src/App.tsx')
ok(/handleToggleTaskCompletion = async \(\s*taskOrId: string \| Pick<Task, 'id'>,\s*e\?: React\.MouseEvent/.test(app), 'D-2 签名兼容两种调用')
ok(app.includes('e?.stopPropagation()'), 'D-2 事件可省略')
ok(app.includes("typeof taskOrId === 'string' ? taskOrId : taskOrId.id"), 'D-2 取 id')
const mobile = read('src/mobile/features/work/MobileWorkScreens.tsx')
ok(mobile.includes('onToggleTaskCompletion?.(task)') && mobile.includes('aria-label="完成任务"'), 'D-2 工作台圆圈直接完成')

// C-1：材料状态映射
ok(mapEvidenceStatus('pending_review') === 'awaiting_review', 'C-1 待确认不落已采纳')
ok(EVIDENCE_STATUS_LABEL[mapEvidenceStatus('pending_review')] === '待负责人确认', 'C-1 文案')
ok(mapEvidenceStatus('adopted') === 'verified' && EVIDENCE_STATUS_LABEL.verified === '已采纳', 'C-1 已采纳')
ok(mapEvidenceStatus('rejected') === 'rejected', 'C-1 已驳回')
ok(mapEvidenceStatus('submitted') === 'pending' && mapEvidenceStatus(undefined) === 'pending', 'C-1 未知状态不冒充已采纳')
ok(mapEvidenceStatus('superseded') === 'superseded', 'C-1 被替代')

// C-2 / C-3：负责人按钮与驳回原因
const ws = read('src/components/views/ResponsibilityWorkspace.tsx')
ok(ws.includes('reviewEvidencePackage'), 'C-2 调用既有审核接口')
ok(ws.includes("ev.canReview === true && ev.status === 'awaiting_review'"), 'C-2 仅负责人且待确认才显示')
ok(ws.includes('采纳') && ws.includes('确认驳回') && ws.includes('驳回原因（选填）'), 'C-2 采纳/驳回按钮')
ok(ws.includes('ev.rejectReason') && ws.includes('驳回原因：'), 'C-3 显示驳回原因')
const mappers = read('src/api/mappers.ts')
ok(mappers.includes('reject_reason') && mappers.includes('can_review'), 'C-3 读取 reject_reason / can_review')

// C-4：模板键 -> 中文标题 + 跳转
for (const k of ['evidence.awaiting_review', 'evidence.adopted', 'evidence.rejected', 'evidence.pending_review', 'agent.report.submitted', 'project.report.aggregated']) {
  const t = notificationTitle(k)
  ok(/[一-龥]/.test(t) && !t.includes('.') && !t.includes('_'), `C-4 标题中文化 ${k}`)
}
ok(notificationTitle('report.weekly') === '汇报通知' && notificationTitle('whatever.x') === '系统通知' && notificationTitle('') === '系统通知', 'C-4 兜底也是中文')
assert.deepEqual(notificationTarget('evidence.rejected', { project_id: 7 }), { view: 'people-axis', projectId: 7 }); n++
assert.deepEqual(notificationTarget('agent.report.submitted', { project_id: '9' }), { view: 'reports', projectId: 9 }); n++
assert.deepEqual(notificationTarget('evidence.adopted', {}), { view: 'people-axis', projectId: undefined }); n++
assert.equal(notificationTarget('auth.welcome', { project_id: 1 }), null); n++
const modal = read('src/components/modals/NotificationsModal.tsx')
const inbox = read('src/components/views/InboxView.tsx')
ok(modal.includes('notificationTitle(n.template_key)') && !modal.includes("title: n.template_key"), 'C-4 通知中心不再用原始键')
ok(inbox.includes('notificationTitle(n.template_key)') && inbox.includes('onOpenTarget(item.target)'), 'C-4 收件箱标题与跳转')
ok(app.includes('onOpenTarget={handleOpenNotificationTarget}'), 'C-4 App 接线')

// WR-19：切换项目后旧项目的事项不得带到保存里
ok(effectiveNodeId('', ['1'], true) === null, 'WR-19 未选')
ok(effectiveNodeId('5', ['5', '6'], true) === 5, 'WR-19 属于当前项目')
ok(effectiveNodeId('9', ['5', '6'], true) === null, 'WR-19 不属于当前项目则丢弃')
ok(effectiveNodeId('9', [], false) === 9, 'WR-19 列表加载中不误丢')
const rp = read('src/mobile/features/progress/RecordProgressScreen.tsx')
ok(rp.includes("setSelectedProjectId(e.target.value); setSelectedNodeId('')"), 'WR-19 切项目清空已选事项')
ok(rp.includes('effectiveNodeId(selectedNodeId'), 'WR-19 保存以当前选择为准')

// WR-14：汇报草稿 / 个人知识带上附件 id
const sent: Record<string, unknown> = {}
const deps = {
  agentChat: async (b: unknown) => { sent.chat = b },
  submitEvidence: async () => {},
  createKnowledgeEntry: async (_p: number, b: unknown) => { sent.knowledge = b },
}
const base = { text: '内容', companyId: 1, projectId: 2, nodeId: null, fileIds: [11, 12], evidenceKind: 'file' }
await saveRecordProgress('report_draft', base, deps)
await saveRecordProgress('knowledge', base, deps)
assert.deepEqual((sent.chat as { file_ids: number[] }).file_ids, [11, 12]); n++
assert.deepEqual((sent.knowledge as { file_ids: number[] }).file_ids, [11, 12]); n++

console.log(`r2 web flow: ${n} assertions passed`)
