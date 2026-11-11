// 准备脚本：建 C- 项目 + 注册 C- 成员（邀请+mailpit 验证码）+ 挂人轴。结果写入 state.json
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir = path.dirname(fileURLToPath(import.meta.url));
const B = 'http://127.0.0.1:8097/api/v1', M = 'http://127.0.0.1:8025/api/v1';
const envTxt = fs.readFileSync((process.env.AUDIT_CRED_FILE || 'C:/Users/11580/AppData/Local/Temp/claude/0ea118bfe5784990/63b0b73d-66cc-42ca-9829-633749930870/scratchpad/audit/credentials.env'), 'utf8');
const env = Object.fromEntries(envTxt.split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function api(method, url, body, token) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; }
  return { status: r.status, j };
}
const login = async (u, p) => { const r = await api('POST', '/auth/login', { username: u, password: p }); if (r.status !== 200) throw new Error('login ' + u + ' ' + r.status + JSON.stringify(r.j)); return r.j.data.access_token; };
const PASS = 'CAudit-Pass-2026!';
const stateFile = path.join(dir, 'state.json');
const state = fs.existsSync(stateFile) ? JSON.parse(fs.readFileSync(stateFile, 'utf8')) : {};
const admin = await login(env.AUDIT_ADMIN_USER, env.AUDIT_ADMIN_PASSWORD);
const me = (await api('GET', '/users/me', null, admin)).j.data;
state.admin = { id: me.id, username: env.AUDIT_ADMIN_USER };
if (!state.project) {
  const p = await api('POST', '/projects', { name: 'C-进展汇报项目', company_id: 1 }, admin);
  console.log('project', p.status, JSON.stringify(p.j).slice(0, 200));
  state.project = p.j.data;
}
const pid = state.project.id;
async function ensureMember(key, label) {
  if (state[key]) return;
  const username = 'c_' + key, email = `C-${key}@audit-c.example.com`;
  const inv = await api('POST', `/projects/${pid}/invitations`, { email }, admin);
  console.log('invite', key, inv.status, JSON.stringify(inv.j).slice(0, 200));
  const token = inv.j.data.token;
  const sc = await api('POST', '/auth/send-code', { channel: 'email', target: email, purpose: 'register', invite_token: token });
  console.log('send-code', sc.status, JSON.stringify(sc.j).slice(0, 150));
  let code;
  for (let i = 0; i < 20 && !code; i++) {
    await sleep(700);
    const s = await (await fetch(`${M}/search?query=${encodeURIComponent('to:' + email)}`)).json();
    for (const m of (s.messages || [])) {
      const d = await (await fetch(`${M}/message/${m.ID}`)).json();
      const mm = /(\d{6})/.exec(d.Text || '');
      if (mm) { code = mm[1]; break; }
    }
  }
  if (!code) throw new Error('no code');
  const reg = await api('POST', '/auth/register', { username, password: PASS, email, email_code: code, nickname: label, invite_token: token });
  console.log('register', reg.status, JSON.stringify(reg.j).slice(0, 300));
  const tk = await login(username, PASS);
  const u = (await api('GET', '/users/me', null, tk)).j.data;
  const acc = await api('POST', `/projects/invitations/${token}/accept`, null, tk);
  console.log('accept', acc.status, JSON.stringify(acc.j).slice(0, 200));
  state[key] = { id: u.id, username, nickname: label, email };
}
await ensureMember('m1', 'C成员一');
await ensureMember('m2', 'C成员二');
// 管理员设为 PM
const pm = await api('POST', `/projects/${pid}/pm`, { user_id: me.id }, admin);
console.log('pm', pm.status, JSON.stringify(pm.j).slice(0, 150));
const treeR = await api('GET', `/projects/${pid}/tree?format=flat`, null, admin);
let nodes = treeR.j.data.nodes; console.log('nodes', nodes.map(n => [n.id, n.node_type_key, n.title, n.parent_id]));
async function mk(body) { const r = await api('POST', `/projects/${pid}/nodes`, body, admin); console.log('node', body.title, r.status, JSON.stringify(r.j).slice(0, 200)); return r.j.data; }
let root = nodes.find(n => !n.parent_id && n.node_type_key === 'person');
if (!root) root = await mk({ node_type_key: 'person', title: 'C-负责人(PM)', assignees: [{ user_id: me.id, role_key: 'primary' }] });
state.rootId = root.id;
for (const k of ['m1', 'm2']) {
  let pn = nodes.find(n => n.title === 'C-人-' + k);
  if (!pn) pn = await mk({ parent_id: root.id, node_type_key: 'person', title: 'C-人-' + k, assignees: [{ user_id: state[k].id, role_key: 'primary' }] });
  state[k].personNodeId = pn.id;
  let wi = nodes.find(n => n.title === 'C-工作项-' + k);
  if (!wi) wi = await mk({ parent_id: pn.id, node_type_key: 'work_item', title: 'C-工作项-' + k, assignees: [{ user_id: state[k].id, role_key: 'primary' }] });
  state[k].workItemId = wi.id;
}
fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
console.log(JSON.stringify(state));
