import React, { useState } from 'react';
import type { AxisWorkItem, TeamMember } from '../../types';
import { deleteMatterNode, updateMatterNode } from '../../api/manage';

const TYPE_LABEL: Record<AxisWorkItem['type'], string> = {
  task: '工作项',
  milestone: '里程碑',
  scope: '范围',
};

/** 把「YYYY-MM-DD」转成后端接受的当天结束时刻；空串表示清除日期。 */
export function dueDateToApi(date: string): string | null {
  const d = date.trim();
  return d ? `${d}T23:59:59` : null;
}

/** 只提交真正改动过的字段，避免无谓地覆盖他人刚改过的内容。 */
export function buildMatterPatch(
  original: Pick<AxisWorkItem, 'title' | 'dueDate' | 'assigneeUserIds'>,
  next: { title: string; dueDate: string; assigneeUserId: number | null },
): { title?: string; due_at?: string | null; assignees?: { user_id: number; role_key: string }[] } {
  const patch: ReturnType<typeof buildMatterPatch> = {};
  const title = next.title.trim();
  if (title !== original.title) patch.title = title;
  if ((next.dueDate || '') !== (original.dueDate || '')) patch.due_at = dueDateToApi(next.dueDate);
  const currentOwner = original.assigneeUserIds?.[0] ?? null;
  if (next.assigneeUserId != null && next.assigneeUserId !== currentOwner) {
    patch.assignees = [{ user_id: next.assigneeUserId, role_key: 'primary' }];
  }
  return patch;
}

interface EditProps {
  item: AxisWorkItem;
  members: TeamMember[];
  canChangeAssignee: boolean;
  onClose: () => void;
  onSaved: () => Promise<void> | void;
}

/** 编辑事项：改名、改日期、改负责人。 */
export const MatterEditForm: React.FC<EditProps> = ({ item, members, canChangeAssignee, onClose, onSaved }) => {
  const [title, setTitle] = useState(item.title);
  const [dueDate, setDueDate] = useState(item.dueDate || '');
  const [assignee, setAssignee] = useState<string>(
    item.assigneeUserIds?.[0] != null ? String(item.assigneeUserIds[0]) : '',
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      setError('事项名称不能为空');
      return;
    }
    const patch = buildMatterPatch(item, {
      title,
      dueDate,
      assigneeUserId: assignee ? Number(assignee) : null,
    });
    if (Object.keys(patch).length === 0) {
      onClose();
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await updateMatterNode(Number(item.id), patch);
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : '保存失败');
    } finally {
      setBusy(false);
    }
  };

  return (
    <form className="axis-evidence-form" onSubmit={(e) => void submit(e)} data-testid="matter-edit-form">
      <h2>编辑{TYPE_LABEL[item.type]}</h2>
      <label>
        名称
        <input value={title} maxLength={200} onChange={(e) => setTitle(e.target.value)} aria-label="事项名称" />
      </label>
      <label>
        截止日期
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} aria-label="截止日期" />
      </label>
      <label>
        负责人
        <select
          value={assignee}
          disabled={!canChangeAssignee}
          onChange={(e) => setAssignee(e.target.value)}
          aria-label="负责人"
        >
          {!assignee && <option value="">保持不变</option>}
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      {!canChangeAssignee && <p className="axis-muted">只有直属上级或项目负责人可以更换负责人。</p>}
      {error && (
        <p role="alert" className="axis-muted" style={{ color: 'var(--color-error-val)' }}>
          {error}
        </p>
      )}
      <div className="axis-form-actions" style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="axis-text-button" onClick={onClose} disabled={busy}>
          取消
        </button>
        <button type="submit" className="axis-primary-button" disabled={busy}>
          {busy ? '保存中…' : '保存'}
        </button>
      </div>
    </form>
  );
};

interface DeleteProps {
  item: AxisWorkItem;
  onClose: () => void;
  onDeleted: (item: AxisWorkItem) => Promise<void> | void;
}

/** 删除前确认；删除后由页面给出「撤销」入口。 */
export const MatterDeleteConfirm: React.FC<DeleteProps> = ({ item, onClose, onDeleted }) => {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteMatterNode(Number(item.id));
      await onDeleted(item);
    } catch (err) {
      setError(err instanceof Error ? err.message : '删除失败');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="axis-evidence-form" data-testid="matter-delete-confirm">
      <h2>删除{TYPE_LABEL[item.type]}？</h2>
      <p>
        即将删除「{item.title}」。删除后它会从人轴上消失，但可以在删除后马上点「撤销」恢复。
      </p>
      {error && (
        <p role="alert" style={{ color: 'var(--color-error-val)' }}>
          {error}
        </p>
      )}
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button type="button" className="axis-text-button" onClick={onClose} disabled={busy}>
          取消
        </button>
        <button
          type="button"
          className="axis-primary-button"
          onClick={() => void confirm()}
          disabled={busy}
        >
          {busy ? '删除中…' : '确认删除'}
        </button>
      </div>
    </div>
  );
};
