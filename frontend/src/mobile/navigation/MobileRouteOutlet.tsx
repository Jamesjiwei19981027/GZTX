import React, { Suspense, useState, useEffect, useCallback } from 'react';
import { WorkContactsPage } from '../../components/WorkContactsPage';
const PersonalKnowledgeSpace = React.lazy(() =>
  import('../../components/PersonalKnowledgeSpace').then((m) => ({ default: m.PersonalKnowledgeSpace })),
);
import { useMobileNavigation } from './MobileNavigationProvider';
import {
  Task,
  Project,
  Activity,
  UserProfile,
  AppSettings,
  Language,
  Status,
} from '../../types';
import { DashboardView } from '../../components/views/DashboardView';
import { MyTasksView } from '../../components/views/MyTasksView';
import { MobileTopBar } from '../ui/MobileTopBar';
import { MobileEmptyState, MobileLoadingState } from '../ui/MobileState';
import { AppIcon } from '../ui/AppIcon';
import { TaskWorkspaceToolbar } from '../../components/TaskWorkspaceToolbar';
import { filterTaskWorkspace, normalizeTaskWorkspaceScope } from '../../utils/taskWorkspace';
import { mapTask } from '../../api/mappers';
import { MyAgentScreen } from '../features/reports/MyAgentScreen';
import { MyReportEditor } from '../features/reports/MyReportEditor';
import { ReportDetailScreen } from '../features/reports/ReportDetailScreen';
import { ManagerReportInbox } from '../features/reports/ManagerReportInbox';
import { ProjectReportScreen } from '../features/reports/ProjectReportScreen';
import { LeadershipReportScreen } from '../features/reports/LeadershipReportScreen';
import { MobileAxisScreens } from '../features/people-axis/MobileAxisScreens';
import { MobileEvidenceScreens } from '../features/people-axis/MobileEvidenceScreens';
import { RecordProgressScreen } from '../features/progress/RecordProgressScreen';
import { MobileWikiScreens } from '../features/wiki/MobileWikiScreens';
import {
  MobileMeScreen,
  MobileProfileScreen,
  MobileSecurityScreen,
  MobileAppearanceScreen,
  MobileNotificationSettingsScreen,
  MobileTaskDefaultsScreen,
  MobileBillingHelpScreen,
  MobileNotificationLogsScreen,
  MobileThirdPartyBindingsScreen,
  isUserAdmin,
} from '../features/settings/MobileSettingsScreens';
import {
  AdaptAccountDeleteScreen,
} from '../features/adaptation/MobileAdaptationScreens';
import {
  MobileWorkbenchScreen,
  MobileTrashScreen,
  MobileGlobalSearchScreen,
} from '../features/work/MobileWorkScreens';
import { MobileStatisticsScreen } from '../features/work/MobileStatisticsScreen';
import {
  MobileMyTasksScreen,
  MobileKanbanScreen,
  MobileCalendarScreen,
  MobileTaskDetailSheet,
  MobileTaskEditScreen,
  MobileQuickAddSheet,
  MobileTaskExtractChatSheet,
} from '../features/tasks/MobileTaskScreens';
import {
  MobileProjectSwitchScreen,
  MobileWorkspaceCreateScreen,
  MobileProjectOverviewScreen,
  MobileProjectSettingsScreen,
  MobileProjectInviteScreen,
  MobileInviteAcceptScreen,
} from '../features/projects/MobileProjectScreens';
import {
  MobileTeamScreen,
  MobileMemberDetailScreen,
} from '../features/projects/MobileTeamScreens';
import {
  MobileMessageListScreen,
  MobileChatDetailScreen,
  MobileConversationProfileScreen,
} from '../features/messages/MobileMessageScreens';
import {
  MobileInboxScreen,
} from '../features/messages/MobileInboxScreens';
import {
  MobileCallScreen,
} from '../features/messages/MobileCallScreen';

// 懒加载重视图
const KanbanView = React.lazy(() =>
  import('../../components/views/KanbanView').then((m) => ({ default: m.KanbanView })),
);
const CalendarView = React.lazy(() =>
  import('../../components/views/CalendarView').then((m) => ({ default: m.CalendarView })),
);
const ReportsView = React.lazy(() =>
  import('../../components/views/ReportsView').then((m) => ({ default: m.ReportsView })),
);
const MessagesView = React.lazy(() =>
  import('../../components/views/MessagesView').then((m) => ({ default: m.MessagesView })),
);
const InboxView = React.lazy(() =>
  import('../../components/views/InboxView').then((m) => ({ default: m.InboxView })),
);
const SettingsView = React.lazy(() =>
  import('../../components/views/SettingsView').then((m) => ({ default: m.SettingsView })),
);
const TeamView = React.lazy(() =>
  import('../../components/views/TeamView').then((m) => ({ default: m.TeamView })),
);
const NotificationSettingsView = React.lazy(() =>
  import('../../components/views/NotificationSettingsView').then((m) => ({
    default: m.NotificationSettingsView,
  })),
);
const TrashView = React.lazy(() =>
  import('../../components/views/TrashView').then((m) => ({ default: m.TrashView })),
);

