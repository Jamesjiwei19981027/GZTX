/** A fixed seven-day window per account. Dismissing a launch does not extend it. */
export function phoneReminderDue(storage: Pick<Storage, 'getItem' | 'setItem'>, userId: string, verified: boolean, now = Date.now()): boolean {
  if (verified || !userId) return false;
  const key = `phone-verification-reminder-start:${userId}`;
  const saved = storage.getItem(key);
  let started = saved === null ? NaN : Number(saved);
  if (!Number.isFinite(started) || started > now) {
    started = now;
    storage.setItem(key, String(started));
  }
  return now - started < 7 * 24 * 60 * 60 * 1000;
}
