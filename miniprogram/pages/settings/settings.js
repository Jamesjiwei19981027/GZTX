const request = require('../../utils/request');

Page({
  data: {
    userInfo: null,
    notifyPrefs: {
      emailEnabled: true,
      wxSubscribeEnabled: true,
      dailyDigestTime: '08:00',
      defaultRemindBefore: 15
    },
    verification: { email: '', phone: '', email_verified: false, phone_verified: false },
    showEmailVerify: false,
    verifyEmail: '',
    verifyEmailCode: '',
    emailCodeCountdown: 0
  },

  onLoad() {
    this.fetchUserInfo();
    this.fetchVerification();
  },

  onUnload() {
    if (this._countdownTimer) clearInterval(this._countdownTimer);
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

  fetchVerification() {
    request.get('/users/me/verification').then((res) => {
      const data = res && res.data !== undefined ? res.data : res;
      if (data) {
        this.setData({
          verification: data,
          verifyEmail: data.email || ''
        });
      }
    }).catch(() => {});
  },

  onGetPhoneNumber(e) {
    if (!e.detail || !e.detail.code) {
      wx.showToast({ title: '未授权手机号', icon: 'none' });
      return;
    }
    request.post('/users/me/bind-phone-wx', { code: e.detail.code })
      .then(() => {
        wx.showToast({ title: '手机号绑定成功' });
        this.fetchVerification();
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '绑定失败', icon: 'none' });
      });
  },

  toggleEmailVerify() {
    this.setData({ showEmailVerify: !this.data.showEmailVerify });
  },

  onVerifyEmailInput(e) {
    this.setData({ verifyEmail: e.detail.value });
  },

  onVerifyEmailCodeInput(e) {
    this.setData({ verifyEmailCode: e.detail.value });
  },

  sendEmailCode() {
    const email = (this.data.verifyEmail || '').trim();
    if (!email) {
      wx.showToast({ title: '请输入邮箱', icon: 'none' });
      return;
    }
    request.post('/users/me/verification/send-code', { channel: 'email', target: email })
      .then((res) => {
        const data = res && res.data !== undefined ? res.data : res;
        wx.showToast({ title: '验证码已发送', icon: 'none' });
        if (data && data.debug_code) {
          // 开发联调提示
          wx.showModal({ title: '开发模式验证码', content: data.debug_code, showCancel: false });
        }
        this.setData({ emailCodeCountdown: (data && data.resend_after) || 60 });
        if (this._countdownTimer) clearInterval(this._countdownTimer);
        this._countdownTimer = setInterval(() => {
          const left = this.data.emailCodeCountdown - 1;
          this.setData({ emailCodeCountdown: Math.max(0, left) });
          if (left <= 0) clearInterval(this._countdownTimer);
        }, 1000);
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '发送失败', icon: 'none' });
      });
  },

  confirmEmailCode() {
    const email = (this.data.verifyEmail || '').trim();
    const code = (this.data.verifyEmailCode || '').trim();
    if (!email || !code) {
      wx.showToast({ title: '请填写邮箱和验证码', icon: 'none' });
      return;
    }
    request.post('/users/me/verification/confirm', { channel: 'email', target: email, code })
      .then(() => {
        wx.showToast({ title: '邮箱验证成功' });
        this.setData({ showEmailVerify: false, verifyEmailCode: '' });
        this.fetchVerification();
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '验证失败', icon: 'none' });
      });
  },

  goProjects() {
    wx.navigateTo({ url: '/pages/project-list/project-list' });
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