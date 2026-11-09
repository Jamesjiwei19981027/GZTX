import assert from 'node:assert';
import fs from 'node:fs';
import { enqueuePrefWrite } from '../src/api/serialQueue';

async function main() {
  // 并发入队的写请求必须严格按顺序、不重叠地执行
  const log: string[] = [];
  let running = 0;
  let maxRunning = 0;
  const mk = (name: string, ms: number, fail = false) => () => new Promise<string>((resolve, reject) => {
    running++; maxRunning = Math.max(maxRunning, running);
    log.push(`start:${name}`);
    setTimeout(() => {
      running--; log.push(`end:${name}`);
      fail ? reject(new Error(name)) : resolve(name);
    }, ms);
  });
  const results = await Promise.allSettled([
    enqueuePrefWrite(mk('a', 30)),
    enqueuePrefWrite(mk('b', 5, true)),
    enqueuePrefWrite(mk('c', 1)),
  ]);
  assert.strictEqual(maxRunning, 1, '写请求不得并发');
  assert.deepStrictEqual(log, ['start:a', 'end:a', 'start:b', 'end:b', 'start:c', 'end:c']);
  assert.strictEqual(results[1].status, 'rejected');
  assert.strictEqual(results[2].status, 'fulfilled', '前一个失败不应阻塞后续');

  // 接线：App 里两条偏好写路径都走队列
  const app = fs.readFileSync('src/App.tsx', 'utf8');
  assert.ok(app.includes('enqueuePrefWrite(() => putUiPrefs('), 'ui-prefs 未走队列');
  assert.ok(app.includes('enqueuePrefWrite(() => updateMe('), 'notify_pref 未走队列');
  console.log('pref write queue: passed');
}
main();
