import React, { useEffect, useState } from 'react';
import { AppSettings, Language } from '../../types';
import {
  getEmailStatus,
  getLlmConfig,
  getSmtpConfig,
  getWechatSubscribeStatus,
  putLlmConfig,
  putSmtpConfig,
  putWechatSubscribePreference,
  sendTestEmail,
  sendTestPush,
  testLlmConfig,
} from '../../api/notifications';

interface NotificationSettingsViewProps {
  settings: AppSettings;
  onUpdateSettings: (updated: Partial<AppSettings>) => void;
  onEnablePush?: () => Promise<void> | void;
  lang: Language;
}

type SmtpForm = {
  smtp_host: string;
  smtp_port: number;
  smtp_user: string;
  smtp_password: string;
  smtp_from: string;
};

type LlmForm = {
  provider: string;
  base_url: string;
  model: string;
  api_key: string;
  enabled: boolean;
  use_for_judge: boolean;
  use_for_agent: boolean;
};

const DEFAULT_SMTP: SmtpForm = {
  smtp_host: '',
  smtp_port: 465,
  smtp_user: '',
  smtp_password: '',
  smtp_from: '',
};

const DEFAULT_LLM: LlmForm = {
  provider: 'openai_compatible',
  base_url: '',
  model: '',
  api_key: '',
  enabled: true,
  use_for_judge: false,
  use_for_agent: false,
};

