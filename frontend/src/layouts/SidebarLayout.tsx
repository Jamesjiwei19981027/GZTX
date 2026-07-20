import { useEffect } from 'react'
import { NavLink, Outlet, useNavigate, useLocation } from 'react-router-dom'
import { useAuthStore, selectNickname } from '@/stores/auth'

const navItems = [
  { key: 'dashboard', path: '/dashboard', icon: 'dashboard', label: '仪表盘', match: (p: string) => p === '/dashboard' },
  {
    key: 'tasks',
    path: '/tasks',
    icon: 'checklist',
    label: '我的任务',
    match: (p: string) => p.startsWith('/tasks'),
  },
  {
    key: 'projects',
    path: '/projects',
    icon: 'account_tree',
    label: '项目',
    match: (p: string) => p.startsWith('/projects'),
  },
  {
    key: 'calendar',
    path: '/calendar',
    icon: 'calendar_month',
    label: '日历',
    match: (p: string) => p === '/calendar',
  },
]

const bottomItems = [
  {
    key: 'company',
    path: '/company/settings',
    icon: 'apartment',
    label: '公司',
    match: (p: string) => p.startsWith('/company'),
  },
  {
    key: 'settings',
    path: '/settings',
    icon: 'settings',
    label: '设置',
    match: (p: string) => p === '/settings',
  },
]

export default function SidebarLayout() {
  const navigate = useNavigate()
  const location = useLocation()
  const user = useAuthStore((s) => s.user)
  const fetchCurrentUser = useAuthStore((s) => s.fetchCurrentUser)
  const logout = useAuthStore((s) => s.logout)
  const userName = selectNickname(user) || '用户'

  useEffect(() => {
    if (!user) {
      void fetchCurrentUser()
    }
  }, [user, fetchCurrentUser])

  async function handleLogout() {
    await logout()
    navigate('/login', { replace: true })
  }

  function linkClass(active: boolean) {
    return [
      'nav-link',
      active ? 'active' : '',
    ]
      .filter(Boolean)
      .join(' ')
  }

  return (
    <div className="h-screen w-full overflow-hidden flex bg-background">
      {/* Sidebar */}
      <nav className="hidden md:flex fixed left-0 top-0 h-full w-sidebar bg-surface border-r border-surface-variant shadow-sm flex-col py-lg px-md gap-sm z-50">
        {/* Brand */}
        <div
          className="mb-lg px-sm flex items-center gap-sm cursor-pointer hover:opacity-80 transition-opacity"
          onClick={() => navigate('/dashboard')}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') navigate('/dashboard')
          }}
        >
          <div className="w-10 h-10 rounded-xl bg-primary flex items-center justify-center shadow-sm flex-shrink-0">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path
                d="M3 20L7 4L12 8L17 4L21 20"
                stroke="white"
                strokeWidth="2.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M7 14L12 12L17 14"
                stroke="white"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                opacity="0.7"
              />
              <circle cx="12" cy="20" r="1.5" fill="white" />
            </svg>
          </div>
          <div>
            <h1 className="font-headline text-headline-sm font-bold text-primary tracking-tight leading-none">
              烂笔头PM
            </h1>
            <p className="font-body text-body-sm text-on-surface-variant mt-xs">好记性不如烂笔头</p>
          </div>
        </div>

        {/* Nav Items */}
        <div className="flex flex-col gap-xs flex-1">
          {navItems.map((item) => {
            const active = item.match(location.pathname)
            return (
              <NavLink
                key={item.key}
                to={item.path}
                className={linkClass(active)}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(item.path)
                }}
              >
                <span
                  className="material-symbols-outlined"
                  style={active ? { fontVariationSettings: "'FILL' 1" } : undefined}
                >
                  {item.icon}
                </span>
                <span className="font-label text-label-md">{item.label}</span>
              </NavLink>
            )
          })}
        </div>

        {/* Bottom Section */}
        <div className="mt-auto pt-sm border-t border-surface-variant space-y-xs">
          {bottomItems.map((item) => {
            const active = item.match(location.pathname)
            return (
              <NavLink
                key={item.key}
                to={item.path}
                className={linkClass(active)}
                onClick={(e) => {
                  e.preventDefault()
                  navigate(item.path)
                }}
              >
                <span className="material-symbols-outlined">{item.icon}</span>
                <span className="font-label text-label-md">{item.label}</span>
              </NavLink>
            )
          })}

          <button
            type="button"
            className="btn-primary mt-md w-full shadow-sm hover:shadow-lg active:scale-95 transition-all"
            onClick={() => navigate('/tasks/new')}
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              add
            </span>
            新建任务
          </button>

          <div className="flex items-center gap-md px-md py-sm mt-sm">
            <div className="w-8 h-8 rounded-full bg-primary-container text-on-primary-container flex items-center justify-center font-label text-label-sm">
              {userName.charAt(0).toUpperCase()}
            </div>
            <span className="font-body text-body-sm text-on-surface truncate flex-1">{userName}</span>
            <button
              type="button"
              className="text-on-surface-variant hover:text-error transition-colors"
              onClick={() => void handleLogout()}
              title="退出登录"
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>
                logout
              </span>
            </button>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="md:ml-sidebar flex-1 flex flex-col h-full overflow-hidden bg-background">
        <Outlet />
      </main>

      {/* Mobile FAB */}
      <button
        type="button"
        className="md:hidden fixed bottom-lg right-lg w-14 h-14 rounded-full bg-primary text-on-primary shadow-xl flex items-center justify-center z-50 active:scale-90 transition-transform"
        onClick={() => navigate('/tasks/new')}
      >
        <span className="material-symbols-outlined" style={{ fontSize: 28, fontVariationSettings: "'FILL' 1" }}>
          add
        </span>
      </button>
    </div>
  )
}
