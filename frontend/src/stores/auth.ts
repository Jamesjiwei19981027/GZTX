import { create } from 'zustand'
import { message } from 'antd'
import {
  login as loginApi,
  register as registerApi,
  getCurrentUser,
  logout as logoutApi,
} from '@/api/auth'
import { getToken, setToken } from '@/api/request'
import type {
  User,
  LoginRequest,
  RegisterRequest,
  AuthResponse,
  CompanyJoinInfo,
} from '@/types'

const REFRESH_TOKEN_KEY = 'refresh_token'

function joinMessage(
  cj: CompanyJoinInfo | undefined,
): { type: 'success' | 'info' | 'warning'; text: string } | null {
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

function applyAuthTokens(response: AuthResponse) {
  setToken(response.access_token)
  if (response.refresh_token) {
    localStorage.setItem(REFRESH_TOKEN_KEY, response.refresh_token)
  }
}

function clearLocalAuth() {
  setToken(null)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
}

type AuthState = {
  token: string | null
  user: User | null
  loading: boolean
  lastCompanyJoin: CompanyJoinInfo | null
  login: (username: string, password: string) => Promise<void>
  register: (payload: RegisterRequest | Record<string, unknown>) => Promise<void>
  logout: () => Promise<void>
  fetchCurrentUser: () => Promise<User | null>
}

export const useAuthStore = create<AuthState>((set) => ({
  token: getToken(),
  user: null,
  loading: false,
  lastCompanyJoin: null,

  async login(username, password) {
    set({ loading: true })
    try {
      const data: LoginRequest = { username, password }
      const response = await loginApi(data)
      applyAuthTokens(response)
      set({
        token: response.access_token,
        user: response.user,
      })
    } finally {
      set({ loading: false })
    }
  },

  async register(payload) {
    set({ loading: true })
    try {
      const response = await registerApi(payload as RegisterRequest)
      applyAuthTokens(response)

      const cj = response.company_join
      set({
        token: response.access_token,
        user: response.user,
        lastCompanyJoin: cj || null,
      })

      const tip = joinMessage(cj)
      if (tip) {
        message[tip.type](tip.text)
      } else {
        message.success('注册成功')
      }
    } finally {
      set({ loading: false })
    }
  },

  async logout() {
    try {
      await logoutApi()
    } catch {
      /* ignore network/logout API errors */
    }
    clearLocalAuth()
    set({ token: null, user: null, lastCompanyJoin: null })
  },

  async fetchCurrentUser() {
    const token = getToken()
    if (!token) {
      set({ token: null, user: null })
      return null
    }
    try {
      const user = await getCurrentUser()
      set({ user, token })
      return user
    } catch {
      clearLocalAuth()
      set({ token: null, user: null })
      return null
    }
  },
}))

/** Display nickname helper (archive nickname computed) */
export function selectNickname(user: User | null): string {
  if (!user) return ''
  return user.nickname || user.username || ''
}
