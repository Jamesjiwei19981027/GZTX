/**
 * 微信小程序请求封装
 */
const app = getApp()

// 单飞刷新：并发多个 401 只发一次 /auth/refresh
let refreshPromise = null

function tryRefreshToken() {
  const refreshToken = wx.getStorageSync('refresh_token')
  if (!refreshToken) return Promise.resolve(false)
  if (!refreshPromise) {
    refreshPromise = new Promise((resolve) => {
      wx.request({
        url: app.globalData.baseUrl + '/auth/refresh',
        method: 'POST',
        data: { refresh_token: refreshToken },
        header: { 'Content-Type': 'application/json' },
        success(res) {
          const accessToken =
            res.statusCode >= 200 && res.statusCode < 300 &&
            res.data && res.data.data && res.data.data.access_token
          if (accessToken) {
            app.globalData.token = accessToken
            wx.setStorageSync('access_token', accessToken)
            // 轮换式刷新：后端若下发新 refresh_token 则同步存储（字段不存在时行为不变）
            var newRefreshToken = res.data.data.refresh_token
            if (newRefreshToken) wx.setStorageSync('refresh_token', newRefreshToken)
            resolve(true)
          } else {
            resolve(false)
          }
        },
        fail() {
          resolve(false)
        },
        complete() {
          refreshPromise = null
        }
      })
    })
  }
  return refreshPromise
}

function clearAuthAndRedirect() {
  wx.removeStorageSync('access_token')
  wx.removeStorageSync('refresh_token')
  app.globalData.token = ''
  wx.redirectTo({ url: '/pages/login/login' })
}

function request(options, isRetry) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.baseUrl + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'X-Client-Channel': 'miniprogram',
        'Authorization': app.globalData.token ? 'Bearer ' + app.globalData.token : ''
      },
      success(res) {
        // 2xx 一律算成功：后端 POST /tasks 返回 201，只认 200 会把
        // 「创建成功」判成失败——任务其实已经建好了，用户没收到反馈就重复点。
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // access_token 15 分钟过期：先用 refresh_token 无感续期并重试一次；
          // 刷新失败（或重试仍 401）才清 token、回登录页，与 Web 端口径一致。
          const isAuthPath = (options.url || '').indexOf('/auth/') === 0
          if (isRetry || isAuthPath) {
            clearAuthAndRedirect()
            reject(new Error('未登录'))
            return
          }
          tryRefreshToken().then((ok) => {
            if (ok) {
              request(options, true).then(resolve, reject)
            } else {
              clearAuthAndRedirect()
              reject(new Error('未登录'))
            }
          })
        } else {
          // 后端错误信封有两种形状：{detail:{message}} 与 {message}
          const body = res.data || {}
          const detail = body.detail
          const message =
            (detail && (detail.message || detail.msg)) ||
            (typeof detail === 'string' ? detail : '') ||
            body.message ||
            '请求失败'
          reject(new Error(message))
        }
      },
      fail(err) {
        wx.showToast({ title: '网络异常', icon: 'none' })
        reject(err)
      }
    })
  })
}

// 快捷方法
function get(url, data) {
  return request({ url, method: 'GET', data })
}

function post(url, data) {
  return request({ url, method: 'POST', data })
}

function put(url, data) {
  return request({ url, method: 'PUT', data })
}

// 后端「完成任务」等接口是 PATCH（见 backend/app/api/v1/tasks.py）
function patch(url, data) {
  return request({ url, method: 'PATCH', data })
}

function del(url, data) {
  return request({ url, method: 'DELETE', data })
}

module.exports = { request, get, post, put, patch, del }
