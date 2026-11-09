import React, { useEffect, useRef, useState } from 'react';
import { completeSso, getSsoOptions, startSso, type SsoOption } from '../api/sso';
import type { AuthTokenPayload } from '../api/auth';

/** 登录页、手机认证页和正式 APP 共享同一重定向/票据处理。 */
export function SsoLoginButtons({ onLoggedIn }: { onLoggedIn?: (payload?: AuthTokenPayload) => void }) {
  const [options, setOptions] = useState<SsoOption[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const completing = useRef(false);
  const callback = useRef(onLoggedIn);
  callback.current = onLoggedIn;
  useEffect(() => {
    let active = true;
    void getSsoOptions().then(data => { if (active) setOptions(data?.items || []); }).catch(() => {});
    return () => { active = false; };
  }, []);
  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.slice(1));
    const ticket = params.get('sso_ticket');
    if (!ticket || completing.current) return;
    completing.current = true;
    // 及时清除历史记录中的短期票据，保留 mobile、邀请及原页面查询参数。
    window.history.replaceState(window.history.state, '', window.location.pathname + window.location.search);
    setBusy(true);
    void completeSso(ticket).then(data => callback.current?.(data)).catch(err => {
      setError(err instanceof Error ? err.message : '单点登录失败，请重新扫码');
    }).finally(() => setBusy(false));
  }, []);
  if (!options.length && !busy && !error) return null;
  return <div className="space-y-3 w-full" aria-label="企业单点登录">
    {options.map(option => <button key={`${option.company_id}-${option.provider}`} type="button" disabled={busy}
      className="w-full rounded-xl border border-outline-variant px-3 py-3 text-sm font-semibold text-primary disabled:opacity-50"
      onClick={() => {
        setBusy(true); setError('');
        void startSso(option).catch(err => { setError(err instanceof Error ? err.message : '无法发起企业登录'); setBusy(false); });
      }}>
      {option.provider === 'dingtalk' ? '钉钉扫码登录' : '企业单点登录'}
      {options.filter(item => item.provider === option.provider).length > 1 ? `（${option.company_name}）` : ''}
    </button>)}
    {busy && <p role="status" className="text-xs text-on-surface-variant">正在连接企业登录…</p>}
    {error && <p role="alert" className="text-sm text-red-600">{error}</p>}
  </div>;
}
