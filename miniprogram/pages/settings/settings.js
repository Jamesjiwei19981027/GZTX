const request = require('../../utils/request');

Page({
  data: {
    userInfo: null,
    notifyPrefs: {
      emailEnabled: true,
      wxSubscribeEnabled: true,
      dailyDigestTime: '08:00',
      defaultRemindBefore: 15
    }
  },

  onLoad() {
    this.fetchUserInfo();
  },

  fetchUserInfo() {
    request.get('/users/me', true)
      .then(data => {
        this.setData({
          userInfo: data,
          notifyPrefs: data.notify_pref || this.data.notifyPrefs
        });
      });
  },

  onEmailToggle(e) {
    this.updateNotifyPref('email_enabled', e.detail.value);
  },

  onWxSubscribeToggle(e) {
    this.updateNotifyPref('wx_subscribe_enabled', e.detail.value);
  },

  onDailyDigestChange(e) {
    this.updateNotifyPref('daily_digest_time', e.detail.value);
  },

  onRemindBeforeChange(e) {
    this.updateNotifyPref('default_remind_before', parseInt(e.detail.value));
  },

  updateNotifyPref(key, value) {
    const notifyPrefs = { ...this.data.notifyPrefs, [key]: value };
    request.put('/users/me', {
      notify_pref: notifyPrefs
    }, true).then(() => {
      this.setData({ notifyPrefs });
      wx.showToast({ title: '设置已保存' });
    });
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          wx.removeStorageSync('token');
          wx.removeStorageSync('refresh_token');
          wx.reLaunch({ url: '/pages/index/index' });
        }
      }
    });
  }
});