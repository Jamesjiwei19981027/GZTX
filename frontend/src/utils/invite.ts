const INVITE_KEY = 'pending_invite_token';

/** 手动加入共用解析：邀请码、网页邀请链接和原生邀请深链。 */
export function parseInviteInput(input: string): string {
  const value = input.trim();
  const valid = (token: string | null | undefined) => Boolean(token && /^[A-Za-z0-9_-]{1,256}$/.test(token));
  if (valid(value)) return value;
  try {
    const url = new URL(value);
    if (!['http:', 'https:', 'worktodo:'].includes(url.protocol)) throw new Error();
    if (url.protocol === 'worktodo:' && url.hostname !== 'invite') throw new Error();
    const token = url.searchParams.get('invite') || url.searchParams.get('token')
      || (url.protocol === 'worktodo:' ? decodeURIComponent(url.pathname.replace(/^\//, '')) : null);
    if (valid(token)) return token!;
  } catch { /* 统一给用户显示中文输入提示。 */ }
  throw new Error('请粘贴有效的邀请码或邀请链接');
}

export function readInviteToken(): string | null {
  if (typeof window === 'undefined') return null;
  const fromUrl = new URLSearchParams(window.location.search).get('invite')?.trim();
  if (fromUrl) {
    sessionStorage.setItem(INVITE_KEY, fromUrl);
    return fromUrl;
  }
  return sessionStorage.getItem(INVITE_KEY);
}

export function clearInviteToken(): void {
  if (typeof window === 'undefined') return;
  sessionStorage.removeItem(INVITE_KEY);
  const url = new URL(window.location.href);
  if (url.searchParams.has('invite')) {
    url.searchParams.delete('invite');
    const next = `${url.pathname}${url.search}${url.hash}`;
    window.history.replaceState({}, '', next || '/');
  }
}

export function inviteAcceptUrl(token: string): string {
  const origin = typeof window === 'undefined' ? '' : window.location.origin;
  return `${origin}/?invite=${encodeURIComponent(token)}`;
}

export function slugFromName(name: string): string {
  const ascii = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return ascii || `ws-${Date.now().toString(36)}`;
}
