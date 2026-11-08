import type { Priority } from '../types';

const PRIORITY_LABELS: Record<string, string> = { High: '高优先级', Medium: '中优先级', Low: '低优先级' };

export const priorityLabel = (priority: Priority | string | null | undefined): string =>
  (priority && PRIORITY_LABELS[priority]) || '';

