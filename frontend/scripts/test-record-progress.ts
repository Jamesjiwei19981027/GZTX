import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolveSuggestedTarget, saveRecordProgress, RECORD_PROGRESS_LABELS, type RecordProgressSaveDeps } from '../src/api/recordProgress';
import { normalizeMobileRoute } from '../src/mobile/navigation/mobileRoutes';

console.log('--- Testing 记录进展 ---');

const calls: string[] = [];
const deps: RecordProgressSaveDeps = {
  saveReportDraft: async (pid, text) => { calls.push(`draft:${pid}:${text}`); },
  submitEvidence: async (id, b) => { calls.push(`evidence:${id}:${b.file_ids.join(',')}`); },
  createKnowledgeEntry: async (pid, b) => { calls.push(`knowledge:${pid}:${b.title}`); },
};
const base = { text: ' 第一行\n第二行 ', companyId: 1, projectId: 7, nodeId: 9, fileIds: [3, 4], evidenceKind: 'file' };

(async () => {
  // 三种保存分别调用正确接口，并给出“已存为××”
  assert.equal(await saveRecordProgress('report_draft', base, deps), '已存为汇报草稿');
  assert.equal(await saveRecordProgress('evidence', base, deps), '已存为证据材料');
  assert.equal(await saveRecordProgress('knowledge', base, deps), '已存为个人知识');
  assert.deepEqual(calls, ['draft:7:第一行\n第二行', 'evidence:9:3,4', 'knowledge:7:第一行']);

  // 证据未选事项：提示并且不调用接口
  calls.length = 0;
  await assert.rejects(() => saveRecordProgress('evidence', { ...base, nodeId: null }, deps), /先选择关联事项/);
  assert.equal(calls.length, 0);

  // 建议显示与改选：模型建议原样采用；规则兜底不覆盖入口预选
  const llm = { target: 'knowledge', reason: '像个人笔记', source: 'llm' } as const;
  assert.deepEqual(resolveSuggestedTarget(llm, 'evidence'), llm);
  assert.equal(resolveSuggestedTarget({ target: 'report_draft', reason: 'x', source: 'rule' }, 'evidence').target, 'evidence');
  assert.equal(resolveSuggestedTarget({ target: 'report_draft', reason: 'x', source: 'rule' }).target, 'report_draft');
  assert.deepEqual(Object.keys(RECORD_PROGRESS_LABELS), ['report_draft', 'evidence', 'knowledge']);

  // 路由：三个旧入口收口到记录进展
  assert.equal(normalizeMobileRoute({ tab: 'axis', screen: 'axis-evidence-submit' }).screen, 'record-progress');
  assert.equal(normalizeMobileRoute({ tab: 'ai', screen: 'ai-chat' }).screen, 'record-progress');

  // 入口源码：手机汇报页、知识空间、电脑端进展按钮均打开记录进展
  const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
  assert.match(read('../src/mobile/features/reports/MyAgentScreen.tsx'), /screen: 'record-progress'/);
  assert.match(read('../src/mobile/navigation/MobileRouteOutlet.tsx'), /initialTarget: 'evidence'/);
  assert.match(read('../src/mobile/navigation/MobileRouteOutlet.tsx'), /initialTarget: 'knowledge'/);
  assert.match(read('../src/App.tsx'), /setRecordProgressOpen\(true\)/);
  assert.match(read('../src/components/WorkAssistantEntry.tsx'), /记录进展/);

  // C-6：存为汇报草稿后给「去我的汇报查看」入口，并在我的汇报里读回服务端草稿
  const screen = read('../src/mobile/features/progress/RecordProgressScreen.tsx');
  assert.match(screen, /去我的汇报查看/);
  assert.match(screen, /saveProgressNoteAsDraft/);
  assert.doesNotMatch(screen, /agentChat/);
  assert.match(read('../src/mobile/navigation/MobileRouteOutlet.tsx'), /onViewReports=\{\(\) => push\(\{ screen: 'ai-report-create'/);
  assert.match(read('../src/App.tsx'), /onViewReports=\{\(\) => \{ setRecordProgressOpen\(false\)/);
  assert.match(read('../src/components/views/ReportsView.tsx'), /listMyReports\(numericProjectId\)/);
  assert.match(read('../src/mobile/features/reports/MyReportEditor.tsx'), /listMyReports\(numericProjectId\)/);

  console.log('✓ 记录进展 assertions PASSED');
})();
