import { expect, test, type Page } from '@playwright/test';
import { COMPANY_ID, LLM_BASELINE, RUN, SMTP_BASELINE, adminSession, api, seedSession, trackErrors, waitMail } from './helpers';

/**
 * 设置页「企业管理」五个区块（超管）。重点：写到公司级、读得回、真的生效。
 * 公司发信 / AI 为全环境共用：每个用例结束都用接口恢复基线（afterAll 再兜底一次）。
 */


let token = '';
let sess: { token: string; refresh: string };

async function restoreCompany(request: any) {
  await api(request, token, 'put', `/companies/${COMPANY_ID}/smtp`, SMTP_BASELINE);
  await api(request, token, 'put', `/companies/${COMPANY_ID}/llm`, LLM_BASELINE);
}

test.beforeAll(async ({ request }) => {
  sess = await adminSession(request);
  token = sess.token;
  await restoreCompany(request);
});
test.afterEach(async ({ request }) => { await restoreCompany(request); });
test.afterAll(async ({ request }) => {
  await restoreCompany(request);
  const smtp = await api(request, token, 'get', `/companies/${COMPANY_ID}/smtp`);
  const llm = await api(request, token, 'get', `/companies/${COMPANY_ID}/llm`);
  expect(smtp.data).toMatchObject({ smtp_host: 'mailpit', smtp_port: 1025, smtp_user: 'sender@audit.test', smtp_from: 'sender@audit.test', has_password: true });
  expect(llm.data).toMatchObject({ provider: 'fake', enabled: true });
});

async function openAdmin(page: Page, tab: string) {
  await seedSession(page, sess);
  await page.goto('/?view=settings');
  await expect(page.getByRole('heading', { name: '设置' }).first()).toBeVisible({ timeout: 30_000 });
  await page.locator('main').getByRole('button', { name: new RegExp(`${tab}$`) }).click();
}

