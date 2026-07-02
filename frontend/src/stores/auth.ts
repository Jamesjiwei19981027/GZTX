import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { login as loginApi, register as registerApi, logout as logoutApi, getCurrentUser } from '@/api/auth'
import type { User, LoginRequest, RegisterRequest } from '@/types'
import router from '@/router'

export const useAuthStore = defineStore('auth', () => {
  // 状态
  const user = ref<User | null>(null)
  const accessToken = ref<string | null>(null)
  const refreshToken = ref<string | null>(null)
  const loading = ref(false)

  // 计算属性
  const isLoggedIn = computed(() => !!accessToken.value)
  const userId = computed(() => user.value?.id)
  const nickname = computed(() => user.value?.nickname || user.value?.username || '')

  // 初始化 - 从 localStorage 恢复状态
  function init() {
    const token = localStorage.getItem('access_token')
    const refresh = localStorage.getItem('refresh_token')
    if (token) {
      accessToken.value = token
      refreshToken.value = refresh
    }
  }

  // 订阅 Web Push 通知（登录/注册后自动调用）
  async function setupWebPush() {
    try {
      const { useWebPush } = await import('@/composables/useWebPush')
      const { subscribe: subPush } = useWebPush()
      await subPush()
    } catch {
      // 推送订阅失败不影响登录流程
    }
  }

  // 登录
  async function login(loginData: LoginRequest) {
    loading.value = true
    try {
      const response = await loginApi(loginData)
      accessToken.value = response.access_token
      refreshToken.value = response.refresh_token
      user.value = response.user

      localStorage.setItem('access_token', response.access_token)
      localStorage.setItem('refresh_token', response.refresh_token)

      // 登录即完成推送订阅
      setupWebPush()

      router.push('/tasks')
      return response
    } finally {
      loading.value = false
    }
  }

  // 注册
  async function register(registerData: RegisterRequest) {
    loading.value = true
    try {
      const response = await registerApi(registerData)
      accessToken.value = response.access_token
      refreshToken.value = response.refresh_token
      user.value = response.user

      localStorage.setItem('access_token', response.access_token)
      localStorage.setItem('refresh_token', response.refresh_token)

      // 注册即完成推送订阅
      setupWebPush()

      router.push('/tasks')
      return response
    } finally {
      loading.value = false
    }
  }

  // 登出
  async function logout() {
    try {
      await logoutApi()
    } finally {
      clearAuth()
    }
  }

  // 清除认证状态
  function clearAuth() {
    user.value = null
    accessToken.value = null
    refreshToken.value = null
    localStorage.removeItem('access_token')
    localStorage.removeItem('refresh_token')
    router.push('/login')
  }

  // 获取当前用户信息
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
    isLoggedIn,
    userId,
    nickname,
    init,
    login,
    register,
    logout,
    clearAuth,
    fetchCurrentUser
  }
})