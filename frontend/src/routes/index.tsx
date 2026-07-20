import { createBrowserRouter, Navigate } from 'react-router-dom'
import { RequireAuth } from './RequireAuth'
import SidebarLayout from '@/layouts/SidebarLayout'
import LoginPage from '@/pages/LoginPage'
import DashboardPage from '@/pages/DashboardPage'
import TaskListPage from '@/pages/TaskListPage'
import TaskDetailPage from '@/pages/TaskDetailPage'
import CalendarPage from '@/pages/CalendarPage'
import SettingsPage from '@/pages/SettingsPage'
import ProjectListPage from '@/pages/ProjectListPage'
import ProjectDetailPage from '@/pages/ProjectDetailPage'
import CompanySettingsPage from '@/pages/CompanySettingsPage'

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
      { path: 'dashboard', element: <DashboardPage /> },
      { path: 'tasks', element: <TaskListPage /> },
      { path: 'tasks/new', element: <TaskDetailPage /> },
      { path: 'tasks/:id', element: <TaskDetailPage /> },
      { path: 'calendar', element: <CalendarPage /> },
      { path: 'settings', element: <SettingsPage /> },
      { path: 'projects', element: <ProjectListPage /> },
      { path: 'projects/:id', element: <ProjectDetailPage /> },
      { path: 'company/settings', element: <CompanySettingsPage /> },
      { path: 'inbox', element: <Navigate to="/dashboard" replace /> },
      { path: 'kanban', element: <Navigate to="/tasks" replace /> },
      { path: 'chat', element: <Navigate to="/dashboard" replace /> },
    ],
  },
])
