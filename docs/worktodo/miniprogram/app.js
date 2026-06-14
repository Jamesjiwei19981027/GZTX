App({
  globalData: {
    userInfo: null,
    token: null,
    apiBase: 'http://localhost:8000/api/v1'
  },
  onLaunch() {
    const token = wx.getStorageSync('token')
    if (token) {
      this.globalData.token = token
    }
  }
})
