import { apiRequest, setRefreshToken, setToken } from './client';
import type { AuthTokenPayload } from './auth';

export type SsoOption = { provider: 'dingtalk' | 'oidc'; company_id: number; company_name: string };
export type SyncReport = { created: number; updated: number; failed: number; users_unmatched?: number; status?: string; synced_at?: string; errors?: string[] };
export type EnterpriseIntegration = {
  provider: string;
  credentials?: Record<string, string | boolean>;
  config?: Record<string, unknown>;
  has_credentials?: boolean;
  callback_uri?: string;
  last_sync_at?: string;
  last_sync_report?: SyncReport;
};

export async function getSsoOptions() {
  const company = new URLSearchParams(window.location.search).get('company_id');
  const query = company && /^\d+$/.test(company) ? `?company_id=${company}` : '';
  return apiRequest<{ items: SsoOption[] }>(`/sso/options${query}`);
}

export async function startSso(option: SsoOption) {
  const returnTo = encodeURIComponent(window.location.pathname + window.location.search);
  const data = await apiRequest<{ authorize_url: string }>(`/sso/${option.provider}/start?company_id=${option.company_id}&return_to=${returnTo}`, { credentials: 'include' });
  window.location.assign(data.authorize_url);
}

export async function completeSso(ticket: string) {
  const data = await apiRequest<AuthTokenPayload>('/sso/complete', {
    method: 'POST', credentials: 'include', body: JSON.stringify({ ticket }),
  });
  setToken(data.access_token);
  setRefreshToken(data.refresh_token || null);
  return data;
}

export function saveIntegration(companyId: number | string, provider: 'dingtalk' | 'oidc', credentials: Record<string, string>, config?: Record<string, unknown>) {
  return apiRequest<EnterpriseIntegration>(`/companies/${companyId}/integrations/${provider}`, {
    method: 'PUT', body: JSON.stringify({ provider, credentials, ...(config ? { config } : {}) }),
  });
}
