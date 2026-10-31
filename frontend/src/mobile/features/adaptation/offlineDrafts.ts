/**
 * 离线草稿管理器 (Offline Draft Manager)
 * 严格按照 userId + projectId + formKind + entityId 隔离草稿存储
 * 退出登录时清理用户草稿，不包含敏感明文密钥或自动重发高风险数据
 */

export interface OfflineDraft<T = unknown> {
  userId: string;
  projectId: string;
  formKind: 'task' | 'report' | 'wiki' | 'evidence' | 'comment' | 'general';
  entityId: string;
  data: T;
  title: string;
  savedAt: string;
  version: 1;
}

const DRAFT_PREFIX = 'gzt_draft_v1';

export function buildDraftKey(
  userId: string | number,
  projectId: string | number | null | undefined,
  formKind: string,
  entityId: string | number = 'new',
): string {
  const u = String(userId || 'anon');
  const p = projectId !== null && projectId !== undefined && projectId !== '' ? String(projectId) : 'all';
  const f = String(formKind || 'general');
  const e = String(entityId || 'new');
  return `${DRAFT_PREFIX}:${u}:${p}:${f}:${e}`;
}

export function saveOfflineDraft<T>(params: {
  userId: string | number;
  projectId?: string | number | null;
  formKind: 'task' | 'report' | 'wiki' | 'evidence' | 'comment' | 'general';
  entityId?: string | number;
  data: T;
  title?: string;
}): OfflineDraft<T> {
  const { userId, projectId, formKind, entityId = 'new', data, title = '未命名草稿' } = params;
  const key = buildDraftKey(userId, projectId, formKind, entityId);

  const draft: OfflineDraft<T> = {
    userId: String(userId),
    projectId: projectId !== null && projectId !== undefined ? String(projectId) : 'all',
    formKind,
    entityId: String(entityId),
    data,
    title,
    savedAt: new Date().toISOString(),
    version: 1,
  };

  try {
    localStorage.setItem(key, JSON.stringify(draft));
  } catch (err) {
    console.warn('[OfflineDrafts] Failed to save draft to localStorage:', err);
  }

  return draft;
}

export function getOfflineDraft<T>(params: {
  userId: string | number;
  projectId?: string | number | null;
  formKind: string;
  entityId?: string | number;
}): OfflineDraft<T> | null {
  const { userId, projectId, formKind, entityId = 'new' } = params;
  const key = buildDraftKey(userId, projectId, formKind, entityId);

  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as OfflineDraft<T>;
    if (parsed && parsed.version === 1) {
      return parsed;
    }
  } catch {
    return null;
  }
  return null;
}

export function clearOfflineDraft(params: {
  userId: string | number;
  projectId?: string | number | null;
  formKind: string;
  entityId?: string | number;
}): void {
  const { userId, projectId, formKind, entityId = 'new' } = params;
  const key = buildDraftKey(userId, projectId, formKind, entityId);
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

export function listOfflineDrafts(
  userId: string | number,
  projectId?: string | number | null,
): OfflineDraft<unknown>[] {
  const u = String(userId);
  const p = projectId !== null && projectId !== undefined ? String(projectId) : null;
  const drafts: OfflineDraft<unknown>[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${DRAFT_PREFIX}:${u}:`)) {
        if (p && !key.startsWith(`${DRAFT_PREFIX}:${u}:${p}:`)) {
          continue;
        }
        const raw = localStorage.getItem(key);
        if (raw) {
          try {
            const parsed = JSON.parse(raw);
            if (parsed && parsed.version === 1) {
              drafts.push(parsed);
            }
          } catch {
            // ignore corrupted entry
          }
        }
      }
    }
  } catch {
    /* ignore */
  }

  // 按时间倒序
  return drafts.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
}

/**
 * 退出登录时清理该用户的所有离线草稿
 */
export function clearUserOfflineDrafts(userId: string | number): void {
  const u = String(userId);
  const keysToRemove: string[] = [];

  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(`${DRAFT_PREFIX}:${u}:`)) {
        keysToRemove.push(key);
      }
    }
    for (const key of keysToRemove) {
      localStorage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}
