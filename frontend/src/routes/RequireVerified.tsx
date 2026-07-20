import { useEffect } from 'react'
import { Navigate } from 'react-router-dom'
import { useAuthStore } from '@/stores/auth'

/**
 * 受限态守卫：已登录但未完成邮箱+手机双验证 → 跳转 /verify。
 * user 未加载完成前不拦截（由页面正常渲染，后端 40320 兜底）。
 */
export function RequireVerified({ children }: { children: React.ReactNode }) {
  const user = useAuthStore((s) => s.user)
  const fetchCurrentUser = useAuthStore((s) => s.fetchCurrentUser)

  useEffect(() => {
    if (!user) void fetchCurrentUser()
  }, [user, fetchCurrentUser])

  if (user && !(user.email_verified && user.phone_verified)) {
    return <Navigate to="/verify" replace />
  }
  return <>{children}</>
}