test('企业管理 · 通知渠道：公司发信配置写到公司级、读得回、测试邮件真收到', async ({ page, request }) => {
  const errs = trackErrors(page);
  await openAdmin(page, '通知渠道');
  await expect(page.getByRole('heading', { name: '通知渠道配置' })).toBeVisible();

  const host = page.getByPlaceholder('smtp.example.com');
  const user = page.getByPlaceholder('notifications@example.com');
  const from = page.getByPlaceholder('worktodo-noreply@example.com');
  const port = page.getByPlaceholder('465 / 587');
  const pwd = page.getByPlaceholder(/已配置 \(留空保留原密码\)|请输入第三方邮箱授权密码/);

  // 1) 页面加载出来的是公司级配置
  await expect(host).toHaveValue('mailpit');
  await expect(port).toHaveValue('1025');
  await expect(user).toHaveValue('sender@audit.test');
  await expect(page.getByText('密码已配置').first()).toBeVisible();

  // 2) 浏览器自动填充：密码框必须 new-password；其余文本框 off
  await expect(pwd).toHaveAttribute('autocomplete', 'new-password');
  await expect(host).toHaveAttribute('autocomplete', 'off');
  await expect(user).toHaveAttribute('autocomplete', 'off');
  await expect(from).toHaveAttribute('autocomplete', 'off');

  // 3) 改发件人并保存（密码留空 = 保留原密码）
  const newFrom = `a-from-${RUN}@audit.test`;
  await from.fill(newFrom);
  const put = page.waitForResponse((r) => r.url().includes(`/companies/${COMPANY_ID}/smtp`) && r.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存 SMTP 配置' }).click();
  expect((await put).status()).toBe(200);
  await expect(page.getByText('企业 SMTP 邮件渠道配置已成功保存')).toBeVisible();

  // 4) 数据落地：公司级读到；个人级没有被写
  const co = await api(request, token, 'get', `/companies/${COMPANY_ID}/smtp`);
  expect(co.data).toMatchObject({ smtp_host: 'mailpit', smtp_port: 1025, smtp_user: 'sender@audit.test', smtp_from: newFrom, has_password: true, source: 'company' });
  const personal = await api(request, token, 'get', '/notifications/smtp-config');
  expect(personal.data.smtp_host || '', '企业管理里保存的配置不应落进个人设置').toBe('');
  expect(personal.data.smtp_from || '').not.toBe(newFrom);

  // 5) 刷新后仍是新值
  await page.reload();
  await page.locator('main').getByRole('button', { name: /通知渠道$/ }).click();
  await expect(page.getByPlaceholder('worktodo-noreply@example.com')).toHaveValue(newFrom);

  // 6) 发送测试邮件：mailpit 真收到，且发件人是刚保存的值（证明用的是这份公司配置）
  const since = Date.now();
  const test = page.waitForResponse((r) => r.url().includes(`/companies/${COMPANY_ID}/smtp/test`));
  await page.getByRole('button', { name: '发送测试邮件' }).click();
  expect((await test).status()).toBe(200);
  await expect(page.getByText('测试邮件已成功发出')).toBeVisible();
  const mail = await waitMail(request, 'auditadmin@audit.test', { subject: /公司 SMTP 测试/, sinceMs: since });
  expect(mail.summary.From.Address).toBe(newFrom);

  // 7) 带密码保存（填 any-pass）也成功，且依然是公司级
  await page.getByPlaceholder(/已配置 \(留空保留原密码\)/).fill('any-pass');
  await page.getByPlaceholder('worktodo-noreply@example.com').fill('sender@audit.test');
  const put2 = page.waitForResponse((r) => r.url().includes(`/companies/${COMPANY_ID}/smtp`) && r.request().method() === 'PUT');
  await page.getByRole('button', { name: '保存 SMTP 配置' }).click();
  expect((await put2).status()).toBe(200);
  const co2 = await api(request, token, 'get', `/companies/${COMPANY_ID}/smtp`);
  expect(co2.data.smtp_from).toBe('sender@audit.test');
  expect(co2.data.has_password).toBe(true);
  // 保存后密码框被清空
  await expect(page.getByPlaceholder(/已配置 \(留空保留原密码\)/)).toHaveValue('');
  // vapid-public-key 在本环境未配置 VAPID 时返回 503（页面按“待配置”处理），不算本区域缺陷
  expect(errs.filter((e) => !/favicon|WebSocket|ws:|vapid-public-key|status of 503/.test(e))).toEqual([]);
});

test('企业管理 · 通知渠道：真正发验证码的地方读的就是公司级发信配置', async ({ request }) => {
  // 换一个可区分的发件人 -> 触发一封系统邮件（登录验证码，purpose=login，用 A 用户的邮箱）-> 看发件人
  const st = JSON.parse(JSON.stringify((await import('./helpers')).readState()));
  test.skip(!st.user, '需要先跑 02-invite 注册出 A 用户');
  const newFrom = `a-sys-${RUN}@audit.test`;
  await api(request, token, 'put', `/companies/${COMPANY_ID}/smtp`, { ...SMTP_BASELINE, smtp_from: newFrom });
  const since = Date.now();
  const r = await (await import('./helpers')).retry429(() => request.post('http://127.0.0.1:8097/api/v1/auth/send-code', { data: { channel: 'email', target: st.user.email, purpose: 'login' } }));
  expect(r.status()).toBe(200);
  const mail = await waitMail(request, st.user.email, { subject: /验证码/, sinceMs: since });
  expect(mail.summary.From.Address, '系统验证码邮件应使用公司级发信配置').toBe(newFrom);
  await api(request, token, 'put', `/companies/${COMPANY_ID}/smtp`, SMTP_BASELINE);
});

test('企业管理 · 通知渠道：推送渠道卡片是只读状态展示', async ({ page, request }) => {
  await openAdmin(page, '通知渠道');
  await expect(page.getByText('下一期支持')).toBeVisible();
  const vapid = await api(request, token, 'get', '/notifications/vapid-public-key');
  const key = vapid.data?.publicKey;
  await expect(page.getByText(key ? '已部署 (Active)' : '待配置')).toBeVisible();
  // 页面上 Android FCM 写“已就绪”，核对后端是否真有 FCM 配置（环境里没有则属于文案与事实不符）
  const fcm = await api(request, token, 'get', '/notifications/status');
  console.log('[A04] FCM 页面显示“已就绪”，后端 /notifications/status =', fcm.status, JSON.stringify(fcm.body).slice(0, 200));
});

test('企业管理 · AI 服务：保存写公司级、读得回；连通性测试可用', async ({ page, request }) => {
  const errs = trackErrors(page);
  try {
    await openAdmin(page, 'AI 服务配置');
    await expect(page.getByRole('heading', { name: 'AI 服务配置' })).toBeVisible();
    const keyBox = page.locator('#enterprise-llm-api-key');
    await expect(keyBox).toHaveAttribute('autocomplete', 'new-password');
    await expect(page.locator('#enterprise-model-secret')).toHaveAttribute('autocomplete', 'new-password');
    await expect(page.locator('#asr-api-key')).toHaveCount(0); // 默认“暂不启用”时不显示

    // 1) 先对基线（假模型）点连通性测试：应通过
    const t0 = page.waitForResponse((r) => r.url().includes(`/companies/${COMPANY_ID}/llm/test`));
    await page.getByRole('button', { name: '连通性测试' }).click();
    expect((await t0).status()).toBe(200);
    await expect(page.getByText('AI 模型连通性测试通过')).toBeVisible();

    // 2) 切到 DeepSeek 并保存
    await page.getByRole('button', { name: /OpenAI 兼容/ }).first().click();
    await page.getByPlaceholder('https://api.openai.com/v1').fill('https://api.deepseek.com/v1');
    await page.getByPlaceholder('gpt-4o / deepseek-chat').fill('deepseek-chat');
    await keyBox.fill('sk-A-audit-key-' + RUN);
    const put = page.waitForResponse((r) => r.url().includes(`/companies/${COMPANY_ID}/llm`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: '保存模型配置' }).click();
    expect((await put).status()).toBe(200);
    await expect(page.getByText('AI 大模型接入参数已成功保存')).toBeVisible();
    const llm = await api(request, token, 'get', `/companies/${COMPANY_ID}/llm`);
    expect(llm.data).toMatchObject({ model: 'deepseek-chat', base_url: 'https://api.deepseek.com/v1', has_api_key: true, source: 'company' });
    console.log('[A04] 页面点“DeepSeek”保存后，后端读回 provider =', llm.data.provider);
    expect(JSON.stringify(llm.data)).not.toContain('sk-A-audit-key');
    const personal = await api(request, token, 'get', '/notifications/llm-config');
    expect(personal.data.provider, '企业管理保存的 AI 配置不应落进个人设置').not.toMatch(/deepseek|custom/);
    expect(personal.data.model || '').not.toBe('deepseek-chat');
  } finally {
    await api(request, token, 'put', `/companies/${COMPANY_ID}/llm`, LLM_BASELINE);
  }
  expect(errs.filter((e) => !/favicon|WebSocket|ws:/.test(e))).toEqual([]);
});

test('企业管理 · AI 服务：只更新密钥保持模型提供商不变', async ({ page, request }) => {
  try {
    await openAdmin(page, 'AI 服务配置');
    await page.locator('#enterprise-model-secret').fill('sk-A-only-key-' + RUN);
    const put = page.waitForResponse((r) => r.url().includes(`/companies/${COMPANY_ID}/llm`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: '更新密钥并加密入库' }).click();
    expect((await put).status()).toBe(200);
    await expect(page.getByText(/密钥更新成功/)).toBeVisible();
    const llm = await api(request, token, 'get', `/companies/${COMPANY_ID}/llm`);
    console.log('[A04] 只更新密钥后公司 AI provider =', llm.data.provider, ' model =', llm.data.model);
    // 只更新密钥必须保留 provider 和 model。
    expect(llm.data.provider, '只更新密钥却改掉了公司的模型提供商').toBe('fake');
  } finally {
    await api(request, token, 'put', `/companies/${COMPANY_ID}/llm`, LLM_BASELINE);
  }
});

test('企业管理 · AI 服务：关闭“启用 AI 汇报分析”开关能写入并读回', async ({ page, request }) => {
  try {
    await openAdmin(page, 'AI 服务配置');
    await page.getByLabel('启用 AI 汇报分析').uncheck();
    const put = page.waitForResponse((r) => r.url().includes(`/companies/${COMPANY_ID}/llm`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: '保存模型配置' }).click();
    expect((await put).status()).toBe(200);
    const llm = await api(request, token, 'get', `/companies/${COMPANY_ID}/llm`);
    expect(llm.data.enabled).toBe(false);
    // 生效：开关关闭后连通性测试应被拒绝（或至少有明确提示）
    const t = await api(request, token, 'post', `/companies/${COMPANY_ID}/llm/test`, {});
    console.log('[A04] enabled=false 时 LLM 连通性测试：', t.status, JSON.stringify(t.body).slice(0, 160));
  } finally {
    await api(request, token, 'put', `/companies/${COMPANY_ID}/llm`, LLM_BASELINE);
  }
});

test('企业管理 · AI 服务：语音识别配置保存 / 读回 / 恢复', async ({ page, request }) => {
  await openAdmin(page, 'AI 服务配置');
  try {
    await page.getByRole('button', { name: 'Whisper 兼容服务' }).click();
    await page.locator('#asr-base-url').fill('https://asr.audit.example.com/v1');
    await page.getByPlaceholder('whisper-1').fill('whisper-A');
    await expect(page.locator('#asr-api-key')).toHaveAttribute('autocomplete', 'new-password');
    await page.locator('#asr-api-key').fill('asr-key-' + RUN);
    const put = page.waitForResponse((r) => r.url().includes(`/companies/${COMPANY_ID}/bindings/asr`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: '保存 ASR 语音配置' }).click();
    expect((await put).status()).toBe(200);
    await expect(page.getByText('语音识别引擎参数已更新')).toBeVisible();
    const b = await api(request, token, 'get', `/companies/${COMPANY_ID}/bindings`);
    expect(b.data.asr).toMatchObject({ provider_id: 'cloud:whisper', has_api_key: true });
    expect(b.data.asr.config_json).toMatchObject({ base_url: 'https://asr.audit.example.com/v1', model: 'whisper-A' });
    await page.reload();
    await page.locator('main').getByRole('button', { name: /AI 服务配置$/ }).click();
    await expect(page.locator('#asr-base-url')).toHaveValue('https://asr.audit.example.com/v1');
  } finally {
    // 恢复：走界面“暂不启用”并保存
    await page.getByRole('button', { name: '暂不启用' }).click();
    const put = page.waitForResponse((r) => r.url().includes(`/companies/${COMPANY_ID}/bindings/asr`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: '保存 ASR 语音配置' }).click();
    await put;
    const b = await api(request, token, 'get', `/companies/${COMPANY_ID}/bindings`);
    console.log('[A04] ASR 恢复后：', JSON.stringify(b.data.asr));
  }
});

test('企业管理 · 组织与登录：通用单点登录保存落库、刷新读回', async ({ page, request }) => {
  const before = await api(request, token, 'get', `/companies/${COMPANY_ID}/integrations`);
  expect(before.status).toBe(200);
  const oidc = before.data.items.find((x: any) => x.provider === 'oidc');
  // 审计环境已有 OIDC 配置，密钥留空保留，finally 恢复原来的非敏感字段。
  expect(oidc?.has_credentials, '需要已有 OIDC 配置以便无损恢复密钥').toBe(true);
  try {
    await openAdmin(page, '组织与登录');
    await expect(page.getByRole('heading', { name: /组织架构与单点登录/ })).toBeVisible();
    await expect(page.getByLabel('单点登录客户端密钥')).toHaveAttribute('autocomplete', 'new-password');
    await page.getByLabel('身份发行方地址').fill('https://idp.audit.example.com');
    await page.getByLabel('客户端标识').fill('A-client-' + RUN);
    const saved = page.waitForResponse(r => r.url().includes(`/companies/${COMPANY_ID}/integrations/oidc`) && r.request().method() === 'PUT');
    await page.getByRole('button', { name: '保存通用单点登录', exact: true }).click();
    expect((await saved).status()).toBe(200);
    await expect(page.getByRole('status')).toContainText('通用单点登录配置已保存');
    const read = await api(request, token, 'get', `/companies/${COMPANY_ID}/integrations`);
    const current = read.data.items.find((x: any) => x.provider === 'oidc');
    expect(current.config.issuer).toBe('https://idp.audit.example.com');
    expect(current.credentials.client_id).toBe('A-client-' + RUN);
    await page.reload();
    await page.locator('main').getByRole('button', { name: /组织与登录$/ }).click();
    await expect(page.getByLabel('客户端标识')).toHaveValue('A-client-' + RUN);
  } finally {
    const restored = await api(request, token, 'put', `/companies/${COMPANY_ID}/integrations/oidc`, { provider: 'oidc', credentials: { client_id: oidc.credentials.client_id }, config: { issuer: oidc.config.issuer } });
    expect(restored.status).toBe(200);
  }
});

test('企业管理 · 组织与登录：发信与 AI 配置不会被误选为组织同步提供商', async ({ page, request }) => {
  await openAdmin(page, '组织与登录');
  // 未配钉钉凭证时 UI 禁止同步；接口应明确说明缺少组织集成，不能误取 llm/smtp。
  await expect(page.getByRole('button', { name: '钉钉立即同步' })).toBeDisabled();
  const sync = await api(request, token, 'post', `/companies/${COMPANY_ID}/org-sync`, {});
  expect(sync.status).toBe(404);
  expect(sync.body.message).toMatch(/未配置组织集成/);
  expect(JSON.stringify(sync.body)).not.toMatch(/provider=(llm|smtp)/);
  console.log('[A04] 无组织凭证同步：', sync.status, sync.body.message);
});

test('企业管理 · 第三方服务绑定：绑定/授权按钮出提示，关闭可用', async ({ page }) => {
  await openAdmin(page, '第三方服务绑定');
  await expect(page.getByRole('heading', { name: '第三方服务绑定' })).toBeVisible();
  await page.getByRole('button', { name: '绑定 / 授权' }).click();
  await expect(page.getByText('微信绑定需通过微信扫码或移动端授权回调完成。')).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByText('微信绑定需通过微信扫码')).toHaveCount(0);
});

