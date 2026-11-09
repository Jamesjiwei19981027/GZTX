import React, { useEffect, useState } from 'react';
import { Language, TeamMember } from '../../types';
import {
  DELEGATION_ACTIONS,
  DELEGATION_SCOPE_DESCRIPTION,
  delegationValidTo,
  Delegation,
  createDelegation,
  listDelegations,
  revokeDelegation,
} from '../../api/delegations';

interface DelegationModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: Language;
  companyId: number;
  projectId: number;
  members: TeamMember[];
  canManage?: boolean;
  currentUserId?: number | null;
}

/** progress.read 默认勾选：没有它被委托人连项目视图都进不去 */
const DEFAULT_ACTIONS = ['progress.read'];

export const DelegationModal: React.FC<DelegationModalProps> = ({
  isOpen,
  onClose,
  lang,
  companyId,
  projectId,
  members,
  canManage = true,
  currentUserId,
}) => {
  const zh = lang === 'zh';
  const [items, setItems] = useState<Delegation[]>([]);
  const [granteeId, setGranteeId] = useState('');
  const [actions, setActions] = useState<Set<string>>(new Set(DEFAULT_ACTIONS));
  const [validTo, setValidTo] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const reload = React.useCallback(() => {
    void listDelegations(companyId, projectId)
      .then((res) => setItems(res.items || []))
      .catch(() => setItems([]));
  }, [companyId, projectId]);

  useEffect(() => {
    if (!isOpen) return;
    setGranteeId(members[0]?.id || '');
    setActions(new Set(DEFAULT_ACTIONS));
    setValidTo('');
    setReason('');
    setError(null);
    reload();
  }, [isOpen, members, reload]);

  if (!isOpen) return null;

  const toggleAction = (key: string) => {
    setActions((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const memberName = (userId: number) => {
    const m = members.find((x) => Number(x.id) === userId);
    return m?.name || `#${userId}`;
  };

  const handleCreate = async () => {
    setError(null);
    const grantee = Number(granteeId);
    if (!Number.isFinite(grantee) || grantee <= 0) {
      setError(zh ? '请选择被授权人' : 'Select a grantee');
      return;
    }
    if (actions.size === 0) {
      setError(zh ? '至少勾选一个权限' : 'Select at least one action');
      return;
    }
    setSubmitting(true);
    try {
      await createDelegation({
        company_id: companyId,
        project_id: projectId,
        grantee_user_id: grantee,
        actions: [...actions],
        valid_to: delegationValidTo(validTo),
        reason: reason.trim() || null,
      });
      setActions(new Set(DEFAULT_ACTIONS));
      setReason('');
      reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : zh ? '创建失败' : 'Failed');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[90] flex items-center justify-center bg-black/40  p-4"
      onClick={onClose}
    >
      <div
        role="dialog" aria-modal="true" aria-label={zh ? '委托授权' : 'Delegations'}
        className="w-full max-w-lg max-h-[85vh] overflow-y-auto rounded-[16px] tabular-nums bg-surface-container-lowest dark:bg-surface-container  border border-outline-variant/40 p-6"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-medium text-on-surface flex items-center gap-2">
            <span className="material-symbols-outlined text-inherit text-[18px]">key</span>
            {zh ? '委托授权' : 'Delegations'}
          </h2>
          <button onClick={onClose} aria-label={zh ? '关闭委托授权' : 'Close delegations'} className="text-on-surface-variant hover:text-on-surface">
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        <p className="mb-4 text-xs leading-relaxed text-on-surface-variant">{zh ? DELEGATION_SCOPE_DESCRIPTION : 'Delegate selected operations within this project. Set an expiry or revoke access at any time. This does not grant access to local files on phones or computers; evidence access covers authorized material already uploaded to the system.'}</p>
        {!canManage && <p className="mb-4 text-xs text-on-surface-variant">{zh ? '你可以查看授权记录；创建授权由项目经理或公司管理员操作。' : 'You can view delegations. Only the project manager or company administrator can create them.'}</p>}
        {canManage && <div className="space-y-3">
          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">
              {zh ? '被授权人' : 'Grantee'}
            </label>
            <select
              value={granteeId}
              onChange={(e) => setGranteeId(e.target.value)}
              className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-sm text-on-surface"
            >
              {members.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                  {m.role ? `（${m.role}）` : ''}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-xs font-medium text-on-surface-variant mb-1">
              {zh ? '授权范围' : 'Actions'}
            </label>
            <div className="space-y-2 border-t border-outline-variant py-3">
              {DELEGATION_ACTIONS.map((a) => (
                <label key={a.key} className="flex items-start gap-2 text-sm text-on-surface cursor-pointer">
                  <input
                    type="checkbox"
                    checked={actions.has(a.key)}
                    onChange={() => toggleAction(a.key)}
                    className="mt-1 accent-[var(--color-primary,#0058be)]"
                  />
                  <span>
                    <span className="block text-xs text-on-surface-variant">{zh ? a.zh : a.en}</span>
                  </span>
                </label>
              ))}
            </div>
            {!actions.has('progress.read') && (
              <p className="text-xs text-on-surface-variant mt-1">
                {zh
                  ? '未勾选查看项目进度：被委托人将无法通过该授权进入项目视图'
                  : 'Without progress.read the grantee cannot open the project view'}
              </p>
            )}
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">
                {zh ? '有效期至（可选）' : 'Valid to (optional)'}
              </label>
              <input
                type="date"
                value={validTo}
                onChange={(e) => setValidTo(e.target.value)}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-sm text-on-surface"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-on-surface-variant mb-1">
                {zh ? '原因（可选）' : 'Reason (optional)'}
              </label>
              <input
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder={zh ? '如：休假期间代管' : 'e.g. covering leave'}
                className="w-full px-3 py-2 rounded-lg border border-outline-variant bg-surface-container text-sm text-on-surface"
              />
            </div>
          </div>

          {error && <p className="text-xs text-error">{error}</p>}

          <button
            onClick={() => void handleCreate()}
            disabled={submitting}
            className="w-full py-3 rounded-lg bg-primary text-on-primary text-sm font-medium disabled:opacity-50"
          >
            {submitting ? (zh ? '创建中…' : 'Creating…') : zh ? '创建委托' : 'Create delegation'}
          </button>
        </div>}

        <div className="mt-6">
          <h3 className="text-sm font-medium text-on-surface mb-2">
            {zh ? '现有委托' : 'Active delegations'}
          </h3>
          {items.length === 0 && (
            <p className="text-xs text-on-surface-variant">{zh ? '暂无' : 'None'}</p>
          )}
          <div className="space-y-2">
            {items.map((d) => (
              <div
                key={d.id}
                className="flex items-start justify-between gap-2 border-b border-outline-variant py-3"
              >
                <div className="min-w-0">
                  <div className="text-sm text-on-surface font-medium">
                    {memberName(d.grantee_user_id)}
                    <span className="font-normal text-xs text-on-surface-variant ml-2">
                      {d.valid_to
                        ? `${zh ? '至' : 'until'} ${d.valid_to.slice(0, 10)}`
                        : zh ? '长期' : 'no expiry'}
                    </span>
                  </div>
                  <div className="text-xs text-on-surface-variant truncate">{d.actions.map(action => { const item = DELEGATION_ACTIONS.find(item => item.key === action); return item ? zh ? item.zh : item.en : action; }).join('、')}</div>
                </div>
                {(canManage || d.grantor_user_id === currentUserId) && <button
                  onClick={() =>
                    void revokeDelegation(d.id)
                      .then(reload)
                      .catch((e) => setError(e instanceof Error ? e.message : 'revoke failed'))
                  }
                  className="text-xs font-medium text-on-surface-variant shrink-0"
                >
                  {zh ? '撤销' : 'Revoke'}
                </button>}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
