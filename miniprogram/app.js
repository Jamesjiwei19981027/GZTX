// app.js
App({
  globalData: {
    // 【发布位】换成微信公众平台已配置的 HTTPS 合法域名，例如 https://app.example.com/api/v1
    baseUrl: 'https://your-domain.com/api/v1',
    // 【发布位】Web 端地址（设置页「复制 Web 地址」）；留空时取 baseUrl 的域名部分
    webUrl: '',
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
