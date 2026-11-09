import React, { useEffect, useState, useMemo } from 'react';
import {
  listProjectMembers,
  listTasks,
  type BackendMember,
  type BackendTask,
} from '../../../api/backend';
import { getMyPermissions, listPresence } from '../../../api/shell';
import {
  listCompanyMembers,
  patchCompanyMember,
  pullMemberIntoProject,
  removeCompanyMember,
  type CompanyMember,
} from '../../../api/manage';
import { MobileConfirm } from '../../ui/MobileConfirm';
import { Language, Task, TeamMember } from '../../../types';
import { AppIcon } from '../../ui/AppIcon';
import { MobileInput } from '../../ui/MobileField';
import { MobileListGroup, MobileListItem } from '../../ui/MobileList';
import { MobileEmptyState, MobileLoadingState } from '../../ui/MobileState';

export interface MobileTeamScreensProps {
  projectId: number;
  companyId: number | null;
  onSelectMember?: (member: BackendMember) => void;
  onBack?: () => void;
  lang?: Language;
  /** 公司超级管理员可切到「公司成员」查看并管理所有人（含已停用的） */
  isCompanyAdmin?: boolean;
}

/** 公司成员 → 列表项用的成员结构 */
function companyMemberToListItem(m: CompanyMember): BackendMember {
  return {
    user_id: m.user_id,
    nickname: m.nickname || undefined,
    username: m.username,
    avatar_url: m.avatar_url || undefined,
    role: m.is_super_admin ? 'admin' : m.is_org_leader ? 'leader' : 'member',
  };
}

const COMPANY_STATUS_LABEL: Record<string, string> = { active: '已启用', disabled: '已停用', removed: '已移出' };

