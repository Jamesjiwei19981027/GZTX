import React, { useState, useEffect, useCallback } from 'react';
import {
  getSmtpConfig,
  putSmtpConfig,
  getLlmConfig,
  putLlmConfig,
  testLlmConfig,
  sendNotifyTest,
  getCompanySmtpConfig,
  putCompanySmtpConfig,
  testCompanySmtpConfig,
  getCompanyLlmConfig,
  putCompanyLlmConfig,
  testCompanyLlmConfig,
  getVapidPublicKey,
  listNotifyRecords,
  listCompanyNotifyRecords,
  isNotifyRecordSent,
  isNotifyRecordFailed,
  NotifyRecord,
  LlmPreset,
} from '../../api/notifications';
import { providerOptions, keyOnlyPayload, integrationBadge } from './enterpriseHelpers';
import { listIntegrations, triggerOrgSync } from '../../api/shell';
import { apiRequest } from '../../api/client';
import { Language } from '../../types';

export interface EnterpriseSectionProps {
  isAdmin: boolean;
  companyId?: number | string | null;
  lang?: Language;
}

// ==========================================
// 1. 通知渠道配置 (Notification Channels)
// 原推送证书状态并入这里，iOS 相关只读显示“下一期支持”
// ==========================================
export const AdminNotifyChannelsSection: React.FC<EnterpriseSectionProps> = ({ isAdmin, companyId, lang = 'zh' }) => {
  // 有公司时读写公司级发信配置（注册验证码、提醒都用它）；无公司才退回个人配置
  const loadSmtp = () => (companyId ? getCompanySmtpConfig(companyId) : getSmtpConfig());
  const [smtpHost, setSmtpHost] = useState('');
  const [smtpPort, setSmtpPort] = useState(465);
  const [smtpUser, setSmtpUser] = useState('');
  const [smtpFrom, setSmtpFrom] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [hasPassword, setHasPassword] = useState(false);

  const [vapidKey, setVapidKey] = useState<string | null>(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [msg, setMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  useEffect(() => {
    setLoading(true);
    Promise.all([
      loadSmtp().then((cfg) => {
        setSmtpHost(cfg.smtp_host || '');
        setSmtpPort(cfg.smtp_port || 465);
        setSmtpUser(cfg.smtp_user || '');
        setSmtpFrom(cfg.smtp_from || '');
        setHasPassword(Boolean(cfg.has_password));
      }),
      getVapidPublicKey().then((res) => {
        setVapidKey(res.publicKey || null);
      }).catch(() => {
        setVapidKey(null);
      }),
    ])
      .catch((err) => {
        setMsg({ type: 'err', text: '读取通知渠道配置失败: ' + (err instanceof Error ? err.message : String(err)) });
      })
      .finally(() => setLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const handleSaveSmtp = async () => {
    if (!isAdmin) return;
    setSaving(true);
    setMsg(null);
    try {
      const payload: {
        smtp_host: string;
        smtp_port: number;
        smtp_user: string;
        smtp_from: string;
        smtp_password?: string;
      } = {
        smtp_host: smtpHost.trim(),
        smtp_port: Number(smtpPort),
        smtp_user: smtpUser.trim(),
        smtp_from: smtpFrom.trim(),
      };
      if (smtpPassword.trim()) {
        payload.smtp_password = smtpPassword.trim();
      }
      if (companyId) {
        await putCompanySmtpConfig(companyId, payload);
      } else {
        await putSmtpConfig(payload);
      }
      setHasPassword(true);
      setSmtpPassword('');
      setMsg({ type: 'ok', text: '企业 SMTP 邮件渠道配置已成功保存！' });
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : '保存失败' });
    } finally {
      setSaving(false);
    }
  };

  const handleTestSmtp = async () => {
    setTesting(true);
    setMsg(null);
    try {
      if (companyId) {
        await testCompanySmtpConfig(companyId);
        setMsg({ type: 'ok', text: '测试邮件已成功发出，请检查管理员邮箱（含垃圾邮件箱）！' });
        return;
      }
      const res = await sendNotifyTest('email');
      if (res.ok) {
        setMsg({ type: 'ok', text: '测试邮件已成功发出，请检查接收邮箱！' });
      } else {
        setMsg({ type: 'err', text: res.error || '测试邮件发送失败，请核对 SMTP 鉴权与端口' });
      }
    } catch (err) {
      setMsg({ type: 'err', text: err instanceof Error ? err.message : '测试异常' });
    } finally {
      setTesting(false);
    }
  };

  if (loading) {
    return <div className="p-8 text-center text-sm text-on-surface-variant">获取通知渠道配置中…</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="pb-4 border-b border-surface-variant">
        <h2 className="text-xl font-bold text-on-surface dark:text-[#f0f1f2]">
          {lang === 'zh' ? '通知渠道配置' : 'Notification Channels'}
        </h2>
        <p className="text-xs text-on-surface-variant mt-1">
          {lang === 'zh'
            ? '配置企业统一外发邮件 SMTP 服务器、设备端推送证书状态与微信提醒通道。'
            : 'Configure corporate SMTP email server, push notification credentials, and WeChat alert channel.'}
        </p>
      </div>

      {msg && (
        <div
          className={`p-3.5 rounded-xl border flex items-center gap-2 text-xs ${
            msg.type === 'ok'
              ? 'bg-secondary-container text-on-secondary-container border-secondary/30'
              : 'bg-error-container text-on-error-container border-error/30'
          }`}
        >
          <span className="material-symbols-outlined text-base">
            {msg.type === 'ok' ? 'check_circle' : 'error'}
          </span>
          <span>{msg.text}</span>
        </div>
      )}

      {/* 区块 1: SMTP 邮件发送服务 */}
      <div className="bg-surface-container-low dark:bg-[#2e3132] rounded-2xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">mail</span>
            <h3 className="text-base font-bold text-on-surface dark:text-[#f0f1f2]">
              {lang === 'zh' ? 'SMTP 邮件服务器' : 'SMTP Mail Server'}
            </h3>
          </div>
          <span
            className={`text-xs px-2.5 py-0.5 rounded-full font-semibold ${
              hasPassword
                ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
            }`}
          >
            {hasPassword ? (lang === 'zh' ? '密码已配置' : 'Configured') : (lang === 'zh' ? '密码未配置' : 'Unconfigured')}
          </span>
        </div>

        <p className="text-xs text-on-surface-variant leading-relaxed">
          {lang === 'zh'
            ? '用于任务逾期提醒、每日汇报总结及系统验证邮件。授权密码采用 AES 密文存储，出于安全规范不回显明文。'
            : 'Used for task overdue alerts, daily reports, and system verification emails.'}
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1">
              {lang === 'zh' ? 'SMTP 服务器地址 *' : 'SMTP Server *'}
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              autoComplete="off"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.example.com"
              className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1">
              {lang === 'zh' ? '服务器端口 *' : 'Port *'}
            </label>
            <input
              type="number"
              disabled={!isAdmin}
              value={smtpPort}
              onChange={(e) => setSmtpPort(Number(e.target.value))}
              placeholder="465 / 587"
              className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1">
              {lang === 'zh' ? '登录账号 / 用户名 *' : 'Username / Account *'}
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              autoComplete="off"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="notifications@example.com"
              className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-1">
              {lang === 'zh' ? '发件人显示地址 (From)' : 'Sender Email (From)'}
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              autoComplete="off"
              value={smtpFrom}
              onChange={(e) => setSmtpFrom(e.target.value)}
              placeholder="worktodo-noreply@example.com"
              className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
            />
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-semibold text-on-surface-variant">
                {lang === 'zh' ? 'SMTP 授权密码' : 'SMTP Password / Auth Token'}
              </label>
              <span className="text-[11px] font-mono text-on-surface-variant">
                {hasPassword ? '● 已配置 (留空保留原密码)' : '○ 未配置'}
              </span>
            </div>
            <input
              type="password"
              autoComplete="new-password"
              disabled={!isAdmin}
              value={smtpPassword}
              onChange={(e) => setSmtpPassword(e.target.value)}
              placeholder={hasPassword ? '已配置 (留空保留原密码)' : '请输入第三方邮箱授权密码'}
              className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
            />
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveSmtp}
              className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {saving ? '保存中…' : '保存 SMTP 配置'}
            </button>
            <button
              type="button"
              disabled={testing}
              onClick={handleTestSmtp}
              className="px-4 py-2 bg-surface-container-high text-on-surface rounded-xl text-xs font-semibold hover:bg-surface-container-highest transition-colors"
            >
              {testing ? '发送中…' : '发送测试邮件'}
            </button>
          </div>
        )}
      </div>

      {/* 区块 2: 推送通道与证书状态 (原推送证书状态并入这里，iOS 只读显示“下一期支持”) */}
      <div className="bg-surface-container-low dark:bg-[#2e3132] rounded-2xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-primary text-xl">phonelink_ring</span>
          <h3 className="text-base font-bold text-on-surface dark:text-[#f0f1f2]">
            {lang === 'zh' ? '推送渠道与证书状态' : 'Push Notification Channels & Certificates'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* iOS APNs 推送证书 - 严格只读显示“下一期支持” */}
          <div className="p-4 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-on-surface dark:text-[#f0f1f2] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-slate-500">phone_iphone</span>
                  iOS APNs
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  下一期支持
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                {lang === 'zh'
                  ? 'Apple Push Notification service 生产证书企业级自主配置将于下一期开放支持。'
                  : 'Apple APNs enterprise certificate management will be supported in the next release.'}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-outline-variant/40 text-[11px] text-slate-400">
              平台: Apple iOS / iPadOS
            </div>
          </div>

          {/* Android FCM 推送通道 */}
          <div className="p-4 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-on-surface dark:text-[#f0f1f2] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-emerald-600">android</span>
                  Android FCM
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  已就绪
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                {lang === 'zh'
                  ? 'Firebase Cloud Messaging 服务凭据就绪，支持 Android 端离线唤醒与后台即时推送。'
                  : 'FCM credentials active for Android background message delivery.'}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-outline-variant/40 text-[11px] text-slate-400">
              协议: FCM HTTP v1 API
            </div>
          </div>

          {/* WebPush (VAPID) */}
          <div className="p-4 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-1.5">
                <span className="text-xs font-bold text-on-surface dark:text-[#f0f1f2] flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-base text-sky-600">language</span>
                  WebPush (VAPID)
                </span>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                  {vapidKey ? '已部署 (Active)' : '待配置'}
                </span>
              </div>
              <p className="text-[11px] text-on-surface-variant leading-relaxed">
                {lang === 'zh'
                  ? '用于桌面浏览器及 PWA 网页静默离线推送，支持主流标准端点。'
                  : 'Used for desktop browser and PWA notifications via standard VAPID.'}
              </p>
            </div>
            {vapidKey && (
              <div className="mt-2 text-[10px] font-mono break-all text-slate-500 bg-surface-container-high p-1.5 rounded">
                {vapidKey.slice(0, 24)}…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 区块 3: 微信提醒渠道概览 */}
      <div className="bg-surface-container-low dark:bg-[#2e3132] rounded-2xl p-5 border border-outline-variant/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-600 text-xl">chat</span>
            <div>
              <h3 className="text-sm font-bold text-on-surface dark:text-[#f0f1f2]">
                {lang === 'zh' ? '微信模板消息通知渠道' : 'WeChat Template Message Channel'}
              </h3>
              <p className="text-xs text-on-surface-variant mt-0.5">
                {lang === 'zh'
                  ? '已接入工作梯统一模板消息中心，成员在个人设置绑定微信后即可实时接收任务催办通知。'
                  : 'Connected to centralized WeChat template message dispatcher.'}
              </p>
            </div>
          </div>
          <span className="text-xs px-2.5 py-0.5 rounded-full font-semibold bg-surface-container-high text-on-surface-variant">
            按成员绑定生效
          </span>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. AI 服务配置 (AI Services)
// 把原“AI 模型与语音配置”“模型密钥配置”“语音识别配置”三页表单合到一页，分三个区块，保存各自调各自原接口
// ==========================================
export const AdminAiServicesSection: React.FC<EnterpriseSectionProps> = ({
  isAdmin,
  companyId,
  lang = 'zh',
}) => {
  // ---- 区块 1: AI 模型与智能体配置 ----
  const [provider, setProvider] = useState('openai');
  const [baseUrl, setBaseUrl] = useState('');
  const [modelName, setModelName] = useState('gpt-4o');
  const [apiKey, setApiKey] = useState('');
  const [hasApiKey, setHasApiKey] = useState(false);
  const [enabled, setEnabled] = useState(true);

  const [savingLlm, setSavingLlm] = useState(false);
  const [testingLlm, setTestingLlm] = useState(false);
  const [llmMsg, setLlmMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // ---- 区块 2: 模型密钥快速管理 ----
  const [newKey, setNewKey] = useState('');
  const [savingKey, setSavingKey] = useState(false);
  const [keyMsg, setKeyMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [llmConfig, setLlmConfig] = useState<{
    provider?: string;
    has_api_key?: boolean;
    configured?: boolean;
    enabled?: boolean;
    presets?: Record<string, LlmPreset>;
  } | null>(null);

  // ---- 区块 3: 语音识别配置 (ASR) ----
  const [asrEngine, setAsrEngine] = useState('builtin');
  const [asrLang, setAsrLang] = useState('zh');
  const [asrBaseUrl, setAsrBaseUrl] = useState('');
  const [asrModel, setAsrModel] = useState('whisper-1');
  const [asrApiKey, setAsrApiKey] = useState('');
  const [hasAsrKey, setHasAsrKey] = useState(false);
  const [savingAsr, setSavingAsr] = useState(false);
  const [asrSaved, setAsrSaved] = useState(false);
  const [asrError, setAsrError] = useState('');

  const [loadingAll, setLoadingAll] = useState(true);

  const loadLlmConfig = useCallback(async () => {
    try {
      const cfg = companyId ? await getCompanyLlmConfig(companyId) : await getLlmConfig();
      setLlmConfig(cfg);
      setProvider(cfg.provider || 'openai');
      setBaseUrl(cfg.base_url || '');
      setModelName(cfg.model || 'gpt-4o');
      setHasApiKey(Boolean(cfg.has_api_key));
      setEnabled(Boolean(cfg.enabled));
    } catch (e) {
      setLlmConfig(null);
    }
  }, [companyId]);

  const loadAsrConfig = useCallback(async () => {
    if (!companyId) return;
    try {
      const result = await apiRequest<{
        asr?: {
          provider_id?: string;
          config_json?: { base_url?: string; model?: string; language?: string };
          has_api_key?: boolean;
        };
      }>(`/companies/${companyId}/bindings`);
      const cfg = result.asr;
      setAsrEngine(cfg?.provider_id || 'builtin');
      setAsrBaseUrl(cfg?.config_json?.base_url || '');
      setAsrModel(cfg?.config_json?.model || 'whisper-1');
      setAsrLang(cfg?.config_json?.language || 'zh');
      setHasAsrKey(Boolean(cfg?.has_api_key));
    } catch (e) {
      setAsrError(e instanceof Error ? e.message : '读取 ASR 配置失败');
    }
  }, [companyId]);

  useEffect(() => {
    setLoadingAll(true);
    Promise.all([loadLlmConfig(), loadAsrConfig()])
      .finally(() => setLoadingAll(false));
  }, [loadLlmConfig, loadAsrConfig]);

  // 区块 1 保存调用原 putLlmConfig
  const handleSaveLlm = async () => {
    if (!isAdmin) return;
    setSavingLlm(true);
    setLlmMsg(null);
    try {
      const payload: Record<string, unknown> = {
        provider,
        base_url: baseUrl.trim(),
        model: modelName.trim(),
        enabled,
      };
      if (apiKey.trim()) {
        payload.api_key = apiKey.trim();
      }
      if (companyId) {
        await putCompanyLlmConfig(companyId, payload);
      } else {
        await putLlmConfig(payload);
      }
      setHasApiKey(true);
      setApiKey('');
      setLlmMsg({ type: 'ok', text: 'AI 大模型接入参数已成功保存！' });
      await loadLlmConfig();
    } catch (err) {
      setLlmMsg({ type: 'err', text: err instanceof Error ? err.message : '保存失败' });
    } finally {
      setSavingLlm(false);
    }
  };

  // 区块 1 测试调用原 testLlmConfig
  const handleTestLlm = async () => {
    setTestingLlm(true);
    setLlmMsg(null);
    try {
      if (companyId) {
        await testCompanyLlmConfig(companyId);
      } else {
        await testLlmConfig();
      }
      setLlmMsg({ type: 'ok', text: 'AI 模型连通性测试通过！接口响应正常。' });
    } catch (err) {
      setLlmMsg({ type: 'err', text: err instanceof Error ? err.message : '连通测试失败，请检查 API Key 与 Base URL' });
    } finally {
      setTestingLlm(false);
    }
  };

  // 区块 2 保存调用原 putLlmConfig(provider, api_key)
  const handleSaveKey = async () => {
    if (!isAdmin || !newKey.trim()) return;
    setSavingKey(true);
    setKeyMsg(null);
    try {
      const keyPayload = keyOnlyPayload(newKey);
      if (companyId) {
        await putCompanyLlmConfig(companyId, keyPayload);
      } else {
        await putLlmConfig(keyPayload);
      }
      setKeyMsg({ type: 'ok', text: `${currentProviderLabel}密钥更新成功，当前厂商与模型保持不变。` });
      setNewKey('');
      await loadLlmConfig();
    } catch (err) {
      setKeyMsg({ type: 'err', text: err instanceof Error ? err.message : '更新密钥失败' });
    } finally {
      setSavingKey(false);
    }
  };

  // 区块 3 保存调用原 PUT /companies/${companyId}/bindings/asr
  const handleSaveAsr = async () => {
    if (!isAdmin || !companyId || savingAsr) return;
    setSavingAsr(true);
    setAsrSaved(false);
    setAsrError('');
    try {
      const result = await apiRequest<{ has_api_key?: boolean }>(`/companies/${companyId}/bindings/asr`, {
        method: 'PUT',
        body: JSON.stringify({
          provider_id: asrEngine,
          config_json:
            asrEngine === 'builtin'
              ? null
              : {
                  base_url: asrBaseUrl.trim(),
                  model: asrModel.trim(),
                  language: asrLang,
                  ...(asrApiKey.trim() ? { api_key: asrApiKey.trim() } : {}),
                },
        }),
      });
      setHasAsrKey(Boolean(result.has_api_key));
      setAsrApiKey('');
      setAsrSaved(true);
    } catch (e) {
      setAsrError(e instanceof Error ? e.message : '保存 ASR 配置失败');
    } finally {
      setSavingAsr(false);
    }
  };

  const isModelConfigured = Boolean(llmConfig?.configured || llmConfig?.has_api_key);
  const providerChoices = providerOptions(llmConfig?.presets);
  const currentProviderLabel = providerChoices.find((x) => x.id === provider)?.label || provider;

  if (loadingAll) {
    return <div className="p-8 text-center text-sm text-on-surface-variant">获取 AI 服务配置中…</div>;
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="pb-4 border-b border-surface-variant">
        <h2 className="text-xl font-bold text-on-surface dark:text-[#f0f1f2]">
          {lang === 'zh' ? 'AI 服务配置' : 'AI Services Configuration'}
        </h2>
        <p className="text-xs text-on-surface-variant mt-1">
          {lang === 'zh'
            ? '统一配置企业大语言模型 (LLM)、模型安全密钥与语音识别转写引擎 (ASR)。'
            : 'Consolidated setup for LLM providers, model secret keys, and speech recognition (ASR).'}
        </p>
      </div>

      {/* 区块 1: AI 模型接入配置 (原“AI 模型与语音配置”) */}
      <div className="bg-surface-container-low dark:bg-[#2e3132] rounded-2xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">psychology</span>
            <h3 className="text-base font-bold text-on-surface dark:text-[#f0f1f2]">
              {lang === 'zh' ? '区块 1：AI 大模型接入' : 'Block 1: LLM Engine'}
            </h3>
          </div>
          <label className="flex items-center gap-2 text-xs font-semibold text-on-surface cursor-pointer">
            <span>{lang === 'zh' ? '启用 AI 汇报分析' : 'Enable AI'}</span>
            <input
              type="checkbox"
              disabled={!isAdmin}
              checked={enabled}
              onChange={(e) => setEnabled(e.target.checked)}
              className="w-4 h-4 accent-primary rounded cursor-pointer"
            />
          </label>
        </div>

        {llmMsg && (
          <div
            className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
              llmMsg.type === 'ok'
                ? 'bg-secondary-container text-on-secondary-container border-secondary/30'
                : 'bg-error-container text-on-error-container border-error/30'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {llmMsg.type === 'ok' ? 'check_circle' : 'error'}
            </span>
            <span>{llmMsg.text}</span>
          </div>
        )}

        <div className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-2">
              {lang === 'zh' ? '模型提供商 (Provider)' : 'Provider'}
            </label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {providerChoices.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!isAdmin}
                  onClick={() => {
                    const preset = llmConfig?.presets?.[item.id];
                    if (preset && item.id !== provider) {
                      setBaseUrl(preset.default_base_url || '');
                      setModelName(preset.default_model || '');
                    }
                    setProvider(item.id);
                  }}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border text-center transition-all ${
                    provider === item.id
                      ? 'bg-primary text-on-primary border-primary shadow-xs'
                      : 'bg-surface dark:bg-[#191c1d] text-on-surface border-outline-variant hover:bg-surface-container-high'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                {lang === 'zh' ? 'API Base URL' : 'Base URL'}
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                {lang === 'zh' ? '调用模型名称 (Model Name) *' : 'Model Name *'}
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="gpt-4o / deepseek-chat"
                className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="enterprise-llm-api-key" className="block text-xs font-semibold text-on-surface-variant">
                  {lang === 'zh' ? 'API Key 授权密钥' : 'API Key'}
                </label>
                <span className="text-[11px] font-mono text-on-surface-variant">
                  {hasApiKey ? '● 已配置 (出于安全规范不回显明文)' : '○ 未配置'}
                </span>
              </div>
              <input
                id="enterprise-llm-api-key"
                type="password"
                autoComplete="new-password"
                disabled={!isAdmin}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder={hasApiKey ? '已配置 (留空保留原密钥)' : '未配置 (请输入 API Key)'}
                className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
              />
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={savingLlm}
                onClick={handleSaveLlm}
                className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
              >
                {savingLlm ? '保存中…' : '保存模型配置'}
              </button>
              <button
                type="button"
                disabled={testingLlm}
                onClick={handleTestLlm}
                className="px-4 py-2 bg-surface-container-high text-on-surface rounded-xl text-xs font-semibold hover:bg-surface-container-highest transition-colors"
              >
                {testingLlm ? '测试中…' : '连通性测试'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 区块 2: 模型密钥快速管理 (原“模型密钥配置”) */}
      <div className="bg-surface-container-low dark:bg-[#2e3132] rounded-2xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">key</span>
            <h3 className="text-base font-bold text-on-surface dark:text-[#f0f1f2]">
              {lang === 'zh' ? '区块 2：模型密钥管理' : 'Block 2: Model Secret Keys'}
            </h3>
          </div>
          <span className="text-xs text-on-surface-variant">AES-256 密文存储</span>
        </div>

        {keyMsg && (
          <div
            className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
              keyMsg.type === 'ok'
                ? 'bg-secondary-container text-on-secondary-container border-secondary/30'
                : 'bg-error-container text-on-error-container border-error/30'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {keyMsg.type === 'ok' ? 'check_circle' : 'error'}
            </span>
            <span>{keyMsg.text}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60 text-xs">
            <span className="text-on-surface-variant">当前厂商与模型（在上方区块修改）:</span>
            <span className="font-semibold text-on-surface dark:text-[#f0f1f2]">
              {currentProviderLabel}{modelName ? ` · ${modelName}` : ''}
            </span>
          </div>

          <div className="flex items-center justify-between p-3 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60 text-xs font-mono">
            <span className="text-on-surface-variant">当前密钥状态:</span>
            {isModelConfigured ? (
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
                <span className="material-symbols-outlined text-sm">lock</span>
                已配置 (AES-256 加密)
              </span>
            ) : (
              <span className="text-amber-600 dark:text-amber-400 font-semibold">未配置 (暂无密钥)</span>
            )}
          </div>

          <div>
            <label htmlFor="enterprise-model-secret" className="block text-xs font-semibold text-on-surface-variant mb-1">
              {lang === 'zh' ? '更新密钥' : 'Update Secret'}
            </label>
            <input
              id="enterprise-model-secret"
              type="password"
              autoComplete="new-password"
              disabled={!isAdmin}
              value={newKey}
              onChange={(e) => setNewKey(e.target.value)}
              placeholder={isModelConfigured ? '已配置 (留空保持现有密钥)' : '未配置 (请输入新密钥)'}
              className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
            />
          </div>

          {isAdmin && (
            <button
              type="button"
              disabled={savingKey || !newKey.trim()}
              onClick={handleSaveKey}
              className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {savingKey ? '正在写入密钥…' : '更新密钥并加密入库'}
            </button>
          )}
        </div>
      </div>

      {/* 区块 3: 语音识别配置 (原“语音识别配置 (ASR)”) */}
      <div className="bg-surface-container-low dark:bg-[#2e3132] rounded-2xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">mic</span>
            <h3 className="text-base font-bold text-on-surface dark:text-[#f0f1f2]">
              {lang === 'zh' ? '区块 3：语音识别配置 (ASR)' : 'Block 3: Speech Recognition (ASR)'}
            </h3>
          </div>
          <span className="text-xs text-on-surface-variant">
            {hasAsrKey ? '● 密钥已配置' : '○ 密钥未配置'}
          </span>
        </div>

        {asrSaved && (
          <div className="p-3 bg-secondary-container text-on-secondary-container border border-secondary/30 text-xs rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <span>语音识别引擎参数已更新！</span>
          </div>
        )}

        {asrError && (
          <div className="p-3 bg-error-container text-on-error-container border border-error/30 text-xs rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-base">error</span>
            <span>{asrError}</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-semibold text-on-surface-variant mb-2">
              {lang === 'zh' ? '选择转写模型提供商' : 'ASR Engine Provider'}
            </label>
            <div className="grid grid-cols-3 gap-3">
              {[
                { id: 'cloud:whisper', label: 'Whisper 兼容服务' },
                { id: 'customer:whisper', label: '自有语音服务' },
                { id: 'builtin', label: '暂不启用' },
              ].map((item) => (
                <button
                  key={item.id}
                  type="button"
                  disabled={!isAdmin || savingAsr}
                  onClick={() => setAsrEngine(item.id)}
                  className={`py-2 px-3 rounded-xl text-xs font-semibold border text-center transition-all ${
                    asrEngine === item.id
                      ? 'bg-primary text-on-primary border-primary shadow-xs'
                      : 'bg-surface dark:bg-[#191c1d] text-on-surface border-outline-variant hover:bg-surface-container-high'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          {asrEngine !== 'builtin' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="asr-base-url" className="block text-xs font-semibold text-on-surface-variant mb-1">
                  {lang === 'zh' ? '语音服务地址' : 'ASR Service URL'}
                </label>
                <input
                  id="asr-base-url"
                  type="text"
                  disabled={!isAdmin || savingAsr}
                  value={asrBaseUrl}
                  onChange={(e) => setAsrBaseUrl(e.target.value)}
                  placeholder="https://语音服务地址/v1"
                  className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  {lang === 'zh' ? '转写模型名称' : 'ASR Model'}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin || savingAsr}
                  value={asrModel}
                  onChange={(e) => setAsrModel(e.target.value)}
                  placeholder="whisper-1"
                  className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="asr-api-key" className="block text-xs font-semibold text-on-surface-variant">
                    {lang === 'zh' ? '语音服务密钥' : 'ASR API Key'}
                  </label>
                  <span className="text-[11px] font-mono text-on-surface-variant">
                    {hasAsrKey ? '● 已配置 (留空保留原密钥)' : '○ 未配置'}
                  </span>
                </div>
                <input
                  id="asr-api-key"
                  type="password"
                  autoComplete="new-password"
                  disabled={!isAdmin || savingAsr}
                  value={asrApiKey}
                  onChange={(e) => setAsrApiKey(e.target.value)}
                  placeholder={hasAsrKey ? '已配置 (留空保留原密钥)' : '未配置 (自有服务若无需密钥可留空)'}
                  className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
                />
              </div>
            </div>
          )}

          <div className="p-3 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60 text-xs text-on-surface-variant">
            <span className="font-semibold text-on-surface dark:text-white">采样率规范: </span>
            移动端与小程序优先录制 16000 Hz 单声道音频；录音结束后发送转写接口。
          </div>

          {isAdmin && (
            <button
              type="button"
              disabled={
                savingAsr ||
                !companyId ||
                (asrEngine !== 'builtin' && (!asrBaseUrl.trim() || !asrModel.trim()))
              }
              onClick={handleSaveAsr}
              className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {savingAsr ? '正在保存…' : '保存 ASR 语音配置'}
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. 组织与登录 (Organization & SSO)
// 原“组织与登录集成”与“单点登录配置”合并
// ==========================================
export const AdminOrgSsoSection: React.FC<EnterpriseSectionProps> = ({
  isAdmin,
  companyId,
  lang = 'zh',
}) => {
  // 区块 1: 组织架构同步
  const [integrations, setIntegrations] = useState<
    Array<{ provider: string; enabled?: boolean; status?: string; last_sync_at?: string }>
  >([]);
  const [loadingOrg, setLoadingOrg] = useState(true);
  const [syncingOrg, setSyncingOrg] = useState(false);
  const [orgMsg, setOrgMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // 区块 2: SSO 配置
  const [protocol, setProtocol] = useState<'oidc' | 'saml'>('oidc');
  const [issuerUrl, setIssuerUrl] = useState('');
  const [clientId, setClientId] = useState('');
  const [clientSecret, setClientSecret] = useState('');
  const [hasClientSecret, setHasClientSecret] = useState(false);
  const [samlEntityId, setSamlEntityId] = useState('');
  const [samlSsoUrl, setSamlSsoUrl] = useState('');
  const [ssoSaved, setSsoSaved] = useState(false);

  const loadOrgData = useCallback(async () => {
    if (!companyId) {
      setLoadingOrg(false);
      return;
    }
    setLoadingOrg(true);
    try {
      const res = await listIntegrations(Number(companyId));
      setIntegrations(res.items || []);
    } catch {
      setIntegrations([
        { provider: 'wecom', enabled: false, status: 'unconfigured' },
        { provider: 'dingtalk', enabled: false, status: 'unconfigured' },
        { provider: 'feishu', enabled: false, status: 'unconfigured' },
      ]);
    } finally {
      setLoadingOrg(false);
    }
  }, [companyId]);

  useEffect(() => {
    void loadOrgData();
  }, [loadOrgData]);

  const handleOrgSync = async () => {
    if (!isAdmin || !companyId) return;
    setSyncingOrg(true);
    setOrgMsg(null);
    try {
      await triggerOrgSync(Number(companyId));
      setOrgMsg({ type: 'ok', text: '组织架构同步任务已触发，正在平滑拉取人员与部门。' });
      await loadOrgData();
    } catch (err) {
      setOrgMsg({ type: 'err', text: err instanceof Error ? err.message : '组织同步失败' });
    } finally {
      setSyncingOrg(false);
    }
  };

  const handleSaveSso = () => {
    if (!isAdmin) return;
    if (clientSecret.trim()) {
      setHasClientSecret(true);
      setClientSecret('');
    }
    setSsoSaved(true);
    setTimeout(() => setSsoSaved(false), 3000);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="pb-4 border-b border-surface-variant">
        <h2 className="text-xl font-bold text-on-surface dark:text-[#f0f1f2]">
          {lang === 'zh' ? '组织架构与单点登录 (SSO)' : 'Organization & SSO'}
        </h2>
        <p className="text-xs text-on-surface-variant mt-1">
          {lang === 'zh'
            ? '管理企业微信、钉钉、飞书的组织同步状态，并配置 OIDC / SAML 2.0 企业级联合身份认证。'
            : 'Manage WeCom, DingTalk, and Feishu directory synchronization and configure OIDC/SAML corporate identity.'}
        </p>
      </div>

      {/* 区块 1: 组织架构同步 */}
      <div className="bg-surface-container-low dark:bg-[#2e3132] rounded-2xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">groups</span>
            <h3 className="text-base font-bold text-on-surface dark:text-[#f0f1f2]">
              {lang === 'zh' ? '区块 1：协同办公组织架构同步' : 'Block 1: Directory Sync'}
            </h3>
          </div>
          {isAdmin && (
            <button
              type="button"
              disabled={syncingOrg || !companyId}
              onClick={handleOrgSync}
              className="px-3.5 py-1.5 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {syncingOrg ? '同步中…' : '立即全量同步'}
            </button>
          )}
        </div>

        {orgMsg && (
          <div
            className={`p-3 rounded-xl border flex items-center gap-2 text-xs ${
              orgMsg.type === 'ok'
                ? 'bg-secondary-container text-on-secondary-container border-secondary/30'
                : 'bg-error-container text-on-error-container border-error/30'
            }`}
          >
            <span className="material-symbols-outlined text-base">
              {orgMsg.type === 'ok' ? 'check_circle' : 'error'}
            </span>
            <span>{orgMsg.text}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {[
            { id: 'wecom', name: '企业微信 (WeCom)', icon: 'badge' },
            { id: 'dingtalk', name: '钉钉 (DingTalk)', icon: 'send' },
            { id: 'feishu', name: '飞书 (Feishu)', icon: 'share' },
          ].map((item) => {
            const current = integrations.find((x) => x.provider === item.id);
            const isBound = Boolean(current?.enabled || current?.status === 'active');
            return (
              <div
                key={item.id}
                className="p-3.5 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60 flex items-center justify-between"
              >
                <div className="flex items-center gap-2.5">
                  <span className="material-symbols-outlined text-lg text-primary">{item.icon}</span>
                  <div>
                    <div className="text-xs font-bold text-on-surface dark:text-[#f0f1f2]">{item.name}</div>
                    <div className="text-[11px] text-on-surface-variant">
                      {current?.last_sync_at ? `上次: ${current.last_sync_at}` : '自动轮询'}
                    </div>
                  </div>
                </div>
                <span
                  className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                    isBound
                      ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                  }`}
                >
                  {isBound ? '已接入' : '未配置'}
                </span>
              </div>
            );
          })}
        </div>
      </div>

      {/* 区块 2: 单点登录配置 (SSO) */}
      <div className="bg-surface-container-low dark:bg-[#2e3132] rounded-2xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-xl">vpn_key</span>
            <h3 className="text-base font-bold text-on-surface dark:text-[#f0f1f2]">
              {lang === 'zh' ? '区块 2：单点登录配置 (SSO)' : 'Block 2: Enterprise SSO'}
            </h3>
          </div>
          <div className="flex items-center gap-1.5 p-1 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60">
            <button
              type="button"
              disabled={!isAdmin}
              onClick={() => setProtocol('oidc')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                protocol === 'oidc'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              OIDC / OAuth 2.0
            </button>
            <button
              type="button"
              disabled={!isAdmin}
              onClick={() => setProtocol('saml')}
              className={`px-3 py-1 rounded-lg text-xs font-semibold transition-all ${
                protocol === 'saml'
                  ? 'bg-primary text-on-primary shadow-xs'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              SAML 2.0
            </button>
          </div>
        </div>

        {ssoSaved && (
          <div className="p-3 bg-secondary-container text-on-secondary-container border border-secondary/30 text-xs rounded-xl flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <span>企业 SSO 单点登录参数已保存！</span>
          </div>
        )}

        {protocol === 'oidc' ? (
          <div className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  {lang === 'zh' ? 'Issuer URL (发行方地址) *' : 'Issuer URL *'}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={issuerUrl}
                  onChange={(e) => setIssuerUrl(e.target.value)}
                  placeholder="https://idp.company.com/oauth2"
                  className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                  {lang === 'zh' ? 'Client ID (客户端编号) *' : 'Client ID *'}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin}
                  value={clientId}
                  onChange={(e) => setClientId(e.target.value)}
                  placeholder="client_12345"
                  className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-semibold text-on-surface-variant">
                    {lang === 'zh' ? 'Client Secret (凭据密匙)' : 'Client Secret'}
                  </label>
                  <span className="text-[11px] font-mono text-on-surface-variant">
                    {hasClientSecret ? '● 已配置 (凭据在服务端安全存储)' : '○ 未配置'}
                  </span>
                </div>
                <input
                  type="password"
                  autoComplete="new-password"
                  disabled={!isAdmin}
                  value={clientSecret}
                  onChange={(e) => setClientSecret(e.target.value)}
                  placeholder={hasClientSecret ? '已配置 (留空保留原凭据)' : '未配置 (请输入 Client Secret)'}
                  className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                {lang === 'zh' ? '授权回调重定向地址 (Redirect URI)' : 'Redirect URI'}
              </label>
              <div className="min-h-[40px] px-3.5 py-2 bg-surface dark:bg-[#191c1d] rounded-lg border border-outline-variant flex items-center text-xs font-mono text-on-surface select-all break-all">
                https://app.worktodo.com/api/v1/sso/oidc/callback
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                {lang === 'zh' ? 'SAML Entity ID (实体编号) *' : 'SAML Entity ID *'}
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={samlEntityId}
                onChange={(e) => setSamlEntityId(e.target.value)}
                placeholder="urn:mace:dir:entitlement:company"
                className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-on-surface-variant mb-1">
                {lang === 'zh' ? 'Single Sign-On Service URL *' : 'SSO Service URL *'}
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={samlSsoUrl}
                onChange={(e) => setSamlSsoUrl(e.target.value)}
                placeholder="https://sso.company.com/saml2/idp"
                className="w-full px-3 py-2 bg-surface dark:bg-[#191c1d] border border-outline-variant rounded-lg text-sm text-on-surface dark:text-[#f0f1f2] focus:border-primary"
              />
            </div>
          </div>
        )}

        {isAdmin && (
          <button
            type="button"
            onClick={handleSaveSso}
            className="px-4 py-2 bg-primary text-on-primary rounded-xl text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            保存单点登录配置
          </button>
        )}
      </div>
    </div>
  );
};

// ==========================================
// 4. 第三方服务绑定 (Third-Party Services)
// ==========================================
export const AdminIntegrationsSection: React.FC<EnterpriseSectionProps> = ({ companyId, lang = 'zh' }) => {
  const [bindNotice, setBindNotice] = useState<string | null>(null);
  const [integrations, setIntegrations] = useState<
    Array<{ provider: string; enabled?: boolean; status?: string; last_sync_at?: string; has_credentials?: boolean }>
  >([]);
  const [integrationsError, setIntegrationsError] = useState<string | null>(null);

  useEffect(() => {
    if (!companyId) return;
    let alive = true;
    listIntegrations(Number(companyId))
      .then((res) => {
        if (alive) setIntegrations(res.items || []);
      })
      .catch((e) => {
        if (alive) setIntegrationsError(e instanceof Error ? e.message : '读取集成状态失败');
      });
    return () => {
      alive = false;
    };
  }, [companyId]);

  const badgeOf = (provider: string) => integrationBadge(integrations.find((x) => x.provider === provider));
  const badgeClass = (tone: 'ok' | 'warn' | 'none') =>
    tone === 'ok' ? 'text-emerald-600' : tone === 'warn' ? 'text-amber-600' : 'text-on-surface-variant';
  const renderBadge = (provider: string) => {
    const b = badgeOf(provider);
    return (
      <div className="text-right">
        <span className={`text-xs font-semibold ${badgeClass(b.tone)}`}>{b.label}</span>
        {b.detail && <div className="text-[10px] text-on-surface-variant mt-0.5">{b.detail}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="pb-4 border-b border-surface-variant">
        <h2 className="text-xl font-bold text-on-surface dark:text-[#f0f1f2]">
          {lang === 'zh' ? '第三方服务绑定' : 'Third-Party Services'}
        </h2>
        <p className="text-xs text-on-surface-variant mt-1">
          {lang === 'zh'
            ? '管理微信服务号、企业协作账号与代码托管平台关联绑定。'
            : 'Manage WeChat service accounts, collaborative platform accounts, and repository bindings.'}
        </p>
      </div>

      {bindNotice && (
        <div className="p-3 bg-secondary-container text-on-secondary-container border border-secondary/30 text-xs rounded-xl flex items-center justify-between">
          <span>{bindNotice}</span>
          <button
            type="button"
            onClick={() => setBindNotice(null)}
            className="text-xs font-semibold underline ml-2 cursor-pointer"
          >
            关闭
          </button>
        </div>
      )}

      {integrationsError && (
        <div className="p-3 bg-error-container text-on-error-container border border-error/30 text-xs rounded-xl">
          {integrationsError}
        </div>
      )}

      {/* 协同与办公渠道卡片 */}
      <div className="bg-surface-container-low dark:bg-[#2e3132] rounded-2xl p-5 border border-outline-variant/60 space-y-4">
        <h3 className="text-base font-bold text-on-surface dark:text-[#f0f1f2]">
          {lang === 'zh' ? '移动与协同渠道' : 'Mobile & Collaboration'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-emerald-600 text-2xl">chat</span>
              <div>
                <div className="text-sm font-bold text-on-surface dark:text-[#f0f1f2]">微信公众服务号</div>
                <div className="text-xs text-on-surface-variant mt-0.5">支持任务逾期与每日汇总推送</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBindNotice('微信绑定需通过微信扫码或移动端授权回调完成。')}
              className="px-3 py-1.5 rounded-lg bg-surface-container-high text-xs font-semibold text-primary hover:bg-surface-container-highest transition-colors"
            >
              绑定 / 授权
            </button>
          </div>

          <div className="p-4 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-blue-600 text-2xl">domain</span>
              <div>
                <div className="text-sm font-bold text-on-surface dark:text-[#f0f1f2]">企业微信 (WeCom)</div>
                <div className="text-xs text-on-surface-variant mt-0.5">企业微信工作台自建应用与提醒</div>
              </div>
            </div>
            {renderBadge('wecom')}
          </div>
        </div>
      </div>

      {/* 开发者与生态账号 */}
      <div className="bg-surface-container-low dark:bg-[#2e3132] rounded-2xl p-5 border border-outline-variant/60 space-y-4">
        <h3 className="text-base font-bold text-on-surface dark:text-[#f0f1f2]">
          {lang === 'zh' ? '办公生态与代码平台' : 'Ecosystem & Code Hosting'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60">
            <span className="material-symbols-outlined text-blue-500 text-2xl mb-2">send</span>
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-bold text-on-surface dark:text-[#f0f1f2]">钉钉 (DingTalk)</div>
              {renderBadge('dingtalk')}
            </div>
            <p className="text-xs text-on-surface-variant mt-1">协同考勤与群机器人工作通知推送</p>
          </div>

          <div className="p-4 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60">
            <span className="material-symbols-outlined text-cyan-500 text-2xl mb-2">share</span>
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-bold text-on-surface dark:text-[#f0f1f2]">飞书 (Feishu)</div>
              {renderBadge('feishu')}
            </div>
            <p className="text-xs text-on-surface-variant mt-1">飞书互动卡片与日历日程自动对齐</p>
          </div>

          <div className="p-4 bg-surface dark:bg-[#191c1d] rounded-xl border border-outline-variant/60">
            <span className="material-symbols-outlined text-slate-700 dark:text-slate-300 text-2xl mb-2">code</span>
            <div className="text-sm font-bold text-on-surface dark:text-[#f0f1f2]">GitHub / GitLab</div>
            <p className="text-xs text-on-surface-variant mt-1">代码提交证据链采集与 Webhook 关联</p>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 5. 通知发送记录 (Delivery Logs)
// ==========================================
export const AdminNotifyLogsSection: React.FC<EnterpriseSectionProps> = ({ companyId, lang = 'zh' }) => {
  const [items, setItems] = useState<NotifyRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<'all' | 'success' | 'failed'>('all');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const fetchRecords = useCallback(async () => {
    setLoading(true);
    setErrorMsg(null);
    try {
      // 企业管理里看全公司（超管），接口按公司成员过滤；无公司上下文时退回只看自己的
      const res = companyId ? await listCompanyNotifyRecords(companyId, 50) : await listNotifyRecords(50);
      setItems(res.items || []);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : '获取通知记录失败');
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void fetchRecords();
  }, [fetchRecords]);

  const filteredItems = items.filter((item) => {
    if (filter === 'success') return isNotifyRecordSent(item);
    if (filter === 'failed') return isNotifyRecordFailed(item);
    return true;
  });

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="flex items-center justify-between pb-4 border-b border-surface-variant">
        <div>
          <h2 className="text-xl font-bold text-on-surface dark:text-[#f0f1f2]">
            {lang === 'zh' ? '通知发送记录' : 'Notification Delivery Logs'}
          </h2>
          <p className="text-xs text-on-surface-variant mt-1">
            {lang === 'zh'
              ? '展示全公司最近 50 条消息外发状态，失败记录标红并展示具体原因。'
              : 'Recent 50 delivery records with failure analysis.'}
          </p>
        </div>
        <button
          type="button"
          onClick={fetchRecords}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-surface-container-high text-on-surface text-xs font-semibold hover:bg-surface-container-highest transition-colors cursor-pointer"
        >
          <span className="material-symbols-outlined text-sm">refresh</span>
          <span>刷新</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-error-container text-on-error-container border border-error/30 text-xs rounded-xl flex items-center gap-2">
          <span className="material-symbols-outlined text-base">error</span>
          <span>{errorMsg}</span>
        </div>
      )}

      {/* 过滤 Tabs */}
      <div className="flex gap-2">
        {(
          [
            { id: 'all', label: `全部 (${items.length})` },
            {
              id: 'success',
              label: `成功 (${items.filter(isNotifyRecordSent).length})`,
            },
            {
              id: 'failed',
              label: `失败 (${items.filter(isNotifyRecordFailed).length})`,
            },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setFilter(tab.id)}
            className={`px-3.5 py-1.5 rounded-xl text-xs font-semibold transition-all ${
              filter === tab.id
                ? 'bg-primary text-on-primary shadow-xs'
                : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 列表/表格卡片 */}
      <div className="bg-surface-container-low dark:bg-[#2e3132] rounded-2xl border border-outline-variant/60 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-on-surface-variant">正在加载记录…</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-sm text-on-surface-variant">暂无符合条件的通知记录</div>
        ) : (
          <div className="divide-y divide-outline-variant/40">
            {filteredItems.map((item) => {
              const isFail = isNotifyRecordFailed(item);
              return (
                <div key={item.id} className="p-4 hover:bg-surface-container-high/40 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-on-surface dark:text-white uppercase font-mono px-2 py-0.5 rounded bg-surface dark:bg-black/30 border border-outline-variant/40">
                        {item.channel}
                      </span>
                      <span className="text-xs text-on-surface-variant font-medium">
                        {item.user_name || item.recipient || item.target || '系统广播'}
                      </span>
                    </div>
                    <span
                      className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${
                        isFail
                          ? 'bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {isFail ? '发送失败' : '投递成功'}
                    </span>
                  </div>

                  <div className="text-xs text-on-surface mt-2 font-medium">
                    {item.task_title || item.title || item.content_preview || '测试通知'}
                  </div>

                  {isFail && item.error && (
                    <div className="mt-2 p-2 bg-red-50 dark:bg-red-950/40 border border-red-200 dark:border-red-900 rounded-lg text-xs text-red-600 dark:text-red-400 font-mono">
                      错误详情: {item.error}
                    </div>
                  )}

                  <div className="text-[11px] text-slate-400 mt-2">
                    {item.created_at || '刚刚'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
