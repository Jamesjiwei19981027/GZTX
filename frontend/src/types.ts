export type Priority = 'High' | 'Medium' | 'Low';
export type Status = 'To Do' | 'In Progress' | 'Done';
export type Category = 'Work' | 'Health' | 'Personal' | 'Shopping' | 'Documentation';
export type ViewMode = 'dashboard' | 'tasks' | 'kanban' | 'calendar' | 'reports' | 'team' | 'messages' | 'inbox' | 'people-axis' | 'knowledge' | 'notifications' | 'settings' | 'trash';
export type Language = 'zh' | 'en';
export type AccentColor = 'blue' | 'green' | 'amber' | 'red';

export interface Subtask {
  id: string;
  title: string;
  completed: boolean;
}

export interface TeamMember {
  id: string;
  name: string;
  role: string;
  roleKey?: 'primary' | 'collaborator' | string;
  avatar: string;
  status?: 'online' | 'busy' | 'offline';
  department?: string;
  email?: string;
  tasksCount?: number;
}

export interface MessageItem {
  id: string;
  senderName: string;
  senderAvatar: string;
  content: string;
  timestamp: string;
  channel: 'general' | 'project' | 'direct';
  likes?: number;
  repliesCount?: number;
  attachments?: MessageAttachment[];
}

export interface MessageAttachment {
  fileId?: number;
  originalName?: string;
  mimeType?: string;
  sizeBytes?: number;
  downloadUrl?: string;
  url?: string;
  name?: string;
}

export interface IntegrationItem {
  id: string;
  name: string;
  icon: string;
  description: string;
  category: 'Communication' | 'Development' | 'Storage' | 'Calendar';
  connected: boolean;
  lastSync?: string;
}

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  timestamp: string;
  read: boolean;
  type: 'mention' | 'deadline' | 'system' | 'assignment';
  linkTaskId?: string;
}

export interface Task {
  id: string;
  title: string;
  description?: string;
  priority: Priority;
  status: Status;
  category: Category;
  dueDate: string;
  dueTime?: string;
  assignee?: TeamMember;
  assignees?: TeamMember[];
  assigneeUserIds?: string[];
  subtasks: Subtask[];
  progress?: number; // 0 to 100 for in progress tasks
  tag?: string;
  completedAt?: string;
  projectId: string;
  /** 关联人轴事项节点 ID（Task.project_node_id） */
  linkedNodeId?: string;
  categoryId?: number;
  tagIds?: number[];
  attachments?: File[];
  sourceChannel?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  sourceMessageId?: string;
  sourceMeta?: Record<string, unknown>;
  /** 重复任务：模板任务 is_recurring=true；实例带 parentTaskId */
  isRecurring?: boolean;
  recurrenceRule?: 'daily' | 'weekdays' | 'weekly' | 'monthly' | string;
  parentTaskId?: string;
}

export interface Project {
  id: string;
  name: string;
  description: string;
  color: string;
  active: boolean;
}

export interface Activity {
  id: string;
  type: 'completed' | 'updated' | 'collaborator' | 'created';
  titleText: string;
  targetText: string;
  timestamp: string;
  icon: string;
  colorClass: string;
}

export interface UserProfile {
  id?: string;
  name: string;
  email: string;
  avatar: string;
  role: string;
}

export interface NotificationSettings {
  email: boolean;
  push: boolean;
  desktop: boolean;
  wechat: boolean;
  quietHoursStart: string;
  quietHoursEnd: string;
  weekendMute: boolean;
}

export interface TaskDefaults {
  priority: Priority;
  category: Category;
}

export interface AppSettings {
  themeMode: 'light' | 'dark';
  accentColor: AccentColor;
  language: Language;
  notifications: NotificationSettings;
  taskDefaults: TaskDefaults;
}

export interface AxisEvidence {
  id: string;
  type: 'commit' | 'document' | 'figma' | 'log' | 'delivery';
  title: string;
  url: string;
  timestamp: string;
  verifiedBy?: string;
  status: 'verified' | 'pending' | 'rejected';
}

export interface AxisWorkItem {
  id: string;
  title: string;
  type: 'task' | 'milestone' | 'scope';
  status: Status;
  progress: number;
  dueDate: string;
  /** 事项负责人（后端 node_assignments 的 user_id），用于编辑时预选 */
  assigneeUserIds?: number[];
  linkedTaskId?: string;
  evidences: AxisEvidence[];
  aiAnalysis?: string;
}

export interface PeopleAxisNode {
  id: string;
  person: TeamMember;
  parentId?: string; // If undefined, node is on the main responsibility trunk. If set, node is a subordinate ("人挂到人上 = 下级人员")
  isTerminalPM?: boolean; // "终责（项目 PM）独一无二：坐在轴的终点"
  orderOnAxis: number;
  roleTitle: string; // e.g. "技术总负责人", "产品设计", "最终交付PM"
  nodeOrigin?: 'project' | 'subordinate';
  responsibilityPermissions?: ResponsibilityPermissions;
  workItems: AxisWorkItem[]; // "工作项/里程碑/范围只能挂在某个「人」下面"
  /** 后端 primary/collaborator 责任人 user_id（与服务端 _owns_path 同口径，用于前端权限显隐） */
  ownerUserIds?: number[];
  uiOffsets?: {
    horizontal?: { x: number; y: number } | null;
    vertical?: { x: number; y: number } | null;
  } | null;
  uiOffset?: { x: number; y: number } | null;
  layoutOffset?: { x: number; y: number };
  aiContext?: {
    riskLevel: 'low' | 'medium' | 'high';
    summary: string;
    lastAnalysis: string;
    suggestedActions: string[];
  };
}

export type ResponsibilityPermissions = {
  channel_access?: boolean;
  evidence_submit: 'inherit' | 'members' | 'responsible' | 'disabled';
  allow_add_subordinates: boolean;
  allow_add_work_items: boolean;
};

export type ResponsibilityNodeCapabilities = {
  can_delete_person?: boolean;
  can_move_person?: boolean;
  can_manage_assignees?: boolean;
  can_manage_channel_access?: boolean;
  can_edit_person: boolean;
  can_manage_permissions: boolean;
  can_add_subordinate: boolean;
  can_add_work_item: boolean;
  can_submit_evidence: boolean;
  can_read_evidence: boolean;
};
