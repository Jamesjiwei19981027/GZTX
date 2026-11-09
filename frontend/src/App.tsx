/**
 * Web 主壳：对接后端（任务/人轴/消息/通知/团队/收件箱/报表）。
 */

import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { enqueuePrefWrite } from './api/serialQueue';
import {
  Task,
  Project,
  Activity,
  UserProfile,
  AppSettings,
  ViewMode,
  Status,
} from './types';
import {
  loadSettings,
  saveSettings,
} from './storage/settings';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { TaskWorkspaceToolbar } from './components/TaskWorkspaceToolbar';
import { pickActiveCompany } from './utils/activeCompany';
import { summarizeBatchReschedule } from './utils/batchReschedule';
import { filterTaskWorkspace, type TaskWorkspaceScope } from './utils/taskWorkspace';
import { PhoneVerificationReminder } from './components/PhoneVerificationReminder';
import { MobileAppShell } from './mobile/MobileAppShell';
import { DashboardView } from './components/views/DashboardView';
import { MyTasksView } from './components/views/MyTasksView';
import { NewTaskModal } from './components/modals/NewTaskModal';
import { QuickAddModal } from './components/modals/QuickAddModal';
import { WorkspaceSetupModal, WorkspaceSetupMode } from './components/modals/WorkspaceSetupModal';
import { handleBootRefreshFailure, getInviteNotice } from './utils/bootSync';
import { GlobalSearchModal } from './components/modals/GlobalSearchModal';
import { TaskDetailDrawer } from './components/modals/TaskDetailDrawer';
import { NotificationsModal } from './components/modals/NotificationsModal';
import { LoginGate } from './components/LoginGate';
import { VerifyGate } from './components/VerifyGate';
import { ApiError, getToken, sendPresenceKeepalive } from './api/client';
import {
  DEFAULT_REGISTRATION_CONFIG,
  fetchMe,
  getRegistrationConfig,
  getVerificationStatus,
  logout,
  type RegistrationConfig,
  updateMe,
  uploadAvatar,
} from './api/auth';
import {
  batchCompleteTasks,
  batchDeleteTasks,
  batchRescheduleTasks,
  completeTask,
  createCompany,
  createProject,
  createTask,
  createTag,
  deleteTask,
  getProject,
  listCategories,
  listTags,
  listMyCompanies,
  listProjectMembers,
  listProjects,
  listTasks,
  acceptProjectInvitation,
  restoreTask,
  uncompleteTask,
  updateTask,
  uploadTaskAttachment,
} from './api/backend';
import {
  mapProject,
  mapMember,
  mapTask,
  mapUser,
  uiPriorityToApi,
  apiPriorityToUi,
  uiStatusToApi,
} from './api/mappers';
import {
  getProjectActivity,
  getUiPrefs,
  listUserActivity,
  putPresence,
  putUiPrefs,
} from './api/shell';
import { enableWebPush } from './api/notifications';
import { track } from './api/telemetry';
import { useToast } from './components/toast/ToastProvider';
import { ShortcutHelpModal } from './components/modals/ShortcutHelpModal';
import { clearInviteToken, readInviteToken } from './utils/invite';
import { toApiDueDate } from './utils/datetime';
import { readDeepLink, writeDeepLink } from './utils/deepLink';
import { RecordProgressModal } from './components/RecordProgressModal';

// 重视图按需分包：人轴（@xyflow/react）、报表（recharts）等只在切到对应视图时才加载
const KanbanView = React.lazy(() =>
  import('./components/views/KanbanView').then((m) => ({ default: m.KanbanView })),
);
const CalendarView = React.lazy(() =>
  import('./components/views/CalendarView').then((m) => ({ default: m.CalendarView })),
);
const SettingsView = React.lazy(() =>
  import('./components/views/SettingsView').then((m) => ({ default: m.SettingsView })),
);
const NotificationSettingsView = React.lazy(() =>
  import('./components/views/NotificationSettingsView').then((m) => ({
    default: m.NotificationSettingsView,
  })),
);
const ReportsView = React.lazy(() =>
  import('./components/views/ReportsView').then((m) => ({ default: m.ReportsView })),
);
const TeamView = React.lazy(() =>
  import('./components/views/TeamView').then((m) => ({ default: m.TeamView })),
);
const InboxView = React.lazy(() =>
  import('./components/views/InboxView').then((m) => ({ default: m.InboxView })),
);
const MessagesView = React.lazy(() =>
  import('./components/views/MessagesView').then((m) => ({ default: m.MessagesView })),
);
const PeopleAxisView = React.lazy(() =>
  import('./components/views/PeopleAxisView').then((m) => ({ default: m.PeopleAxisView })),
);
const TrashView = React.lazy(() =>
  import('./components/views/TrashView').then((m) => ({ default: m.TrashView })),
);
const PersonalKnowledgeSpace = React.lazy(() =>
  import('./components/PersonalKnowledgeSpace').then((m) => ({ default: m.PersonalKnowledgeSpace })),
);

const ViewLoadingFallback: React.FC = () => (
  <div className="flex items-center justify-center py-24 bg-surface text-on-surface-variant text-sm gap-2">
    <span className="inline-block h-5 w-5 rounded-full border-2 border-outline-variant border-t-primary animate-spin" />
    加载中…
  </div>
);

const ALL_PROJECT_ITEM: Project = {
  id: 'all',
  name: '全盘研发概览',
  description: '跨项目总览（任务来自个人任务 API；人轴需选具体项目）',
  color: '#0058be',
  active: true,
};

/** boot 时最多拉多少页任务，避免异常大账号把首屏拖死；超出在 UI 明示截断 */
const TASK_PAGE_SIZE = 200;
const TASK_MAX_PAGES = 10;

function useIsMobileViewport(): boolean {
  const check = useCallback(() => {
    if (typeof window === 'undefined') return false;
    const isApp = Boolean(
      window.flutterShellBridge ||
        window.FlutterBridge ||
        window.__isFlutterApp ||
        (window.__NATIVE_RUNTIME__ as { surface?: string } | undefined)?.surface === 'app' ||
        new URLSearchParams(window.location.search).get('mobile') === '1',
    );
    if (isApp) return true;
    return window.innerWidth < 1024;
  }, []);

  const [isMobile, setIsMobile] = useState<boolean>(check);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const isApp = Boolean(
      window.flutterShellBridge ||
        window.FlutterBridge ||
        window.__isFlutterApp ||
        (window.__NATIVE_RUNTIME__ as { surface?: string } | undefined)?.surface === 'app' ||
        new URLSearchParams(window.location.search).get('mobile') === '1',
    );
    if (isApp) {
      setIsMobile(true);
      return;
    }

    const onNativeRuntimeChange = () => setIsMobile(true);
    window.addEventListener('nativeRuntimeChange', onNativeRuntimeChange);

    const onResize = () => {
      setIsMobile(window.innerWidth < 1024);
    };
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('nativeRuntimeChange', onNativeRuntimeChange);
      window.removeEventListener('resize', onResize);
    };
  }, [check]);

  return isMobile;
}

