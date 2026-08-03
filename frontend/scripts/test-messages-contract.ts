import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const shell = fs.readFileSync(path.join(root, 'src/api/shell.ts'), 'utf8');
const view = fs.readFileSync(path.join(root, 'src/components/views/MessagesView.tsx'), 'utf8');
const types = fs.readFileSync(path.join(root, 'src/types.ts'), 'utf8');

const assertions: [string, boolean][] = [
  ['collab file upload API exists', shell.includes('/files') && shell.includes('FormData')],
  ['messages support file IDs', shell.includes('file_ids')],
  ['message type carries attachments', types.includes('attachments?: MessageAttachment[]') && view.includes('attachments')],
  ['binary picker and upload state exist', view.includes('type="file"') && view.includes('uploadingFiles')],
  ['emoji quick picker exists', view.includes('emoji') && view.includes('showEmojiPicker')],
  ['activity bubbles use backend activity', view.includes('listUserActivity') && view.includes('activityItems')],
];

const failures = assertions.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) throw new Error(`messages contract failed: ${failures.join(', ')}`);
console.log(`messages contract: ${assertions.length} assertions passed`);

