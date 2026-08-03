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

type ApiBody<T> = {
  code?: number
  message?: string
  data?: T
  detail?: string | { msg?: string; message?: string }[]
}

function extractErrorMessage(body: ApiBody<unknown> | null, status: number): string {
  if (!body) return `HTTP ${status}`
  if (body.message) return body.message
  if (typeof body.detail === 'string') return body.detail
  if (Array.isArray(body.detail)) {
    return body.detail
      .map((d) => (typeof d === 'string' ? d : d.msg || d.message || ''))
      .filter(Boolean)
      .join('; ') || `HTTP ${status}`
  }
  return `HTTP ${status}`
}

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
    throw new ApiError(401, extractErrorMessage(body, 401) || '未登录或登录已过期')
  }
  // ResponseData 成功：HTTP 2xx 且 code===200（注册可能是 201）
  const businessOk = body?.code === undefined || body.code === 200
  if (!res.ok || !businessOk) {
    throw new ApiError(body?.code ?? res.status, extractErrorMessage(body, res.status))
  }
  return body.data as T
}