export const NotificationSettingsView: React.FC<NotificationSettingsViewProps> = ({
  settings,
  onUpdateSettings,
  onEnablePush,
  lang,
}) => {
  const zh = lang === 'zh';
  const [smtp, setSmtp] = useState<SmtpForm>(DEFAULT_SMTP);
  const [smtpHasPassword, setSmtpHasPassword] = useState(false);
  const [llm, setLlm] = useState<LlmForm>(DEFAULT_LLM);
  const [llmHasKey, setLlmHasKey] = useState(false);
  const [wechatBound, setWechatBound] = useState(false);
  const [wechatEnabled, setWechatEnabled] = useState(settings.notifications.wechat);
  const [emailStatus, setEmailStatus] = useState('');
  const [statusMessage, setStatusMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState<'smtp' | 'llm' | 'wechat' | null>(null);
  const [testing, setTesting] = useState<'email' | 'push' | 'llm' | null>(null);

  useEffect(() => {
    let cancelled = false;
    void Promise.all([
      getSmtpConfig(),
      getLlmConfig(),
      getWechatSubscribeStatus(),
      getEmailStatus(),
    ]).then(([smtpConfig, llmConfig, wx, email]) => {
      if (cancelled) return;
      setSmtp({
        smtp_host: smtpConfig.smtp_host || '',
        smtp_port: Number(smtpConfig.smtp_port || 465),
        smtp_user: smtpConfig.smtp_user || '',
        smtp_password: '',
        smtp_from: smtpConfig.smtp_from || '',
      });
      setSmtpHasPassword(Boolean(smtpConfig.has_password));
      setLlm({
        provider: llmConfig.provider || 'openai_compatible',
        base_url: llmConfig.base_url || '',
        model: llmConfig.model || '',
        api_key: '',
        enabled: llmConfig.enabled !== false,
        use_for_judge: Boolean((llmConfig as { use_for_judge?: boolean }).use_for_judge),
        use_for_agent: Boolean((llmConfig as { use_for_agent?: boolean }).use_for_agent),
      });
      setLlmHasKey(Boolean(llmConfig.has_api_key));
      setWechatBound(Boolean(wx.wx_bound));
      setWechatEnabled(Boolean(wx.subscription_enabled));
      setEmailStatus(email.smtp_configured ? `SMTP: ${email.smtp_source}` : (zh ? 'SMTP 未配置' : 'SMTP is not configured'));
    }).catch((reason) => {
      if (!cancelled) setError(reason instanceof Error ? reason.message : (zh ? '加载通知配置失败' : 'Unable to load notification settings'));
    });
    return () => { cancelled = true; };
  }, [zh]);

  const updateNotifications = (patch: Partial<AppSettings['notifications']>) => {
    onUpdateSettings({ notifications: { ...settings.notifications, ...patch } });
  };

  const run = async (kind: 'smtp' | 'llm' | 'wechat', action: () => Promise<unknown>) => {
    setSaving(kind);
    setError(null);
    setStatusMessage(null);
    try {
      await action();
      setStatusMessage(zh ? '已保存' : 'Saved');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (zh ? '保存失败' : 'Save failed'));
    } finally {
      setSaving(null);
    }
  };

  const runTest = async (kind: 'email' | 'push' | 'llm', action: () => Promise<unknown>) => {
    setTesting(kind);
    setError(null);
    setStatusMessage(null);
    try {
      await action();
      setStatusMessage(zh ? '测试请求已发送' : 'Test request sent');
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : (zh ? '测试失败' : 'Test failed'));
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="max-w-[1100px] mx-auto w-full pb-20 md:pb-8 space-y-6 animate-in fade-in duration-300">
      <div>
        <h1 className="text-3xl font-extrabold text-on-surface dark:text-[#f0f1f2] tracking-tight">
          {zh ? '通知中心' : 'Notification Center'}
        </h1>
        <p className="text-sm text-on-surface-variant mt-1">
          {zh ? '集中管理通知渠道、静音规则和个人 SMTP/LLM 配置。' : 'Manage notification channels, quiet hours, and personal SMTP/LLM settings.'}
        </p>
      </div>

      {(error || statusMessage) && (
        <div className={`px-4 py-3 rounded-xl text-sm border ${error ? 'bg-error-container text-on-error-container border-error/30' : 'bg-secondary-container text-on-secondary-container border-secondary/30'}`}>
          {error || statusMessage}
        </div>
      )}

      <section className="bg-surface dark:bg-[#191c1d] p-6 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm space-y-4">
        <div className="pb-3 border-b border-surface-variant">
          <h2 className="text-xl font-bold">{zh ? '提醒渠道' : 'Alert channels'}</h2>
          <p className="text-xs text-on-surface-variant mt-1">{zh ? '开关会同步到用户通知偏好；Web Push 仍需浏览器授权。' : 'Channel switches sync to your user preferences; Web Push still requires browser permission.'}</p>
        </div>
        {([
          ['email', zh ? '邮件提醒' : 'Email alerts', zh ? '每日摘要和任务提醒' : 'Daily digest and task reminders', 'mail'],
          ['desktop', zh ? '桌面提醒' : 'Desktop alerts', zh ? '浏览器级弹窗' : 'Browser-level prompts', 'desktop_windows'],
        ] as const).map(([key, title, subtitle, icon]) => (
          <label key={key} className="flex items-center justify-between p-4 bg-surface-container-low dark:bg-[#2e3132] rounded-2xl cursor-pointer">
            <span className="flex items-center gap-3"><span className="material-symbols-outlined text-primary text-2xl">{icon}</span><span><span className="block font-bold text-sm">{title}</span><span className="block text-xs text-on-surface-variant mt-0.5">{subtitle}</span></span></span>
            <input type="checkbox" checked={settings.notifications[key]} onChange={(e) => updateNotifications({ [key]: e.target.checked })} className="w-5 h-5 accent-primary rounded" />
          </label>
        ))}
        <label className="flex items-center justify-between p-4 bg-surface-container-low dark:bg-[#2e3132] rounded-2xl cursor-pointer">
          <span className="flex items-center gap-3"><span className="material-symbols-outlined text-secondary text-2xl">notifications_active</span><span><span className="block font-bold text-sm">{zh ? '浏览器推送' : 'Browser push'}</span><span className="block text-xs text-on-surface-variant mt-0.5">{zh ? '授权后接收实时提醒' : 'Authorize this browser for real-time alerts'}</span></span></span>
          <input type="checkbox" checked={settings.notifications.push} onChange={(e) => {
            const checked = e.target.checked;
            if (checked && onEnablePush) void Promise.resolve(onEnablePush()).then(() => updateNotifications({ push: true })).catch((reason) => setError(reason instanceof Error ? reason.message : (zh ? 'Web Push 授权失败' : 'Web Push authorization failed')));
            else updateNotifications({ push: checked });
          }} className="w-5 h-5 accent-primary rounded" />
        </label>
        <label className="flex items-center justify-between p-4 bg-surface-container-low dark:bg-[#2e3132] rounded-2xl cursor-pointer">
          <span className="flex items-center gap-3"><span className="material-symbols-outlined text-secondary text-2xl">chat</span><span><span className="block font-bold text-sm">{zh ? '微信提醒' : 'WeChat alerts'}</span><span className="block text-xs text-on-surface-variant mt-0.5">{wechatBound ? (zh ? '已绑定服务号，可接收模板消息' : 'Bound and ready for template messages') : (zh ? '请先完成微信绑定' : 'Bind WeChat before enabling')}</span></span></span>
          <input type="checkbox" checked={wechatEnabled} disabled={!wechatBound || saving === 'wechat'} onChange={(e) => {
            const checked = e.target.checked;
            setWechatEnabled(checked);
            void run('wechat', async () => { await putWechatSubscribePreference(checked); updateNotifications({ wechat: checked }); });
          }} className="w-5 h-5 accent-primary rounded disabled:opacity-40" />
        </label>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <label className="text-xs font-bold text-on-surface-variant">{zh ? '静音开始' : 'Quiet hours start'}<input type="time" value={settings.notifications.quietHoursStart} onChange={(e) => updateNotifications({ quietHoursStart: e.target.value })} className="mt-1 w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-xl text-sm" /></label>
          <label className="text-xs font-bold text-on-surface-variant">{zh ? '静音结束' : 'Quiet hours end'}<input type="time" value={settings.notifications.quietHoursEnd} onChange={(e) => updateNotifications({ quietHoursEnd: e.target.value })} className="mt-1 w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-xl text-sm" /></label>
        </div>
        <label className="flex items-center gap-3 text-sm font-semibold cursor-pointer"><input type="checkbox" checked={settings.notifications.weekendMute} onChange={(e) => updateNotifications({ weekendMute: e.target.checked })} className="w-5 h-5 accent-primary rounded" />{zh ? '周末全天免打扰' : 'Mute all weekend'}</label>
      </section>

      <section className="bg-surface dark:bg-[#191c1d] p-6 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-surface-variant"><div><h2 className="text-xl font-bold">SMTP</h2><p className="text-xs text-on-surface-variant mt-1">{emailStatus || (zh ? '状态加载中…' : 'Loading status…')}</p></div><button type="button" onClick={() => void runTest('email', sendTestEmail)} disabled={testing === 'email'} className="px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-bold disabled:opacity-50">{testing === 'email' ? '…' : (zh ? '发测试邮件' : 'Send test email')}</button></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {([['smtp_host', zh ? '主机' : 'Host'], ['smtp_port', zh ? '端口' : 'Port'], ['smtp_user', zh ? '账号' : 'User'], ['smtp_from', zh ? '发件人' : 'From']] as const).map(([key, label]) => <label key={key} className="text-xs font-bold text-on-surface-variant">{label}<input type={key === 'smtp_port' ? 'number' : 'text'} value={smtp[key]} onChange={(e) => setSmtp((prev) => ({ ...prev, [key]: key === 'smtp_port' ? Number(e.target.value) : e.target.value }))} className="mt-1 w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-xl text-sm" /></label>)}
        </div>
        <label className="text-xs font-bold text-on-surface-variant">{zh ? '密码' : 'Password'}{smtpHasPassword && <span className="ml-2 text-secondary">({zh ? '已配置，留空不改' : 'configured; blank keeps it'})</span>}<input type="password" autoComplete="new-password" value={smtp.smtp_password} onChange={(e) => setSmtp((prev) => ({ ...prev, smtp_password: e.target.value }))} className="mt-1 w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-xl text-sm" /></label>
        <button type="button" onClick={() => void run('smtp', async () => { const saved = await putSmtpConfig({ ...smtp, smtp_password: smtp.smtp_password || undefined }); setSmtpHasPassword(Boolean(saved?.has_password ?? true)); })} disabled={saving === 'smtp'} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50">{saving === 'smtp' ? '…' : (zh ? '保存 SMTP' : 'Save SMTP')}</button>
      </section>

      <section className="bg-surface dark:bg-[#191c1d] p-6 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm space-y-4">
        <div className="flex items-center justify-between pb-3 border-b border-surface-variant"><div><h2 className="text-xl font-bold">LLM</h2><p className="text-xs text-on-surface-variant mt-1">{llmHasKey ? (zh ? 'API Key 已配置（已脱敏）' : 'API key configured (masked)') : (zh ? '未配置个人 API Key' : 'No personal API key')}</p></div><button type="button" onClick={() => void runTest('llm', testLlmConfig)} disabled={testing === 'llm'} className="px-3 py-2 rounded-lg bg-primary/10 text-primary text-xs font-bold disabled:opacity-50">{testing === 'llm' ? '…' : (zh ? '测试 LLM' : 'Test LLM')}</button></div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {([['provider', zh ? 'Provider' : 'Provider'], ['base_url', zh ? 'Base URL' : 'Base URL'], ['model', zh ? '模型' : 'Model']] as const).map(([key, label]) => <label key={key} className="text-xs font-bold text-on-surface-variant">{label}<input value={llm[key]} onChange={(e) => setLlm((prev) => ({ ...prev, [key]: e.target.value }))} className="mt-1 w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-xl text-sm" /></label>)}
          <label className="text-xs font-bold text-on-surface-variant">API Key{llmHasKey && <span className="ml-2 text-secondary">({zh ? '留空不改' : 'blank keeps it'})</span>}<input type="password" autoComplete="new-password" value={llm.api_key} onChange={(e) => setLlm((prev) => ({ ...prev, api_key: e.target.value }))} className="mt-1 w-full px-3 py-2 bg-surface-container-low border border-outline-variant rounded-xl text-sm" /></label>
        </div>
        <div className="flex flex-wrap gap-4 text-xs font-semibold"><label className="flex items-center gap-2"><input type="checkbox" checked={llm.enabled} onChange={(e) => setLlm((prev) => ({ ...prev, enabled: e.target.checked }))} className="accent-primary" />{zh ? '启用个人 LLM' : 'Enable personal LLM'}</label><label className="flex items-center gap-2"><input type="checkbox" checked={llm.use_for_judge} onChange={(e) => setLlm((prev) => ({ ...prev, use_for_judge: e.target.checked }))} className="accent-primary" />{zh ? '用于判定' : 'Use for judge'}</label><label className="flex items-center gap-2"><input type="checkbox" checked={llm.use_for_agent} onChange={(e) => setLlm((prev) => ({ ...prev, use_for_agent: e.target.checked }))} className="accent-primary" />{zh ? '用于智能体' : 'Use for agent'}</label></div>
        <button type="button" onClick={() => void run('llm', async () => { const saved = await putLlmConfig({ ...llm, api_key: llm.api_key || undefined }); setLlmHasKey(Boolean(saved?.has_api_key ?? true)); })} disabled={saving === 'llm'} className="px-4 py-2 rounded-lg bg-primary text-on-primary text-xs font-bold disabled:opacity-50">{saving === 'llm' ? '…' : (zh ? '保存 LLM' : 'Save LLM')}</button>
      </section>

      <div className="flex items-center gap-3"><button type="button" onClick={() => void runTest('push', sendTestPush)} disabled={testing === 'push'} className="px-4 py-2 rounded-lg border border-outline-variant text-xs font-bold disabled:opacity-50">{testing === 'push' ? '…' : (zh ? '发送推送测试' : 'Send push test')}</button><span className="text-xs text-on-surface-variant">{zh ? '生产环境需设置 VAPID、微信服务号、SMTP 和 LLM 凭证。' : 'Production requires VAPID, WeChat service, SMTP, and LLM credentials.'}</span></div>
    </div>
  );
};
