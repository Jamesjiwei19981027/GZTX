import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const shell = fs.readFileSync(path.join(root, 'src/api/shell.ts'), 'utf8');
const messages = fs.readFileSync(path.join(root, 'src/components/views/MessagesView.tsx'), 'utf8');
const inbox = fs.readFileSync(path.join(root, 'src/components/views/InboxView.tsx'), 'utf8');

const assertions: [string, boolean][] = [
  ['call config API exists', shell.includes('getCallConfig') && shell.includes('/calls/config')],
  ['voice/video panel exposes signaling state', messages.includes('callMode') && messages.includes('STUN')],
  ['missing ICE config is explained', messages.includes('TURN') && messages.includes('not configured')],
  ['external mail status API exists', shell.includes('getExternalMailStatus') && shell.includes('/external-mail/status')],
  ['external mail is explicit in inbox', inbox.includes('external-mail') && inbox.includes('configuration')],
];

const failures = assertions.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) throw new Error(`calls/mail contract failed: ${failures.join(', ')}`);
console.log(`calls/mail contract: ${assertions.length} assertions passed`);

