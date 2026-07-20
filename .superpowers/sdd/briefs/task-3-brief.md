## Task 3: P0/P1 鈥?Auth store銆佽矾鐢便€丩ayout銆佺櫥褰曟敞鍐?
**Files:**
- Create: `frontend/src/stores/auth.ts`
- Create: `frontend/src/routes/index.tsx`, `RequireAuth.tsx`
- Create: `frontend/src/layouts/SidebarLayout.tsx`
- Create: `frontend/src/pages/LoginPage.tsx`
- Modify: `frontend/src/App.tsx`

**Interfaces:**
- Produces `useAuthStore`:
  - `token: string | null`
  - `user: User | null`
  - `login(username, password): Promise<void>`
  - `register(...): Promise<void>`
  - `logout(): Promise<void>`
  - `fetchCurrentUser(): Promise<void>`

- [ ] **Step 1: auth store**

```typescript
// frontend/src/stores/auth.ts
import { create } from 'zustand'
import { login as loginApi, register as registerApi, getMe, logout as logoutApi } from '@/api/auth'
import { getToken, setToken } from '@/api/request'
import type { User } from '@/types'

type AuthState = {
  token: string | null
  user: User | null
  login: (username: string, password: string) => Promise<void>
  register: (payload: Record<string, unknown>) => Promise<void>
  logout: () => Promise<void>
  fetchCurrentUser: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getToken(),
  user: null,
  async login(username, password) {
    const data = await loginApi({ username, password })
    // 瀵归綈 archive锛歛ccess_token 瀛楁鍚嶄互 api 杩斿洖涓哄噯
    const token = (data as { access_token: string }).access_token
    setToken(token)
    set({ token })
    const user = await getMe()
    set({ user })
  },
  async register(payload) {
    await registerApi(payload as never)
  },
  async logout() {
    try {
      await logoutApi()
    } catch {
      /* ignore */
    }
    setToken(null)
    set({ token: null, user: null })
  },
  async fetchCurrentUser() {
    const user = await getMe()
    set({ user, token: getToken() })
  },
}))
```

> `loginApi` / `getMe` 绛惧悕浠ヨ縼绉诲悗鐨?`api/auth.ts` 涓哄噯銆?
- [ ] **Step 2: RequireAuth**

```tsx
// frontend/src/routes/RequireAuth.tsx
import { Navigate, useLocation } from 'react-router-dom'
import { getToken } from '@/api/request'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: loc }} />
  }
  return <>{children}</>
}
```

- [ ] **Step 3: 璺敱琛紙瀵归綈 archive router锛?*

```tsx
// frontend/src/routes/index.tsx
import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'
import SidebarLayout from '@/layouts/SidebarLayout'
import LoginPage from '@/pages/LoginPage'
// 鍚庣画椤甸潰鍏?placeholder锛屽啀鎸?Task 鏇挎崲

function Placeholder({ title }: { title: string }) {
  return <div className="p-6">{title}</div>
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  { path: '/register', element: <LoginPage register /> },
  {
    path: '/',
    element: (
      <RequireAuth>
        <SidebarLayout />
      </RequireAuth>
    ),
    children: [
      { index: true, element: <Navigate to="/dashboard" replace /> },
      { path: 'dashboard', element: <Placeholder title="Dashboard" /> },
      { path: 'tasks', element: <Placeholder title="Tasks" /> },
      { path: 'tasks/new', element: <Placeholder title="TaskCreate" /> },
      { path: 'tasks/:id', element: <Placeholder title="TaskDetail" /> },
      { path: 'calendar', element: <Placeholder title="Calendar" /> },
      { path: 'settings', element: <Placeholder title="Settings" /> },
      { path: 'projects', element: <Placeholder title="Projects" /> },
      { path: 'projects/:id', element: <Placeholder title="ProjectDetail" /> },
      { path: 'company/settings', element: <Placeholder title="CompanySettings" /> },
      { path: 'inbox', element: <Navigate to="/dashboard" replace /> },
      { path: 'kanban', element: <Navigate to="/tasks" replace /> },
      { path: 'chat', element: <Navigate to="/dashboard" replace /> },
    ],
  },
])
```

- [ ] **Step 4: App 鎸傝浇 RouterProvider**

```tsx
import { RouterProvider } from 'react-router-dom'
import { router } from '@/routes'

export default function App() {
  return <RouterProvider router={router} />
}
```

- [ ] **Step 5: SidebarLayout**

瀵圭収 `frontend-vue-archive/src/layouts/SidebarLayout.vue`锛氬鑸」 dashboard/tasks/calendar/projects/settings/company锛沗<Outlet />`锛涢€€鍑鸿皟鐢?`useAuthStore().logout` 鍚?`navigate('/login')`銆?
- [ ] **Step 6: LoginPage**

瀵圭収 `LoginView.vue`锛氱櫥褰曡〃鍗曪紱`register` prop 鏃舵樉绀烘敞鍐屽瓧娈典笌 company_join 鎻愮ず锛涙垚鍔熷悗 `navigate('/dashboard')`銆?
- [ ] **Step 7: 鎵嬪伐楠岃瘉**

```bash
# 缁堢 1
cd backend && uvicorn app.main:app --reload
# 缁堢 2
cd frontend && npm run dev
```

Expected: 鏃?token 璁块棶 `/dashboard` 鈫?`/login`锛涚櫥褰曟垚鍔熻繘澹炽€?
- [ ] **Step 8: Commit**

```bash
git commit -am "feat(frontend): auth store, router guards, layout, login/register"
```

---

