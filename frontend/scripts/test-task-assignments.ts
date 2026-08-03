import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');
const types = read('src/types.ts');
const backend = read('src/api/backend.ts');
const mapper = read('src/api/mappers.ts');
const modal = read('src/components/modals/NewTaskModal.tsx');
const drawer = read('src/components/modals/TaskDetailDrawer.tsx');
const kanban = read('src/components/views/KanbanView.tsx');
const app = read('src/App.tsx');

const assertions: [string, boolean][] = [
  ['Task has multi-assignee contract', types.includes('assignees?: TeamMember[]') && types.includes('assigneeUserIds?: string[]')],
  ['backend DTO exposes assignees', backend.includes('assignees?: BackendAssignee[]') && backend.includes('assignee_user_ids')],
  ['mapper maps assignees and legacy primary', mapper.includes('mapAssignee') && mapper.includes('assignee: primary')],
  ['new task modal selects project members', modal.includes('assigneeUserIds') && modal.includes('members.map')],
  ['detail drawer can update assignments', drawer.includes('assigneeUserIds') && drawer.includes('onUpdateTask')],
  ['kanban renders stacked assignees', kanban.includes('task.assignees') && kanban.includes('+')],
  ['app sends assignment IDs to API', app.includes('assignee_user_ids')],
];

const failures = assertions.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) {
  throw new Error(`task assignment contract failed: ${failures.join(', ')}`);
}
console.log(`task assignment contract: ${assertions.length} assertions passed`);

