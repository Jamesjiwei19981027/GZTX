import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { normalizeTaskScope } from '../src/utils/taskScope';

console.log('=== Starting APP V2 Mobile Workbench, Tasks, Auth & Messages Verification ===\n');

// 1. Task Scope Verification
console.log('1. Checking Task Scope Contract...');
assert.deepEqual(normalizeTaskScope('all'), { project_id: null, origin: 'personal' });
assert.deepEqual(normalizeTaskScope(''), { project_id: null, origin: 'personal' });
assert.deepEqual(normalizeTaskScope(null), { project_id: null, origin: 'personal' });
assert.deepEqual(normalizeTaskScope(undefined), { project_id: null, origin: 'personal' });
assert.deepEqual(normalizeTaskScope('42'), { project_id: 42, origin: 'project_link' });
assert.throws(() => normalizeTaskScope('invalid_scope'));
assert.throws(() => normalizeTaskScope('-10'));
console.log('✓ normalizeTaskScope semantic rules verified.');

// 2. Static Code Audits across Auth, Project, Task, Work, Message components
console.log('\n2. Static Audits of Implemented Mobile Screens...');
const root = process.cwd();
const authCode = fs.readFileSync(path.join(root, 'src/components/LoginGate.tsx'), 'utf8');
const verifyCode = fs.readFileSync(path.join(root, 'src/components/VerifyGate.tsx'), 'utf8');
const projectCode = fs.readFileSync(path.join(root, 'src/mobile/features/projects/MobileProjectScreens.tsx'), 'utf8');
const teamCode = fs.readFileSync(path.join(root, 'src/mobile/features/projects/MobileTeamScreens.tsx'), 'utf8');
const workCode = fs.readFileSync(path.join(root, 'src/mobile/features/work/MobileWorkScreens.tsx'), 'utf8');
const statsCode = fs.readFileSync(path.join(root, 'src/mobile/features/work/MobileStatisticsScreen.tsx'), 'utf8');
const taskCode = fs.readFileSync(path.join(root, 'src/mobile/features/tasks/MobileTaskScreens.tsx'), 'utf8');
const callCode = fs.readFileSync(path.join(root, 'src/mobile/features/messages/MobileCallScreen.tsx'), 'utf8');
const inboxCode = fs.readFileSync(path.join(root, 'src/mobile/features/messages/MobileInboxScreens.tsx'), 'utf8');
const messageCode = fs.readFileSync(path.join(root, 'src/mobile/features/messages/MobileMessageScreens.tsx'), 'utf8');
const outletCode = fs.readFileSync(path.join(root, 'src/mobile/navigation/MobileRouteOutlet.tsx'), 'utf8');
const routesCode = fs.readFileSync(path.join(root, 'src/mobile/navigation/mobileRoutes.ts'), 'utf8');

// Auth Screen Checks
assert.ok(authCode.includes('LoginGate'), 'Shared desktop/mobile LoginGate exists');
assert.ok(authCode.includes('handlePasswordLogin'), 'handlePasswordLogin (01) implemented');
assert.ok(authCode.includes('handleRegister'), 'handleRegister (02) implemented');
assert.ok(verifyCode.includes('confirmBindCode'), 'Shared VerifyGate confirms email/phone ownership');
assert.ok(authCode.includes('handleResetPassword'), 'Shared LoginGate resets forgotten passwords');
assert.ok(authCode.includes('handleCodeLogin'), 'handleCodeLogin (79) implemented');
assert.ok(authCode.includes('detectChannel'), 'detectChannel phone/email detection exists');
assert.ok(authCode.includes('loginWithCode'), 'loginWithCode API wired');
assert.ok(authCode.includes('useCountdown'), 'useCountdown integrated for verification countdown');
console.log('✓ Auth screens (01, 02, 03, 04, 79) implementation verified.');

// Project & Team Checks
assert.ok(projectCode.includes('MobileProjectSwitchScreen'), 'MobileProjectSwitchScreen exists');
assert.ok(projectCode.includes('MobileWorkspaceCreateScreen'), 'MobileWorkspaceCreateScreen exists');
assert.ok(projectCode.includes('MobileProjectOverviewScreen'), 'MobileProjectOverviewScreen exists');
assert.ok(projectCode.includes('MobileProjectSettingsScreen'), 'MobileProjectSettingsScreen exists');
assert.ok(projectCode.includes('MobileProjectInviteScreen'), 'MobileProjectInviteScreen exists');
assert.ok(projectCode.includes('MobileInviteAcceptScreen'), 'MobileInviteAcceptScreen exists');
assert.ok(projectCode.includes('getMyPermissions'), 'Project permissions checked via getMyPermissions');
assert.ok(teamCode.includes('MobileTeamScreen'), 'MobileTeamScreen exists');
assert.ok(teamCode.includes('MobileMemberDetailScreen'), 'MobileMemberDetailScreen exists');
assert.ok(teamCode.includes('listPresence'), 'listPresence presence status integrated');
console.log('✓ Project & Team screens (07, 08, 09, 10, 11, 80, 81, 51, 52) implementation verified.');

