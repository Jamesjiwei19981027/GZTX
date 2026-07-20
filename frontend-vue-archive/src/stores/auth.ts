import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { ElMessage } from 'element-plus'
import { login as loginApi, register as registerApi, logout as logoutApi, getCurrentUser } from '@/api/auth'
import type { User, LoginRequest, RegisterRequest, AuthResponse, CompanyJoinInfo } from '@/types'
import router from '@/router'
import {
  clearCompanyContext,
  ensureCompanyContext,
  setCompanyId,
} from '@/composables/useCompanyContext'

function joinMessage(cj: CompanyJoinInfo | undefined): { type: 'success' | 'info' | 'warning'; text: string } | null {
  if (!cj) return null
  if (cj.joined) {
    const slug = cj.company_slug ? `（${cj.company_slug}）` : ''
    return { type: 'success', text: `注册成功，已加入默认公司${slug}` }
  }
  const reason = cj.reason || ''
  if (reason === 'company_locked') {
    return {
      type: 'warning',
      text: '账号已创建，但公司尚未解锁 License，暂未加入组织。请联系管理员。',
    }
  }
  if (reason === 'no_default_company') {
    return {
      type: 'info',
      text: '账号已创建（个人模式）。管理员开通公司后可加入协作。',
    }
  }
  if (reason === 'not_single_company') {
    return { type: 'success', text: '注册成功' }
  }
  if (reason) {
    return { type: 'info', text: `注册成功（未自动入会：${reason}）` }
  }
  return { type: 'success', text: '注册成功' }
}

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const loading = ref(false)
  /** 最近一次注册的入会结果，供 UI 展示 */
  const lastCompanyJoin = ref<CompanyJoinInfo | null>(null)

  const isLoggedIn = computed(() => !!accessToken.value)
  const userId = computed(() => user.value?.id)
  const nickname = computed(() => user.value?.nickname || user.value?.username || '')

  function init() {
    const token = localStorage.getItem('access_token')
    const refresh = localStorage.getItem('refresh_token')
    if (token) {
      accessToken.value = token
      refreshToken.value = refresh
    }
  }

  async function setupWebPush() {
    try {
      const { useWebPush } = await import('@/composables/useWebPush')
      const { subscribe: subPush } = useWebPush()
      await subPush()
    } catch {
      // 推送订阅失败不影响登录流程
    }
  }

  function applyAuth(response: AuthResponse) {
    accessToken.value = response.access_token
    refreshToken.value = response.refresh_token
    user.value = response.user
    localStorage.setItem('access_token', response.access_token)
    localStorage.setItem('refresh_token', response.refresh_token)
  }

  async function login(loginData: LoginRequest) {
    loading.value = true
    try {
      const response = await loginApi(loginData)
      applyAuth(response)
      setupWebPush()
      await ensureCompanyContext(true)
      router.push('/dashboard')
      return response
    } finally {
      loading.value = false
    }
  }

  async function register(registerData: RegisterRequest) {
    loading.value = true
    try {
      const response = await registerApi(registerData)
      applyAuth(response)

      const cj = response.company_join
      lastCompanyJoin.value = cj || null
      if (cj?.joined && cj.company_id) {
        setCompanyId(cj.company_id)
      }

      const tip = joinMessage(cj)
      if (tip) {
        ElMessage[tip.type](tip.text)
      } else {
        ElMessage.success('注册成功')
      }

      setupWebPush()
      await ensureCompanyContext(true)
      router.push('/dashboard')
      return response
    } finally {
      loading.value = false
    }
  }

  async function logout() {
    try {
      await logoutApi()
    } finally {
      clearAuth()
    }
  }

  function clearAuth() {
    user.value = null
    accessToken.value = null
    refreshToken.value = null
    lastCompanyJoin.value = null
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    clearCompanyContext()
    router.push('/login')
  }

  async function fetchCurrentUser() {
    if (!accessToken.value) return null
    try {
      const response = await getCurrentUser()
      user.value = response
      return response
    } catch {
      clearAuth()
      return null
    }
  }

  return {
    user,
    accessToken,
    refreshToken,
    loading,
    lastCompanyJoin,
    isLoggedIn,
    userId,
    nickname,
    init,
    login,
    register,
    logout,
    clearAuth,
    fetchCurrentUser,
  }
})
