import assert from 'node:assert/strict';
import {
  resolveBackAction,
  mapLegacyViewToMobileRoute,
  isValidScreenForTab,
  MOBILE_TABS,
  REGISTERED_SCREENS,
  normalizeMobileRoute,
} from '../src/mobile/navigation/mobileRoutes';
import { screenOwnsHeader } from '../src/mobile/navigation/mobileChrome';

console.log('--- Testing resolveBackAction truth table ---');

// 1. Mandatory plan assertions
assert.equal(
  resolveBackAction({ currentDirty: true, overlayOpen: true, detailOpen: true }),
  'confirm-discard',
  'dirty state must take highest priority over overlay and detail',
);

assert.equal(
  resolveBackAction({ currentDirty: false, overlayOpen: true, detailOpen: true }),
  'close-overlay',
  'when not dirty, overlay must take priority over detail pop',
);

assert.equal(
  resolveBackAction({ currentDirty: false, overlayOpen: false, detailOpen: true }),
  'pop-detail',
  'when not dirty and no overlay, detailOpen must pop-detail',
);

assert.equal(
  resolveBackAction({ currentDirty: false, overlayOpen: false, detailOpen: false }),
  'root',
  'at root without overlay or dirty state, must return root',
);

// 2. Full 8-case truth table coverage
assert.equal(
  resolveBackAction({ currentDirty: true, overlayOpen: false, detailOpen: true }),
  'confirm-discard',
);
assert.equal(
  resolveBackAction({ currentDirty: true, overlayOpen: true, detailOpen: false }),
  'confirm-discard',
);
assert.equal(
  resolveBackAction({ currentDirty: true, overlayOpen: false, detailOpen: false }),
  'confirm-discard',
);
assert.equal(
  resolveBackAction({ currentDirty: false, overlayOpen: true, detailOpen: false }),
  'close-overlay',
);

console.log('--- Testing Mobile Tabs and Screen Registry ---');
assert.equal(MOBILE_TABS.length, 5, 'Must have exactly 5 mobile tabs');
assert.deepEqual(
  MOBILE_TABS.map((t) => t.id),
  ['work', 'axis', 'knowledge', 'messages', 'me'],
  'Tabs order must be work, axis, knowledge, messages, me',
);

// Validate screens
assert.equal(isValidScreenForTab('work', 'work-root'), true);
assert.equal(isValidScreenForTab('work', 'work-tasks'), true);
assert.equal(isValidScreenForTab('work', 'axis-root'), false);
assert.equal(isValidScreenForTab('axis', 'axis-root'), true);
assert.equal(isValidScreenForTab('work', 'ai-root'), true);
assert.equal(isValidScreenForTab('knowledge', 'knowledge-root'), true);
assert.equal(isValidScreenForTab('messages', 'messages-root'), true);
assert.equal(isValidScreenForTab('me', 'me-root'), true);
assert.equal(screenOwnsHeader('me-security'), true, '账号安全页面自带返回顶栏');
assert.equal(screenOwnsHeader('me-appearance'), true, '外观页面自带返回顶栏');
assert.equal(screenOwnsHeader('axis-delegations'), true, '委托授权页面自带返回顶栏');

console.log('--- Testing Legacy Deep Link Mapping ---');
const r1 = mapLegacyViewToMobileRoute('tasks', { taskId: 'task-123' });
assert.equal(r1.tab, 'work');
assert.equal(r1.screen, 'work-task-detail');
assert.equal(r1.params.taskId, 'task-123');

const r2 = mapLegacyViewToMobileRoute('people-axis');
assert.equal(r2.tab, 'axis');
assert.equal(r2.screen, 'axis-root');

const r3 = mapLegacyViewToMobileRoute('reports');
assert.equal(r3.tab, 'work');
assert.equal(r3.screen, 'ai-root');

const r4 = mapLegacyViewToMobileRoute('inbox');
assert.equal(r4.tab, 'messages');
assert.equal(r4.screen, 'messages-root');

const r5 = mapLegacyViewToMobileRoute('team');
assert.equal(r5.tab, 'me');
assert.equal(r5.screen, 'me-team');

const r6 = mapLegacyViewToMobileRoute(null);
assert.equal(r6.tab, 'work');
assert.equal(r6.screen, 'work-root');
assert.equal(mapLegacyViewToMobileRoute('knowledge').tab, 'knowledge');
assert.equal(mapLegacyViewToMobileRoute('knowledge').screen, 'knowledge-root');
assert.equal(mapLegacyViewToMobileRoute('ai').tab, 'work');
assert.equal(mapLegacyViewToMobileRoute('ai').screen, 'ai-root');
assert.equal(normalizeMobileRoute({tab:'ai', screen:'ai-inbox', params:{reportId:'5'}}).tab, 'work');
assert.equal(normalizeMobileRoute({tab:'ai', screen:'ai-chat'}).tab, 'work');
assert.equal(normalizeMobileRoute({tab:'ai', screen:'ai-chat'}).screen, 'record-progress');
assert.equal(normalizeMobileRoute({tab:'axis', screen:'axis-evidence-submit'}).screen, 'record-progress');
assert.equal(normalizeMobileRoute({tab:'axis', screen:'record-progress'}).tab, 'axis');
assert.equal(normalizeMobileRoute({tab:'knowledge', screen:'record-progress'}).tab, 'knowledge');
assert.equal(normalizeMobileRoute({screen:'record-progress'}).tab, 'work');
assert.deepEqual(normalizeMobileRoute({tab:'me', screen:'me-knowledge', params:{knowledgeScope:'project'}}),
  {tab:'knowledge',screen:'knowledge-root',params:{knowledgeScope:'project'},presentation:'page'});

console.log('All resolveBackAction and mobile navigation assertions PASSED!');
