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
  },

  onShow() {
    const token = wx.getStorageSync('access_token')
    if (!token) return
    const header = { Authorization: 'Bearer ' + token }
    wx.request({ url: this.globalData.baseUrl + '/users/me', header, success: (me) => {
      const user = me.statusCode === 200 && me.data && me.data.data
      if (!user || !user.id) return
      wx.request({ url: this.globalData.baseUrl + '/users/me/verification', header, success: (res) => {
        const status = res.statusCode === 200 && res.data && res.data.data
        if (!status || status.phone_verified) return
        const key = 'phone-verification-reminder-start:' + user.id
        const now = Date.now()
        let started = Number(wx.getStorageSync(key))
        if (!started || started > now) { started = now; wx.setStorageSync(key, started) }
        if (now - started >= 7 * 86400000) return
        wx.showModal({ title: '手机号码尚未验证', content: '请绑定手机以保障账号安全。一周内每次开启将提醒，验证后停止。', confirmText: '去绑定', cancelText: '稍后提醒', success: (answer) => {
          if (answer.confirm) wx.switchTab({ url: '/pages/settings/settings' })
        } })
      } })
    } })
  }
})
