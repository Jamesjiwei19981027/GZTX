import fs from 'node:fs'; import path from 'node:path'; import { fileURLToPath } from 'node:url';
export const dir = path.dirname(fileURLToPath(import.meta.url));
export const B = 'http://127.0.0.1:8097/api/v1';
const envTxt = fs.readFileSync((process.env.AUDIT_CRED_FILE || 'C:/Users/11580/AppData/Local/Temp/claude/0ea118bfe5784990/63b0b73d-66cc-42ca-9829-633749930870/scratchpad/audit/credentials.env'), 'utf8');
export const env = Object.fromEntries(envTxt.split(/\r?\n/).filter(l => l.includes('=')).map(l => [l.slice(0, l.indexOf('=')).trim(), l.slice(l.indexOf('=') + 1).trim().replace(/^["']|["']$/g, '')]));
export const state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8'));
export async function api(method, url, body, token) {
  const r = await fetch(B + url, { method, headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) }, body: body ? JSON.stringify(body) : undefined });
  const t = await r.text(); let j; try { j = JSON.parse(t); } catch { j = t; } return { status: r.status, j };
}
export const login = async (u, p) => (await api('POST', '/auth/login', { username: u, password: p })).j.data.access_token;
export const PASS = 'CAudit-Pass-2026!';
