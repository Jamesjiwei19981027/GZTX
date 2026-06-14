import axios, { AxiosInstance, AxiosError, InternalAxiosRequestConfig, AxiosResponse } from 'axios'
import { ElMessage } from 'element-plus'
import router from '@/router'
import type { ApiResponse } from '@/types'

// 创建 axios 实例
const request: AxiosInstance = axios.create({
  baseURL: '/api/v1',
  timeout: 30000,
  headers: {
    'Content-Type': 'application/json'
  }
})

// 请求拦截器
request.interceptors.request.use(
  (config: InternalAxiosRequestConfig) => {
    // 从 localStorage 获取 token
    const token = localStorage.getItem('access_token')
    if (token && config.headers) {
      config.headers.Authorization = `Bearer ${token}`
    }
    return config
  },
  (error: AxiosError) => {
    return Promise.reject(error)
  }
)

// 响应拦截器
request.interceptors.response.use(
  (response: AxiosResponse<ApiResponse<unknown>>) => {
    const res = response.data
    // 自动解包：如果后端返回 { code: 200, message: "success", data: {...} }
    // 则直接返回 data 部分
    if (res && res.code === 200 && res.data !== undefined) {
      return res.data as any
    }
    // 如果格式不同，原样返回
    return res as any
  },
  async (error: AxiosError<ApiResponse<unknown>>) => {
    const originalRequest = error.config

    // 处理 401 未授权错误
    if (error.response?.status === 401) {
      const refreshToken = localStorage.getItem('refresh_token')

      // 如果有 refresh_token，尝试刷新 token
      if (refreshToken && originalRequest && !originalRequest.url?.includes('/auth/refresh')) {
        try {
          const response = await axios.post('/api/v1/auth/refresh', {
            refresh_token: refreshToken
          })

          const newToken = response.data.data?.access_token
          if (newToken) {
            localStorage.setItem('access_token', newToken)

            // 重试原请求
            if (originalRequest.headers) {
              originalRequest.headers.Authorization = `Bearer ${newToken}`
            }
            return request(originalRequest)
          }
        } catch (refreshError) {
          // 刷新失败，清除 token 并跳转登录
          localStorage.removeItem('access_token')
          localStorage.removeItem('refresh_token')
          router.push('/login')
          return Promise.reject(refreshError)
        }
      } else {
        // 没有 refresh_token，跳转登录
        localStorage.removeItem('access_token')
        localStorage.removeItem('refresh_token')
        router.push('/login')
      }
    }

    // 处理其他错误
    const errorMessage = error.response?.data?.message || error.message || '请求失败'
    ElMessage.error(errorMessage)

    return Promise.reject(error)
  }
)

export default request
