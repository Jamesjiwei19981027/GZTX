import { expect, test as base } from '@playwright/test';
import { companyId, mockWorkspaceApi, openDesktopSettings, useWorkspaceSession } from './helpers/workspace-api';

// 每条都捕获未处理异常及 console.error；不能把报错仅打印后当作通过。
const test = base.extend<{ browserErrors: string[] }>({
  browserErrors: [async ({ page }, use) => {
    const errors: string[] = [];
    page.on('pageerror', error => errors.push(`pageerror: ${error.message}`));
    page.on('console', message => {
      if (message.type() === 'error') errors.push(`console.error: ${message.text()}`);
    });
    await use(errors);
    expect(errors, '企业管理流程不应产生浏览器错误').toEqual([]);
  }, { auto: true }],
});

const enterprisePages = [
  ['通知渠道', '通知渠道配置'],
  ['AI 服务配置', 'AI 服务配置'],
  ['组织与登录', '组织架构与单点登录'],
  ['第三方服务绑定', '第三方服务绑定'],
  ['通知发送记录', '通知发送记录'],
] as const;

test('公司超级管理员可从电脑端设置打开企业管理的五个子页', async ({ page }) => {
  await mockWorkspaceApi(page, { superAdmin: true });
  await useWorkspaceSession(page);
  await openDesktopSettings(page);
  const main = page.locator('main');
  await expect(main.getByText('企业管理', { exact: true })).toBeVisible();
  for (const [entry, heading] of enterprisePages) {
    await main.getByRole('button', { name: new RegExp(entry) }).click();
    await expect(main.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    // 等待异步内容落地，避免只断言静态标题而漏掉加载时异常。
    if (entry === '通知渠道') await expect(main.getByRole('button', { name: '保存 SMTP 配置', exact: true })).toBeVisible();
    if (entry === 'AI 服务配置') await expect(main.getByLabel('API Key 授权密钥', { exact: true })).toBeVisible();
    if (entry === '组织与登录') {
      await expect(main.getByLabel('钉钉应用密钥', { exact: true })).toBeVisible();
      await expect(main.getByRole('button', { name: '保存通用单点登录', exact: true })).toBeVisible();
      await expect(main.getByRole('button', { name: '保存登录方式', exact: true })).toBeVisible();
    }
    if (entry === '第三方服务绑定') await expect(main.getByRole('heading', { name: '办公生态与代码平台', exact: true })).toBeVisible();
    if (entry === '通知发送记录') await expect(main.getByText('暂无符合条件的通知记录', { exact: true })).toBeVisible();
  }
});

test('AI 模型配置和快捷密钥保存后均只显示已配置，不回显明文', async ({ page }) => {
  await mockWorkspaceApi(page, { superAdmin: true });
  let configured = false;
  const writes: Record<string, unknown>[] = [];
  // 企业管理页读写公司级配置（AI 建议、材料研判读的是公司级）
  await page.route('**/api/v1/companies/*/llm', async route => {
    if (route.request().method() === 'PUT') {
      writes.push(route.request().postDataJSON());
      configured = true;
    }
    // 模拟服务端只返回状态、不返回原始密钥的安全契约。
    await route.fulfill({ json: { code: 200, data: {
      provider: 'openai', base_url: 'https://llm.example.test/v1', model: 'test-model',
      enabled: true, configured, has_api_key: configured,
    } } });
  });
  await useWorkspaceSession(page);
  await openDesktopSettings(page);
  const main = page.locator('main');
  await main.getByRole('button', { name: /AI 服务配置/ }).click();
  const secret = 'sk-e2e-model-secret-never-render';
  const key = main.getByLabel('API Key 授权密钥', { exact: true });
  await expect(key).toHaveAttribute('type', 'password');
  await expect(key).toHaveValue('');
  await expect(key).toHaveAttribute('placeholder', '未配置 (请输入 API Key)');
  await key.fill(secret);
  await main.getByRole('button', { name: '保存模型配置', exact: true }).click();
  await expect(main.getByText('AI 大模型接入参数已成功保存！', { exact: true })).toBeVisible();
  expect(writes).toEqual([expect.objectContaining({ provider: 'openai', api_key: secret })]);
  await expect(key).toHaveValue('');
  await expect(key).toHaveAttribute('placeholder', '已配置 (留空保留原密钥)');
  await expect(main.getByText('● 已配置 (出于安全规范不回显明文)', { exact: true })).toBeVisible();

  const quickKey = main.getByLabel('更新密钥', { exact: true });
  await expect(quickKey).toHaveAttribute('type', 'password');
  await quickKey.fill('sk-e2e-replacement-secret');
  await main.getByRole('button', { name: '更新密钥并加密入库', exact: true }).click();
  await expect(main.getByText('OpenAI密钥更新成功，当前厂商与模型保持不变。', { exact: true })).toBeVisible();
  expect(writes).toHaveLength(2);
  // 快捷更新不能覆盖现有厂商、模型或地址。
  expect(writes[1]).toEqual({ api_key: 'sk-e2e-replacement-secret' });
  await expect(quickKey).toHaveValue('');
  await expect(main.getByText(/已配置 \(AES-256 加密\)$/)).toBeVisible();

  // 离开再进入，验证重新读取配置也不会把密钥恢复到输入框。
  await main.getByRole('button', { name: /组织与登录/ }).click();
  await main.getByRole('button', { name: /AI 服务配置/ }).click();
  await expect(key).toHaveValue('');
  await expect(quickKey).toHaveValue('');
  await expect(main.getByText(secret, { exact: false })).toHaveCount(0);
  await expect(main.getByText('sk-e2e-replacement-secret', { exact: false })).toHaveCount(0);
});

test('非公司超级管理员在电脑端看不到企业管理及五个入口', async ({ page }) => {
  await mockWorkspaceApi(page, { superAdmin: false });
  await useWorkspaceSession(page);
  await openDesktopSettings(page);
  const main = page.locator('main');
  await expect(main.getByText('企业管理', { exact: true })).toHaveCount(0);
  for (const [entry] of enterprisePages) {
    await expect(main.getByRole('button', { name: new RegExp(entry) })).toHaveCount(0);
  }
});

for (const superAdmin of [true, false]) {
  test(`手机端我的不提供企业配置入口，${superAdmin ? '超管显示电脑端操作提示' : '普通成员无管理提示'}`, async ({ page }) => {
    await mockWorkspaceApi(page, { superAdmin });
    await useWorkspaceSession(page);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/?mobile=1');
    await page.getByRole('tab', { name: '我的', exact: true }).click();
    await expect(page.getByRole('heading', { name: '验收成员', exact: true })).toBeVisible();
    await expect(page.getByText(`企业 ID: ${companyId}`, { exact: true })).toBeVisible();
    await expect(page.getByText('正在从后端同步…', { exact: true })).toHaveCount(0);
    for (const label of [...enterprisePages.map(([entry]) => entry), '通知渠道配置', 'AI 模型与语音配置', '组织与登录集成', '模型密钥配置', '语音识别配置 (ASR)', '单点登录配置 (SSO)', '企业集成与管理', '推送证书状态']) {
      await expect(page.getByText(label, { exact: true })).toHaveCount(0);
    }
    const hint = page.getByText('企业配置请在电脑端「设置 → 企业管理」中操作', { exact: true });
    if (superAdmin) await expect(hint).toBeVisible();
    else await expect(hint).toHaveCount(0);
    // 个人设置仍可打开并正常返回到我的。
    await page.getByRole('button', { name: /个人资料/ }).click();
    await expect(page.getByRole('heading', { name: '个人资料', exact: true })).toBeVisible();
    await page.getByRole('button', { name: '返回', exact: true }).click();
    await expect(page.getByRole('heading', { name: '验收成员', exact: true })).toBeVisible();
  });
}