test('企业管理 · 通知发送记录：刷新 / 全部·成功·失败筛选，与接口数据一致', async ({ page, request }) => {
  // 先造一条真实的“已发送”记录：个人测试邮件（走公司发信）
  const since = Date.now();
  const ts = await api(request, token, 'post', '/notify/test-send', { channel: 'email' });
  console.log('[A04] 个人测试发送：', ts.status, JSON.stringify(ts.data));
  const rec = await api(request, token, 'get', `/notify/company-records?company_id=${COMPANY_ID}&limit=50`);
  const items = rec.data.items as any[];
  const sent = items.filter((i) => i.status === 'sent').length;
  const failed = items.filter((i) => i.status === 'failed').length;
  console.log('[A04] 接口记录：总', items.length, ' sent', sent, ' failed', failed);
  await openAdmin(page, '通知发送记录');
  await expect(page.getByRole('heading', { name: '通知发送记录' })).toBeVisible();
  await expect(page.getByRole('button', { name: new RegExp(`全部 \\(${items.length}\\)`) })).toBeVisible();
  const refresh = page.waitForResponse((r) => r.url().includes('/notify/company-records'));
  await page.getByRole('button', { name: '刷新' }).click();
  expect((await refresh).status()).toBe(200);
  // 页面成功计数必须包含接口 sent 状态。
  const okBtn = page.getByRole('button', { name: /^成功 \(\d+\)/ });
  const okText = await okBtn.innerText();
  console.log('[A04] 页面显示：', okText, '（接口里 sent =', sent, '）');
  await okBtn.click();
  await page.getByRole('button', { name: /^失败 \(\d+\)/ }).click();
  await page.getByRole('button', { name: /^全部 \(\d+\)/ }).click();
  expect(okText, '“成功”筛选数量应等于接口里发送成功的记录数').toContain(`(${sent})`);
  void since;
});

test('企业管理 · 通知日志：超管可读公司成员记录，普通成员不可读全公司记录', async ({ request }) => {
  const helpers = await import('./helpers');
  const st = helpers.readState();
  const member = await helpers.apiLogin(request, st.user.username, st.user.password);
  const sent = await api(request, member.token, 'post', '/notify/test-send', { channel: 'email' });
  expect(sent.status).toBe(200); expect(sent.data.ok).toBe(true);
  const own = await api(request, member.token, 'get', '/notify/records?limit=50');
  expect(own.status).toBe(200); expect(own.data.items.length).toBeGreaterThan(0);
  const company = await api(request, token, 'get', `/notify/company-records?company_id=${COMPANY_ID}&limit=50`);
  expect(company.status).toBe(200);
  expect(company.data.items.map((x: any) => x.id)).toContain(own.data.items[0].id);
  const denied = await api(request, member.token, 'get', `/notify/company-records?company_id=${COMPANY_ID}&limit=50`);
  expect(denied.status).toBe(403);
  console.log('[A04] 全公司通知记录 GET：超管', company.status, '包含成员最新记录；成员', denied.status);
});
