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
import { saveIntegration, type EnterpriseIntegration } from '../../api/sso';
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
      setMsg({ type: 'ok', text: '企业 SMTP 邮件渠道配置已成功保存' });
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
        setMsg({ type: 'ok', text: '测试邮件已成功发出，请检查管理员邮箱（含垃圾邮件箱）' });
        return;
      }
      const res = await sendNotifyTest('email');
      if (res.ok) {
        setMsg({ type: 'ok', text: '测试邮件已成功发出，请检查接收邮箱' });
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
        <h2 className="text-xl font-medium text-on-surface dark:text-on-surface tabular-nums">
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
          className={`p-4 rounded-xl border flex items-center gap-2 text-xs ${
            msg.type === 'ok'
              ? 'bg-secondary-container text-on-secondary-container border-secondary/30'
              : 'bg-error-container text-on-error-container border-error/30'
          }`}
        >
          <span className="material-symbols-outlined text-[18px]">
            {msg.type === 'ok' ? 'check_circle' : 'error'}
          </span>
          <span>{msg.text}</span>
        </div>
      )}

      {/* 区块 1: SMTP 邮件发送服务 */}
      <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-inherit text-[18px]">mail</span>
            <h3 className="text-base font-medium text-on-surface dark:text-on-surface tabular-nums">
              {lang === 'zh' ? 'SMTP 邮件服务器' : 'SMTP Mail Server'}
            </h3>
          </div>
          <span
            className={`text-xs px-2 py-1 rounded-md font-medium ${
              hasPassword
                ? 'bg-surface-container text-[#2f7d4f] dark:bg-surface-container dark:text-[#6bbf8a]'
                : 'bg-surface-container text-[#a86412] dark:bg-surface-container dark:text-[#d9a35b]'
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
            <label className="block text-xs font-medium text-on-surface-variant mb-1 tabular-nums">
              {lang === 'zh' ? 'SMTP 服务器地址 *' : 'SMTP Server *'}
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              autoComplete="off"
              value={smtpHost}
              onChange={(e) => setSmtpHost(e.target.value)}
              placeholder="smtp.example.com"
              className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1 tabular-nums">
              {lang === 'zh' ? '服务器端口 *' : 'Port *'}
            </label>
            <input
              type="number"
              disabled={!isAdmin}
              value={smtpPort}
              onChange={(e) => setSmtpPort(Number(e.target.value))}
              placeholder="465 / 587"
              className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1 tabular-nums">
              {lang === 'zh' ? '登录账号 / 用户名 *' : 'Username / Account *'}
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              autoComplete="off"
              value={smtpUser}
              onChange={(e) => setSmtpUser(e.target.value)}
              placeholder="notifications@example.com"
              className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1 tabular-nums">
              {lang === 'zh' ? '发件人显示地址 (From)' : 'Sender Email (From)'}
            </label>
            <input
              type="text"
              disabled={!isAdmin}
              autoComplete="off"
              value={smtpFrom}
              onChange={(e) => setSmtpFrom(e.target.value)}
              placeholder="worktodo-noreply@example.com"
              className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
            />
          </div>

          <div className="md:col-span-2">
            <div className="flex items-center justify-between mb-1">
              <label className="block text-xs font-medium text-on-surface-variant tabular-nums">
                {lang === 'zh' ? 'SMTP 授权密码' : 'SMTP Password / Auth Token'}
              </label>
              <span className="text-xs font-mono text-on-surface-variant">
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
              className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
            />
          </div>
        </div>

        {isAdmin && (
          <div className="flex items-center gap-3 pt-2">
            <button
              type="button"
              disabled={saving}
              onClick={handleSaveSmtp}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity tabular-nums"
            >
              {saving ? '保存中…' : '保存 SMTP 配置'}
            </button>
            <button
              type="button"
              disabled={testing}
              onClick={handleTestSmtp}
              className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg text-xs font-medium hover:bg-surface-container-highest transition-ink-colors tabular-nums"
            >
              {testing ? '发送中…' : '发送测试邮件'}
            </button>
          </div>
        )}
      </div>

      {/* 区块 2: 推送通道与证书状态 (原推送证书状态并入这里，iOS 只读显示“下一期支持”) */}
      <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center gap-2">
          <span className="material-symbols-outlined text-inherit text-[18px]">phonelink_ring</span>
          <h3 className="text-base font-medium text-on-surface dark:text-on-surface tabular-nums">
            {lang === 'zh' ? '推送渠道与证书状态' : 'Push Notification Channels & Certificates'}
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* iOS APNs 推送证书 - 严格只读显示“下一期支持” */}
          <div className="p-4    border-t border-outline-variant/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-on-surface dark:text-on-surface flex items-center gap-2 tabular-nums">
                  <span className="material-symbols-outlined text-[18px] text-inherit">phone_iphone</span>
                  iOS APNs
                </span>
                <span className="text-xs font-medium px-2 py-1 rounded-md bg-surface-container text-on-surface dark:bg-surface-container-lowest dark:text-outline tabular-nums">
                  下一期支持
                </span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {lang === 'zh'
                  ? 'Apple Push Notification service 生产证书企业级自主配置将于下一期开放支持。'
                  : 'Apple APNs enterprise certificate management will be supported in the next release.'}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-outline-variant/40 text-xs text-outline">
              平台: Apple iOS / iPadOS
            </div>
          </div>

          {/* Android FCM 推送通道 */}
          <div className="p-4    border-t border-outline-variant/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-on-surface dark:text-on-surface flex items-center gap-2 tabular-nums">
                  <span className="material-symbols-outlined text-[18px] text-inherit">android</span>
                  Android FCM
                </span>
                <span className="text-xs font-medium px-2 py-1 rounded-md bg-surface-container text-[#2f7d4f] dark:bg-surface-container dark:text-[#6bbf8a] tabular-nums">
                  已就绪
                </span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {lang === 'zh'
                  ? 'Firebase Cloud Messaging 服务凭据就绪，支持 Android 端离线唤醒与后台即时推送。'
                  : 'FCM credentials active for Android background message delivery.'}
              </p>
            </div>
            <div className="mt-3 pt-2 border-t border-outline-variant/40 text-xs text-outline">
              协议: FCM HTTP v1 API
            </div>
          </div>

          {/* WebPush (VAPID) */}
          <div className="p-4    border-t border-outline-variant/60 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs font-medium text-on-surface dark:text-on-surface flex items-center gap-2 tabular-nums">
                  <span className="material-symbols-outlined text-[18px] text-sky-600">language</span>
                  WebPush (VAPID)
                </span>
                <span className="text-xs font-medium px-2 py-1 rounded-md bg-surface-container text-[#2f7d4f] dark:bg-surface-container dark:text-[#6bbf8a] tabular-nums">
                  {vapidKey ? '已部署 (Active)' : '待配置'}
                </span>
              </div>
              <p className="text-xs text-on-surface-variant leading-relaxed">
                {lang === 'zh'
                  ? '用于桌面浏览器及 PWA 网页静默离线推送，支持主流标准端点。'
                  : 'Used for desktop browser and PWA notifications via standard VAPID.'}
              </p>
            </div>
            {vapidKey && (
              <div className="mt-2 text-xs font-mono break-all text-on-surface-variant bg-surface-container-high p-2 rounded">
                {vapidKey.slice(0, 24)}…
              </div>
            )}
          </div>
        </div>
      </div>

      {/* 区块 3: 微信提醒渠道概览 */}
      <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-5 border border-outline-variant/60">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-inherit text-[18px]">chat</span>
            <div>
              <h3 className="text-sm font-medium text-on-surface dark:text-on-surface tabular-nums">
                {lang === 'zh' ? '微信模板消息通知渠道' : 'WeChat Template Message Channel'}
              </h3>
              <p className="text-xs text-on-surface-variant mt-1">
                {lang === 'zh'
                  ? '已接入工作梯统一模板消息中心，成员在个人设置绑定微信后即可实时接收任务催办通知。'
                  : 'Connected to centralized WeChat template message dispatcher.'}
              </p>
            </div>
          </div>
          <span className="text-xs px-2 py-1 rounded-md font-medium bg-surface-container-high text-on-surface-variant tabular-nums">
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
      setLlmMsg({ type: 'ok', text: 'AI 大模型接入参数已成功保存' });
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
      setLlmMsg({ type: 'ok', text: 'AI 模型连通性测试通过接口响应正常。' });
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
        <h2 className="text-xl font-medium text-on-surface dark:text-on-surface tabular-nums">
          {lang === 'zh' ? 'AI 服务配置' : 'AI Services Configuration'}
        </h2>
        <p className="text-xs text-on-surface-variant mt-1">
          {lang === 'zh'
            ? '统一配置企业大语言模型 (LLM)、模型安全密钥与语音识别转写引擎 (ASR)。'
            : 'Consolidated setup for LLM providers, model secret keys, and speech recognition (ASR).'}
        </p>
      </div>

      {/* 区块 1: AI 模型接入配置 (原“AI 模型与语音配置”) */}
      <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-inherit text-[18px]">psychology</span>
            <h3 className="text-base font-medium text-on-surface dark:text-on-surface tabular-nums">
              {lang === 'zh' ? '区块 1：AI 大模型接入' : 'Block 1: LLM Engine'}
            </h3>
          </div>
          <label className="flex items-center gap-2 text-xs font-medium text-on-surface cursor-pointer tabular-nums">
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
            className={`p-3  border-t flex items-center gap-2 text-xs ${
              llmMsg.type === 'ok'
                ? 'bg-secondary-container text-on-secondary-container border-secondary/30'
                : 'bg-error-container text-on-error-container border-error/30'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {llmMsg.type === 'ok' ? 'check_circle' : 'error'}
            </span>
            <span>{llmMsg.text}</span>
          </div>
        )}

        <div className="space-y-4 pt-1">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-2 tabular-nums">
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
                  className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-ink-colors ${
                    provider === item.id
                      ? 'bg-primary text-on-primary border-primary shadow-sm dark:shadow-none'
                      : 'bg-surface dark:bg-surface-container-low text-on-surface border-outline-variant hover:bg-surface-container-high'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1 tabular-nums">
                {lang === 'zh' ? 'API Base URL' : 'Base URL'}
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1 tabular-nums">
                {lang === 'zh' ? '调用模型名称 (Model Name) *' : 'Model Name *'}
              </label>
              <input
                type="text"
                disabled={!isAdmin}
                value={modelName}
                onChange={(e) => setModelName(e.target.value)}
                placeholder="gpt-4o / deepseek-chat"
                className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
              />
            </div>

            <div className="md:col-span-2">
              <div className="flex items-center justify-between mb-1">
                <label htmlFor="enterprise-llm-api-key" className="block text-xs font-medium text-on-surface-variant tabular-nums">
                  {lang === 'zh' ? 'API Key 授权密钥' : 'API Key'}
                </label>
                <span className="text-xs font-mono text-on-surface-variant">
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
                className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
              />
            </div>
          </div>

          {isAdmin && (
            <div className="flex items-center gap-3 pt-2">
              <button
                type="button"
                disabled={savingLlm}
                onClick={handleSaveLlm}
                className="px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity tabular-nums"
              >
                {savingLlm ? '保存中…' : '保存模型配置'}
              </button>
              <button
                type="button"
                disabled={testingLlm}
                onClick={handleTestLlm}
                className="px-4 py-2 bg-surface-container-high text-on-surface rounded-lg text-xs font-medium hover:bg-surface-container-highest transition-ink-colors tabular-nums"
              >
                {testingLlm ? '测试中…' : '连通性测试'}
              </button>
            </div>
          )}
        </div>
      </div>

      {/* 区块 2: 模型密钥快速管理 (原“模型密钥配置”) */}
      <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-inherit text-[18px]">key</span>
            <h3 className="text-base font-medium text-on-surface dark:text-on-surface tabular-nums">
              {lang === 'zh' ? '区块 2：模型密钥管理' : 'Block 2: Model Secret Keys'}
            </h3>
          </div>
          <span className="text-xs text-on-surface-variant">AES-256 密文存储</span>
        </div>

        {keyMsg && (
          <div
            className={`p-3  border-t flex items-center gap-2 text-xs ${
              keyMsg.type === 'ok'
                ? 'bg-secondary-container text-on-secondary-container border-secondary/30'
                : 'bg-error-container text-on-error-container border-error/30'
            }`}
          >
            <span className="material-symbols-outlined text-[18px]">
              {keyMsg.type === 'ok' ? 'check_circle' : 'error'}
            </span>
            <span>{keyMsg.text}</span>
          </div>
        )}

        <div className="space-y-4">
          <div className="flex items-center justify-between p-3    border-t border-outline-variant/60 text-xs">
            <span className="text-on-surface-variant">当前厂商与模型（在上方区块修改）:</span>
            <span className="font-medium text-on-surface dark:text-on-surface tabular-nums">
              {currentProviderLabel}{modelName ? ` · ${modelName}` : ''}
            </span>
          </div>

          <div className="flex items-center justify-between p-3    border-t border-outline-variant/60 text-xs font-mono">
            <span className="text-on-surface-variant">当前密钥状态:</span>
            {isModelConfigured ? (
              <span className="text-[#2f7d4f] dark:text-[#6bbf8a] font-medium flex items-center gap-1 tabular-nums">
                <span className="material-symbols-outlined text-[18px]">lock</span>
                已配置 (AES-256 加密)
              </span>
            ) : (
              <span className="text-[#a86412] dark:text-[#d9a35b] font-medium tabular-nums">未配置 (暂无密钥)</span>
            )}
          </div>

          <div>
            <label htmlFor="enterprise-model-secret" className="block text-xs font-medium text-on-surface-variant mb-1 tabular-nums">
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
              className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
            />
          </div>

          {isAdmin && (
            <button
              type="button"
              disabled={savingKey || !newKey.trim()}
              onClick={handleSaveKey}
              className="px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-40 transition-opacity tabular-nums"
            >
              {savingKey ? '正在写入密钥…' : '更新密钥并加密入库'}
            </button>
          )}
        </div>
      </div>

      {/* 区块 3: 语音识别配置 (原“语音识别配置 (ASR)”) */}
      <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-5 border border-outline-variant/60 space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-inherit text-[18px]">mic</span>
            <h3 className="text-base font-medium text-on-surface dark:text-on-surface tabular-nums">
              {lang === 'zh' ? '区块 3：语音识别配置 (ASR)' : 'Block 3: Speech Recognition (ASR)'}
            </h3>
          </div>
          <span className="text-xs text-on-surface-variant">
            {hasAsrKey ? '● 密钥已配置' : '○ 密钥未配置'}
          </span>
        </div>

        {asrSaved && (
          <div className="p-3 bg-secondary-container text-on-secondary-container border-t border-secondary/30 text-xs  flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">check_circle</span>
            <span>语音识别引擎参数已更新</span>
          </div>
        )}

        {asrError && (
          <div className="p-3 bg-error-container text-on-error-container border-t border-error/30 text-xs  flex items-center gap-2">
            <span className="material-symbols-outlined text-[18px]">error</span>
            <span>{asrError}</span>
          </div>
        )}

        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-2 tabular-nums">
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
                  className={`py-2 px-3 rounded-lg text-xs font-medium border text-center transition-ink-colors ${
                    asrEngine === item.id
                      ? 'bg-primary text-on-primary border-primary shadow-sm dark:shadow-none'
                      : 'bg-surface dark:bg-surface-container-low text-on-surface border-outline-variant hover:bg-surface-container-high'
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
                <label htmlFor="asr-base-url" className="block text-xs font-medium text-on-surface-variant mb-1 tabular-nums">
                  {lang === 'zh' ? '语音服务地址' : 'ASR Service URL'}
                </label>
                <input
                  id="asr-base-url"
                  type="text"
                  disabled={!isAdmin || savingAsr}
                  value={asrBaseUrl}
                  onChange={(e) => setAsrBaseUrl(e.target.value)}
                  placeholder="https://语音服务地址/v1"
                  className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-on-surface-variant mb-1 tabular-nums">
                  {lang === 'zh' ? '转写模型名称' : 'ASR Model'}
                </label>
                <input
                  type="text"
                  disabled={!isAdmin || savingAsr}
                  value={asrModel}
                  onChange={(e) => setAsrModel(e.target.value)}
                  placeholder="whisper-1"
                  className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
                />
              </div>

              <div className="md:col-span-2">
                <div className="flex items-center justify-between mb-1">
                  <label htmlFor="asr-api-key" className="block text-xs font-medium text-on-surface-variant tabular-nums">
                    {lang === 'zh' ? '语音服务密钥' : 'ASR API Key'}
                  </label>
                  <span className="text-xs font-mono text-on-surface-variant">
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
                  className="w-full px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm text-on-surface dark:text-on-surface focus:border-primary"
                />
              </div>
            </div>
          )}

          <div className="p-3    border-t border-outline-variant/60 text-xs text-on-surface-variant">
            <span className="font-medium text-on-surface dark:text-on-surface tabular-nums">采样率规范: </span>
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
              className="px-4 py-2 bg-primary text-on-primary rounded-lg text-xs font-medium hover:opacity-90 disabled:opacity-50 transition-opacity tabular-nums"
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
export const AdminOrgSsoSection: React.FC<EnterpriseSectionProps> = ({ isAdmin, companyId }) => {
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [integrations, setIntegrations] = useState<EnterpriseIntegration[]>([]);
  const [ding, setDing] = useState({ corp_id: '', app_key: '', app_secret: '', agent_id: '' });
  const [oidc, setOidc] = useState({ issuer: '', client_id: '', client_secret: '' });
  const [methods, setMethods] = useState({ password: true, dingtalk: false, oidc: false });
  const input = 'w-full min-w-0 px-3 py-2 bg-surface dark:bg-surface-container-low border border-outline-variant rounded-lg text-sm';
  const button = 'px-4 py-2 bg-primary text-on-primary rounded-xl text-sm font-medium disabled:opacity-50';
  const deferred = ['badge', 'vpn_key'];
  const dingIntegration = integrations.find(item => item.provider === 'dingtalk');
  const oidcIntegration = integrations.find(item => item.provider === 'oidc');
  const report = dingIntegration?.last_sync_report;

  const load = useCallback(async () => {
    if (!companyId) { setLoading(false); return; }
    setLoading(true);
    try {
      const [data, loginMethods] = await Promise.all([
        listIntegrations(Number(companyId)),
        apiRequest<Record<string, boolean>>(`/companies/${companyId}/login-methods`),
      ]);
      const items = data.items || [];
      setIntegrations(items);
      const dc = items.find(item => item.provider === 'dingtalk')?.credentials || {};
      const oi = items.find(item => item.provider === 'oidc');
      setDing({ corp_id: String(dc.corp_id || ''), app_key: String(dc.app_key || ''), agent_id: String(dc.agent_id || ''), app_secret: '' });
      setOidc({ issuer: String(oi?.config?.issuer || ''), client_id: String(oi?.credentials?.client_id || ''), client_secret: '' });
      setMethods({ password: loginMethods.password !== false, dingtalk: loginMethods.dingtalk === true, oidc: loginMethods.oidc === true });
    } catch (error) { setMessage(error instanceof Error ? error.message : '读取企业登录配置失败'); }
    finally { setLoading(false); }
  }, [companyId]);
  useEffect(() => { setMessage(''); setIntegrations([]); setDing({ corp_id: '', app_key: '', app_secret: '', agent_id: '' }); setOidc({ issuer: '', client_id: '', client_secret: '' }); void load(); }, [load]);

  async function save(provider: 'dingtalk' | 'oidc') {
    if (!isAdmin || !companyId) return;
    setBusy(true); setMessage('');
    try {
      const credentials: Record<string, string> = provider === 'dingtalk'
        ? { corp_id: ding.corp_id.trim(), app_key: ding.app_key.trim(), agent_id: ding.agent_id.trim() }
        : { client_id: oidc.client_id.trim() };
      const secret = provider === 'dingtalk' ? ding.app_secret : oidc.client_secret;
      if (secret.trim()) credentials[provider === 'dingtalk' ? 'app_secret' : 'client_secret'] = secret.trim();
      const saved = await saveIntegration(companyId, provider, credentials, provider === 'oidc' ? { issuer: oidc.issuer.trim() } : undefined);
      setIntegrations(current => [...current.filter(item => item.provider !== provider), saved]);
      if (provider === 'dingtalk') setDing(current => ({ ...current, app_secret: '' }));
      else setOidc(current => ({ ...current, client_secret: '' }));
      setMessage(provider === 'dingtalk' ? '钉钉配置已保存，请在下方启用钉钉登录' : '通用单点登录配置已保存');
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存企业登录配置失败'); }
    finally { setBusy(false); }
  }

  async function sync() {
    if (!isAdmin || !companyId) return;
    setBusy(true); setMessage('');
    try {
      const result = await triggerOrgSync(Number(companyId), 'dingtalk');
      await load();
      setMessage(result.status === 'failed' ? (result.report?.errors?.join('；') || '钉钉同步失败') : '钉钉组织同步完成，未受邀人员不会自动开户');
    } catch (error) { setMessage(error instanceof Error ? error.message : '钉钉同步失败'); }
    finally { setBusy(false); }
  }

  async function saveMethods() {
    if (!isAdmin || !companyId) return;
    setBusy(true); setMessage('');
    try {
      await apiRequest(`/companies/${companyId}/login-methods`, { method: 'PATCH', body: JSON.stringify(methods) });
      setMessage('企业登录方式已保存');
    } catch (error) { setMessage(error instanceof Error ? error.message : '保存登录方式失败'); }
    finally { setBusy(false); }
  }

  if (loading) return <p className="p-5 text-sm">正在读取企业登录配置…</p>;
  return <div className="space-y-6 min-w-0">
    <div><h2 className="text-xl font-medium tabular-nums">组织架构与单点登录</h2>
      <p className="text-xs text-on-surface-variant mt-2">本期支持钉钉扫码登录、部门与人员目录同步，以及通用企业单点登录。仅限已受邀加入的成员登录。</p></div>
    {message && <p role="status" className="p-3 rounded-xl border border-outline-variant text-sm break-words">{message}</p>}
    <fieldset disabled={!isAdmin || busy || !companyId} className="space-y-4 p-5 rounded-xl border border-outline-variant min-w-0">
      <legend className="font-medium px-2 tabular-nums">钉钉企业内部应用</legend>
      <p className="text-xs">{dingIntegration?.has_credentials ? '应用密钥已配置，留空保留原密钥' : '尚未配置应用密钥'}</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {([{ key: 'corp_id', label: '企业标识' }, { key: 'app_key', label: '应用标识' }, { key: 'agent_id', label: '应用编号' }] as const).map(field => <label key={field.key} className="text-sm space-y-1">
          <span>{field.label}</span><input aria-label={field.label} className={input} value={ding[field.key]} onChange={event => setDing({ ...ding, [field.key]: event.target.value })} autoComplete="off" /></label>)}
        <label className="text-sm space-y-1"><span>钉钉应用密钥</span><input aria-label="钉钉应用密钥" type="password" autoComplete="new-password" className={input} value={ding.app_secret} onChange={event => setDing({ ...ding, app_secret: event.target.value })} placeholder={dingIntegration?.has_credentials ? '已配置，留空保持原密钥' : '首次配置请填写密钥'} /></label>
      </div>
      {dingIntegration?.callback_uri && <p className="text-xs break-all">授权回调地址：{dingIntegration.callback_uri}</p>}
      <div className="flex flex-wrap gap-3"><button type="button" className={button} onClick={() => void save('dingtalk')}>保存钉钉配置</button>
        <button type="button" className={button} disabled={!dingIntegration?.has_credentials || busy} onClick={() => void sync()}>钉钉立即同步</button></div>
      <p className="text-xs">同步部门与人员信息，仅关联企业已有成员；不会创建登录账号或自动邀请。</p>
      {report && <div className="text-sm space-y-1" aria-label="最近同步结果">
        <p>新增 {report.created} · 更新 {report.updated} · 失败 {report.failed}</p>
        <p>未关联已有账号 {report.users_unmatched || 0} 人</p>
        <p>同步时间：{report.synced_at ? new Date(report.synced_at).toLocaleString('zh-CN') : dingIntegration?.last_sync_at || '暂无'}</p>
        {report.errors?.map((error, index) => <p key={index} className="text-error">{error}</p>)}
      </div>}
    </fieldset>
    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">{['企业微信', '飞书', '联合身份认证'].map(name => <button key={name} type="button" disabled className="p-3 rounded-lg border border-outline-variant text-sm text-on-surface-variant opacity-50"><span className="material-symbols-outlined align-middle mr-2">badge</span>{name}：下一期支持</button>)}</div>
    <fieldset disabled={!isAdmin || busy || !companyId} className="space-y-4 p-5 rounded-xl border border-outline-variant min-w-0">
      <legend className="font-medium px-2 tabular-nums"><span className="material-symbols-outlined align-middle mr-2">vpn_key</span>通用企业单点登录</legend>
      <p className="text-xs">通过身份发行方发现配置并验证身份令牌签名。应用回调地址由服务端应用访问地址生成。</p>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <label className="text-sm space-y-1"><span>身份发行方地址</span><input aria-label="身份发行方地址" className={input} value={oidc.issuer} onChange={event => setOidc({ ...oidc, issuer: event.target.value })} placeholder="https://idp.example.com" /></label>
        <label className="text-sm space-y-1"><span>客户端标识</span><input aria-label="客户端标识" className={input} value={oidc.client_id} onChange={event => setOidc({ ...oidc, client_id: event.target.value })} autoComplete="off" /></label>
        <label className="text-sm space-y-1"><span>单点登录客户端密钥</span><input aria-label="单点登录客户端密钥" className={input} type="password" autoComplete="new-password" value={oidc.client_secret} onChange={event => setOidc({ ...oidc, client_secret: event.target.value })} placeholder={oidcIntegration?.has_credentials ? '已配置，留空保持原密钥' : '首次配置请填写密钥'} /></label>
      </div>
      {oidcIntegration?.callback_uri && <p className="text-xs break-all">授权回调地址：{oidcIntegration.callback_uri}</p>}
      <button type="button" className={button} onClick={() => void save('oidc')}>保存通用单点登录</button>
    </fieldset>
    <fieldset disabled={!isAdmin || busy || !companyId} className="space-y-4 p-5 rounded-xl border border-outline-variant">
      <legend className="font-medium px-2 tabular-nums">企业登录方式</legend>
      <div className="flex flex-wrap gap-5">{([{ key: 'password', label: '账号密码登录' }, { key: 'dingtalk', label: '钉钉登录' }, { key: 'oidc', label: '通用单点登录' }] as const).map(item => <label key={item.key} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={methods[item.key]} onChange={event => setMethods({ ...methods, [item.key]: event.target.checked })} />{item.label}</label>)}</div>
      <p className="text-xs">关闭账号密码登录后，普通成员须使用其他已启用入口。该企业有效且在职的超级管理员仍可用密码登录，作为防锁死保底。多企业成员须满足所有有效任职企业的密码限制；验证码登录单独保留。</p>
      <button type="button" className={button} onClick={() => void saveMethods()}>保存登录方式</button>
    </fieldset>
  </div>;
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
    tone === 'ok' ? 'text-[#2f7d4f]' : tone === 'warn' ? 'text-[#a86412]' : 'text-on-surface-variant';
  const renderBadge = (provider: string) => {
    const b = badgeOf(provider);
    return (
      <div className="text-right">
        <span className={`text-xs font-medium ${badgeClass(b.tone)}`}>{b.label}</span>
        {b.detail && <div className="text-xs text-on-surface-variant mt-1">{b.detail}</div>}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      <div className="pb-4 border-b border-surface-variant">
        <h2 className="text-xl font-medium text-on-surface dark:text-on-surface tabular-nums">
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
            className="text-xs font-medium underline ml-2 cursor-pointer tabular-nums"
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
      <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-5 border border-outline-variant/60 space-y-4">
        <h3 className="text-base font-medium text-on-surface dark:text-on-surface tabular-nums">
          {lang === 'zh' ? '移动与协同渠道' : 'Mobile & Collaboration'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-4    border-t border-outline-variant/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-inherit text-[18px]">chat</span>
              <div>
                <div className="text-sm font-medium text-on-surface dark:text-on-surface tabular-nums">微信公众服务号</div>
                <div className="text-xs text-on-surface-variant mt-1">支持任务逾期与每日汇总推送</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setBindNotice('微信绑定需通过微信扫码或移动端授权回调完成。')}
              className="px-3 py-2 rounded-lg bg-surface-container-high text-xs font-medium text-primary hover:bg-surface-container-highest transition-ink-colors tabular-nums"
            >
              绑定 / 授权
            </button>
          </div>

          <div className="p-4    border-t border-outline-variant/60 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <span className="material-symbols-outlined text-inherit text-[18px]">domain</span>
              <div>
                <div className="text-sm font-medium text-on-surface dark:text-on-surface tabular-nums">企业微信 (WeCom)</div>
                <div className="text-xs text-on-surface-variant mt-1">企业微信工作台自建应用与提醒</div>
              </div>
            </div>
            {renderBadge('wecom')}
          </div>
        </div>
      </div>

      {/* 开发者与生态账号 */}
      <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl p-5 border border-outline-variant/60 space-y-4">
        <h3 className="text-base font-medium text-on-surface dark:text-on-surface tabular-nums">
          {lang === 'zh' ? '办公生态与代码平台' : 'Ecosystem & Code Hosting'}
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4    border-t border-outline-variant/60">
            <span className="material-symbols-outlined text-inherit text-[18px] mb-2">send</span>
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-on-surface dark:text-on-surface tabular-nums">钉钉 (DingTalk)</div>
              {renderBadge('dingtalk')}
            </div>
            <p className="text-xs text-on-surface-variant mt-1">协同考勤与群机器人工作通知推送</p>
          </div>

          <div className="p-4    border-t border-outline-variant/60">
            <span className="material-symbols-outlined text-inherit text-[18px] mb-2">share</span>
            <div className="flex items-start justify-between gap-2">
              <div className="text-sm font-medium text-on-surface dark:text-on-surface tabular-nums">飞书 (Feishu)</div>
              {renderBadge('feishu')}
            </div>
            <p className="text-xs text-on-surface-variant mt-1">飞书互动卡片与日历日程自动对齐</p>
          </div>

          <div className="p-4    border-t border-outline-variant/60">
            <span className="material-symbols-outlined text-inherit text-inherit text-[18px] mb-2">code</span>
            <div className="text-sm font-medium text-on-surface dark:text-on-surface tabular-nums">GitHub / GitLab</div>
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
          <h2 className="text-xl font-medium text-on-surface dark:text-on-surface tabular-nums">
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
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-surface-container-high text-on-surface text-xs font-medium hover:bg-surface-container-highest transition-ink-colors cursor-pointer tabular-nums"
        >
          <span className="material-symbols-outlined text-[18px]">refresh</span>
          <span>刷新</span>
        </button>
      </div>

      {errorMsg && (
        <div className="p-3 bg-error-container text-on-error-container border border-error/30 text-xs rounded-xl flex items-center gap-2">
          <span className="material-symbols-outlined text-[18px]">error</span>
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
            className={`px-4 py-2 rounded-lg text-xs font-medium transition-ink-colors ${
              filter === tab.id
                ? 'bg-primary text-on-primary shadow-sm dark:shadow-none'
                : 'bg-surface-container-low text-on-surface-variant hover:text-on-surface'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* 列表/表格卡片 */}
      <div className="bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-outline-variant/60 overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-sm text-on-surface-variant">正在加载记录…</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-sm text-on-surface-variant">暂无符合条件的通知记录</div>
        ) : (
          <div className="divide-y divide-outline-variant/40">
            {filteredItems.map((item) => {
              const isFail = isNotifyRecordFailed(item);
              return (
                <div key={item.id} className="p-4 hover:bg-surface-container-high/40 transition-ink-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-on-surface dark:text-on-surface  font-mono px-2 py-1 rounded bg-surface dark:bg-surface/30 border border-outline-variant/40 tabular-nums">
                        {item.channel}
                      </span>
                      <span className="text-xs text-on-surface-variant font-medium tabular-nums">
                        {item.user_name || item.recipient || item.target || '系统广播'}
                      </span>
                    </div>
                    <span
                      className={`text-xs font-medium px-2 py-1 rounded-md ${
                        isFail
                          ? 'bg-error-container text-error dark:bg-error dark:text-error'
                          : 'bg-surface-container text-[#2f7d4f] dark:bg-surface-container dark:text-[#6bbf8a]'
                      }`}
                    >
                      {isFail ? '发送失败' : '投递成功'}
                    </span>
                  </div>

                  <div className="text-xs text-on-surface mt-2 font-medium tabular-nums">
                    {item.task_title || item.title || item.content_preview || '测试通知'}
                  </div>

                  {isFail && item.error && (
                    <div className="mt-2 p-2 bg-error-container dark:bg-error border border-outline-variant dark:border-outline-variant rounded-lg text-xs text-error dark:text-error font-mono">
                      错误详情: {item.error}
                    </div>
                  )}

                  <div className="text-xs text-outline mt-2">
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
