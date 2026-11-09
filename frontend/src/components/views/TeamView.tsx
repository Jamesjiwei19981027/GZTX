import React, { useEffect, useMemo, useState } from 'react';
import { TeamMember, Language } from '../../types';
import { listProjectMembers } from '../../api/backend';
import { mapMember } from '../../api/mappers';
import { inviteDeliveryNotice, inviteProjectMember, listPresence } from '../../api/shell';
import { inviteAcceptUrl } from '../../utils/invite';
import { getMyPermissions } from '../../api/shell';
import { canInviteToProject } from '../../mobile/features/projects/projectPermissions';
import { CompanyMembersPanel } from '../CompanyMembersPanel';

interface TeamViewProps {
  onSelectMember?: (member: TeamMember) => void;
  onNavigateToMessages?: () => void;
  onCreateCompany?: () => void;
  onCreateProject?: () => void;
  lang: Language;
  companyId?: number | null;
  projectId?: string;
  projectName?: string;
  /** 当前登录人是否公司超级管理员 */
  isCompanyAdmin?: boolean;
  currentUserId?: number | null;
}

export const TeamView: React.FC<TeamViewProps> = ({
  onNavigateToMessages,
  onSelectMember,
  onCreateCompany,
  onCreateProject,
  lang,
  companyId,
  projectId,
  projectName,
  isCompanyAdmin = false,
  currentUserId = null,
}) => {
  const [tab, setTab] = useState<'project' | 'company'>('project');
  const [canPull, setCanPull] = useState(false);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isInviteOpen, setIsInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteLink, setInviteLink] = useState<string | null>(null);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const backendPid =
    projectId && projectId !== 'all' && Number(projectId) > 0 ? Number(projectId) : null;

  useEffect(() => {
    if (!backendPid) {
      setCanPull(false);
      return;
    }
    let cancelled = false;
    void getMyPermissions(backendPid)
      .then((p) => {
        if (!cancelled) setCanPull(canInviteToProject(p));
      })
      .catch(() => {
        if (!cancelled) setCanPull(false);
      });
    return () => {
      cancelled = true;
    };
  }, [backendPid]);

  useEffect(() => {
    if (!backendPid) {
      setMembers([]);
      if (!companyId) {
        setError(
          lang === 'zh'
            ? '还没有公司。先创建公司工作区，再邀请同事。'
            : 'No company yet. Create a workspace before inviting teammates.',
        );
      } else {
        setError(
          lang === 'zh'
            ? '请先选择或创建一个具体项目，再加载成员。'
            : 'Select or create a project to load members.',
        );
      }
      return;
    }
    let cancelled = false;
    setLoading(true);
    void (async () => {
      try {
        const [memRes, presenceRes] = await Promise.all([
          listProjectMembers(backendPid),
          companyId ? listPresence(companyId).catch(() => ({ items: [] })) : Promise.resolve({ items: [] }),
        ]);
        if (cancelled) return;
        const presenceMap = new Map(
          (presenceRes.items || []).map((p) => [String(p.user_id), p.status]),
        );
        setMembers(
          (memRes.items || []).map((m) => {
            const mapped = mapMember(m);
            const st = presenceMap.get(mapped.id);
            return {
              ...mapped,
              status: (st as TeamMember['status']) || 'offline',
              department: mapped.role,
            };
          }),
        );
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : '加载失败');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [backendPid, companyId, lang]);

  const filteredMembers = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return members;
    return members.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        m.role.toLowerCase().includes(q) ||
        (m.department && m.department.toLowerCase().includes(q)),
    );
  }, [members, searchQuery]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail.trim() || !backendPid) return;
    try {
      const invited = await inviteProjectMember(backendPid, { email: inviteEmail.trim() });
      const link = invited.invite_url || inviteAcceptUrl(invited.token);
      setInviteLink(link);
      setInviteNotice(inviteDeliveryNotice(invited, inviteEmail.trim()));
      setInviteEmail('');
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : '邀请失败');
    }
  };

  const statusBadge = (status?: string) => {
    const label =
      status === 'online'
        ? lang === 'zh'
          ? '在线'
          : 'Online'
        : status === 'busy'
          ? lang === 'zh'
            ? '忙碌'
            : 'Busy'
          : lang === 'zh'
            ? '离线'
            : 'Offline';
    const color =
      status === 'online'
        ? 'bg-[#2f7d4f]/10 text-[#2f7d4f] border-[#2f7d4f]/20'
        : status === 'busy'
          ? 'bg-[#a86412]/10 text-[#a86412] border-[#a86412]/20'
          : 'bg-surface-container-high/10 text-on-surface-variant border-outline-variant/20';
    return (
      <span className={`inline-flex items-center gap-2 px-2 py-1 rounded-md text-xs font-medium border ${color}`}>
        {label}
      </span>
    );
  };

  return (
    <div className="space-y-8 animate-in pb-12">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-outline-variant/30 shadow-sm dark:shadow-none">
        <div>
          <h1 className="text-2xl font-medium  text-on-surface flex items-center gap-2 tabular-nums">
            <span className="material-symbols-outlined text-inherit text-[18px]">groups</span>
            {lang === 'zh' ? '团队成员' : 'Team'}
          </h1>
          <p className="text-sm text-on-surface-variant mt-1">
            {loading
              ? lang === 'zh'
                ? '加载中…'
                : 'Loading…'
              : lang === 'zh'
                ? `共 ${members.length} 人（含在线状态）`
                : `${members.length} members`}
          </p>
        </div>
        <div className="flex gap-2">
          {onCreateCompany && !companyId && (
            <button
              type="button"
              onClick={onCreateCompany}
              className="px-4 py-2 rounded-lg border border-outline-variant/50 text-sm font-medium cursor-pointer tabular-nums"
            >
              {lang === 'zh' ? '创建公司' : 'Create company'}
            </button>
          )}
          {onCreateProject && (
            <button
              type="button"
              onClick={onCreateProject}
              className="px-4 py-2 rounded-lg border border-outline-variant/50 text-sm font-medium cursor-pointer tabular-nums"
            >
              {lang === 'zh' ? '创建项目' : 'Create project'}
            </button>
          )}
          {onNavigateToMessages && (
            <button
              type="button"
              onClick={onNavigateToMessages}
              className="px-4 py-2 rounded-lg border border-outline-variant/50 text-sm font-medium cursor-pointer tabular-nums"
            >
              {lang === 'zh' ? '去消息' : 'Messages'}
            </button>
          )}
          <button
            type="button"
            onClick={() => setIsInviteOpen(true)}
            disabled={!backendPid}
            className="flex items-center gap-2 px-5 py-2 rounded-lg bg-primary text-on-primary font-medium text-sm cursor-pointer disabled:opacity-40 tabular-nums"
          >
            <span className="material-symbols-outlined text-[18px]">person_add</span>
            {lang === 'zh' ? '邀请' : 'Invite'}
          </button>
        </div>
      </div>

      {companyId ? (
        <div className="flex gap-2" role="tablist" aria-label="团队视图">
          {([
            ['project', '项目成员'],
            ['company', '公司成员管理'],
          ] as const).map(([id, label]) => (
            <button
              key={id}
              type="button"
              role="tab"
              aria-selected={tab === id}
              onClick={() => setTab(id)}
              className={`px-4 py-2 rounded-lg text-sm font-medium cursor-pointer border ${
                tab === id
                  ? 'bg-primary text-on-primary border-primary'
                  : 'border-outline-variant/50 text-on-surface'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      ) : null}

      {companyId && tab === 'company' && (
        <CompanyMembersPanel
          companyId={companyId}
          currentUserId={currentUserId}
          canManage={isCompanyAdmin}
          projectId={backendPid}
          projectName={projectName}
          canPull={canPull}
        />
      )}

      {tab === 'project' && error && (
        <div className="px-4 py-2 rounded-xl bg-surface-container-lowest dark:bg-surface-container text-[#a86412] text-sm border border-outline-variant">
          {error}
        </div>
      )}

      {tab === 'project' && <div className="relative max-w-md">
        <span className="material-symbols-outlined absolute left-3 top-2.5 text-inherit">search</span>
        <input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder={lang === 'zh' ? '搜索成员…' : 'Search members…'}
          className="w-full pl-10 pr-3 py-2 rounded-lg bg-surface-container border border-outline-variant/40 text-sm"
        />
      </div>}

      {tab === 'project' && <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {filteredMembers.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onSelectMember?.(m)}
            className="text-left p-5 rounded-lg bg-surface-container-lowest border border-outline-variant/30 hover:border-primary/40 transition-ink-colors cursor-pointer"
          >
            <div className="flex items-center gap-3">
              {m.avatar ? (
                <img
                  src={m.avatar}
                  alt=""
                  className="w-12 h-12 rounded-full object-cover bg-surface-container"
                />
              ) : (
                <span className="w-12 h-12 rounded-full bg-primary/10 text-primary text-sm font-medium flex items-center justify-center tabular-nums">
                  {m.name.slice(0, 1)}
                </span>
              )}
              <div className="min-w-0">
                <div className="font-medium text-on-surface truncate tabular-nums">{m.name}</div>
                <div className="text-xs text-on-surface-variant truncate">{m.role}</div>
                <div className="mt-1">{statusBadge(m.status)}</div>
              </div>
            </div>
          </button>
        ))}
      </div>}

      {isInviteOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <form
            onSubmit={(e) => void handleInvite(e)}
            className="bg-surface-container-lowest rounded-[var(--radius-ink-panel)] p-6 w-full max-w-md space-y-4 border border-outline-variant/40"
          >
            <h3 className="text-lg font-medium tabular-nums">
              {lang === 'zh' ? '邀请项目成员' : 'Invite member'}
            </h3>
            <input
              type="email"
              required
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full p-3 rounded-lg bg-surface-container border border-outline-variant/40 text-sm"
            />
            {inviteNotice && (
              <p data-testid="invite-delivery-notice" className="text-xs text-on-surface-variant">{inviteNotice}</p>
            )}
            {inviteLink && (
              <div className="rounded-xl bg-surface-container-lowest dark:bg-surface-container p-3 text-xs break-all">
                <div className="font-medium mb-1 tabular-nums">{lang === 'zh' ? '邀请链接' : 'Invite link'}</div>
                <p>{inviteLink}</p>
                <button
                  type="button"
                  className="mt-2 text-primary font-medium tabular-nums"
                  onClick={() => void navigator.clipboard?.writeText(inviteLink)}
                >
                  {lang === 'zh' ? '复制链接' : 'Copy link'}
                </button>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setIsInviteOpen(false)} className="px-4 py-2 text-sm cursor-pointer">
                {lang === 'zh' ? '取消' : 'Cancel'}
              </button>
              <button type="submit" className="px-4 py-2 rounded-lg bg-primary text-on-primary text-sm font-medium cursor-pointer tabular-nums">
                {lang === 'zh' ? '生成并发送邀请' : 'Send'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
