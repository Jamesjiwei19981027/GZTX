import axios, {
  type AxiosInstance,
  type AxiosError,
  type AxiosRequestConfig,
  type InternalAxiosRequestConfig,
  type AxiosResponse,
} from 'axios'
import type { ApiResponse } from '@/types'

/** 业务错误（HTTP 成功但 code !== 200，或显式业务失败） */
export class ApiBusinessError extends Error {
  code: number
  detail?: unknown

  constructor(code: number, message: string, detail?: unknown) {
    super(message)
    this.name = 'ApiBusinessError'
    this.code = code
    this.detail = detail
  }
}

const TOKEN_KEY = 'access_token'
const REFRESH_TOKEN_KEY = 'refresh_token'

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

// 创建 axios 实例（与 Vue archive 对齐）
const rawRequest: AxiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_BASE || '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json',
  },
})

// 请求拦截器
rawRequest.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    const token = getToken()
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => Promise.reject(error),
)

/** 并发 401 共用一次 refresh，避免多次刷新/跳登录 */
let refreshPromise: Promise<string | null> | null = null

async function refreshAccessToken(): Promise<string | null> {
  if (refreshPromise) return refreshPromise

  refreshPromise = (async () => {
    const refreshToken = localStorage.getItem(REFRESH_TOKEN_KEY)
    if (!refreshToken) return null

    try {
      const base = import.meta.env.VITE_API_BASE || '/api/v1'
      const response = await axios.post<ApiResponse<{ access_token: string; expires_in?: number }>>(
        `${base}/auth/refresh`,
        { refresh_token: refreshToken },
      )
      const body = response.data
      const newToken = body?.code === 200 ? body.data?.access_token : undefined
      if (newToken) {
        setToken(newToken)
        return newToken
      }
      return null
    } catch {
      return null
    } finally {
      refreshPromise = null
    }
  })()

  return refreshPromise
}

function clearAuthAndRedirect() {
  setToken(null)
  localStorage.removeItem(REFRESH_TOKEN_KEY)
  if (!window.location.pathname.startsWith('/login')) {
    window.location.assign('/login')
  }
}

function extractErrorMessage(
  error: AxiosError<ApiResponse<unknown> | { detail?: unknown }>,
): string {
  const data = error.response?.data as
    | (ApiResponse<unknown> & { detail?: unknown })
    | undefined
  if (!data) return error.message || '请求失败'

  if (typeof data.message === 'string' && data.message) return data.message

  const detail = data.detail
  if (typeof detail === 'string' && detail) return detail
  if (detail && typeof detail === 'object') {
    const d = detail as { message?: string; error?: string }
    if (d.message) return d.message
    if (d.error) return d.error
  }

  return error.message || '请求失败'
}

// 响应拦截器：解包 { code, message, data } → 返回 data（可为 null）
// 与 archive 一致：仅 code === 200 视为成功（不用 code === 0）
// eslint-disable-next-line @typescript-eslint/no-explicit-any -- 拦截器返回解包后的 data，非 AxiosResponse
rawRequest.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    const res = response.data

    // 非统一信封（极少见），原样返回
    if (res == null || typeof res !== 'object' || !('code' in res)) {
      return res as any
    }

    if (res.code === 200) {
      // data 缺省时返回 null，与 Promise<T | null> 调用方约定一致
      return (res.data !== undefined ? res.data : null) as any
    }

    const message = res.message || '请求失败'
    return Promise.reject(new ApiBusinessError(res.code, message, res.detail))
  },
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const originalRequest = error.config as
      | (InternalAxiosRequestConfig & { _retry?: boolean })
      | undefined

    if (error.response?.status === 401 && originalRequest && !originalRequest._retry) {
      // 刷新接口自身 401：直接登出
      if (originalRequest.url?.includes('/auth/refresh')) {
        clearAuthAndRedirect()
        return Promise.reject(error)
      }

      originalRequest._retry = true
      const newToken = await refreshAccessToken()
      if (newToken) {
        if (originalRequest.headers) {
          originalRequest.headers.Authorization = `Bearer ${newToken}`
        }
        return rawRequest(originalRequest)
      }

      clearAuthAndRedirect()
      return Promise.reject(error)
    }

    return Promise.reject(error)
  },
)

/**
 * 类型声明：响应拦截器已解包 data，调用方拿到的是 T 而不是 AxiosResponse<T>。
 * 后端仅返回 message、无 data 时，运行时为 null。
 */
export interface RequestClient {
  get<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
  delete<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
  head<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
  options<T = unknown>(url: string, config?: AxiosRequestConfig): Promise<T>
  post<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  put<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  patch<T = unknown>(url: string, data?: unknown, config?: AxiosRequestConfig): Promise<T>
  (config: AxiosRequestConfig): Promise<unknown>
}

const request = rawRequest as unknown as RequestClient

export default request

/** 从 catch 中取出可读错误文案 */
export function getErrorMessage(error: unknown, fallback = '操作失败'): string {
  if (error instanceof ApiBusinessError) return error.message
  if (axios.isAxiosError(error)) return extractErrorMessage(error)
  if (error instanceof Error && error.message) return error.message
  return fallback
}
