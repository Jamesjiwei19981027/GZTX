import { expect, type Page } from '@playwright/test';

export const companyId = 31;
export const invitedProject = { id: 73, company_id: companyId, name: '邀请验收项目', status: 'active' };
export const workspaceUser = {
  id: 47, username: 'invited_member', nickname: '验收成员',
  email: 'member@example.test', email_verified: true, phone: '', phone_verified: false,
  avatar_url: '',
};

type WorkspaceOptions = {
  superAdmin?: boolean;
  phoneVerified?: boolean;
  registrationConfig?: { mode: 'open' | 'invite_only'; phone_required: boolean };
};

/** 只替换 HTTP 边界，保留真实 App、角色映射、导航和表单事件。无须后端或种子账号。 */
export async function mockWorkspaceApi(page: Page, options: WorkspaceOptions = {}) {
  const user = { ...workspaceUser, phone_verified: options.phoneVerified ?? true };
  await page.route('**/api/v1/**', async route => {
    const path = new URL(route.request().url()).pathname.replace('/api/v1', '');
    // 非目标的动态、通知、在线状态等列表统一为空，目标接口使用下面的实际响应结构。
    let data: unknown = { items: [], total: 0 };
    if (path === '/auth/registration-config') {
      data = options.registrationConfig ?? { mode: 'open', phone_required: false };
    } else if (path === '/users/me') {
      data = user;
    } else if (path === '/users/me/verification') {
      data = { ...user, is_verified: true };
    } else if (path === '/companies/mine') {
      data = { items: [{ id: companyId, name: '验收企业', status: 'active', my_membership: {
        status: 'active', is_super_admin: options.superAdmin ?? false,
        // 组织负责人也不能代替公司超管权限。
        is_org_leader: true,
      } }] };
    } else if (path === '/projects') {
      data = { items: [
        { id: 72, company_id: companyId, name: '其他项目', status: 'active' },
        invitedProject,
      ], total: 2 };
    } else if (path === `/projects/${invitedProject.id}`) {
      data = invitedProject;
    } else if (/\/projects\/\d+\/tree$/.test(path)) {
      data = { project_id: invitedProject.id, nodes: [] };
    } else if (/\/projects\/\d+\/my-permissions$/.test(path)) {
      data = { role: 'member', is_pm: false, is_superadmin: options.superAdmin ?? false };
    } else if (path === '/categories' || path === '/tags') {
      data = [];
    } else if (path === '/users/me/ui-prefs') {
      data = { ui: { language: 'zh', theme_mode: 'light' } };
    } else if (path === '/health') {
      data = { status: 'ok', version: 'e2e' };
    } else if (path === '/notifications/smtp-config') {
      data = { smtp_host: 'smtp.example.test', smtp_port: 465,
        smtp_user: 'notify@example.test', smtp_from: 'notify@example.test', has_password: true };
    } else if (path === '/notifications/vapid-public-key') {
      data = { publicKey: '' };
    } else if (path === '/notifications/llm-config') {
      data = { provider: 'openai', base_url: 'https://llm.example.test/v1', model: 'test-model',
        enabled: true, configured: false, has_api_key: false };
    } else if (path === `/companies/${companyId}/bindings`) {
      data = { asr: { provider_id: 'builtin', config_json: null, has_api_key: false } };
    } else if (path === '/users/me/people-axis') {
      data = { projects: [] };
    }
    await route.fulfill({ json: { code: 200, data } });
  });
}

export async function useWorkspaceSession(page: Page) {
  await page.addInitScript(() => {
    localStorage.setItem('access_token', 'e2e-workspace-access');
    localStorage.setItem('refresh_token', 'e2e-workspace-refresh');
  });
}

export async function openDesktopSettings(page: Page) {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto('/');
  await page.locator('aside').getByRole('button', { name: '我的', exact: true }).click();
  await expect(page.getByRole('heading', { name: '个人资料', exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: '验收成员', exact: true })).toBeVisible();
  await expect(page.getByText('正在从后端同步…', { exact: true })).toHaveCount(0);
}
