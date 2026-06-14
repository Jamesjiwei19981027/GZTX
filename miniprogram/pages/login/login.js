// pages/login/login.js
const { post } = require('../../utils/request')
const app = getApp()

Page({
  data: {
    loading: false
  },

  async onWxLogin() {
    this.setData({ loading: true })
    try {
      const { code } = await wx.login()
      const res = await post('/auth/wx-login', { code })
      const data = res.data
      app.globalData.token = data.access_token
      app.globalData.userInfo = data.user
      wx.setStorageSync('access_token', data.access_token)
      wx.setStorageSync('refresh_token', data.refresh_token)
      wx.switchTab({ url: '/pages/index/index' })
    } catch {
      wx.showToast({ title: '登录失败', icon: 'none' })
    } finally {
      this.setData({ loading: false })
    }
  }
})
