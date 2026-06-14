// 登录页面
const app = getApp()
const request = require('../../utils/request')

Page({
  data: {
    logging: false
  },

  onLoad() {
    // 如果已登录，直接跳转
    if (app.globalData.token) {
      wx.navigateBack()
    }
  },

  // 微信授权登录
  onWxLogin() {
    if (this.data.logging) return

    this.setData({ logging: true })

    wx.showLoading({ title: '登录中...' })

    // 第一步：获取微信登录凭证
    wx.login({
      success: async (loginRes) => {
        if (!loginRes.code) {
          this.setData({ logging: false })
          wx.hideLoading()
          wx.showToast({
            title: '获取登录凭证失败',
            icon: 'none'
          })
          return
        }

        try {
          // 第二步：将 code 发送到后端
          const res = await request.post('/auth/wx-login', { code: loginRes.code })

          // 第三步：保存登录信息
          app.setLoginData(res.access_token, res.user)

          wx.hideLoading()
          wx.showToast({ title: '登录成功' })

          // 跳转回上一页或首页
          setTimeout(() => {
            wx.navigateBack()
          }, 1500)
        } catch (err) {
          this.setData({ logging: false })
          wx.hideLoading()
          wx.showToast({
            title: err.message || '登录失败',
            icon: 'none'
          })
        }
      },
      fail: (err) => {
        this.setData({ logging: false })
        wx.hideLoading()
        wx.showToast({
          title: '微信登录失败',
          icon: 'none'
        })
      }
    })
  }
})