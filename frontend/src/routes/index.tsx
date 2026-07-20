import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'
import SidebarLayout from '@/layouts/SidebarLayout'
import LoginPage from '@/pages/LoginPage'

function Placeholder({ title }: { title: string }) {
  return <div className="p-6 font-body text-body-md text-on-surface">{title}</div>
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
