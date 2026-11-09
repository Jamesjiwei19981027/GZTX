import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  listCompanyMembers,
  patchCompanyMember,
  pullMemberIntoProject,
  removeCompanyMember,
  type CompanyMember,
} from '../api/manage';

interface Props {
  companyId: number;
  /** 当前登录人 id，用来禁止对自己做停用 / 移除 */
  currentUserId: number | null;
  /** 公司超级管理员才能改角色、停用、移除 */
  canManage: boolean;
  /** 当前选中的具体项目（可为空）；项目负责人可把成员拉进来 */
  projectId: number | null;
  projectName?: string;
  /** 能否把成员拉入当前项目（项目负责人或超管） */
  canPull: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  active: '已启用',
  disabled: '已停用',
  removed: '已移出',
};

type Pending =
  | { kind: 'disable' | 'remove' | 'revokeAdmin'; member: CompanyMember }
  | null;

/** 团队页「公司成员」：改角色、停用 / 启用、移除、拉入项目。 */
export const CompanyMembersPanel: React.FC<Props> = ({
  companyId,
  currentUserId,
  canManage,
  projectId,
  projectName,
  canPull,
}) => {
  const [members, setMembers] = useState<CompanyMember[]>([]);
  const [loading, setLoading] = useState(false);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [pending, setPending] = useState<Pending>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setMembers(await listCompanyMembers(companyId));
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof Error ? e.message : '成员列表加载失败' });
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) =>
      [m.nickname, m.username, m.email, m.title].some((v) => (v || '').toLowerCase().includes(q)),
    );
  }, [members, query]);

  const run = async (member: CompanyMember, job: () => Promise<unknown>, okText: string) => {
    setBusyId(member.user_id);
    setNotice(null);
    try {
      await job();
      setNotice({ tone: 'ok', text: okText });
      await load();
    } catch (e) {
      setNotice({ tone: 'error', text: e instanceof Error ? e.message : '操作失败' });
    } finally {
      setBusyId(null);
      setPending(null);
    }
  };

  const name = (m: CompanyMember) => m.nickname || m.username || `用户${m.user_id}`;
  const btn =
    'px-2 py-1 rounded-lg border border-outline-variant/50 text-xs font-medium cursor-pointer disabled:opacity-40 hover:border-primary/50';

  return (
    <section className="space-y-3" data-testid="company-members-panel">
      <div className="flex flex-wrap items-center gap-3">
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="搜索姓名、账号或邮箱…"
          aria-label="搜索公司成员"
          className="w-full max-w-sm px-3 py-2 rounded-lg bg-surface-container border border-outline-variant/40 text-sm"
        />
        <span className="text-xs text-on-surface-variant">
          {loading ? '加载中…' : `共 ${members.length} 人`}
        </span>
      </div>
      {!canManage && (
        <p className="text-xs text-on-surface-variant">
          只有公司超级管理员可以调整角色、停用或移除成员。
        </p>
      )}
      {notice && (
        <div
          role="status"
          className={`px-4 py-2 rounded-xl text-sm border ${
            notice.tone === 'ok'
              ? 'bg-surface-container-lowest dark:bg-surface-container text-[#2f7d4f] border-outline-variant'
              : 'bg-error-container text-error border-outline-variant'
          }`}
        >
          {notice.text}
        </div>
      )}
      <ul className="divide-y divide-outline-variant/30 rounded-xl border border-outline-variant/30 bg-surface-container-lowest">
        {shown.map((m) => {
          const isSelf = m.user_id === currentUserId;
          const busy = busyId === m.user_id;
          const inactive = m.status !== 'active';
          return (
            <li
              key={m.user_id}
              data-testid={`company-member-${m.user_id}`}
              className="flex flex-wrap items-center gap-3 px-4 py-3"
            >
              <span className="w-9 h-9 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center shrink-0 tabular-nums">
                {name(m).slice(0, 1)}
              </span>
              <div className="min-w-0 flex-1">
                <div className="font-medium text-on-surface truncate tabular-nums">
                  {name(m)}
                  {isSelf && <span className="ml-1 text-xs text-on-surface-variant">（我）</span>}
                </div>
                <div className="text-xs text-on-surface-variant truncate">
                  {m.title || '未设职务'}
                  {m.email ? ` · ${m.email}` : ''}
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {m.is_super_admin && (
                  <span className="px-2 py-1 rounded-md text-xs font-medium bg-primary/10 text-primary tabular-nums">
                    超级管理员
                  </span>
                )}
                {m.is_org_leader && (
                  <span className="px-2 py-1 rounded-md text-xs font-medium bg-[#a86412]/10 text-[#a86412] tabular-nums">
                    组织负责人
                  </span>
                )}
                <span
                  className={`px-2 py-1 rounded-md text-xs font-medium ${
                    inactive ? 'bg-error text-error' : 'bg-[#2f7d4f]/10 text-[#2f7d4f]'
                  }`}
                >
                  {STATUS_LABEL[m.status] || m.status}
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {canManage && (
                  <>
                    <button
                      type="button"
                      className={btn}
                      disabled={busy}
                      onClick={() =>
                        void run(
                          m,
                          () => patchCompanyMember(companyId, m.user_id, { is_org_leader: !m.is_org_leader }),
                          m.is_org_leader ? `已取消「${name(m)}」的组织负责人` : `已设「${name(m)}」为组织负责人`,
                        )
                      }
                    >
                      {m.is_org_leader ? '取消组织负责人' : '设为组织负责人'}
                    </button>
                    {m.is_super_admin ? (
                      <button
                        type="button"
                        className={btn}
                        disabled={busy || isSelf}
                        title={isSelf ? '不能撤销自己的超级管理员身份' : undefined}
                        onClick={() => setPending({ kind: 'revokeAdmin', member: m })}
                      >
                        撤销超管
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={btn}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            m,
                            () => patchCompanyMember(companyId, m.user_id, { is_super_admin: true }),
                            `已设「${name(m)}」为超级管理员`,
                          )
                        }
                      >
                        设为超管
                      </button>
                    )}
                    {m.status === 'active' ? (
                      <button
                        type="button"
                        className={btn}
                        disabled={busy || isSelf}
                        title={isSelf ? '不能停用自己' : undefined}
                        onClick={() => setPending({ kind: 'disable', member: m })}
                      >
                        停用
                      </button>
                    ) : (
                      <button
                        type="button"
                        className={btn}
                        disabled={busy}
                        onClick={() =>
                          void run(
                            m,
                            () => patchCompanyMember(companyId, m.user_id, { status: 'active' }),
                            `已启用「${name(m)}」。原来的项目成员关系不会自动恢复，请用「拉入项目」重新加入。`,
                          )
                        }
                      >
                        启用
                      </button>
                    )}
                    <button
                      type="button"
                      className={`${btn} text-error`}
                      disabled={busy || isSelf}
                      title={isSelf ? '不能移出自己' : undefined}
                      onClick={() => setPending({ kind: 'remove', member: m })}
                    >
                      移出公司
                    </button>
                  </>
                )}
                {canPull && projectId && m.status === 'active' && (
                  <button
                    type="button"
                    className={btn}
                    disabled={busy}
                    onClick={() =>
                      void run(
                        m,
                        () => pullMemberIntoProject(projectId, m.user_id),
                        `已把「${name(m)}」拉入项目「${projectName || projectId}」`,
                      )
                    }
                  >
                    拉入项目
                  </button>
                )}
              </div>
            </li>
          );
        })}
        {!loading && shown.length === 0 && (
          <li className="px-4 py-6 text-sm text-on-surface-variant text-center">没有符合条件的成员</li>
        )}
      </ul>

      {pending && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="确认操作"
          className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4"
        >
          <div className="bg-surface-container-lowest dark:bg-surface-container rounded-[var(--radius-ink-panel)] p-6 w-full max-w-md space-y-4 border border-outline-variant/40">
            <h3 className="text-lg font-medium tabular-nums">
              {pending.kind === 'disable'
                ? `停用「${name(pending.member)}」？`
                : pending.kind === 'remove'
                  ? `把「${name(pending.member)}」移出公司？`
                  : `撤销「${name(pending.member)}」的超级管理员？`}
            </h3>
            <p className="text-sm text-on-surface-variant">
              {pending.kind === 'disable'
                ? '停用后对方无法登录，并会立刻退出他参与的所有项目。以后重新启用时，需要用「拉入项目」逐个加回项目。'
                : pending.kind === 'remove'
                  ? '移出后对方无法登录，并退出所有项目；历史任务和汇报会保留。需要重新邀请才能再加入。'
                  : '撤销后对方不再能管理公司成员与企业设置。'}
            </p>
            <div className="flex justify-end gap-2">
              <button type="button" className="px-4 py-2 text-sm cursor-pointer" onClick={() => setPending(null)}>
                取消
              </button>
              <button
                type="button"
                className="px-4 py-2 rounded-lg bg-error text-on-error text-sm font-medium cursor-pointer tabular-nums"
                onClick={() => {
                  const m = pending.member;
                  if (pending.kind === 'disable') {
                    void run(m, () => patchCompanyMember(companyId, m.user_id, { status: 'disabled' }), `已停用「${name(m)}」`);
                  } else if (pending.kind === 'remove') {
                    void run(m, () => removeCompanyMember(companyId, m.user_id), `已把「${name(m)}」移出公司`);
                  } else {
                    void run(m, () => patchCompanyMember(companyId, m.user_id, { is_super_admin: false }), `已撤销「${name(m)}」的超级管理员`);
                  }
                }}
              >
                确认
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
};