// -------------------------------------------------------------
// 51 团队与成员
// -------------------------------------------------------------
export const MobileTeamScreen: React.FC<MobileTeamScreensProps> = ({
  projectId,
  companyId,
  onSelectMember,
  onBack,
  lang = 'zh',
  isCompanyAdmin = false,
}) => {
  const [scope, setScope] = useState<'project' | 'company'>('project');
  const [companyMembers, setCompanyMembers] = useState<CompanyMember[]>([]);
  const [members, setMembers] = useState<BackendMember[]>([]);
  const [presenceMap, setPresenceMap] = useState<Record<number, string>>({});
  const [search, setSearch] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'pm' | 'member'>('all');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setLoading(true);
      try {
        const [memRes, presRes] = await Promise.all([
          listProjectMembers(projectId),
          companyId ? listPresence(companyId).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        ]);
        if (active) {
          setMembers(memRes.items || []);
          const pMap: Record<number, string> = {};
          (presRes.items || []).forEach((item) => {
            pMap[item.user_id] = item.status;
          });
          setPresenceMap(pMap);
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    };
    load();
    return () => {
      active = false;
    };
  }, [projectId, companyId]);

  useEffect(() => {
    if (scope !== 'company' || !companyId) return undefined;
    let active = true;
    listCompanyMembers(companyId)
      .then((items) => active && setCompanyMembers(items))
      .catch(() => active && setCompanyMembers([]));
    return () => {
      active = false;
    };
  }, [scope, companyId]);

  const shownMembers = scope === 'company' ? companyMembers.map(companyMemberToListItem) : members;
  const companyStatus = new Map<number, string>(companyMembers.map((m) => [m.user_id, m.status] as [number, string]));

  const filtered = useMemo(() => {
    return shownMembers.filter((m) => {
      const matchSearch =
        !search.trim() ||
        (m.display_name || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.nickname || '').toLowerCase().includes(search.toLowerCase()) ||
        (m.username || '').toLowerCase().includes(search.toLowerCase());
      const isPm = m.role?.toLowerCase() === 'pm' || m.role?.toLowerCase() === 'admin';
      const matchRole =
        roleFilter === 'all' ? true : roleFilter === 'pm' ? isPm : !isPm;
      return matchSearch && matchRole;
    });
  }, [shownMembers, search, roleFilter]);

  if (loading) return <MobileLoadingState message="加载团队成员…" />;

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="返回"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold">{scope === 'company' ? '公司成员管理' : '项目团队与成员'}</h1>
        <div className="w-10" />
      </header>

      {isCompanyAdmin && companyId ? (
        <div className="px-4 pt-3 bg-white dark:bg-slate-900 flex gap-2" role="tablist" aria-label="团队范围">
          {([['project', '项目成员'], ['company', '公司成员']] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={scope === id}
              onClick={() => setScope(id)}
              className={`min-h-[36px] px-3.5 rounded-full text-xs font-medium ${
                scope === id ? 'bg-[#0058BE] text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      <div className="p-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 space-y-3">
        <MobileInput
          placeholder="搜索成员姓名或用户名…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          clearable
          onClear={() => setSearch('')}
          leading={<AppIcon name="search" size={18} />}
        />

        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setRoleFilter('all')}
            className={`min-h-[36px] px-3.5 rounded-full text-xs font-medium transition-colors ${
              roleFilter === 'all'
                ? 'bg-[#0058BE] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            全部 ({shownMembers.length})
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('pm')}
            className={`min-h-[36px] px-3.5 rounded-full text-xs font-medium transition-colors ${
              roleFilter === 'pm'
                ? 'bg-[#0058BE] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            管理员 / PM
          </button>
          <button
            type="button"
            onClick={() => setRoleFilter('member')}
            className={`min-h-[36px] px-3.5 rounded-full text-xs font-medium transition-colors ${
              roleFilter === 'member'
                ? 'bg-[#0058BE] text-white'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300'
            }`}
          >
            业务成员
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filtered.length === 0 ? (
          <MobileEmptyState
            title="无匹配成员"
            description="未找到符合搜索条件的成员"
          />
        ) : (
          <MobileListGroup title={`成员列表 (${filtered.length})`}>
            {filtered.map((m) => {
              const name = m.display_name || m.nickname || m.username || `用户${m.user_id}`;
              const status = presenceMap[m.user_id] || 'offline';
              const isOnline = status === 'online';
              const isPm = m.role?.toLowerCase() === 'pm' || m.role?.toLowerCase() === 'admin';

              return (
                <MobileListItem
                  key={m.user_id}
                  leading={
                    <div className="relative">
                      {m.avatar_url ? (
                        <img
                          src={m.avatar_url}
                          alt={name}
                          className="w-10 h-10 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-10 h-10 rounded-full bg-[#0058BE]/10 text-[#0058BE] font-bold text-sm flex items-center justify-center">
                          {name.slice(0, 1)}
                        </div>
                      )}
                      <span
                        className={`absolute bottom-0 right-0 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 ${
                          isOnline ? 'bg-green-500' : 'bg-slate-300 dark:bg-slate-600'
                        }`}
                        aria-label={isOnline ? '在线' : '离线'}
                      />
                    </div>
                  }
                  title={name}
                  subtitle={m.username ? `@${m.username}` : `用户ID: ${m.user_id}`}
                  trailing={
                    scope === 'company' ? (
                      <span
                        className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                          (companyStatus.get(m.user_id) || 'active') === 'active'
                            ? 'bg-green-50 text-green-700'
                            : 'bg-red-50 text-red-600'
                        }`}
                      >
                        {COMPANY_STATUS_LABEL[companyStatus.get(m.user_id) || 'active'] || '已启用'}
                      </span>
                    ) : (
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-md font-medium ${
                        isPm
                          ? 'bg-blue-50 text-[#0058BE] dark:bg-blue-950 dark:text-blue-300'
                          : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                      }`}
                    >
                      {isPm ? 'PM 负责人' : '成员'}
                    </span>
                    )
                  }
                  onClick={onSelectMember ? () => onSelectMember(m) : undefined}
                />
              );
            })}
          </MobileListGroup>
        )}
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 52 成员详情与职责
// -------------------------------------------------------------
export const MobileMemberDetailScreen: React.FC<{
  member: BackendMember;
  projectId: number;
  onNavigateToAxisNode?: (nodeId: number) => void;
  onNavigateToTask?: (taskId: string) => void;
  onBack?: () => void;
  lang?: Language;
  companyId?: number | null;
  /** 当前登录人，用来禁止对自己停用 / 移除 */
  currentUserId?: number | null;
  /** 公司超级管理员才显示改角色 / 停用 / 移除 */
  isCompanyAdmin?: boolean;
}> = ({ member, projectId, onNavigateToAxisNode, onNavigateToTask, onBack, lang = 'zh', companyId = null, currentUserId = null, isCompanyAdmin = false }) => {
  const [assignedTasks, setAssignedTasks] = useState<BackendTask[]>([]);
  const [loading, setLoading] = useState(true);

  const name = member.display_name || member.nickname || member.username || `用户${member.user_id}`;
  const isPm = member.role?.toLowerCase() === 'pm' || member.role?.toLowerCase() === 'admin';

  useEffect(() => {
    let active = true;
    const loadTasks = async () => {
      setLoading(true);
      try {
        const res = await listTasks({ page: 1, page_size: 50 });
        if (active) {
          // 过滤当前成员负责的任务，严格受当前项目控制
          const userTasks = (res.items || []).filter(
            (t) =>
              t.project_id === projectId &&
              (t.assignees?.some((a) => a.user_id === member.user_id) ||
                t.assignee?.user_id === member.user_id),
          );
          setAssignedTasks(userTasks);
        }
      } catch {
        /* ignore */
      } finally {
        if (active) setLoading(false);
      }
    };
    loadTasks();
    return () => {
      active = false;
    };
  }, [member.user_id, projectId]);

  return (
    <div className="flex flex-col h-full bg-[#F2F2F7] dark:bg-black text-slate-900 dark:text-slate-100">
      <header className="h-14 px-4 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 flex items-center justify-between shrink-0">
        {onBack && (
          <button
            type="button"
            onClick={onBack}
            className="min-h-[48px] min-w-[48px] flex items-center justify-center -ml-2 text-slate-500"
            aria-label="返回"
          >
            <AppIcon name="back" size={20} />
          </button>
        )}
        <h1 className="text-base font-semibold truncate flex-1 text-center">
          成员职责名片
        </h1>
        <div className="w-10" />
      </header>

      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {/* 名片基本信息 */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col items-center text-center">
          {member.avatar_url ? (
            <img
              src={member.avatar_url}
              alt={name}
              className="w-16 h-16 rounded-full object-cover mb-3"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-[#0058BE]/10 text-[#0058BE] font-bold text-2xl flex items-center justify-center mb-3">
              {name.slice(0, 1)}
            </div>
          )}

          <h2 className="text-lg font-bold text-slate-900 dark:text-white">{name}</h2>
          <p className="text-xs text-slate-500 mt-0.5">
            {member.username ? `@${member.username}` : `用户ID: ${member.user_id}`}
          </p>

          <div className="flex gap-2 mt-3">
            <span
              className={`text-xs px-2.5 py-1 rounded-full font-medium ${
                isPm
                  ? 'bg-blue-50 text-[#0058BE] dark:bg-blue-950 dark:text-blue-300'
                  : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
              }`}
            >
              {isPm ? '项目负责人' : '项目成员'}
            </span>
          </div>
        </div>

        {/* 权限范围提示 */}
        <div className="p-3 bg-blue-50 dark:bg-blue-950/40 rounded-xl text-xs text-[#0058BE] flex items-center gap-2">
          <AppIcon name="info" size={16} />
          <span>该成员在人轴中的权限、责任节点及汇报内容均受服务端安全策略约束。</span>
        </div>

        {companyId ? (
          <MobileMemberManageGroup
            companyId={companyId}
            projectId={projectId}
            memberUserId={member.user_id}
            memberName={name}
            isSelf={currentUserId != null && currentUserId === member.user_id}
            isCompanyAdmin={isCompanyAdmin}
          />
        ) : null}

        {/* 分配的事项列表 */}
        <MobileListGroup title={`当前项目负责事项 (${assignedTasks.length})`}>
          {loading ? (
            <div className="p-4 text-center text-xs text-slate-400">正在检索事项…</div>
          ) : assignedTasks.length === 0 ? (
            <div className="p-4 text-center text-xs text-slate-400">
              当前项目尚未分派任务
            </div>
          ) : (
            assignedTasks.map((task) => (
              <MobileListItem
                key={task.id}
                leading={
                  <div
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${
                      task.status === 2
                        ? 'bg-green-500'
                        : task.status === 1
                          ? 'bg-blue-500'
                          : 'bg-slate-400'
                    }`}
                  />
                }
                title={task.title}
                subtitle={task.due_date ? `截止: ${task.due_date.slice(0, 10)}` : '无截止日'}
                trailing={
                  <span className="text-[11px] text-slate-400">
                    {task.status === 2 ? '已完成' : task.status === 1 ? '进行中' : '待办'}
                  </span>
                }
                onClick={onNavigateToTask ? () => onNavigateToTask(String(task.id)) : undefined}
              />
            ))
          )}
        </MobileListGroup>
      </div>
    </div>
  );
};

