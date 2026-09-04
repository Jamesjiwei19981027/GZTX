import { AppSettings, Priority } from '../types';

export const INITIAL_SETTINGS: AppSettings = {
  themeMode: 'light',
  accentColor: 'blue',
  language: 'zh',
  notifications: {
    email: true,
    push: true,
    desktop: false,
    wechat: false,
    quietHoursStart: '22:00',
    quietHoursEnd: '08:00',
    weekendMute: false,
  },
  taskDefaults: {
    priority: 'Medium',
    category: 'Work',
  },
};

// 沿用历史 key，避免升级后丢用户本地偏好
const SETTINGS_KEY = 'flow_app_settings_v1';

const VALID_PRIORITIES: Priority[] = ['High', 'Medium', 'Low'];

/** 老版本本地存储里可能残留 'Urgent'（后端从未支持），读取时折叠为 High */
function sanitizePriority(value: unknown): Priority {
  if (value === 'Urgent') return 'High';
  return VALID_PRIORITIES.includes(value as Priority)
    ? (value as Priority)
    : INITIAL_SETTINGS.taskDefaults.priority;
}

export function loadSettings(): AppSettings {
  try {
    const data = localStorage.getItem(SETTINGS_KEY);
    if (!data) return INITIAL_SETTINGS;
    const parsed = JSON.parse(data) as Partial<AppSettings>;
    return {
      ...INITIAL_SETTINGS,
      ...parsed,
      notifications: { ...INITIAL_SETTINGS.notifications, ...(parsed.notifications || {}) },
      taskDefaults: {
        ...INITIAL_SETTINGS.taskDefaults,
        ...(parsed.taskDefaults || {}),
        priority: sanitizePriority(parsed.taskDefaults?.priority),
      },
    };
  } catch {
    return INITIAL_SETTINGS;
  }
}

export function saveSettings(settings: AppSettings): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch (e) {
    console.error('Failed to save settings', e);
  }
}
