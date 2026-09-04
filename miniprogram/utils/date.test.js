/**
 * 时间契约自测（无依赖，直接 `node utils/date.test.js`）。
 *
 * 小程序侧原来没有测试位。这里只盯时区换算：出参是 UTC，渲染/分桶必须按本地
 * 时区，区间入参必须换成 UTC。断言不写死某个时区，本地跑与 CI 跑都成立。
 */
const assert = require('assert');
const d = require('./date');

let count = 0;
function check(name, fn) {
  fn();
  count += 1;
  void name;
}

check('toLocalDateKey 跟本地时间的年月日一致', () => {
  const iso = '2026-05-27T23:00:00Z';
  const local = new Date(iso);
  const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(
    local.getDate()
  ).padStart(2, '0')}`;
  assert.strictEqual(d.toLocalDateKey(iso), expected);
});

check('toLocalDateKey 对空值/非法串返回空串', () => {
  assert.strictEqual(d.toLocalDateKey(null), '');
  assert.strictEqual(d.toLocalDateKey(''), '');
  assert.strictEqual(d.toLocalDateKey('garbage'), '');
});

check('localDayStartToApi 回到本地当天 00:00', () => {
  const start = new Date(d.localDayStartToApi(2026, 5, 28));
  assert.strictEqual(start.getFullYear(), 2026);
  assert.strictEqual(start.getMonth() + 1, 5);
  assert.strictEqual(start.getDate(), 28);
  assert.strictEqual(start.getHours(), 0);
  assert.strictEqual(start.getMinutes(), 0);
});

check('localDayEndToApi 回到本地当天 23:59:59', () => {
  const end = new Date(d.localDayEndToApi(2026, 5, 31));
  assert.strictEqual(end.getDate(), 31);
  assert.strictEqual(end.getHours(), 23);
  assert.strictEqual(end.getMinutes(), 59);
  assert.strictEqual(end.getSeconds(), 59);
});

check('区间入参是带 Z 的 UTC 串', () => {
  const start = d.localDayStartToApi(2026, 5, 1);
  const end = d.localDayEndToApi(2026, 5, 31);
  assert.ok(start.endsWith('Z'), start);
  assert.ok(end.endsWith('Z'), end);
  assert.ok(new Date(start) < new Date(end));
});

check('月区间能覆盖本地月首日凌晨的任务', () => {
  // 回归：以前发的是裸串 `2026-05-01`，后端按 UTC 解读，UTC+8 下本地
  // 5/1 00:00~08:00 到期的任务会落在区间外被漏掉。
  const start = new Date(d.localDayStartToApi(2026, 5, 1));
  const localFirstMidnight = new Date(2026, 4, 1, 0, 0, 0, 0);
  assert.strictEqual(start.getTime(), localFirstMidnight.getTime());
});

check('formatDate 按本地时区渲染 UTC 出参', () => {
  const iso = '2026-05-28T10:00:00Z';
  const local = new Date(iso);
  const expected = `${local.getFullYear()}-${String(local.getMonth() + 1).padStart(2, '0')}-${String(
    local.getDate()
  ).padStart(2, '0')} ${String(local.getHours()).padStart(2, '0')}:${String(
    local.getMinutes()
  ).padStart(2, '0')}`;
  assert.strictEqual(d.formatDate(iso, 'YYYY-MM-DD HH:mm'), expected);
});

console.log(`miniprogram date contract: ${count} cases passed`);
