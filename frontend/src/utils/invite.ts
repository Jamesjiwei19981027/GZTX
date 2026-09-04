const INVITE_KEY = 'pending_invite_token';

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