export interface MobileRouteOutletSharedProps {
  user: UserProfile;
  tasks: Task[];
  projects: Project[];
  currentProject: Project;
  onSelectProject: (p: Project) => void;
  activities: Activity[];
  settings: AppSettings;
  companyId: number | string | null;
  projectMembers: import('../../types').TeamMember[] | Array<{ id: string; name: string; avatar?: string; role?: string }>;
  onSelectTask: (task: Task) => void;
  onTaskSaved?: (task: Task) => void;
  onOpenNewTask: () => void;
  onToggleTaskCompletion: (task: Task) => void;
  onUpdateTaskStatus?: (taskId: string, status: Status) => void;
  onBatchComplete: (ids: string[]) => Promise<void>;
  onBatchReschedule: (ids: string[], date: string) => Promise<void>;
  onBatchDelete: (ids: string[]) => Promise<void>;
  onMoveTask?: (taskId: string, date: string) => void;
  onUpdateUser: (updated: Partial<UserProfile>) => Promise<void>;
  onUploadAvatar: (file: File) => Promise<void>;
  onUpdateSettings: (updated: Partial<AppSettings>) => void;
  onLogout: () => Promise<void>;
  onOpenQuickAdd: () => void;
  onOpenSearch: () => void;
}

export const MobileRouteOutlet: React.FC<MobileRouteOutletSharedProps> = (props) => {
  const { currentTab, activeRoute, canGoBack, goBack, push, replace, openOverlay, closeOverlay, setDirty } = useMobileNavigation();
  const lang: Language = props.settings.language;

  const [detailTask, setDetailTask] = useState<Task | null>(null);
  const [isNewTaskOpen, setIsNewTaskOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<Task | null>(null);
  const [newTaskDate, setNewTaskDate] = useState<string>();
  const [newTaskStatus, setNewTaskStatus] = useState<Status>();
  const [calendarEditor, setCalendarEditor] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [isExtractChatOpen, setIsExtractChatOpen] = useState(false);
  const [activeCall, setActiveCall] = useState<{ name: string; type: 'audio' | 'video'; conversationId?: number } | null>(null);

  const parsedCompanyId = props.companyId ? Number(props.companyId) : null;
  const projectMembersList: import('../../types').TeamMember[] = Array.isArray(props.projectMembers)
    ? (props.projectMembers as import('../../types').TeamMember[])
    : [];

  const editScheduledTask = (task: Task) => {
    setDetailTask(null); setCalendarEditor(true); setEditingTask(task); setIsNewTaskOpen(true);
  };
  const addScheduledTask = (date: string) => {
    setDetailTask(null); setCalendarEditor(true); setEditingTask(null); setNewTaskDate(date); setIsNewTaskOpen(true);
  };
  const closeTaskEditor = useCallback(() => {
    setIsNewTaskOpen(false); setEditingTask(null); setNewTaskDate(undefined);
    setNewTaskStatus(undefined); setCalendarEditor(false); setDirty(false);
  }, [setDirty]);
  useEffect(() => {
    if (!isNewTaskOpen) return;
    openOverlay({ id: 'task-editor', type: 'sheet', onDismiss: closeTaskEditor });
    return () => closeOverlay();
  }, [isNewTaskOpen, openOverlay, closeOverlay, closeTaskEditor]);

  // 根据当前 activeRoute 确定页面渲染
  const renderScreenContent = () => {
    switch (activeRoute.screen.startsWith('ai-') ? 'assistant' : currentTab) {
      case 'work': {
        if (activeRoute.screen === 'record-progress') {
          return (
            <RecordProgressScreen
              projectId={activeRoute.params.projectId || props.currentProject.id}
              companyId={props.companyId}
              nodeId={activeRoute.params.nodeId}
              initialTarget={activeRoute.params.initialTarget as any}
              currentUser={props.user}
              projects={props.projects}
              onBack={goBack}
              onViewReports={() => push({ screen: 'ai-report-create', title: '我的汇报' })}
            />
          );
        }
        if (activeRoute.screen === 'work-tasks' || activeRoute.screen === 'work-kanban') {
          const view = activeRoute.screen === 'work-tasks' ? 'tasks' : 'kanban';
          const scope = normalizeTaskWorkspaceScope(activeRoute.params.filter);
          const tasks = filterTaskWorkspace(props.tasks, scope);
          return <div className="flex flex-col h-full min-h-0">
            <TaskWorkspaceToolbar view={view} scope={scope} lang={lang}
              onViewChange={next => replace({ screen: next === 'tasks' ? 'work-tasks' : 'work-kanban', title: '任务管理', params: activeRoute.params })}
              onScopeChange={filter => replace({ screen: activeRoute.screen, title: '任务管理', params: { ...activeRoute.params, filter } })}
              onOpenTrash={() => push({ screen: 'work-trash', title: '回收站' })} />
            <div className="flex-1 min-h-0">{view === 'tasks' ? (
            <MobileMyTasksScreen
              tasks={tasks}
              showHeader={false}
              onSelectTask={(t) => setDetailTask(t)}
              onToggleCompletion={async (t) => { props.onToggleTaskCompletion(t); }}
              onBatchComplete={props.onBatchComplete}
              onBatchReschedule={props.onBatchReschedule}
              onBatchDelete={props.onBatchDelete}
              onOpenNewTask={() => {
                setEditingTask(null);
                setIsNewTaskOpen(true);
              }}
              lang={lang}
            />
          ) : (
            <MobileKanbanScreen
              tasks={tasks}
              showHeader={false}
              members={projectMembersList}
              onUpdateStatus={async (taskId, newStatus) => {
                props.onUpdateTaskStatus?.(taskId, newStatus);
              }}
              onSelectTask={(t) => setDetailTask(t)}
              onOpenNewTaskWithStatus={(status) => {
                setNewTaskStatus(status);
                setEditingTask(null);
                setIsNewTaskOpen(true);
              }}
              lang={lang}
            />
          )}</div></div>;
        }
        if (activeRoute.screen === 'work-calendar') {
          return (
            <MobileCalendarScreen
              tasks={props.tasks}
              onSelectTask={editScheduledTask}
              onOpenNewTaskWithDate={addScheduledTask}
              onBack={canGoBack ? goBack : undefined}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'work-statistics') {
          return (
            <MobileStatisticsScreen
              tasks={props.tasks}
              projectId={props.currentProject.id}
              members={projectMembersList}
              onBack={canGoBack ? goBack : undefined}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'work-trash') {
          return (
            <MobileTrashScreen
              onRestored={task => props.onTaskSaved?.(mapTask(task))}
              onBack={canGoBack ? goBack : undefined}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'work-search') {
          return (
            <MobileGlobalSearchScreen
              tasks={props.tasks}
              projects={props.projects}
              onSelectTask={(t) => setDetailTask(t)}
              onSelectProject={(p) => props.onSelectProject(p)}
              onClose={goBack}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'project-switch') {
          return (
            <MobileProjectSwitchScreen
              currentProject={props.currentProject}
              projects={props.projects}
              companyId={parsedCompanyId}
              onSelectProject={props.onSelectProject}
              onCreateProjectClick={() => push({ screen: 'project-create', title: '新建项目' })}
              onClose={canGoBack ? goBack : undefined}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'project-create' || activeRoute.screen === 'company-create') {
          return (
            <MobileWorkspaceCreateScreen
              initialMode={activeRoute.screen === 'company-create' ? 'company' : 'project'}
              companyId={parsedCompanyId}
              onCreated={(created) => {
                if (created.kind === 'project') {
                  props.onSelectProject({
                    id: String(created.id),
                    name: created.name,
                    description: '',
                    color: '#0058BE',
                    active: true,
                  });
                }
                goBack();
              }}
              onCancel={goBack}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'project-overview') {
          return (
            <MobileProjectOverviewScreen
              projectId={Number(activeRoute.params.projectId || props.currentProject.id)}
              onSelectTask={setDetailTask}
              onNavigateToTasks={() => push({ screen: 'work-tasks', title: '我的待办' })}
              onNavigateToKanban={() => push({ screen: 'work-kanban', title: '项目看板' })}
              onNavigateToAxis={() => {
                const project = props.projects.find(p => p.id === String(activeRoute.params.projectId || props.currentProject.id));
                if (project) props.onSelectProject(project);
                push({ tab: 'axis', screen: 'axis-root', title: '人轴' });
              }}
              onNavigateToSettings={() => push({ screen: 'project-settings', title: '项目设置', params:{projectId:String(activeRoute.params.projectId || props.currentProject.id)} })}
              onNavigateToKnowledge={() => {
                const project = props.projects.find(p => p.id === String(activeRoute.params.projectId || props.currentProject.id));
                if (project) props.onSelectProject(project);
                push({ tab: 'knowledge', screen: 'knowledge-root', title: '项目知识空间', params: { knowledgeScope: 'project' } });
              }}
              onNavigateToInvite={() => push({ screen: 'project-invite', title: '成员邀请', params:{projectId:String(activeRoute.params.projectId || props.currentProject.id)} })}
              onBack={canGoBack ? goBack : undefined}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'project-settings') {
          return (
            <MobileProjectSettingsScreen
              projectId={Number(activeRoute.params.projectId || props.currentProject.id)}
              onBack={canGoBack ? goBack : undefined}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'project-invite') {
          return (
            <MobileProjectInviteScreen
              projectId={Number(activeRoute.params.projectId || props.currentProject.id)}
              onBack={canGoBack ? goBack : undefined}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'invite-accept') {
          return (
            <MobileInviteAcceptScreen
              initialToken={activeRoute.params.token}
              onAccepted={(res) => {
                goBack();
              }}
              onCancel={goBack}
              lang={lang}
            />
          );
        }

        // 默认工作台根页 (05 员工工作台 / 06 管理者工作台)
        return (
          <MobileWorkbenchScreen
            user={props.user}
            tasks={props.tasks}
            projects={props.projects}
            currentProject={props.currentProject}
            activities={props.activities}
            onSelectTask={(t) => setDetailTask(t)}
            onOpenNewTask={() => {
              setEditingTask(null);
              setIsNewTaskOpen(true);
            }}
            onOpenQuickAdd={() => setIsQuickAddOpen(true)}
            onOpenSearch={() => push({ screen: 'work-search', title: '全局搜索' })}
            onNavigateToTasks={() => push({ screen: 'work-tasks', title: '我的待办' })}
            onNavigateToKanban={filter => push({ screen: 'work-kanban', title: '任务管理', params: { filter } })}
            onNavigateToCalendar={() => push({ screen: 'work-calendar', title: '日程日历' })}
            onNavigateToStatistics={() => push({ screen: 'work-statistics', title: '统计报表' })}
            onNavigateToAssistant={action => push({ tab: 'work', screen: action === 'progress' ? 'record-progress' : 'ai-root', title: action === 'progress' ? '记录进展' : '汇报' })}
            onNavigateToTrash={() => push({ screen: 'work-trash', title: '回收站' })}
            onNavigateToAxis={() => push({ tab: 'axis', screen: 'axis-root', title: '人轴' })}
            onOpenProject={(project) => {
              props.onSelectProject(project);
              push({screen:'project-overview',title:project.name,params:{projectId:project.id}});
            }}
            onOpenProjects={() => push({screen:'project-switch',title:'项目列表'})}
            onToggleTaskCompletion={props.onToggleTaskCompletion}
            onEditScheduledTask={editScheduledTask}
            onOpenNewTaskWithDate={addScheduledTask}
            lang={lang}
          />
        );
      }

      case 'axis': {
        // 人轴页在“全部项目”下会回退到具体项目并把它带进路由；拿不到具体项目时不发 NaN 请求
        const axisProjectId = activeRoute.params.projectId || props.currentProject.id;
        if (activeRoute.screen !== 'axis-root' && !(Number(axisProjectId) > 0)) {
          return <MobileEmptyState iconName="folder" title="请先选择项目" description="请先在顶部选择一个具体项目后再打开此页面。" />;
        }
        if (activeRoute.screen === 'record-progress') {
          return (
            <RecordProgressScreen
              projectId={axisProjectId}
              companyId={props.companyId}
              nodeId={activeRoute.params.nodeId}
              initialTarget={activeRoute.params.initialTarget as any}
              currentUser={props.user}
              projects={props.projects}
              onBack={goBack}
              onViewReports={() => push({ screen: 'ai-report-create', title: '我的汇报' })}
            />
          );
        }
        if (activeRoute.screen === 'axis-evidence-detail') {
          return (
            <MobileEvidenceScreens
              mode="detail"
              projectId={axisProjectId}
              companyId={props.companyId}
              nodeId={activeRoute.params.nodeId}
              packageId={activeRoute.params.packageId}
              currentUser={props.user}
              onBack={goBack}
            />
          );
        }
        if (activeRoute.screen === 'axis-progress') {
          return (
            <MobileEvidenceScreens
              mode="progress"
              projectId={axisProjectId}
              companyId={props.companyId}
              nodeId={activeRoute.params.nodeId}
              currentUser={props.user}
              onBack={goBack}
              onNavigateToPackage={(pkgId) =>
                push({ screen: 'axis-evidence-detail', params: { packageId: String(pkgId) } })
              }
            />
          );
        }
        if (activeRoute.screen === 'axis-delegations') {
          return (
            <MobileEvidenceScreens
              mode="delegations"
              projectId={axisProjectId}
              companyId={props.companyId}
              currentUser={props.user}
              onBack={goBack}
            />
          );
        }
        if (activeRoute.screen === 'axis-audit') {
          const currentAuditProject =
            props.projects.find((p) => String(p.id) === String(axisProjectId)) ||
            (props.currentProject.id !== 'all' ? props.currentProject : undefined);
          return (
            <MobileEvidenceScreens
              mode="audit"
              projectId={axisProjectId}
              projectName={currentAuditProject?.name}
              companyId={props.companyId}
              currentUser={props.user}
              onBack={goBack}
            />
          );
        }
        if (
          activeRoute.screen === 'axis-wiki' ||
          activeRoute.screen === 'axis-wiki-draft' ||
          activeRoute.screen === 'axis-wiki-search'
        ) {
          const initialTab =
            activeRoute.screen === 'axis-wiki-draft'
              ? 'drafts'
              : activeRoute.screen === 'axis-wiki-search'
              ? 'search'
              : 'published';
          return (
            <MobileWikiScreens
              projectId={axisProjectId}
              projectName={props.currentProject.name}
              currentUser={props.user}
              initialTab={initialTab}
              onBack={goBack}
              onOpenEvidencePackage={(pkgId) =>
                push({ screen: 'axis-evidence-detail', params: { packageId: String(pkgId) } })
              }
            />
          );
        }

        return (
          <MobileAxisScreens
            projectId={axisProjectId}
            projects={props.projects}
            currentProject={props.currentProject}
            currentUser={props.user}
            companyId={props.companyId}
            onSelectProject={props.onSelectProject}
            onNavigateToReport={(reportId, nodeId, projectId) => {
              const targetPid = projectId || (props.currentProject.id !== 'all' ? props.currentProject.id : undefined);
              if (targetPid && props.onSelectProject) {
                const targetProject = props.projects.find((p) => String(p.id) === String(targetPid));
                if (targetProject && String(props.currentProject.id) !== String(targetProject.id)) {
                  props.onSelectProject(targetProject);
                }
              }
              push({
                screen: 'record-progress',
                title: '记录进展',
                params: {
                  nodeId: nodeId != null ? String(nodeId) : undefined,
                  projectId: targetPid ? String(targetPid) : undefined,
                },
              });
            }}
            onOpenWiki={() => push({ screen: 'axis-wiki' })}
            onOpenEvidence={(nodeId) => {
              const targetPid =
                axisProjectId && axisProjectId !== 'all' && Number(axisProjectId) > 0
                  ? axisProjectId
                  : props.projects.find((p) => p.id !== 'all' && Number(p.id) > 0)?.id;
              if (targetPid && props.onSelectProject) {
                const targetProject = props.projects.find((p) => String(p.id) === String(targetPid));
                if (targetProject && String(props.currentProject.id) !== String(targetProject.id)) {
                  props.onSelectProject(targetProject);
                }
              }
              push({
                screen: 'record-progress',
                title: '记录进展',
                params: {
                  nodeId,
                  projectId: targetPid ? String(targetPid) : undefined,
                  initialTarget: 'evidence',
                },
              });
            }}
            onOpenAudit={(projectId) => push({ screen: 'axis-audit', params: { projectId: projectId ? String(projectId) : undefined } })}
            onOpenDelegation={(projectId) => push({ screen: 'axis-delegations', params: { projectId: projectId ? String(projectId) : undefined } })}
          />
        );
      }

      case 'assistant': {
        // 记录进展统一入口 (T08 / T09)
        if (activeRoute.screen === 'record-progress') {
          return (
            <RecordProgressScreen
              projectId={activeRoute.params.projectId || props.currentProject.id}
              companyId={props.companyId}
              nodeId={activeRoute.params.nodeId}
              initialTarget={activeRoute.params.initialTarget as any}
              currentUser={props.user}
              projects={props.projects}
              onBack={goBack}
              onViewReports={() => push({ screen: 'ai-report-create', title: '我的汇报' })}
            />
          );
        }
        if (activeRoute.screen === 'ai-report-create') {
          return (
            <MyReportEditor
              projects={props.projects}
              onSelectProject={props.onSelectProject}
              user={props.user}
              currentProject={props.currentProject}
              projectMembers={props.projectMembers}
            />
          );
        }
        if (activeRoute.screen === 'ai-report-submitted') {
          return (
            <ReportDetailScreen
              user={props.user}
              currentProject={props.currentProject}
              projectMembers={props.projectMembers}
              initialMode="submitted"
            />
          );
        }
        if (activeRoute.screen === 'ai-report-detail') {
          return (
            <ReportDetailScreen
              user={props.user}
              currentProject={props.currentProject}
              projectMembers={props.projectMembers}
              initialMode="detail"
            />
          );
        }
        if (activeRoute.screen === 'ai-inbox') {
          return (
            <ManagerReportInbox
              user={props.user}
              currentProject={props.currentProject}
              projectMembers={props.projectMembers}
            />
          );
        }
        if (activeRoute.screen === 'ai-project-aggregate') {
          return (
            <ProjectReportScreen
              user={props.user}
              currentProject={props.currentProject}
            />
          );
        }
        if (activeRoute.screen === 'ai-leadership') {
          return (
            <LeadershipReportScreen
              user={props.user}
              companyId={props.companyId}
              projects={props.projects}
            />
          );
        }

        // 默认 AI 汇报中心入口 (Design ID 35)
        return (
          <MyAgentScreen
              projects={props.projects}
              onSelectProject={props.onSelectProject}
            user={props.user}
            currentProject={props.currentProject}
            companyId={props.companyId}
            projectMembers={props.projectMembers}
            initialViewMode="hub"
            onBack={goBack}
          />
        );
      }

      case 'messages': {
        if (activeRoute.screen === 'messages-contacts') return <WorkContactsPage companyId={parsedCompanyId} onBack={goBack}
          onCreated={(id,title) => {
            goBack();
            push({screen:'messages-chat',title,params:{type:'direct',id:String(id),name:title}});
          }} />;
        if (activeRoute.screen === 'messages-chat') {
          return (
            <MobileChatDetailScreen
              type={(activeRoute.params.type as 'channel' | 'direct') || 'channel'}
              id={Number(activeRoute.params.id || 1)}
              name={activeRoute.params.name || '项目聊天'}
              currentUserId={props.user.id}
              companyId={parsedCompanyId}
              onOpenProfile={() => push({ screen: 'messages-profile', params: activeRoute.params })}
              onOpenCall={(targetName, callType, conversationId) => setActiveCall({ name: targetName, type: callType, conversationId })}
              onConvertToTaskDraft={() => setIsNewTaskOpen(true)}
              onBack={goBack}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'messages-profile') {
          return (
            <MobileConversationProfileScreen
              type={(activeRoute.params.type as 'channel' | 'direct') || 'channel'}
              id={Number(activeRoute.params.id || 1)}
              name={activeRoute.params.name || '会话资料'}
              onBack={goBack}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'messages-call') {
          return (
            <MobileCallScreen
              companyId={parsedCompanyId}
              conversationId={Number(activeRoute.params.id || 0) || undefined}
              targetName={activeRoute.params.name || '项目通话'}
              callType={(activeRoute.params.callType as 'audio' | 'video') || 'audio'}
              onClose={goBack}
            />
          );
        }
        if (activeRoute.screen === 'messages-inbox' || activeRoute.screen === 'messages-notifications') {
          return (
            <MobileInboxScreen
              companyId={parsedCompanyId}
              onConvertToTaskDraft={() => setIsNewTaskOpen(true)}
              onBack={canGoBack ? goBack : undefined}
              lang={lang}
            />
          );
        }

        return (
          <MobileMessageListScreen
            currentUserId={props.user.id}
            companyId={parsedCompanyId}
            projectId={props.currentProject.id}
            members={projectMembersList}
            onSelectChannel={(ch) =>
              push({
                screen: 'messages-chat',
                title: ch.name,
                params: { type: 'channel', id: String(ch.id), name: ch.name },
              })
            }
            onSelectDirect={(conv) =>
              push({
                screen: 'messages-chat',
                title: conv.title || '私聊',
                params: {
                  type: 'direct',
                  id: String(conv.id),
                  name: conv.title || conv.members.map((m) => m.name).join('、'),
                },
              })
            }
            onOpenInbox={() => push({ screen: 'messages-inbox', title: '通知与收件箱' })}
            onOpenContacts={() => push({screen:'messages-contacts',title:'工作联系人'})}
            onBack={canGoBack ? goBack : undefined}
            lang={lang}
          />
        );
      }

      case 'knowledge': {
        if (activeRoute.screen === 'record-progress') {
          return (
            <RecordProgressScreen
              projectId={activeRoute.params.projectId || props.currentProject.id}
              companyId={props.companyId}
              nodeId={activeRoute.params.nodeId}
              initialTarget="knowledge"
              currentUser={props.user}
              projects={props.projects}
              onBack={goBack}
              onViewReports={() => push({ screen: 'ai-report-create', title: '我的汇报' })}
            />
          );
        }
        if (activeRoute.screen === 'knowledge-chat') {
          return <MyAgentScreen user={props.user} currentProject={props.currentProject}
            projects={props.projects} onSelectProject={props.onSelectProject} companyId={props.companyId}
            projectMembers={props.projectMembers} initialViewMode="chat" onBack={goBack} />;
        }
        {
          return <PersonalKnowledgeSpace
            key={`${props.user.id}:${props.currentProject.id}:${activeRoute.params.knowledgeScope ?? 'personal'}`}
            initialSpace={activeRoute.params.knowledgeScope === 'project' ? 'project' : 'personal'}
            userId={props.user.id}
            projects={props.projects}
            currentProject={props.currentProject}
            onSelectProject={props.onSelectProject}
            onBack={canGoBack ? goBack : undefined}
            onAskKnowledge={() => push({ screen: 'knowledge-chat', title: '知识助手' })}
            onRecordProgress={() => push({ screen: 'record-progress', title: '记录进展', params: { projectId: props.currentProject.id, initialTarget: 'knowledge' } })}
          />;
        }
      }
      case 'me': {
        // T11 个人偏好与设置
        if (activeRoute.screen === 'me-profile') {
          return <MobileProfileScreen {...props} />;
        }
        if (activeRoute.screen === 'me-security') {
          return <MobileSecurityScreen {...props} />;
        }
        if (activeRoute.screen === 'me-appearance') {
          return <MobileAppearanceScreen {...props} />;
        }
        if (activeRoute.screen === 'me-notifications') {
          return <MobileNotificationSettingsScreen {...props} />;
        }
        if (activeRoute.screen === 'me-defaults') {
          return <MobileTaskDefaultsScreen {...props} />;
        }
        if (activeRoute.screen === 'me-billing-help') {
          return <MobileBillingHelpScreen {...props} />;
        }
        if (activeRoute.screen === 'me-notify-logs') {
          return <MobileNotificationLogsScreen {...props} />;
        }
        if (activeRoute.screen === 'me-integrations') {
          return <MobileThirdPartyBindingsScreen {...props} />;
        }
        if (activeRoute.screen === 'me-team') {
          return (
            <MobileTeamScreen
              projectId={Number(props.currentProject.id)}
              companyId={parsedCompanyId}
              isCompanyAdmin={isUserAdmin(props.user)}
              onSelectMember={(m) =>
                push({
                  screen: 'me-member-detail',
                  params: {
                    memberId: String(m.user_id),
                    memberName: m.display_name || m.nickname || m.username || '',
                  },
                })
              }
              onBack={canGoBack ? goBack : undefined}
              lang={lang}
            />
          );
        }
        if (activeRoute.screen === 'me-member-detail') {
          const targetMem = projectMembersList.find(
            (m) => String(m.id) === String(activeRoute.params.memberId),
          );
          return (
            <MobileMemberDetailScreen
              member={{
                user_id: Number(activeRoute.params.memberId || props.user.id),
                display_name: targetMem?.name || activeRoute.params.memberName || props.user.name,
                role: targetMem?.role || props.user.role,
                avatar_url: targetMem?.avatar || (activeRoute.params.memberId ? undefined : props.user.avatar),
              }}
              projectId={Number(props.currentProject.id)}
              companyId={parsedCompanyId}
              currentUserId={Number(props.user.id) || null}
              isCompanyAdmin={isUserAdmin(props.user)}
              onBack={goBack}
              lang={lang}
            />
          );
        }

        // T12 账号注销确认
        if (activeRoute.screen === 'adapt-account-delete') {
          return <AdaptAccountDeleteScreen {...props} />;
        }

        // 默认我的页面根页 (Design ID 53)
        return <MobileMeScreen {...props} />;
      }

      default:
        return <MobileEmptyState title="页面不存在" description="请选择有效的导航" />;
    }
  };

  // 顶栏右侧快捷操作
  const renderRightActions = () => {
    if (currentTab === 'work') {
      return (
        <div className="flex items-center gap-1">
          <button
            type="button"
            onClick={props.onOpenSearch}
            aria-label="搜索"
            className="mobile-touch-target text-slate-700 dark:text-slate-300 active:opacity-60 cursor-pointer"
          >
            <AppIcon name="search" size={20} />
          </button>
        </div>
      );
    }
    return null;
  };

  const pageTitle = activeRoute.title || (currentTab === 'work' ? '工作台' : undefined);
  // 人轴、AI 汇报和“我的”页面由各自 feature screen 绘制平台化顶栏；
  // 工作 / 消息页面没有内部顶栏，继续由 Outlet 提供统一标题和返回入口。
  // 避免同一页面出现两套顶栏和重复 heading。
  const hideOuterTopBar = currentTab === 'axis' || currentTab === 'knowledge' || activeRoute.screen.startsWith('ai-') || currentTab === 'me'
    || activeRoute.screen === 'messages-chat' || activeRoute.screen === 'record-progress';
  const ownsContactsHeader = activeRoute.screen === 'messages-contacts' || activeRoute.screen === 'project-switch'
    || activeRoute.screen === 'project-overview';

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#F2F2F7] dark:bg-black">
      {/* 统一移动顶栏 (人轴 Tab 自主管理导航与画布控制) */}
      {!hideOuterTopBar && !ownsContactsHeader && (
        <MobileTopBar
          title={pageTitle}
          showBack={canGoBack}
          onBack={goBack}
          rightAction={renderRightActions()}
        />
      )}

      {/* 滚动内容区 */}
      <main
        className={`flex-1 min-h-0 pb-[56px] ${
          currentTab === 'axis'
            ? 'overflow-hidden flex flex-col'
            : 'overflow-y-auto overscroll-contain mobile-scroll-container'
        }`}
      >
        <Suspense fallback={<MobileLoadingState message="加载视图中…" />}>
          {renderScreenContent()}
        </Suspense>
      </main>

      {/* 14 任务详情 Sheet */}
      <MobileTaskDetailSheet
        task={detailTask}
        isOpen={Boolean(detailTask)}
        onClose={() => setDetailTask(null)}
        onEditTask={(t) => {
          setEditingTask(t);
          setIsNewTaskOpen(true);
        }}
        onDeleteTask={async (taskId) => {
          await props.onBatchDelete([taskId]);
        }}
        onToggleCompletion={async (t) => {
          props.onToggleTaskCompletion(t);
        }}
        onNavigateToNode={(nodeId) => {
          push({ tab: 'axis', screen: 'axis-node-detail', params: { nodeId } });
        }}
        lang={lang}
      />

      {/* 15 新建 / 编辑任务 Sheet */}
      <MobileTaskEditScreen
        isOpen={isNewTaskOpen}
        onClose={closeTaskEditor}
        onRequestClose={goBack}
        onDirtyChange={setDirty}
        onSaveTask={async (t) => {
          props.onTaskSaved?.(t);
          if (!calendarEditor) setDetailTask(t);
        }}
        editingTask={editingTask}
        projectId={editingTask ? editingTask.projectId || 'all' : props.currentProject.id}
        projectName={props.projects.find(project => project.id === editingTask?.projectId)?.name || props.currentProject.name}
        defaultDate={newTaskDate}
        defaultStatus={newTaskStatus}
        members={projectMembersList}
        lang={lang}
      />

      {/* 16 快速添加 Sheet */}
      <MobileQuickAddSheet
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onCreated={(t) => {
          props.onTaskSaved?.(t);
          setDetailTask(t);
        }}
        projectId={props.currentProject.id}
        projectName={props.currentProject.name}
        lang={lang}
      />

      {/* 17 从聊天提取任务 Sheet */}
      <MobileTaskExtractChatSheet
        isOpen={isExtractChatOpen}
        onClose={() => setIsExtractChatOpen(false)}
        onCreated={(t) => {
          props.onTaskSaved?.(t);
          setDetailTask(t);
        }}
        projectId={props.currentProject.id}
        companyId={parsedCompanyId}
        lang={lang}
      />

      {/* 46 音视频通话屏 */}
      {activeCall && (
        <MobileCallScreen
          companyId={parsedCompanyId}
          conversationId={activeCall.conversationId}
          targetName={activeCall.name}
          callType={activeCall.type}
          onClose={() => setActiveCall(null)}
          lang={lang}
        />
      )}
    </div>
  );
};
