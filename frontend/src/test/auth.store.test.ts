import { describe, it, expect, beforeEach, vi } from 'vitest'
import { selectNickname, useAuthStore } from '@/stores/auth'
import { setToken } from '@/api/request'

vi.mock('@/api/auth', () => ({
  login: vi.fn(),
  register: vi.fn(),
  getCurrentUser: vi.fn(),
  logout: vi.fn().mockResolvedValue(undefined),
}))

describe('auth store basics', () => {
  beforeEach(() => {
    localStorage.clear()
    useAuthStore.setState({
      token: null,
      user: null,
      loading: false,
      lastCompanyJoin: null,
    })
  })

  it('selectNickname prefers nickname then username', () => {
    expect(selectNickname(null)).toBe('')
    expect(
      selectNickname({
        id: 1,
        username: 'alice',
        nickname: 'Alice',
        created_at: '',
      }),
    ).toBe('Alice')
    expect(
      selectNickname({
        id: 2,
        username: 'bob',
        nickname: '',
        created_at: '',
      }),
    ).toBe('bob')
  })

  it('logout clears token and user', async () => {
    setToken('tok-1')
    useAuthStore.setState({
      token: 'tok-1',
      user: { id: 1, username: 'u', nickname: 'N', created_at: '' },
    })

    await useAuthStore.getState().logout()

    expect(useAuthStore.getState().token).toBeNull()
    expect(useAuthStore.getState().user).toBeNull()
    expect(localStorage.getItem('access_token')).toBeNull()
  })

  it('fetchCurrentUser returns null without token', async () => {
    const user = await useAuthStore.getState().fetchCurrentUser()
    expect(user).toBeNull()
    expect(useAuthStore.getState().token).toBeNull()
  })
})
