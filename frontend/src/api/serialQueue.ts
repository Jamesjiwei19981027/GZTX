/** 把偏好类写请求串成一条队列：前一个完成（成败皆可）后才发下一个，避免同一列并发覆盖。 */
let tail: Promise<unknown> = Promise.resolve();

export function enqueuePrefWrite<T>(task: () => Promise<T>): Promise<T> {
  const run = tail.then(task, task);
  tail = run.catch(() => undefined);
  return run;
}
