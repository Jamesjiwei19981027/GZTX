import { apiRequest, setRefreshToken, setToken } from './client'

export type BackendUser = {
  id: number
  username?: string
  nickname?: string
  email?: string
  avatar_url?: string
}

export async function loginPassword(username: string, password: string) {
  const data = await apiRequest<{
    access_token: string
    refresh_token?: string
    user?: BackendUser
  }>('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
  })
  setToken(data.access_token)
  if (data.refresh_token) setRefreshToken(data.refresh_token)
  return data
}

export async function fetchMe() {
  return apiRequest<BackendUser>('/users/me')
}

export async function logout() {
  try {
    await apiRequest('/auth/logout', { method: 'POST', body: '{}' })
  } catch {
    /* ignore */
  }
  setToken(null)
  setRefreshToken(null)
}
