/**
 * Remix UI 主壳：对接 GZTX 后端（任务/人轴/消息/通知/团队/收件箱/报表）。
 */

import React, { useState, useEffect, useMemo, useCallback } from 'react';
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
} from './data/mockData';
import { Navbar } from './components/Navbar';
import { Sidebar } from './components/Sidebar';
import { DashboardView } from './components/views/DashboardView';
import { MyTasksView } from './components/views/MyTasksView';
import { KanbanView } from './components/views/KanbanView';
import { CalendarView } from './components/views/CalendarView';
import { SettingsView } from './components/views/SettingsView';
import { NotificationSettingsView } from './components/views/NotificationSettingsView';
import { ReportsView } from './components/views/ReportsView';
import { TeamView } from './components/views/TeamView';
import { InboxView } from './components/views/InboxView';
import { MessagesView } from './components/views/MessagesView';
import { PeopleAxisView } from './components/views/PeopleAxisView';
import { NewTaskModal } from './components/modals/NewTaskModal';
import { QuickAddModal } from './components/modals/QuickAddModal';
import { TaskDetailDrawer } from './components/modals/TaskDetailDrawer';
import { NotificationsModal } from './components/modals/NotificationsModal';
import { LoginGate } from './components/LoginGate';
import { VerifyGate } from './components/VerifyGate';
import { getToken } from './api/client';
import { fetchMe, getVerificationStatus, logout, updateMe, uploadAvatar } from './api/auth';
import {
  completeTask,
  createTask,
  createTag,
  deleteTask,
  listCategories,
  listTags,
  listMyCompanies,
  listProjectMembers,
  listProjects,
  listTasks,
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

const ALL_PROJECT_ITEM: Project = {
  id: 'all',
  name: '全盘研发概览 (All Projects Overview)',
  description: '跨项目总览（任务来自个人任务 API；人轴需选具体项目）',
  color: '#0058be',
  active: true,
};

function toApiDueDate(date?: string, time?: string): string | undefined {
  if (!date) return undefined;
  const trimmedTime = (time || '').trim();
  return trimmedTime ? `${date}T${trimmedTime}:00` : date;
}

export default function App() {
  const [authed, setAuthed] = useState(() => !!getToken());
  /** null=检查中；false=需补验邮箱/手机；true=双验证通过 */
  const [verified, setVerified] = useState<boolean | null>(() =>
    getToken() ? null : true,
  );
  const [bootError, setBootError] = useState<string | null>(null);
  const [loadingBoot, setLoadingBoot] = useState(false);

  const [tasks, setTasks] = useState<Task[]>([]);
  const [categories, setCategories] = useState<import('./api/backend').BackendCategory[]>([]);
  const [tags, setTags] = useState<import('./api/backend').BackendTag[]>([]);
  const [projectMembers, setProjectMembers] = useState<import('./types').TeamMember[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [companyId, setCompanyId] = useState<number | null>(null);
  const [currentProject, setCurrentProject] = useState<Project>(ALL_PROJECT_ITEM);
  const [activities, setActivities] = useState<Activity[]>([]);
  const [user, setUser] = useState<UserProfile>({
    name: '',
    email: '',
    avatar: '',
    role: '',
  });
  const [settings, setSettings] = useState<AppSettings>(() => loadSettings());

  const [activeView, setActiveView] = useState<ViewMode>('dashboard');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  const [isNewTaskModalOpen, setIsNewTaskModalOpen] = useState(false);
  const [newTaskDefaultStatus, setNewTaskDefaultStatus] = useState<Status | undefined>();
  const [newTaskDefaultDate, setNewTaskDefaultDate] = useState<string | undefined>();
  const [newTaskDefaultTitle, setNewTaskDefaultTitle] = useState<string | undefined>();
  const [newTaskDefaultDesc, setNewTaskDefaultDesc] = useState<string | undefined>();
  const [newTaskDefaultSource, setNewTaskDefaultSource] = useState<{ channel?: string; title?: string; url?: string } | undefined>();
  const [isNotificationsModalOpen, setIsNotificationsModalOpen] = useState(false);
  const [isQuickAddOpen, setIsQuickAddOpen] = useState(false);

  const refreshFromBackend = useCallback(async () => {
    setLoadingBoot(true);
    setBootError(null);
    try {
      const me = await fetchMe();
      setUser(mapUser(me));
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
      const companies = await listMyCompanies();
      const cid = companies.items?.[0]?.id ?? null;
      setCompanyId(cid);
      let mappedProjects: Project[] = [];
      if (cid) {
        const projPage = await listProjects(cid);
        mappedProjects = (projPage.items || []).map(mapProject);
      }
      setProjects(mappedProjects);
      const taskPage = await listTasks({ page: 1, page_size: 200 });
      setTasks((taskPage.items || []).map((t) => mapTask(t)));
      try {
        const [categoryItems, tagItems] = await Promise.all([listCategories(), listTags()]);
        setCategories(categoryItems || []);
        setTags(tagItems || []);
        const defaultCategoryId = Number(((notifyPref.ui || {}) as Record<string, unknown>).task_default_category_id);
        if (Number.isFinite(defaultCategoryId)) {
          const defaultCategory = (categoryItems || []).find((item) => item.id === defaultCategoryId);
          if (defaultCategory) {
            setSettings((prev) => ({ ...prev, taskDefaults: { ...prev.taskDefaults, category: defaultCategory.name as typeof prev.taskDefaults.category } }));
          }
        }
      } catch {
        setCategories([]);
        setTags([]);
      }
      void putPresence('online').catch(() => undefined);
      try {
        const prefs = await getUiPrefs();
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
      } catch {
        /* keep local */
      }
    } catch (e) {
      setBootError(e instanceof Error ? e.message : '加载失败');
      // A failed API request must remain visible as an error/empty state.
      // Injecting demo records makes authenticated users believe writes worked.
      setTasks([]);
      setProjects([]);
      setActivities([]);
    } finally {
      setLoadingBoot(false);
    }
  }, []);

  useEffect(() => {
    if (!authed) {
      setVerified(true);
      return;
    }
    let cancelled = false;
    setVerified(null);
    void (async () => {
      try {
        const st = await getVerificationStatus();
        if (!cancelled) setVerified(Boolean(st.is_verified));
      } catch {
        // 旧账号或接口异常时不挡门，避免误锁死
        if (!cancelled) setVerified(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [authed]);

  useEffect(() => {
    if (authed && verified) void refreshFromBackend();
  }, [authed, verified, refreshFromBackend]);

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
      if (!(e.altKey && (e.key === 'n' || e.key === 'N' || e.code === 'KeyN'))) return;
      // 正在输入（表单控件 / 富文本）时不抢快捷键，避免打断用户
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName?.toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || target?.isContentEditable) return;
      e.preventDefault();
      setIsQuickAddOpen(true);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  useEffect(() => {
    saveSettings(settings);
    const root = document.documentElement;
    if (settings.themeMode === 'dark') root.classList.add('dark');
    else root.classList.remove('dark');
    if (authed) {
      void putUiPrefs({
        language: settings.language,
        accent: settings.accentColor,
        theme_mode: settings.themeMode,
        task_default_priority: uiPriorityToApi(settings.taskDefaults.priority),
        task_default_category_id: categories.find((item) => item.name === settings.taskDefaults.category)?.id,
      }).catch(() => undefined);
    }
  }, [settings, authed]);

  useEffect(() => {
    if (!authed) return;
    const n = settings.notifications;
    void updateMe({
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
    }).catch(() => undefined);
  }, [authed, settings.notifications]);

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
        alert(
          `任务已创建，但 ${attachmentFailures.length} 个附件上传失败：${attachmentFailures.join('、')}`,
        );
      }
      return true;
    } catch (e) {
      alert(e instanceof Error ? e.message : '创建失败');
      return false;
    }
  };

  const handleUpdateTask = async (updatedTask: Task) => {
    const id = Number(updatedTask.id);
    if (!Number.isFinite(id)) return;
    try {
      await updateTask(id, {
        title: updatedTask.title,
        description: updatedTask.description,
        priority: uiPriorityToApi(updatedTask.priority),
        status: uiStatusToApi(updatedTask.status),
        category_id: updatedTask.categoryId,
        tag_ids: updatedTask.tagIds,
        due_date: toApiDueDate(updatedTask.dueDate, updatedTask.dueTime),
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
      });
      setTasks((prev) => prev.map((t) => (t.id === updatedTask.id ? updatedTask : t)));
      addActivity('updated', '任务已更新:', updatedTask.title);
      setSelectedTask(updatedTask);
    } catch (e) {
      alert(e instanceof Error ? e.message : '更新失败');
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const id = Number(taskId);
    try {
      if (Number.isFinite(id)) await deleteTask(id);
      const taskToDelete = tasks.find((t) => t.id === taskId);
      setTasks((prev) => prev.filter((t) => t.id !== taskId));
      if (taskToDelete) addActivity('updated', '任务已删除:', taskToDelete.title);
      setSelectedTask(null);
    } catch (e) {
      alert(e instanceof Error ? e.message : '删除失败');
    }
  };

  const handleToggleTaskCompletion = async (taskId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const id = Number(taskId);
    const task = tasks.find((t) => t.id === taskId);
    if (!task || !Number.isFinite(id)) return;
    try {
      if (task.status === 'Done') await uncompleteTask(id);
      else await completeTask(id);
      await refreshFromBackend();
    } catch (err) {
      alert(err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleUpdateTaskStatus = async (taskId: string, newStatus: Status) => {
    const id = Number(taskId);
    if (!Number.isFinite(id)) return;
    try {
      if (newStatus === 'Done') await completeTask(id);
      else await updateTask(id, { status: uiStatusToApi(newStatus) });
      await refreshFromBackend();
    } catch (err) {
      alert(err instanceof Error ? err.message : '状态更新失败');
    }
  };

  const handleMoveTask = async (task: Task, dueDate: string) => {
    const id = Number(task.id);
    if (!Number.isFinite(id)) return;
    try {
      const updated = await updateTask(id, { due_date: toApiDueDate(dueDate, task.dueTime) });
      setTasks((prev) => prev.map((item) => (item.id === task.id ? mapTask(updated) : item)));
    } catch (err) {
      alert(err instanceof Error ? err.message : '日期更新失败');
    }
  };

  const handleOpenNewTask = () => {
    setNewTaskDefaultTitle('');
    setNewTaskDefaultDesc('');
    setNewTaskDefaultSource(undefined);
    setNewTaskDefaultStatus('To Do');
    setNewTaskDefaultDate(undefined);
    setIsNewTaskModalOpen(true);
  };

  if (!authed) {
    return (
      <LoginGate
        lang={settings.language}
        onLoggedIn={() => {
          setAuthed(true);
          setVerified(null);
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
      {(bootError || loadingBoot) && (
        <div className="fixed top-16 left-0 right-0 z-[60] px-4 py-2 text-sm text-center bg-amber-50 text-amber-900 border-b border-amber-200 md:pl-[280px]">
          {loadingBoot
            ? '正在从后端同步…'
            : `后端同步提示：${bootError}（请检查后端服务后重试）`}
        </div>
      )}

      <Navbar
        currentProject={currentProject}
        projects={displayProjects}
        onSelectProject={(proj) => setCurrentProject(proj)}
        user={user}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        lang={settings.language}
        onToggleLang={() =>
          setSettings((prev) => ({
            ...prev,
            language: prev.language === 'zh' ? 'en' : 'zh',
          }))
        }
        onOpenSettings={() => setActiveView('settings')}
        onResetDemo={() => void refreshFromBackend()}
        onOpenNewTask={handleOpenNewTask}
        onOpenQuickAdd={() => setIsQuickAddOpen(true)}
        onOpenNotifications={() => setIsNotificationsModalOpen(true)}
        onLogout={async () => {
          await logout();
          setAuthed(false);
        }}
      />

      <div className="flex flex-1 pt-16">
        <Sidebar
          activeView={activeView}
          onSelectView={setActiveView}
          onOpenNewTask={handleOpenNewTask}
          lang={settings.language}
        />

        <main className="flex-1 md:pl-[280px] pb-20 md:pb-8 min-w-0 transition-all duration-200">
          <div className="max-w-7xl mx-auto">
            {activeView === 'dashboard' && (
              <DashboardView
                user={user}
                tasks={filteredTasks}
                activities={activities}
                onSelectTask={setSelectedTask}
                onOpenNewTask={handleOpenNewTask}
                onNavigateToTasks={() => setActiveView('tasks')}
                onNavigateToPeopleAxis={() => setActiveView('people-axis')}
                lang={settings.language}
              />
            )}

            {activeView === 'people-axis' && (
              <PeopleAxisView
                lang={settings.language}
                projectId={currentProject.id}
                projects={projects}
                onSelectProject={(proj) => setCurrentProject(proj)}
              />
            )}

            {activeView === 'tasks' && (
              <MyTasksView
                tasks={filteredTasks}
                onToggleTaskCompletion={handleToggleTaskCompletion}
                onSelectTask={setSelectedTask}
                lang={settings.language}
              />
            )}

            {activeView === 'kanban' && (
              <KanbanView
                tasks={filteredTasks}
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
              <ReportsView tasks={tasks} lang={settings.language} />
            )}

            {activeView === 'team' && (
              <TeamView
                companyId={companyId}
                projectId={currentProject.id}
                onSelectMember={(m) =>
                  alert(
                    settings.language === 'zh'
                      ? `成员: ${m.name}`
                      : `Selected: ${m.name}`,
                  )
                }
                onNavigateToMessages={() => setActiveView('messages')}
                lang={settings.language}
              />
            )}

            {activeView === 'inbox' && (
         <InboxView
                companyId={companyId}
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
              />
            )}

            {activeView === 'settings' && (
              <SettingsView
                user={user}
                 onUpdateUser={async (updated) => {
                  const saved = await updateMe({
                    nickname: updated.name,
                    avatar_url: updated.avatar,
                  });
                   setUser(mapUser(saved));
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
          </div>
        </main>
      </div>

      <NewTaskModal
        isOpen={isNewTaskModalOpen}
        onClose={() => setIsNewTaskModalOpen(false)}
        onCreateTask={handleCreateTask}
        currentProject={
          currentProject.id === 'all'
            ? projects[0] || {
                id: '0',
                name: '默认',
                description: '',
                color: '#0058be',
                active: true,
              }
            : currentProject
        }
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

      <QuickAddModal
        isOpen={isQuickAddOpen}
        onClose={() => setIsQuickAddOpen(false)}
        onCreateTask={handleCreateTask}
        projectId={currentProject.id === 'all' ? projects[0]?.id || '0' : currentProject.id}
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
        onOpenSettings={() => setActiveView('notifications')}
        lang={settings.language}
      />
    </div>
  );
}
