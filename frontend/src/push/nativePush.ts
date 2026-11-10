import { apiRequest } from '../api/client';

type Extras = Record<string, unknown>;
type Request = (path: string, init?: RequestInit) => Promise<unknown>;
let unregisterSession: (() => Promise<void>) | undefined;
let notification: Extras | undefined;
let openNotification: ((extras: Extras) => void) | undefined;
let sequence = 0;

async function boundedRequest(request: Request, path: string, init: RequestInit = {}) {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new Error('push cleanup timeout')); }, 1500);
  });
  try { return await Promise.race([request(path, { ...init, signal: controller.signal }), deadline]); }
  finally { clearTimeout(timer!); }
}

function postNative(type: string, data: Extras = {}) {
  window.FlutterBridge?.postMessage(JSON.stringify({ type, ...data }));
}

export function subscribePushOpen(open: (extras: Extras) => void) {
  openNotification = open;
  if (notification) { open(notification); notification = undefined; }
  return () => { if (openNotification === open) openNotification = undefined; };
}

/** 网页自己使用登录会话访问 API，宿主/SDK 不接收网页令牌。 */
export function bindNativePushSession(request: Request = apiRequest) {
  const sessionId = `${Date.now()}-${++sequence}`;
  const send = (type: string, data: Extras = {}) => postNative(type, { ...data, session_id: sessionId });
  let active = true;
  let rid: string | undefined;
  let writes = Promise.resolve();
  const register = (event: Event) => {
    const value = (event as CustomEvent).detail?.registration_id;
    if (!active || (event as CustomEvent).detail?.session_id !== sessionId || typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(value)) return;
    rid = value;
    writes = writes.then(async () => {
      if (!active) return;
      const result = await boundedRequest(request, '/push/devices', { method: 'POST', body: JSON.stringify({ platform: 'android', registration_id: value, app_version: '2.0.0+2' }) });
      if (active && (result as { enabled?: boolean })?.enabled === true) send('pushRegistered', { registration_id: value });
    }).catch(() => undefined);
  };
  const opened = (event: Event) => {
    const extras = (event as CustomEvent).detail;
    if (!active || !extras || extras.session_id !== sessionId || typeof extras !== 'object' || Array.isArray(extras)) return;
    const { session_id: _, ...payload } = extras;
    if (openNotification) openNotification(payload); else notification = payload;
    send('pushNotificationHandled');
  };
  const sync = async () => {
    if (!active || !window.FlutterBridge) return;
    try {
      const status = await boundedRequest(request, '/push/status');
      if (active) send('pushSession', { enabled: (status as { enabled?: boolean })?.enabled === true });
    } catch { if (active) send('pushSession', { enabled: false }); }
  };
  const unregister = async () => {
    active = false;
    notification = undefined;
    send('pushSession', { enabled: false });
    await writes;
    try { if (rid) await boundedRequest(request, `/push/devices/${encodeURIComponent(rid)}`, { method: 'DELETE' }); }
    catch { /* 本机仍停止推送；不阻碍登出。 */ }
  };
  unregisterSession = unregister;
  window.addEventListener('nativePushRegistration', register);
  window.addEventListener('nativePushOpen', opened);
  window.addEventListener('nativeRuntimeChange', sync);
  window.addEventListener('nativeAppResumed', sync);
  void sync();
  return () => {
    active = false;
    notification = undefined;
    send('pushSession', { enabled: false });
    window.removeEventListener('nativePushRegistration', register);
    window.removeEventListener('nativePushOpen', opened);
    window.removeEventListener('nativeRuntimeChange', sync);
    window.removeEventListener('nativeAppResumed', sync);
    if (unregisterSession === unregister) unregisterSession = undefined;
  };
}

export async function unregisterNativePush() { await unregisterSession?.(); }
