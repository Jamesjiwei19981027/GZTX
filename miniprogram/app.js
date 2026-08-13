// app.js
App({
  globalData: {
    // 后端 API 基址：开发环境见 README「配置后端 API」，生产填 HTTPS 域名
    baseUrl: 'https://your-domain.com/api/v1',
    // Web 端地址（设置页「复制 Web 地址」用）；留空时取 baseUrl 的域名部分
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
