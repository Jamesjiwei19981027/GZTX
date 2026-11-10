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

/** 关页/切后台时上报在线状态。sendBeacon 只能 POST，接口是 PUT，所以用 keepalive fetch。 */
export function sendPresenceKeepalive(status: 'online' | 'offline'): boolean {
  const token = getToken()
  if (!token) return false
  try {
    void fetch(`${getApiBase()}/users/me/presence`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ status }),
      keepalive: true,
    })
    return true
  } catch {
    return false
  }
}

export function setToken(token: string | null) {
  if (token) localStorage.setItem(TOKEN_KEY, token)
  else localStorage.removeItem(TOKEN_KEY)
}

export function getRefreshToken(): string | null {
  return localStorage.getItem(REFRESH_KEY)
}

export function setRefreshToken(token: string | null) {
  if (token) localStorage.setItem(REFRESH_KEY, token)
  else localStorage.removeItem(REFRESH_KEY)
}

/** 429：触发后端限流，统一给用户看的中文提示 */
export const RATE_LIMIT_MESSAGE = '操作太频繁，请稍后再试'

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
  detail?: string | { code?: number; msg?: string; message?: string } | { msg?: string; message?: string }[]
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
  if (body.detail && typeof body.detail === 'object') {
    return body.detail.message || body.detail.msg || `HTTP ${status}`
  }
  return `HTTP ${status}`
}

function extractErrorCode(body: ApiBody<unknown> | null, status: number): number {
  if (body?.detail && typeof body.detail === 'object' && !Array.isArray(body.detail) && typeof body.detail.code === 'number') {
    return body.detail.code
  }
  return body?.code ?? status
}

// 单飞刷新：并发多个 401 只发一次 /auth/refresh，其余请求等同一个 Promise
let refreshPromise: Promise<boolean> | null = null

async function tryRefreshToken(): Promise<boolean> {
  const refresh = getRefreshToken()
  if (!refresh) return false
  if (!refreshPromise) {
    refreshPromise = (async () => {
      try {
        const res = await fetch(`${getApiBase()}/auth/refresh`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh_token: refresh }),
        })
        if (!res.ok) return false
        const body = (await res.json()) as ApiBody<{
          access_token?: string
          refresh_token?: string
        }>
        const accessToken = body?.data?.access_token
        if (!accessToken) return false
        setToken(accessToken)
        // 轮换式刷新：后端若下发新 refresh_token 则同步存储（字段不存在时行为不变）
        if (body?.data?.refresh_token) setRefreshToken(body.data.refresh_token)
        return true
      } catch {
        return false
      } finally {
        refreshPromise = null
      }
    })()
  }
  return refreshPromise
}

export async function apiRequest<T>(
  path: string,
  init: RequestInit = {},
): Promise<T> {
  const headers = new Headers(init.headers || {})
  if (
    !headers.has('Content-Type') &&
    init.body &&
    !(typeof FormData !== 'undefined' && init.body instanceof FormData)
  ) {
    headers.set('Content-Type', 'application/json')
  }
  const token = getToken()
  if (token) headers.set('Authorization', `Bearer ${token}`)

  let res = await fetch(`${getApiBase()}${path}`, { ...init, headers })

  // access_token 过期（15 分钟）时用 refresh_token 无感续期并重试一次。
  // /auth/ 下的接口（登录/注册/刷新本身）不参与，避免死循环。
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const refreshed = await tryRefreshToken()
    if (refreshed) {
      headers.set('Authorization', `Bearer ${getToken()}`)
      res = await fetch(`${getApiBase()}${path}`, { ...init, headers })
    }
  }

  if (res.status === 429) {
    throw new ApiError(429, RATE_LIMIT_MESSAGE)
  }

  if (res.status === 204 && res.ok) return undefined as T

  let body: ApiBody<T> | null = null
  try {
    body = (await res.json()) as ApiBody<T>
  } catch {
    throw new ApiError(res.status, `HTTP ${res.status}`)
  }

  if (res.status === 401) {
    setToken(null)
    setRefreshToken(null)
    throw new ApiError(401, extractErrorMessage(body, 401) || '未登录或登录已过期')
  }
  // ResponseData 成功：HTTP 2xx 且 code===200（注册可能是 201）
  const businessOk = body?.code === undefined || body.code === 200
  if (!res.ok || !businessOk) {
    throw new ApiError(extractErrorCode(body, res.status), extractErrorMessage(body, res.status))
  }
  // 与 App 的 ApiClient 一致：有 data 则解包，否则保留原始对象（如 /push/status）。
  return (body && Object.prototype.hasOwnProperty.call(body, 'data') ? body.data : body) as T
}
