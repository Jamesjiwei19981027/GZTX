// app.js
App({
  globalData: {
    baseUrl: 'https://your-domain.com/api/v1',
    token: '',
    userInfo: null
  },

  onLaunch() {
    // 检查登录状态
    const token = wx.getStorageSync('access_token')
    if (token) {
      this.globalData.token = token
    }
  }
})
