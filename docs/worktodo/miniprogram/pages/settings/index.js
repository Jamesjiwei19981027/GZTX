// 设置页面
const app = getApp()
const request = require('../../utils/request')

Page({
  data: {
    userInfo: null,
    notifyEnabled: true,
    dailyDigestEnabled: true,
    dailyDigestTime: '08:00',
    version: '1.0.0'
  },

  onLoad() {
    this.setData({
      userInfo: app.globalData.userInfo
    })
    this.loadUserSettings()
  },

  onShow() {
    this.setData({
      userInfo: app.globalData.userInfo
    })
  },

  async loadUserSettings() {
    try {
      const user = await request.get('/users/me')
      this.setData({
        notifyEnabled: user.notify_pref.wx_subscribe_enabled,
        dailyDigestEnabled: user.notify_pref.daily_digest_enabled,
        dailyDigestTime: user.notify_pref.daily_digest_time || '08:00'
      })
    } catch (err) {
      console.error('加载设置失败:', err)
    }
  },

  // 跳转到登录页
  goToLogin() {
    if (!app.globalData.token) {
      wx.navigateTo({
        url: '/pages/login/index'
      })
    }
  },

  // 登出
  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          app.clearLoginData()
          wx.reLaunch({
            url: '/pages/index/index'
          })
        }
      }
    })
  },

  // 切换通知
  onNotifyToggle(e) {
    const enabled = e.detail.value
    this.setData({ notifyEnabled: enabled })
    this.updateNotifySetting(enabled)
  },

  // 切换每日摘要
  onDailyDigestToggle(e) {
    const enabled = e.detail.value
    this.setData({ dailyDigestEnabled: enabled })
    this.updateDailyDigestSetting(enabled)
  },

  // 更新时间
  onDigestTimeChange(e) {
    this.setData({
      dailyDigestTime: e.detail.value
    })
    this.updateDailyDigestSetting(this.data.dailyDigestEnabled, e.detail.value)
  },

  // 更新通知设置
  async updateNotifySetting(enabled) {
    try {
      await request.put('/users/me', {
        notify_pref: {
          wx_subscribe_enabled: enabled
        }
      })
      wx.showToast({ title: '设置已保存' })
    } catch (err) {
      wx.showToast({
        title: '设置失败',
        icon: 'none'
      })
    }
  },

  // 更新每日摘要设置
  async updateDailyDigestSetting(enabled, time) {
    try {
      await request.put('/users/me', {
        notify_pref: {
          daily_digest_enabled: enabled,
          daily_digest_time: time || this.data.dailyDigestTime
        }
      })
      wx.showToast({ title: '设置已保存' })
    } catch (err) {
      wx.showToast({
        title: '设置失败',
        icon: 'none'
      })
    }
  },

  // 清除缓存
  onClearCache() {
    wx.showModal({
      title: '确认清除',
      content: '确定要清除本地缓存吗？',
      success: (res) => {
        if (res.confirm) {
          wx.clearStorageSync()
          wx.showToast({ title: '缓存已清除' })
        }
      }
    })
  },

  // 关于我们
  onAbout() {
    wx.showModal({
      title: '关于',
      content: '工作待办提醒系统 v1.0.0\n一个简洁高效的待办管理小程序',
      showCancel: false
    })
  }
})