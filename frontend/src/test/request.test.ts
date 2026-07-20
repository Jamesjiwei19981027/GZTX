import { describe, it, expect, beforeEach } from 'vitest'
import axios from 'axios'
import {
  getErrorMessage,
  setToken,
  getToken,
  ApiBusinessError,
} from '@/api/request'
import type { InternalAxiosRequestConfig } from 'axios'

describe('request helpers', () => {
  beforeEach(() => {
    localStorage.clear()
  })

  it('setToken/getToken', () => {
    setToken('abc')
    expect(getToken()).toBe('abc')
    setToken(null)
    expect(getToken()).toBeNull()
  })

  it('getErrorMessage reads detail.message from AxiosError', () => {
    const err = new axios.AxiosError(
      'Request failed',
      'ERR_BAD_REQUEST',
      undefined,
      undefined,
      {
        status: 403,
        statusText: 'Forbidden',
        headers: {},
        config: {} as InternalAxiosRequestConfig,
        data: { detail: { message: '无权限操作' } },
      },
    )
    expect(getErrorMessage(err)).toBe('无权限操作')
  })

  it('getErrorMessage reads ApiBusinessError message', () => {
    const err = new ApiBusinessError(400, '业务失败')
    expect(getErrorMessage(err)).toBe('业务失败')
  })

  it('getErrorMessage falls back for unknown errors', () => {
    expect(getErrorMessage({}, '默认文案')).toBe('默认文案')
  })
})
