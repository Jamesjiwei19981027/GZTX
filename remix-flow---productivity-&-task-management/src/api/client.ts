/**
 * 与现有 GZTX 后端 `/api/v1` 对接的轻量客户端（无 axios 依赖）。
 * 约定：HTTP 200 + body.code === 200 为成功，data 为业务载荷。
 */

const TOKEN_KEY = 'access_token'
const REFRESH_KEY = 'refresh_token'

export function getApiBase(): string {
  return (import.meta as ImportMeta & { env: Record<string, string> }).env
    ?.VITE_API_BASE || '/api/v1'
}

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY)
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function setRefreshToken(token: string | null) {
  if (token) localStorage.setItem(REFRESH_KEY, token)
  else localStorage.removeItem(REFRESH_KEY)
}

export class ApiError extends Error {
  code: number
  constructor(code: number, message: string) {
    super(message)
    this.code = code
    this.name = 'ApiError'
  }
}

type ApiBody<T> = { code: number; message?: string; data?: T }

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (!headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  const res = await fetch(`${getApiBase()}${path}`, { ...init, headers })
  let body: ApiBody<T> | null = null
  try {
    body = (await res.json()) as ApiBody<T>
  } catch {
    throw new ApiError(res.status, `HTTP ${res.status}`)
  }

  if (res.status === 401) {
    setToken(null)
    throw new ApiError(401, body?.message || '未登录或登录已过期')
  }
  if (!res.ok || body.code !== 200) {
    throw new ApiError(body.code ?? res.status, body.message || '请求失败')
  }
  return body.data as T
}
