import { expect, test } from '@playwright/test';
import { RUN, api, apiLogin, mailList, readState } from './helpers';

/**
 * “通知偏好”里的开关到底有没有影响真实提醒？
 * 做法：A 用户把“邮件提醒”关掉、静音时段设成全天、开周末免打扰，然后建一个 1 分钟内到点的邮件提醒，
 * 等调度器（每 60 秒扫描一次）发信，看 mailpit 是否仍然收到。
 */
test('到点提醒邮件应能发出（邮件渠道开启、任务带截止时间）', async ({ request }) => {
  test.setTimeout(240_000);
  const st = readState();
  const U = st.user;
  const s = await apiLogin(request, U.username, U.password);
  const tok = s.token;
  const pref = (await api(request, tok, 'get', '/users/me')).data.notify_pref;
  let taskId = 0, reminderId = 0;
  try {
  const title = `A-提醒任务-${RUN}`;
  await api(request, tok, 'put', '/users/me', { notify_pref: { channels: { email: { enabled: true } }, quiet_hours: { start: '00:00', end: '00:00' }, weekend_mute: false } });
  const due = new Date(Date.now() + 10 * 60_000).toISOString();
  const task = await api(request, tok, 'post', '/tasks', { title, due_date: due });
  expect(task.status, JSON.stringify(task.body).slice(0, 200)).toBeLessThan(300);
  taskId = task.data.id;
  const remindAt = new Date(Date.now() + 3_000).toISOString().replace('Z', '');
  const rem = await api(request, tok, 'post', '/reminders', { task_id: taskId, remind_at: remindAt, remind_type: 1, notify_channels: 'email' });
  expect(rem.status, JSON.stringify(rem.body).slice(0, 200)).toBeLessThan(300);
  reminderId = rem.data.id;
  let got: any = null;
  const deadline = Date.now() + 130_000;
  while (Date.now() < deadline && !got) {
    const msgs = await mailList(request, U.email);
    got = msgs.find((m) => (m.Subject || '').includes(title) || (m.Snippet || '').includes(title));
    if (!got) await new Promise((r) => setTimeout(r, 5000));
  }
  const recs = (await api(request, tok, 'get', '/notify/records?limit=10')).data.items.filter((r: any) => r.task_id === taskId);
  console.log('[A06] 是否收到提醒邮件：', !!got, ' 发送记录：', JSON.stringify(recs.map((r: any) => [r.status, r.error])));
  // finally 清理提醒，避免发送失败时调度器继续重试。
  expect(!!got, '到点提醒邮件没有发出：' + JSON.stringify(recs.map((r: any) => r.error))).toBe(true);
  } finally {
    if (reminderId) await api(request, tok, 'delete', `/reminders/${reminderId}`);
    if (taskId) await api(request, tok, 'delete', `/tasks/${taskId}`);
    const channels = Object.fromEntries(Object.entries(pref.channels || {}).map(([key, value]: any) => [key, { enabled: value.enabled }]));
    expect((await api(request, tok, 'put', '/users/me', { notify_pref: { channels, quiet_hours: pref.quiet_hours, weekend_mute: pref.weekend_mute } })).status).toBe(200);
  }
});
