import { Navigate, useLocation } from 'react-router-dom'
import { getToken } from '@/api/request'

export function RequireAuth({ children }: { children: React.ReactNode }) {
  const loc = useLocation()
  if (!getToken()) {
    return <Navigate to="/login" replace state={{ from: loc }} />
  }
  return <>{children}</>
}