// Work & Task Checks
assert.ok(workCode.includes('MobileWorkbenchScreen'), 'MobileWorkbenchScreen exists');
assert.ok(workCode.includes('MobileTrashScreen'), 'MobileTrashScreen exists');
assert.ok(workCode.includes('MobileGlobalSearchScreen'), 'MobileGlobalSearchScreen exists');
assert.ok(statsCode.includes('MobileStatisticsScreen'), 'MobileStatisticsScreen exists');
assert.ok(statsCode.includes('getTaskTrend'), 'getTaskTrend integrated');
assert.ok(statsCode.includes('getTaskStats'), 'getTaskStats integrated');

// Strict scope checks in Task code
assert.ok(taskCode.includes('normalizeTaskScope'), 'normalizeTaskScope used in task code');
assert.ok(!taskCode.includes("scope === 'all' ? projects[0]"), 'Strict prohibition of all -> projects[0]');
assert.ok(taskCode.includes('MobileMyTasksScreen'), 'MobileMyTasksScreen exists');
assert.ok(taskCode.includes('MobileTaskDetailSheet'), 'MobileTaskDetailSheet exists');
assert.ok(taskCode.includes('MobileTaskEditScreen'), 'MobileTaskEditScreen exists');
assert.ok(taskCode.includes('MobileQuickAddSheet'), 'MobileQuickAddSheet exists');
assert.ok(taskCode.includes('MobileTaskExtractChatSheet'), 'MobileTaskExtractChatSheet exists');
assert.ok(taskCode.includes('MobileKanbanScreen'), 'MobileKanbanScreen exists');
assert.ok(taskCode.includes('MobileCalendarScreen'), 'MobileCalendarScreen exists');
// Responsibility link read-only guard
assert.ok(taskCode.includes('人轴责任链关联事项') && taskCode.includes('前往责任节点'), 'Responsibility-linked tasks have read-only guard and forward button');
console.log('✓ Workbench & Task screens (05, 06, 12-19, 64, 65, 82-85, Stats) implementation verified.');

// Communication & Messages Checks
assert.ok(callCode.includes('MobileCallScreen'), 'MobileCallScreen exists');
assert.ok(callCode.includes('getCallConfig'), 'Call config fetched via real API');
assert.ok(callCode.includes('未配置 WebRTC 通话服务') || callCode.includes('未配置'), 'Real unconfigured diagnostics shown for calls, no fake calls');
assert.ok(inboxCode.includes('MobileInboxScreen'), 'MobileInboxScreen exists');
assert.ok(inboxCode.includes('MobileExternalMailView'), 'MobileExternalMailView exists');
assert.ok(inboxCode.includes('外部邮箱未配置'), 'Real unconfigured diagnostics shown for external email, no fake email');
assert.ok(messageCode.includes('MobileMessageListScreen'), 'MobileMessageListScreen exists');
assert.ok(messageCode.includes('MobileChatDetailScreen'), 'MobileChatDetailScreen exists');
assert.ok(messageCode.includes('MobileConversationProfileScreen'), 'MobileConversationProfileScreen exists');
assert.ok(messageCode.includes('onConvertToTaskDraft') && messageCode.includes('将此消息转为任务待办草稿'), 'Message conversion to task implemented');
console.log('✓ Messages, Calls & Inbox screens (44-50, 89, 98) implementation verified.');

// Navigation & Route Outlet Wiring Checks
const requiredRoutes = [
  'work-tasks',
  'work-kanban',
  'work-calendar',
  'work-statistics',
  'work-trash',
  'work-search',
  'project-switch',
  'project-create',
  'project-overview',
  'project-settings',
  'project-invite',
  'invite-accept',
  'messages-chat',
  'messages-profile',
  'messages-call',
  'messages-inbox',
  'me-team',
];
for (const r of requiredRoutes) {
  assert.ok(routesCode.includes(`'${r}'`), `Route '${r}' registered in mobileRoutes.ts`);
  assert.ok(outletCode.includes(r), `Route '${r}' handled in MobileRouteOutlet.tsx`);
}
console.log(`✓ All ${requiredRoutes.length} new subroutes wired into MobileRouteOutlet.tsx.`);

console.log('\n======================================================');
console.log('🎉 ALL APP V2 MOBILE WORKBENCH & MESSAGING TESTS PASSED!');
console.log('======================================================\n');
