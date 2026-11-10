import React, { useEffect, useState } from 'react';
import { apiRequest } from '../api/client';

export function PushPreferenceRow({ enabled, checked, onChange, native = false }: {
  enabled: boolean; checked: boolean; onChange: (checked: boolean) => void; native?: boolean;
}) {
  if (!enabled) return null;
  return <label className="flex items-center justify-between gap-4 p-4 border-b border-outline-variant">
    <span><span className="block text-sm text-on-surface">{native ? '系统推送' : '手机推送'}</span>
      <span className="block text-xs text-on-surface-variant mt-1">在安卓 App 的系统通知栏接收工作提醒</span></span>
    <input aria-label={native ? '系统推送' : '手机推送'} type="checkbox" checked={checked} onChange={event => onChange(event.target.checked)} className="w-5 h-5 accent-primary cursor-pointer" />
  </label>;
}

export function PushPreferenceSwitch(props: { checked: boolean; onChange: (checked: boolean) => void; native?: boolean }) {
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    let active = true;
    void apiRequest<{ enabled: boolean }>('/push/status').then(status => {
      if (active) setEnabled(status.enabled === true);
    }).catch(() => { if (active) setEnabled(false); });
    return () => { active = false; };
  }, []);
  return <PushPreferenceRow {...props} enabled={enabled} />;
}
