import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const view = fs.readFileSync(path.join(root, 'src/components/views/NotificationSettingsView.tsx'), 'utf8');
const api = fs.readFileSync(path.join(root, 'src/api/notifications.ts'), 'utf8');
const app = fs.readFileSync(path.join(root, 'src/App.tsx'), 'utf8');

const assertions: [string, boolean][] = [
  ['standalone notifications view is wired', app.includes("activeView === 'notifications'")],
  ['SMTP config endpoint is used', view.includes('putSmtpConfig') && api.includes("/notifications/smtp-config")],
  ['LLM config endpoint is used', view.includes('putLlmConfig') && api.includes("/notifications/llm-config")],
  ['WeChat status is visible', view.includes('getWechatSubscribeStatus') && view.includes('wechatBound')],
  ['push test action exists', view.includes('sendTestPush') && api.includes("/notifications/test-push")],
  ['secrets are entered but never rendered', view.includes('type="password"') && !view.includes('llm.api_key}</span>')],
];

const failures = assertions.filter(([, passed]) => !passed).map(([name]) => name);
if (failures.length) {
  throw new Error(`notification settings contract failed: ${failures.join(', ')}`);
}
console.log(`notification settings contract: ${assertions.length} assertions passed`);
