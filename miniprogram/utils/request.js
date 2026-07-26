/**
 * 微信小程序请求封装
 */
const app = getApp()

function request(options) {
  return new Promise((resolve, reject) => {
    wx.request({
      url: app.globalData.baseUrl + options.url,
      method: options.method || 'GET',
      data: options.data || {},
      header: {
        'Content-Type': 'application/json',
        'Authorization': app.globalData.token ? 'Bearer ' + app.globalData.token : ''
      },
      success(res) {
        // 2xx 一律算成功：后端 POST /tasks 返回 201，只认 200 会把
        // 「创建成功」判成失败——任务其实已经建好了，用户没收到反馈就重复点。
        if (res.statusCode >= 200 && res.statusCode < 300) {
          resolve(res.data)
        } else if (res.statusCode === 401) {
          // Token 过期，跳转登录
          wx.removeStorageSync('access_token')
          wx.redirectTo({ url: '/pages/login/login' })
          reject(new Error('未登录'))
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

function del(url, data) {
  return request({ url, method: 'DELETE', data })
}

module.exports = { request, get, post, put, del }