// -------------------------------------------------------------
// 成员管理：改角色 / 停用 / 启用 / 移除 / 拉入项目
// -------------------------------------------------------------
type ManageConfirm = 'disable' | 'remove' | null;

export const MobileMemberManageGroup: React.FC<{
  companyId: number;
  projectId: number;
  memberUserId: number;
  memberName: string;
  isSelf: boolean;
  isCompanyAdmin: boolean;
}> = ({ companyId, projectId, memberUserId, memberName, isSelf, isCompanyAdmin }) => {
  const [member, setMember] = useState<CompanyMember | null>(null);
  const [canPull, setCanPull] = useState(false);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<ManageConfirm>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  const reload = async () => {
    const all = await listCompanyMembers(companyId);
    setMember(all.find((m) => m.user_id === memberUserId) || null);
  };

  useEffect(() => {
    let active = true;
    listCompanyMembers(companyId)
      .then((all) => active && setMember(all.find((m) => m.user_id === memberUserId) || null))
      .catch(() => undefined);
    if (projectId > 0) {
      getMyPermissions(projectId)
        .then((p) => active && setCanPull(Boolean(p.is_pm || p.is_superadmin || p.can_edit_all)))
        .catch(() => undefined);
    }
    return () => {
      active = false;
    };
  }, [companyId, memberUserId, projectId]);

  const run = async (job: () => Promise<unknown>, okText: string) => {
    setBusy(true);
    setNotice(null);
    try {
      await job();
      await reload();
      setNotice({ ok: true, text: okText });
    } catch (e) {
      setNotice({ ok: false, text: e instanceof Error ? e.message : '操作失败' });
    } finally {
      setBusy(false);
      setConfirm(null);
    }
  };

  if (!member || (!isCompanyAdmin && !canPull)) return null;

  return (
    <div data-testid="mobile-member-manage">
      {notice && (
        <div
          role="status"
          className={`mb-3 p-3 rounded-xl text-xs ${notice.ok ? 'bg-green-50 text-green-800' : 'bg-red-50 text-red-700'}`}
        >
          {notice.text}
        </div>
      )}
      <MobileListGroup title={`成员管理 · ${COMPANY_STATUS_LABEL[member.status] || member.status}`}>
        {isCompanyAdmin && (
          <MobileListItem
            title={member.is_org_leader ? '取消组织负责人' : '设为组织负责人'}
            showChevron={false}
            onClick={busy ? undefined : () =>
              void run(
                () => patchCompanyMember(companyId, memberUserId, { is_org_leader: !member.is_org_leader }),
                member.is_org_leader ? '已取消组织负责人' : '已设为组织负责人',
              )
            }
          />
        )}
        {isCompanyAdmin && member.status === 'active' && !isSelf && (
          <MobileListItem
            title="停用此成员"
            subtitle="停用后无法登录，并退出所有项目"
            showChevron={false}
            destructive
            onClick={busy ? undefined : () => setConfirm('disable')}
          />
        )}
        {isCompanyAdmin && member.status === 'disabled' && (
          <MobileListItem
            title="启用此成员"
            subtitle="启用后需用「拉入项目」重新加入项目"
            showChevron={false}
            onClick={busy ? undefined : () =>
              void run(
                () => patchCompanyMember(companyId, memberUserId, { status: 'active' }),
                '已启用，项目成员关系需要重新拉入',
              )
            }
          />
        )}
        {canPull && member.status === 'active' && projectId > 0 && (
          <MobileListItem
            title="拉入当前项目"
            showChevron={false}
            onClick={busy ? undefined : () =>
              void run(() => pullMemberIntoProject(projectId, memberUserId), '已拉入当前项目')
            }
          />
        )}
        {isCompanyAdmin && !isSelf && member.status !== 'removed' && (
          <MobileListItem
            title="移出公司"
            subtitle="历史任务和汇报会保留，需重新邀请才能再加入"
            showChevron={false}
            destructive
            showDivider={false}
            onClick={busy ? undefined : () => setConfirm('remove')}
          />
        )}
      </MobileListGroup>
      <MobileConfirm
        isOpen={confirm !== null}
        title={confirm === 'remove' ? `把「${memberName}」移出公司？` : `停用「${memberName}」？`}
        message={
          confirm === 'remove'
            ? '移出后对方无法登录，并退出所有项目；需要重新邀请才能再加入。'
            : '停用后对方无法登录，并退出所有项目；以后启用时需要重新拉入项目。'
        }
        confirmLabel={confirm === 'remove' ? '确认移出' : '确认停用'}
        destructive
        loading={busy}
        onConfirm={() =>
          confirm === 'remove'
            ? void run(() => removeCompanyMember(companyId, memberUserId), '已移出公司')
            : void run(() => patchCompanyMember(companyId, memberUserId, { status: 'disabled' }), '已停用')
        }
        onCancel={() => setConfirm(null)}
      />
    </div>
  );
};