export default function App() {
  const isMobileView = useIsMobileViewport();
  const toast = useToast();
  const [authed, setAuthed] = useState(() => !!getToken());
  /** null=检查中；false=需补验邮箱；true=邮箱已验证（个人待办可用） */
  const [verified, setVerified] = useState<boolean | null>(() =>
    getToken() ? null : true,
  );
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [regConfig, setRegConfig] = useState<RegistrationConfig>(DEFAULT_REGISTRATION_CONFIG);
  const [inviteNotice, setInviteNotice] = useState<string | null>(null);
  const [inviteRefreshFailed, setInviteRefreshFailed] = useState(false);
  const [workspaceModal, setWorkspaceModal] = useState<WorkspaceSetupMode | null>(null);
  const [workspaceBusy, setWorkspaceBusy] = useState(false);
  const [workspaceError, setWorkspaceError] = useState<string | null>(null);
  const [phoneGateOpen, setPhoneGateOpen] = useState(false);
  const markPhoneVerified = useCallback(() => setPhoneVerified(true), []);
  const [bootError, setBootError] = useState<string | null>(null);
  const [loadingBoot, setLoadingBoot] = useState(false);
  /**
   * boot 把服务端偏好灌进 settings 之前，禁止回写 putUiPrefs / updateMe。
   * 否则 settings 的初值（localStorage 或默认值）会先把服务端偏好覆盖掉。
   */
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  /** 任务超过 TASK_PAGE_SIZE * TASK_MAX_PAGES 时的截断提示 */
  const [taskTruncated, setTaskTruncated] = useState<{ loaded: number; total: number } | null>(null);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<import('./api/backend').BackendCategory[]>([]);
  const [tags, setTags] = useState<import('./api/backend').BackendTag[]>([]);
  const [projectMembers, setProjectMembers] = useState<import('./types').TeamMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(null);
  /** 刚接受另一家公司的项目邀请后，刷新时要停留在该公司身份 */
  const preferredCompanyIdRef = useRef<number | null>(null);
  const [isCompanyAdmin, setIsCompanyAdmin] = useState(false);
  const [currentProject, setCurrentProject] = useState<Project>(ALL_PROJECT_ITEM);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [user, setUser] = useState<UserProfile>({
    name: '',
    email: '',
    avatar: '',
    role: '',
  });
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  // 深链：`?view=` 决定首屏视图，刷新/分享都保持
  const [activeView, setActiveView] = useState<ViewMode>(
    () => readDeepLink().view ?? 'dashboard',
  );
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [taskWorkspaceScope, setTaskWorkspaceScope] = useState<TaskWorkspaceScope>('all');
  const [trashReturnView, setTrashReturnView] = useState<'tasks' | 'kanban'>('kanban');
  /** `?taskId=` 待打开的任务；tasks 载入后再解析成具体任务 */
  const [pendingTaskId, setPendingTaskId] = useState<string | null>(
    () => readDeepLink().taskId ?? null,
  );

  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskDefaultStatus, setNewTaskDefaultStatus] = useState<Status | undefined>();
  const [newTaskDefaultDate, setNewTaskDefaultDate] = useState<string | undefined>();
  const [newTaskDefaultTitle, setNewTaskDefaultTitle] = useState<string | undefined>();
  const [newTaskDefaultDesc, setNewTaskDefaultDesc] = useState<string | undefined>();
  const [newTaskDefaultSource, setNewTaskDefaultSource] = useState<{ channel?: string; title?: string; url?: string } | undefined>();
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);
  const [assistantFocus, setAssistantFocus] = useState<'progress' | 'reports'>('reports');
  const [recordProgressOpen, setRecordProgressOpen] = useState(false);
  const [isGlobalSearchOpen, setIsGlobalSearchOpen] = useState(false);
  const [isShortcutHelpOpen, setIsShortcutHelpOpen] = useState(false);

  /** 视图切换统一入口：附带轻遥测（view.{viewName}） */
  const switchView = useCallback((view: ViewMode) => {
    setActiveView(view);
    track(`view.${view}`);
  }, []);

  // 视图 / 任务抽屉状态同步进地址栏（视图 replace、任务详情 push）
  useEffect(() => {
    writeDeepLink({ view: activeView, taskId: selectedTask?.id }, Boolean(selectedTask));
  }, [activeView, selectedTask]);

  // 浏览器前进/后退：从地址栏回读视图与任务
  useEffect(() => {
    const onPopState = () => {
      const { view, taskId } = readDeepLink();
      setActiveView(view ?? 'dashboard');
      setPendingTaskId(taskId ?? null);
      if (!taskId) setSelectedTask(null);
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // `?taskId=` 需要等任务列表载入后才能解析
  useEffect(() => {
    if (!pendingTaskId) return;
    const target = tasks.find((item) => item.id === pendingTaskId);
    if (target) {
      setSelectedTask(target);
      setPendingTaskId(null);
    } else if (tasks.length > 0) {
      // 任务已被删除或不在可见范围内：清掉参数，别让地址栏留死链
      setPendingTaskId(null);
    }
  }, [pendingTaskId, tasks]);

  const refreshFromBackend = useCallback(async (): Promise<boolean> => {
    setLoadingBoot(true);
    setBootError(null);
    try {
      // 首屏这几个请求互不依赖，串行 await 会把首屏拖成 5 个往返。
      // 目录/偏好各自降级（失败不算 boot 失败），所以在这里就地 catch。
      const [me, companies, firstTaskPage, catalog, prefs] = await Promise.all([
        fetchMe(),
        listMyCompanies(),
        listTasks({ page: 1, page_size: TASK_PAGE_SIZE }),
        Promise.all([listCategories(), listTags()]).catch(() => null),
        getUiPrefs().catch(() => null),
      ]);
      // 角色来自企业成员关系：超级管理员才能看到电脑端“企业管理”和手机端的电脑端操作提示
      const activeCompany = pickActiveCompany(companies.items, preferredCompanyIdRef.current);
      setUser({ ...mapUser(me), role: activeCompany?.my_membership?.is_super_admin ? '管理员' : '成员' });
      const notifyPref = me.notify_pref || {};
      const channels = (notifyPref.channels || {}) as Record<string, Record<string, unknown>>;
      const quietHours = (notifyPref.quiet_hours || {}) as Record<string, unknown>;
      setSettings((prev) => ({
        ...prev,
        notifications: {
          ...prev.notifications,
          email: typeof channels.email?.enabled === 'boolean' ? Boolean(channels.email.enabled) : prev.notifications.email,
          push: typeof channels.push?.enabled === 'boolean' ? Boolean(channels.push.enabled) : prev.notifications.push,
          desktop: typeof channels.desktop?.enabled === 'boolean' ? Boolean(channels.desktop.enabled) : prev.notifications.desktop,
          wechat: typeof channels.wechat?.enabled === 'boolean' ? Boolean(channels.wechat.enabled) : prev.notifications.wechat,
          quietHoursStart: typeof quietHours.start === 'string' ? quietHours.start : prev.notifications.quietHoursStart,
          quietHoursEnd: typeof quietHours.end === 'string' ? quietHours.end : prev.notifications.quietHoursEnd,
          weekendMute: typeof notifyPref.weekend_mute === 'boolean' ? Boolean(notifyPref.weekend_mute) : prev.notifications.weekendMute,
        },
      }));
      const cid = activeCompany?.id ?? null;
      setCompanyId(cid);
      setIsCompanyAdmin(Boolean(activeCompany?.my_membership?.is_super_admin));
      let mappedProjects: Project[] = [];
      if (cid) {
        const projPage = await listProjects(cid);
        mappedProjects = (projPage.items || []).map(mapProject);
      }
      setProjects(mappedProjects);
      // 单页 200 会静默截断（老账号任务过千时看板/日历直接缺数据），
      // 首页已随首屏并发取回，这里只续拉后续页
      const collected: import('./api/backend').BackendTask[] = [
        ...(firstTaskPage.items || []),
      ];
      let total = firstTaskPage.total ?? collected.length;
      if (collected.length >= TASK_PAGE_SIZE && collected.length < total) {
        for (let page = 2; page <= TASK_MAX_PAGES; page += 1) {
          const taskPage = await listTasks({ page, page_size: TASK_PAGE_SIZE });
          const items = taskPage.items || [];
          total = taskPage.total ?? collected.length + items.length;
          collected.push(...items);
          if (items.length < TASK_PAGE_SIZE || collected.length >= total) break;
        }
      }
      setTasks(collected.map((t) => mapTask(t)));
      setTaskTruncated(
        total > collected.length ? { loaded: collected.length, total } : null,
      );
      if (catalog) {
        const [categoryItems, tagItems] = catalog;
        setCategories(categoryItems || []);
        setTags(tagItems || []);
        const defaultCategoryId = Number(((notifyPref.ui || {}) as Record<string, unknown>).task_default_category_id);
        if (Number.isFinite(defaultCategoryId)) {
          const defaultCategory = (categoryItems || []).find((item) => item.id === defaultCategoryId);
          if (defaultCategory) {
            setSettings((prev) => ({ ...prev, taskDefaults: { ...prev.taskDefaults, category: defaultCategory.name as typeof prev.taskDefaults.category } }));
          }
        }
      } else {
        setCategories([]);
        setTags([]);
      }
      void putPresence('online').catch(() => undefined);
      if (prefs) {
        const ui = prefs.ui || {};
        setSettings((prev) => ({
          ...prev,
          language: ui.language === 'en' || ui.language === 'zh' ? ui.language : prev.language,
          accentColor:
            ui.accent === 'blue' ||
            ui.accent === 'green' ||
            ui.accent === 'amber' ||
            ui.accent === 'red'
              ? ui.accent
              : prev.accentColor,
          themeMode: ui.theme_mode === 'dark' || ui.theme_mode === 'light' ? ui.theme_mode : prev.themeMode,
          taskDefaults: {
            ...prev.taskDefaults,
            priority: typeof ui.task_default_priority === 'number' ? apiPriorityToUi(ui.task_default_priority) : prev.taskDefaults.priority,
            category: typeof ui.task_default_category === 'string' ? ui.task_default_category as typeof prev.taskDefaults.category : prev.taskDefaults.category,
          },
        }));
      }
      // 服务端偏好已灌完（成功或降级用本地值），此后才允许回写
      setPrefsHydrated(true);
      return true;
    } catch (e) {
      const failure = handleBootRefreshFailure<Task, Activity>(e instanceof Error ? e.message : '加载失败');
      setBootError(failure.bootError);
      // 项目列表是导航依据，清空会让用户误以为项目被删了。保留上一次成功拿到的真实项目列表（首次加载失败时它本来就是空数组）。
      // A failed API request must remain visible as an error/empty state for tasks and activities.
      // Injecting demo records makes authenticated users believe writes worked.
      setTasks(failure.tasks);
      setActivities(failure.activities);
      return false;
    } finally {
      setLoadingBoot(false);
    }
  }, []);

  // 在线状态跟着标签页可见性走：只在 boot 时报一次 online 的话，关掉页面的人
  // 在别人的成员列表里会永远显示在线。
  useEffect(() => {
    if (!authed) return;
    const report = (status: 'online' | 'offline') => {
      void putPresence(status).catch(() => undefined);
    };
    const onVisibility = () => {
      report(document.visibilityState === 'visible' ? 'online' : 'offline');
    };
    // 关页面/切后台：keepalive fetch（sendBeacon 只能 POST，接口是 PUT）
    const onLeave = () => {
      if (sendPresenceKeepalive('offline')) return;
      report('offline');
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', onLeave);
    // 列表接口把 last_seen > 5 分钟的 online 当成离线；标签页开着时每 2 分钟续一次心跳
    const heartbeat = window.setInterval(() => {
      if (document.visibilityState === 'visible') report('online');
    }, 120_000);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', onLeave);
      window.clearInterval(heartbeat);
    };
  }, [authed]);

  useEffect(() => {
    if (!authed) {
      setVerified(true);
      setPhoneVerified(false);
      // 退出后重新登录要再等一次 boot 才允许回写偏好
      setPrefsHydrated(false);
      return;
    }
    let cancelled = false;
    setVerified(null);
    void (async () => {
      try {
        const st = await getVerificationStatus();
        if (!cancelled) {
          setVerified(Boolean(st.email_verified));
          setPhoneVerified(Boolean(st.phone_verified));
        }
      } catch {
        if (!cancelled) {
          setVerified(true);
          setPhoneVerified(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  useEffect(() => {
    let cancelled = false;
    void getRegistrationConfig().then((cfg) => {
      if (!cancelled) setRegConfig(cfg);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (authed && verified) void refreshFromBackend();
  }, [authed, verified, refreshFromBackend]);

  useEffect(() => {
    if (!(authed && verified)) return;
    const token = readInviteToken();
    if (!token) return;
    let cancelled = false;
    void (async () => {
      try {
        const accepted = await acceptProjectInvitation(token);
        if (cancelled) return;
        clearInviteToken();
        // 先取项目详情，知道它属于哪家公司；刷新时切到该公司身份，项目列表才会包含新项目
        let joinedDetail: Awaited<ReturnType<typeof getProject>> | null = null;
        if (accepted.project_id) {
          try {
            joinedDetail = await getProject(accepted.project_id);
            if (joinedDetail?.company_id) preferredCompanyIdRef.current = joinedDetail.company_id;
          } catch {
            /* 拿不到详情就沿用当前公司 */
          }
        }
        const refreshOk = await refreshFromBackend();
        if (accepted.project_id) {
          // 取真实项目名：以前直接钉「受邀项目」占位，顶栏会一直显示这个假名字
          let joined: Project = {
            id: String(accepted.project_id),
            name: settings.language === 'zh' ? '受邀项目' : 'Invited project',
            description: '',
            color: '#0058be',
            active: true,
          };
          if (joinedDetail) joined = mapProject(joinedDetail);
          if (cancelled) return;
          setCurrentProject(joined);
          switchView('team');
        }
        setInviteRefreshFailed(!refreshOk);
        setInviteNotice(getInviteNotice(refreshOk, settings.language));
      } catch (e) {
        if (cancelled) return;
        const message = e instanceof Error ? e.message : '';
        const code = e instanceof ApiError ? e.code : 0;
        if ((code === 40320 || /手机/.test(message)) && regConfig.phone_required) {
          setPhoneGateOpen(true);
          setInviteRefreshFailed(false);
          setInviteNotice(
            settings.language === 'zh'
              ? '接受邀请需要先完成手机验证'
              : 'Accepting an invite requires phone verification',
          );
          return;
        }
        clearInviteToken();
        setInviteRefreshFailed(false);
        setInviteNotice(message || (settings.language === 'zh' ? '邀请无效或已过期' : 'Invitation is invalid or expired'));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, verified, phoneVerified, regConfig.phone_required, refreshFromBackend, settings.language, switchView]);

  const requirePhoneForCollab = useCallback(() => {
    if (!regConfig.phone_required) return true;
    if (phoneVerified) return true;
    setPhoneGateOpen(true);
    toast.info(
      settings.language === 'zh'
        ? '协作功能需要先完成手机验证'
        : 'Collaboration requires phone verification',
    );
    return false;
  }, [phoneVerified, regConfig.phone_required, settings.language, toast]);

  const handleCreateCompany = useCallback(
    async (payload: { name: string; slug?: string }) => {
      if (!requirePhoneForCollab()) return;
      setWorkspaceBusy(true);
      setWorkspaceError(null);
      try {
        const created = await createCompany({
          name: payload.name,
          slug: payload.slug || payload.name,
        });
        setCompanyId(created.id);
        setWorkspaceModal(null);
        await refreshFromBackend();
        toast.success(
          created.status === 'pending_license'
            ? settings.language === 'zh'
              ? '公司已创建。创建项目前需要有效 License。'
              : 'Company created. A valid license is required before creating projects.'
            : settings.language === 'zh'
              ? '公司已创建'
              : 'Company created',
        );
      } catch (e) {
        setWorkspaceError(e instanceof Error ? e.message : settings.language === 'zh' ? '创建失败' : 'Create failed');
      } finally {
        setWorkspaceBusy(false);
      }
    },
    [refreshFromBackend, requirePhoneForCollab, settings.language, toast],
  );

  const handleCreateProject = useCallback(
    async (payload: { name: string }) => {
      if (!requirePhoneForCollab()) return;
      if (!companyId) {
        setWorkspaceModal('company');
        return;
      }
      setWorkspaceBusy(true);
      setWorkspaceError(null);
      try {
        const created = await createProject({ name: payload.name, company_id: companyId });
        const mapped = mapProject(created);
        setProjects((prev) => [mapped, ...prev.filter((p) => p.id !== mapped.id)]);
        setCurrentProject(mapped);
        setWorkspaceModal(null);
        toast.success(settings.language === 'zh' ? '项目已创建' : 'Project created');
      } catch (e) {
        setWorkspaceError(e instanceof Error ? e.message : settings.language === 'zh' ? '创建失败' : 'Create failed');
      } finally {
        setWorkspaceBusy(false);
      }
    },
    [companyId, requirePhoneForCollab, settings.language, toast],
  );

  useEffect(() => {
    const pid =
      currentProject.id !== 'all' && Number(currentProject.id) > 0
        ? Number(currentProject.id)
        : null;
    if (!pid) {
      if (!authed) return;
      let cancelled = false;
      void listUserActivity(50).then((res) => {
        if (cancelled) return;
        setActivities((res.items || []).map((a) => ({
          id: String(a.id),
          type: String(a.type).includes('complete') ? 'completed' : String(a.type).includes('creat') ? 'created' : 'updated',
          titleText: a.title || a.type,
          targetText: a.project_name || '',
          timestamp: a.created_at ? a.created_at.slice(5, 16).replace('T', ' ') : '—',
          icon: 'history',
          colorClass: 'bg-primary-fixed text-on-primary-fixed',
        })));
      }).catch(() => undefined);
      return () => { cancelled = true; };
    }
    let cancelled = false;
    void (async () => {
      try {
        const res = await getProjectActivity(pid);
        if (cancelled) return;
        setActivities(
          (res.items || []).map((a, i) => ({
            id: String(a.id ?? i),
            type:
              String(a.type).includes('complete')
                ? 'completed'
                : String(a.type).includes('creat')
                  ? 'created'
                  : 'updated',
            titleText: a.type || 'activity',
            targetText: a.title || '',
            timestamp: a.created_at
              ? a.created_at.slice(5, 16).replace('T', ' ')
              : '—',
            icon: 'history',
            colorClass: 'bg-primary-fixed text-on-primary-fixed',
          })),
        );
      } catch {
        /* keep existing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed, currentProject.id]);

  useEffect(() => {
    const projectId = Number(currentProject.id);
    if (!Number.isFinite(projectId) || projectId <= 0) {
      setProjectMembers([]);
      return;
    }
    let cancelled = false;
    void listProjectMembers(projectId)
      .then((res) => {
        if (!cancelled) setProjectMembers((res.items || []).map(mapMember));
      })
      .catch(() => {
        if (!cancelled) setProjectMembers([]);
      });
    return () => {
      cancelled = true;
    };
  }, [currentProject.id]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl/Cmd+K：全局搜索（输入框聚焦时也响应，命令面板惯例）
      if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setIsGlobalSearchOpen(true);
        return;
      }
      const isAltN = e.altKey && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN');
      const isHelpKey = e.key === '?' && !e.ctrlKey && !e.metaKey && !e.altKey;
      if (!isAltN && !isHelpKey) return;
      // 正在输入（表单控件 / 富文本）时不抢快捷键，避免打断用户
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
      e.preventDefault();
      if (isHelpKey) setIsShortcutHelpOpen(true);
      else setIsQuickAddOpen(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  const lastUiPrefsKey = useRef<string>('');
  useEffect(() => {
    saveSettings(settings);
    const root = document.documentElement;
    if (settings.themeMode === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    root.style.colorScheme = settings.themeMode;
    // 主题色通过 data-accent 接通 index.css 的调色板变量
    root.dataset.accent = settings.accentColor;
    if (authed && prefsHydrated) {
      const uiPayload = {
        language: settings.language,
        accent: settings.accentColor,
        theme_mode: settings.themeMode,
        task_default_priority: uiPriorityToApi(settings.taskDefaults.priority),
        task_default_category_id: categories.find((item) => item.name === settings.taskDefaults.category)?.id,
      };
      const uiKey = JSON.stringify(uiPayload);
      // 界面偏好没变就不写（切通知开关不应触发 ui-prefs 写入）
      if (lastUiPrefsKey.current !== uiKey) {
        lastUiPrefsKey.current = uiKey;
        void enqueuePrefWrite(() => putUiPrefs(uiPayload)).catch(() => undefined);
      }
    }
  }, [settings, authed, prefsHydrated, categories]);

  useEffect(() => {
    if (!(authed && prefsHydrated)) return;
    const n = settings.notifications;
    void enqueuePrefWrite(() => updateMe({
      notify_pref: {
        channels: {
          email: { enabled: n.email },
          push: { enabled: n.push },
          desktop: { enabled: n.desktop },
          wechat: { enabled: n.wechat },
        },
        quiet_hours: { start: n.quietHoursStart, end: n.quietHoursEnd },
        weekend_mute: n.weekendMute,
      },
    })).catch(() => undefined);
  }, [authed, prefsHydrated, settings.notifications]);

  const displayProjects = useMemo(
    () => [ALL_PROJECT_ITEM, ...projects],
    [projects],
  );

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      const matchesProject =
        currentProject.id === 'all' ||
        t.projectId === currentProject.id ||
        !t.projectId;
      const query = searchQuery.trim().toLowerCase();
      const matchesSearch =
        !query ||
        t.title.toLowerCase().includes(query) ||
        (t.description && t.description.toLowerCase().includes(query)) ||
        (t.tag && t.tag.toLowerCase().includes(query));
      return matchesProject && matchesSearch;
    });
  }, [tasks, currentProject, searchQuery]);

  const addActivity = (
    type: 'completed' | 'updated' | 'collaborator' | 'created',
    titleText: string,
    targetText: string,
    timestamp: string = '刚刚',
  ) => {
    const iconMap = {
      completed: 'check',
      updated: 'edit',
      collaborator: 'group',
      created: 'add_circle',
    };
    const colorMap = {
      completed: 'bg-secondary-container text-on-secondary-container',
      updated: 'bg-primary-fixed text-on-primary-fixed',
      collaborator: 'bg-tertiary-fixed text-on-tertiary-fixed',
      created: 'bg-primary text-on-primary',
    };
    const newActivity: Activity = {
      id: `act_${Date.now()}`,
      type,
      titleText,
      targetText,
      timestamp,
      icon: iconMap[type],
      colorClass: colorMap[type],
    };
    setActivities((prev) => [newActivity, ...prev.slice(0, 19)]);
  };

  /** 返回是否创建成功，供 QuickAddModal 决定是否清空并关闭（NewTaskModal 忽略返回值） */
  const handleCreateTask = async (taskData: Omit<Task, 'id'>): Promise<boolean> => {
    try {
      let tagIds = taskData.tagIds || [];
      if (taskData.tag?.trim()) {
        const existing = tags.find((item) => item.name === taskData.tag?.trim());
        if (existing) tagIds = [existing.id];
        else {
          const createdTag = await createTag(taskData.tag.trim());
          tagIds = [createdTag.id];
          setTags((prev) => [...prev, createdTag]);
        }
      }
      const projectId = Number(taskData.projectId);
      const category = categories.find((item) => item.name === taskData.category);
      const created = await createTask({
        title: taskData.title,
        description: taskData.description,
        priority: uiPriorityToApi(taskData.priority),
        status: uiStatusToApi(taskData.status),
        category_id: taskData.categoryId ?? category?.id,
        tag_ids: tagIds,
        due_date: toApiDueDate(taskData.dueDate, taskData.dueTime),
        company_id: companyId,
        project_id: Number.isFinite(projectId) && projectId > 0 ? projectId : null,
        origin: Number.isFinite(projectId) && projectId > 0 ? 'project_link' : 'personal',
        source_channel: taskData.sourceChannel,
        source_title: taskData.sourceTitle,
        source_url: taskData.sourceUrl,
        source_message_id: taskData.sourceMessageId,
        source_meta: taskData.sourceMeta,
        assignee_user_ids: (taskData.assigneeUserIds || []).map((id) => Number(id)).filter((id) => Number.isFinite(id)),
        is_recurring: taskData.isRecurring || undefined,
        recurrence_rule: taskData.isRecurring ? taskData.recurrenceRule : undefined,
        checklist: taskData.subtasks?.length
          ? taskData.subtasks.map((st) => ({ id: st.id, title: st.title, completed: st.completed }))
          : undefined,
      });
      const mapped = mapTask(created);
      const attachmentFailures: string[] = [];
      if (taskData.attachments?.length && Number.isFinite(created.id)) {
        for (const file of taskData.attachments) {
          try {
            await uploadTaskAttachment(created.id, file);
          } catch {
            attachmentFailures.push(file.name);
          }
        }
      }
      setTasks((prev) => [mapped, ...prev]);
      addActivity('created', '新任务创建:', mapped.title);
      setIsNewTaskModalOpen(false);
      if (attachmentFailures.length > 0) {
        toast.error(
          `任务已创建，但 ${attachmentFailures.length} 个附件上传失败：${attachmentFailures.join('、')}`,
        );
      }
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '创建失败');
      return false;
    }
  };

  const handleUpdateTask = async (updatedTask: Task) => {
    const id = Number(updatedTask.id);
    if (!Number.isFinite(id)) return false;
    try {
      await updateTask(id, {
        title: updatedTask.title,
        description: updatedTask.description,
        priority: uiPriorityToApi(updatedTask.priority),
        status: uiStatusToApi(updatedTask.status),
        category_id: updatedTask.categoryId,
        tag_ids: updatedTask.tagIds,
        due_date: toApiDueDate(updatedTask.dueDate, updatedTask.dueTime) || null,
        project_id:
          updatedTask.projectId && Number(updatedTask.projectId) > 0
            ? Number(updatedTask.projectId)
            : null,
        project_node_id: updatedTask.linkedNodeId
          ? Number(updatedTask.linkedNodeId)
          : null,
        assignee_user_ids: (updatedTask.assigneeUserIds || updatedTask.assignees?.map((member) => member.id) || [])
          .map((id) => Number(id))
          .filter((id) => Number.isFinite(id)),
        checklist: (updatedTask.subtasks || []).map((st) => ({
          id: st.id,
          title: st.title,
          completed: st.completed,
        })),
      });
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
      addActivity('updated', '任务已更新:', updatedTask.title);
      setSelectedTask(updatedTask);
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '更新失败');
      return false;
    }
  };

  /** 恢复单个软删任务并塞回本地列表（撤销删除 / 回收站恢复共用） */
  const restoreTaskToList = async (backendId: number) => {
    try {
      const restored = await restoreTask(backendId);
      const mapped = mapTask(restored);
      setTasks((prev) => [mapped, ...prev.filter((t) => t.id !== mapped.id)]);
      toast.success(`已恢复「${mapped.title}」`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '恢复失败，可到回收站手动恢复');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const id = Number(taskId);
    const taskToDelete = tasks.find((t) => t.id === taskId);
    try {
      if (Number.isFinite(id)) await deleteTask(id);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (taskToDelete) addActivity('updated', '任务已删除:', taskToDelete.title);
      setSelectedTask(null);
      // 软删可恢复：先执行 + 撤销 toast（也可稍后去回收站恢复）
      if (Number.isFinite(id)) {
        toast.action(
          `已删除「${taskToDelete?.title || taskId}」，可撤销或到回收站恢复`,
          { label: '撤销', onAction: () => restoreTaskToList(id) },
        );
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '删除失败');
    }
  };

  /** 用后端返回的任务做单条本地替换（列表 + 详情抽屉同步），避免全量重拉 */
  const applyTaskFromBackend = (updated: import('./api/backend').BackendTask): Task => {
    const mapped = mapTask(updated);
    setTasks((prev) => prev.map((t) => (t.id === mapped.id ? mapped : t)));
    setSelectedTask((prev) => (prev && prev.id === mapped.id ? mapped : prev));
    return mapped;
  };

  /** 重复任务完成后端会返回下一次实例：插入本地列表并提示 */
  const handleNextInstance = (nextInstance?: import('./api/backend').BackendTask | null) => {
    if (!nextInstance) return;
    const mapped = mapTask(nextInstance);
    setTasks((prev) => [mapped, ...prev.filter((t) => t.id !== mapped.id)]);
    toast.success(`已生成下一次：${mapped.dueDate || '未排期'}`);
  };

  const handleToggleTaskCompletion = async (
    taskOrId: string | Pick<Task, 'id'>,
    e?: React.MouseEvent,
  ) => {
    e?.stopPropagation();
    const taskId = typeof taskOrId === 'string' ? taskOrId : taskOrId.id;
    const id = Number(taskId);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !Number.isFinite(id)) return;
    try {
      const wasDone = task.status === 'Done';
      const updated = wasDone ? await uncompleteTask(id) : await completeTask(id);
      const mapped = applyTaskFromBackend(updated);
      if (wasDone) addActivity('updated', '任务已恢复待办:', mapped.title);
      else {
        addActivity('completed', '任务已完成:', mapped.title);
        track('task.complete');
        handleNextInstance((updated as { next_instance?: import('./api/backend').BackendTask | null }).next_instance);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: Status) => {
    const id = Number(taskId);
    if (!Number.isFinite(id)) return;
    try {
      const updated =
        newStatus === 'Done'
          ? await completeTask(id)
          : await updateTask(id, { status: uiStatusToApi(newStatus) });
      const mapped = applyTaskFromBackend(updated);
      if (newStatus === 'Done') {
        addActivity('completed', '任务已完成:', mapped.title);
        track('task.complete');
        handleNextInstance((updated as { next_instance?: import('./api/backend').BackendTask | null }).next_instance);
      } else addActivity('updated', '任务状态更新:', mapped.title);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleMoveTask = async (task: Task, dueDate: string) => {
    const id = Number(task.id);
    if (!Number.isFinite(id)) return;
    try {
      const updated = await updateTask(id, { due_date: toApiDueDate(dueDate, task.dueTime) });
      setTasks((prev) => prev.map((item) => (item.id === task.id ? mapTask(updated) : item)));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : '日期更新失败');
    }
  };

  /** 批量顺延：成功后本地更新这些任务的 dueDate（保留原时刻） */
  const handleBatchReschedule = async (taskIds: string[], dueDate: string) => {
    const ids = taskIds.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    if (!ids.length) return;
    try {
      const res = await batchRescheduleTasks(ids, dueDate);
      const { applied, skippedCount, message } = summarizeBatchReschedule(taskIds, res, dueDate);
      const idSet = new Set(applied);
      setTasks((prev) => prev.map((t) => (idSet.has(t.id) ? { ...t, dueDate } : t)));
      if (skippedCount > 0) toast.info(message);
      else toast.success(message);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '批量顺延失败');
    }
  };

  const handleBatchComplete = async (taskIds: string[]) => {
    const ids = taskIds.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    if (!ids.length) return;
    try {
      const res = await batchCompleteTasks(ids);
      const skipped = new Set(((res as { skipped_task_ids?: number[] })?.skipped_task_ids ?? []).map(String));
      const idSet = new Set(taskIds.filter((id) => !skipped.has(id)));
      setTasks((prev) =>
        prev.map((t) => (idSet.has(t.id) ? { ...t, status: 'Done' as Status, progress: 100 } : t)),
      );
      track('task.complete', { batch: ids.length });
      if (skipped.size > 0) toast.info(`已完成 ${ids.length - skipped.size} 个任务，${skipped.size} 条只读任务未完成`);
      else toast.success(`已完成 ${ids.length} 个任务`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '批量完成失败');
    }
  };

  const handleBatchDelete = async (taskIds: string[]) => {
    const ids = taskIds.map((v) => Number(v)).filter((v) => Number.isFinite(v));
    if (!ids.length) return;
    try {
      await batchDeleteTasks(ids);
      const idSet = new Set(taskIds);
      setTasks((prev) => prev.filter((t) => !idSet.has(t.id)));
      toast.action(`已删除 ${ids.length} 个任务，可撤销或到回收站恢复`, {
        label: '撤销',
        onAction: async () => {
          for (const id of ids) await restoreTaskToList(id);
        },
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : '批量删除失败');
    }
  };

  // 下面这几个回调的引用都要稳定：Navbar / Sidebar 走了 React.memo，
  // 每次渲染新建箭头函数会让浅比较必然失败，memo 等于白加。
  const handleToggleLang = useCallback(() => {
    setSettings((prev) => ({
      ...prev,
      language: prev.language === 'zh' ? 'en' : 'zh',
    }));
  }, []);
  /** 材料/汇报类通知：切到对应项目，再进人轴或汇报页 */
  const handleOpenNotificationTarget = useCallback((target: import('./utils/notificationText').NotificationTarget) => {
    if (target.projectId != null) {
      const hit = displayProjects.find((p) => String(p.id) === String(target.projectId));
      if (hit) setCurrentProject(hit);
    }
    switchView(target.view);
  }, [displayProjects, switchView]);

  const handleOpenSettings = useCallback(() => switchView('settings'), [switchView]);
  const handleReload = useCallback(() => {
    void refreshFromBackend();
  }, [refreshFromBackend]);
  const handleOpenQuickAdd = useCallback(() => setIsQuickAddOpen(true), []);
  const handleOpenNotifications = useCallback(() => setIsNotificationsModalOpen(true), []);
  const handleLogout = useCallback(async () => {
    await logout();
    setAuthed(false);
  }, []);

  const handleOpenNewTask = useCallback(() => {
    setNewTaskDefaultTitle('');
    setNewTaskDefaultDesc('');
    setNewTaskDefaultSource(undefined);
    setNewTaskDefaultStatus('To Do');
    setNewTaskDefaultDate(undefined);
    setIsNewTaskModalOpen(true);
  }, []);

  if (!authed) {
    return (
      <LoginGate
        lang={settings.language}
        registrationConfig={regConfig}
        onLoggedIn={(payload) => {
          setAuthed(true);
          setVerified(null);
          if (payload?.project_id) {
            clearInviteToken();
            const pid = payload.project_id;
            void getProject(pid)
              .then((p) => {
                if (p.company_id) preferredCompanyIdRef.current = p.company_id;
              })
              .catch(() => undefined)
              .then(() => refreshFromBackend())
              .then(() => {
              void getProject(pid)
                .then((p) => {
                  setCurrentProject(mapProject(p));
                  switchView('team');
                })
                .catch(() => {
                  setCurrentProject({
                    id: String(pid),
                    name: settings.language === 'zh' ? '受邀项目' : 'Invited project',
                    description: '',
                    color: '#0058be',
                    active: true,
                  });
                  switchView('team');
                });
            });
          }
        }}
      />
    );
  }

  if (verified === null) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-surface text-on-surface-variant text-sm">
        {settings.language === 'zh' ? '正在检查验证状态…' : 'Checking verification…'}
      </div>
    );
  }

  if (!verified) {
    return (
      <VerifyGate
        lang={settings.language}
        required="email"
        phoneRequired={regConfig.phone_required}
        onVerified={() => setVerified(true)}
        onLogout={() => {
          setAuthed(false);
          setVerified(true);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-surface dark:bg-[#111314] text-on-surface dark:text-[#e2e2e5] font-sans transition-colors duration-200">
      {(bootError || loadingBoot || inviteNotice || taskTruncated) && (
        <div className="fixed top-16 left-0 right-0 z-[60] px-4 py-2 text-sm text-center bg-amber-50 text-amber-900 border-b border-amber-200 md:pl-[280px]">
          {loadingBoot ? (
            '正在从后端同步…'
          ) : inviteNotice ? (
            <span className="inline-flex items-center justify-center gap-2">
              <span>{inviteNotice}</span>
              {inviteRefreshFailed && (
                <button
                  type="button"
                  onClick={async () => {
                    const ok = await refreshFromBackend();
                    if (ok) {
                      setInviteRefreshFailed(false);
                      setInviteNotice(getInviteNotice(true, settings.language));
                    }
                  }}
                  className="underline font-semibold cursor-pointer hover:text-amber-950"
                >
                  {settings.language === 'zh' ? '重试' : 'Retry'}
                </button>
              )}
            </span>
          ) : bootError ? (
            `后端同步提示：${bootError}（请检查后端服务后重试）`
          ) : settings.language === 'zh' ? (
            `任务过多，仅载入最近 ${taskTruncated?.loaded} / ${taskTruncated?.total} 条，请用搜索或筛选定位更早的任务`
          ) : (
            `Too many tasks: showing the latest ${taskTruncated?.loaded} of ${taskTruncated?.total}. Use search or filters for older tasks.`
          )}
        </div>
      )}

      <RecordProgressModal
        isOpen={recordProgressOpen && !isMobileView}
        onClose={() => setRecordProgressOpen(false)}
        projectId={String(currentProject.id)}
        companyId={companyId}
        currentUser={user}
        projects={displayProjects}
      />

      {isMobileView ? (
        <MobileAppShell
          user={user}
          tasks={filteredTasks}
          projects={displayProjects}
          currentProject={currentProject}
          onSelectProject={setCurrentProject}
          activities={activities}
          settings={settings}
          companyId={companyId}
          projectMembers={projectMembers}
          onSelectTask={setSelectedTask}
          onTaskSaved={saved => setTasks(previous => previous.some(task => task.id === saved.id)
            ? previous.map(task => task.id === saved.id ? saved : task) : [saved, ...previous])}
          onOpenNewTask={handleOpenNewTask}
          onToggleTaskCompletion={handleToggleTaskCompletion}
          onUpdateTaskStatus={handleUpdateTaskStatus}
          onBatchComplete={handleBatchComplete}
          onBatchReschedule={handleBatchReschedule}
          onBatchDelete={handleBatchDelete}
          onMoveTask={handleMoveTask}
          onUpdateUser={async (updated) => {
            const saved = await updateMe({
              nickname: updated.name,
              avatar_url: updated.avatar,
            });
            setUser((prev) => ({ ...mapUser(saved), role: prev.role }));
          }}
          onUploadAvatar={async (file) => {
            const saved = await uploadAvatar(file);
            setUser((prev) => ({ ...prev, avatar: saved.avatar_url }));
          }}
          onUpdateSettings={(updated) =>
            setSettings((prev) => ({ ...prev, ...updated }))
          }
          onLogout={handleLogout}
          onOpenQuickAdd={handleOpenQuickAdd}
          onOpenSearch={() => setIsGlobalSearchOpen(true)}
        />
      ) : (
        <>
          <div className={activeView === 'people-axis' ? 'hidden md:block' : undefined}>
      <Navbar
        currentProject={currentProject}
        projects={displayProjects}
        onSelectProject={setCurrentProject}
        user={user}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        lang={settings.language}
        onToggleLang={handleToggleLang}
        onOpenSettings={handleOpenSettings}
        onResetDemo={handleReload}
        onOpenNewTask={handleOpenNewTask}
        onOpenQuickAdd={handleOpenQuickAdd}
        onOpenNotifications={handleOpenNotifications}
        onLogout={handleLogout}
      />
      </div>

      <div className={`flex flex-1 ${activeView === 'people-axis' ? 'pt-0 md:pt-16' : 'pt-16'}`}>
        <Sidebar
          activeView={activeView}
          onSelectView={view => { if (view === 'kanban' || view === 'tasks') setTaskWorkspaceScope('all'); switchView(view); }}
          onOpenNewTask={handleOpenNewTask}
          lang={settings.language}
        />

        <main className={`flex-1 md:pl-[280px] ${activeView === 'people-axis' ? 'pb-0' : 'pb-20 md:pb-8'} min-w-0 transition-all duration-200`}>
          <div className="max-w-7xl mx-auto">
            {(activeView === 'tasks' || activeView === 'kanban') && <TaskWorkspaceToolbar
              view={activeView} scope={taskWorkspaceScope} lang={settings.language}
              onViewChange={switchView} onScopeChange={setTaskWorkspaceScope}
              onOpenTrash={() => { setTrashReturnView(activeView); switchView('trash'); }} />}
            {activeView === 'trash' && <button type="button" onClick={() => switchView(trashReturnView)}
              className="min-h-[44px] px-3 text-primary font-medium">{settings.language === 'zh' ? '返回任务管理' : 'Back to tasks'}</button>}
            <React.Suspense fallback={<ViewLoadingFallback />}>
            {activeView === 'dashboard' && (
              <DashboardView
                user={user}
                projects={projects}
                currentProject={currentProject}
                onOpenCalendar={() => switchView('calendar')}
                onEditScheduledTask={setSelectedTask}
                onOpenNewTaskWithDate={date => {
                  setNewTaskDefaultDate(date); setNewTaskDefaultStatus('To Do'); setNewTaskDefaultSource(undefined);
                  setNewTaskDefaultTitle(''); setNewTaskDefaultDesc(''); setIsNewTaskModalOpen(true);
                }}
                onOpenProject={(project) => { setCurrentProject(project); switchView('people-axis'); }}
                tasks={filteredTasks}
                activities={activities}
                onSelectTask={setSelectedTask}
                onOpenNewTask={handleOpenNewTask}
                onNavigateToTasks={() => { setTaskWorkspaceScope('all'); switchView('tasks'); }}
                onNavigateToKanban={scope => { setTaskWorkspaceScope(scope || 'all'); switchView('kanban'); }}
                onNavigateToAssistant={action => { if (action === 'progress') { setRecordProgressOpen(true); return; } setAssistantFocus(action); switchView('reports'); }}
                onNavigateToPeopleAxis={() => switchView('people-axis')}
                lang={settings.language}
              />
            )}

            {activeView === 'people-axis' && (
              <PeopleAxisView
                lang={settings.language}
                projectId={currentProject.id}
                projects={displayProjects}
                onSelectProject={(proj) => setCurrentProject(proj)}
              />
            )}

            {activeView === 'knowledge' && (
              <PersonalKnowledgeSpace
                userId={user.id}
                projects={displayProjects}
                currentProject={currentProject}
                onSelectProject={setCurrentProject}
                onAskKnowledge={() => switchView('reports')}
              />
            )}

            {activeView === 'tasks' && (
              <MyTasksView
                tasks={filterTaskWorkspace(filteredTasks, taskWorkspaceScope)}
                onToggleTaskCompletion={handleToggleTaskCompletion}
                onSelectTask={setSelectedTask}
                onBatchComplete={handleBatchComplete}
                onBatchReschedule={handleBatchReschedule}
                onBatchDelete={handleBatchDelete}
                lang={settings.language}
              />
            )}

            {activeView === 'trash' && (
              <TrashView
                lang={settings.language}
                onRestored={(restored) => {
                  const mapped = mapTask(restored);
                  setTasks((prev) => [mapped, ...prev.filter((t) => t.id !== mapped.id)]);
                }}
              />
            )}

            {activeView === 'kanban' && (
              <KanbanView
                tasks={filterTaskWorkspace(filteredTasks, taskWorkspaceScope)}
                members={projectMembers}
                lastUpdatedAt={activities[0]?.timestamp}
                onUpdateTaskStatus={handleUpdateTaskStatus}
                onSelectTask={setSelectedTask}
                onOpenNewTaskWithStatus={(status) => {
                  setNewTaskDefaultStatus(status);
                  setNewTaskDefaultSource(undefined);
                  setIsNewTaskModalOpen(true);
                }}
                lang={settings.language}
              />
            )}

            {activeView === 'calendar' && (
              <CalendarView
                tasks={filteredTasks}
                onSelectTask={setSelectedTask}
                onOpenNewTaskWithDate={(dateStr) => {
                  setNewTaskDefaultDate(dateStr);
                  setNewTaskDefaultSource(undefined);
                  setIsNewTaskModalOpen(true);
                }}
                onMoveTask={handleMoveTask}
                lang={settings.language}
              />
            )}

            {activeView === 'reports' && (
              <ReportsView
                initialFocus={assistantFocus}
                projects={displayProjects}
                onSelectProject={setCurrentProject}
                tasks={filteredTasks}
                lang={settings.language}
                projectId={currentProject.id}
                projectName={currentProject.name}
                userId={user.id}
                companyId={companyId}
                onNavigateToPeopleAxis={() => switchView('people-axis')}
                onNavigateToInbox={() => switchView('inbox')}
              />
            )}

            {activeView === 'team' && (
              <TeamView
                companyId={companyId}
                projectId={currentProject.id}
                onCreateCompany={() => {
                  setWorkspaceError(null);
                  setWorkspaceModal('company');
                }}
                onCreateProject={() => {
                  setWorkspaceError(null);
                  setWorkspaceModal(companyId ? 'project' : 'company');
                }}
                onSelectMember={(m) =>
                  toast.info(
                    settings.language === 'zh'
                      ? `成员: ${m.name}`
                      : `Selected: ${m.name}`,
                  )
                }
                onNavigateToMessages={() => switchView('messages')}
                lang={settings.language}
              />
            )}

            {activeView === 'inbox' && (
         <InboxView
                companyId={companyId}
                canViewIntegrations={isCompanyAdmin}
                onOpenTarget={handleOpenNotificationTarget}
                onOpenNewTaskWithTitle={(title, desc, source) => {
                  setNewTaskDefaultTitle(title);
                  setNewTaskDefaultDesc(desc);
                  setNewTaskDefaultSource(source);
                  setIsNewTaskModalOpen(true);
                }}
                lang={settings.language}
              />
            )}

            {activeView === 'messages' && (
              <MessagesView
                user={user}
                lang={settings.language}
                companyId={companyId}
                projectId={currentProject.id}
                members={projectMembers}
                tasks={filteredTasks}
                onSelectTask={setSelectedTask}
                onCreateCompany={() => {
                  setWorkspaceError(null);
                  setWorkspaceModal('company');
                }}
              />
            )}

            {activeView === 'settings' && (
              <SettingsView
                user={user}
                companyId={companyId}
                 onUpdateUser={async (updated) => {
                  const saved = await updateMe({
                    nickname: updated.name,
                    avatar_url: updated.avatar,
                  });
                   setUser((prev) => ({ ...mapUser(saved), role: prev.role }));
                 }}
                 onUploadAvatar={async (file) => {
                   const saved = await uploadAvatar(file);
                   setUser((prev) => ({ ...prev, avatar: saved.avatar_url }));
                 }}
                 onEnablePush={async () => { await enableWebPush(); }}
                settings={settings}
                onUpdateSettings={(updated) =>
                  setSettings((prev) => ({ ...prev, ...updated }))
                }
                onResetDemo={() => void refreshFromBackend()}
                onLogout={async () => {
                  await logout();
                  setAuthed(false);
                }}
                lang={settings.language}
              />
            )}

            {activeView === 'notifications' && (
              <NotificationSettingsView
                settings={settings}
                onUpdateSettings={(updated) => setSettings((prev) => ({ ...prev, ...updated }))}
                onEnablePush={async () => { await enableWebPush(); }}
                lang={settings.language}
              />
            )}
            </React.Suspense>
          </div>
        </main>
      </div>
        </>
      )}

      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        onCreateTask={handleCreateTask}
        currentProject={currentProject}
        defaultStatus={newTaskDefaultStatus}
        defaultDate={newTaskDefaultDate}
        defaultPriority={settings.taskDefaults.priority}
        defaultCategory={settings.taskDefaults.category}
        defaultTitle={newTaskDefaultTitle}
        defaultDescription={newTaskDefaultDesc}
        defaultSource={newTaskDefaultSource}
        categories={categories}
        tags={tags}
        companyId={companyId}
        members={projectMembers}
        currentUserId={user.id}
        lang={settings.language}
      />

      <GlobalSearchModal
        isOpen={isGlobalSearchOpen}
        onClose={() => setIsGlobalSearchOpen(false)}
        tasks={tasks}
        projects={projects}
        lang={settings.language}
        onSelectTask={(task) => setSelectedTask(task)}
        onSelectProject={(proj) => {
          setCurrentProject(proj);
          switchView('people-axis');
        }}
      />

      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onCreateTask={handleCreateTask}
        projectId={currentProject.id}
        defaultCategory={settings.taskDefaults.category}
        lang={settings.language}
      />

      <TaskDetailDrawer
        task={selectedTask}
        onClose={() => setSelectedTask(null)}
        onUpdateTask={handleUpdateTask}
        onDeleteTask={handleDeleteTask}
        members={projectMembers}
        currentUserId={user.id}
        lang={settings.language}
      />

      <NotificationsModal
        isOpen={isNotificationsModalOpen}
        onClose={() => setIsNotificationsModalOpen(false)}
        onSelectTaskId={(id) => {
          const t = tasks.find((x) => x.id === id);
          if (t) setSelectedTask(t);
        }}
        onOpenSettings={() => switchView('notifications')}
        onOpenTarget={handleOpenNotificationTarget}
        lang={settings.language}
      />

      <ShortcutHelpModal
        isOpen={isShortcutHelpOpen}
        onClose={() => setIsShortcutHelpOpen(false)}
        lang={settings.language}
      />

      <WorkspaceSetupModal
        isOpen={workspaceModal !== null}
        mode={workspaceModal || 'company'}
        lang={settings.language}
        submitting={workspaceBusy}
        error={workspaceError}
        onClose={() => {
          if (workspaceBusy) return;
          setWorkspaceModal(null);
          setWorkspaceError(null);
        }}
        onSubmit={(payload) =>
          workspaceModal === 'project' ? handleCreateProject(payload) : handleCreateCompany(payload)
        }
      />

      {regConfig.phone_required && (
        <PhoneVerificationReminder
          userId={user.id || ''}
          verified={phoneVerified}
          onVerify={() => setPhoneGateOpen(true)}
          onVerified={markPhoneVerified}
        />
      )}
      {phoneGateOpen && (
        <div className="fixed inset-0 z-[80] bg-black/50 flex items-center justify-center p-4">
          <div className="w-full max-w-lg">
            <VerifyGate
              lang={settings.language}
              required="phone"
              phoneRequired={regConfig.phone_required}
              onVerified={() => {
                setPhoneVerified(true);
                setVerified(true);
                setPhoneGateOpen(false);
              }}
              onLogout={() => {
                setAuthed(false);
                setVerified(true);
                setPhoneGateOpen(false);
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}
