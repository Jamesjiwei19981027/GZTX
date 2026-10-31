const request = require('../../utils/request');
const app = getApp();

Page({
  data: {
    userInfo: null,
    notifyPrefs: {
      emailEnabled: true,
      wechatEnabled: true
    },
    webUrl: '',
    verification: { email: '', phone: '', email_verified: false, phone_verified: false },
    showEmailVerify: false,
    verifyEmail: '',
    verifyEmailCode: '',
    emailCodeCountdown: 0
  },

  onLoad() {
    this.setData({ webUrl: this.resolveWebUrl() });
    this.fetchUserInfo();
    this.fetchVerification();
  },

  onUnload() {
    if (this._countdownTimer) clearInterval(this._countdownTimer);
  },

  fetchUserInfo() {
    request.get('/users/me')
      .then((res) => {
        // 响应信封 {code, message, data}
        const data = res.data;
        // notify_pref 的现行契约：channels.{email,wechat}.enabled（与 Web 端一致）
        const channels = (data.notify_pref && data.notify_pref.channels) || {};
        this.setData({
          userInfo: data,
          notifyPrefs: {
            emailEnabled: channels.email ? channels.email.enabled !== false : true,
            wechatEnabled: channels.wechat ? channels.wechat.enabled !== false : true
          }
        });
      })
      .catch(() => {});
  },

  onEmailToggle(e) {
    this.updateChannelPref('email', 'emailEnabled', e.detail.value);
  },

  onWxSubscribeToggle(e) {
    this.updateChannelPref('wechat', 'wechatEnabled', e.detail.value);
  },

  updateChannelPref(channel, localKey, enabled) {
    // 后端 PUT /users/me 只合并 notify_pref 的 channels / quiet_hours / weekend_mute
    request.put('/users/me', {
      notify_pref: { channels: { [channel]: { enabled } } }
    }).then(() => {
      this.setData({ [`notifyPrefs.${localKey}`]: enabled });
      wx.showToast({ title: '设置已保存' });
    }).catch((err) => {
      wx.showToast({ title: (err && err.message) || '保存失败', icon: 'none' });
    });
  },

  fetchVerification() {
    request.get('/users/me/verification').then((res) => {
      const data = res.data;
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
        const data = res.data;
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

  /** API origin（scheme://host[:port]）：订阅 url 自带 /api/v1 前缀，只能拼 origin，不能拼完整 baseUrl */
  resolveApiOrigin() {
    const match = /^(https?:\/\/[^/]+)/.exec(app.globalData.baseUrl || '');
    return match ? match[1] : '';
  },

  copyCalendarFeed() {
    request.get('/tasks/calendar-feed-url')
      .then((res) => {
        const url = (res.data && res.data.url) || '';
        if (!url) {
          wx.showToast({ title: '未获取到订阅地址', icon: 'none' });
          return;
        }
        const full = /^https?:\/\//.test(url) ? url : this.resolveApiOrigin() + url;
        wx.setClipboardData({
          data: full,
          success: () => {
            wx.showToast({ title: '已复制，在系统日历按 URL 订阅', icon: 'none' });
          }
        });
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '获取订阅地址失败', icon: 'none' });
      });
  },

  /** Web 端地址：优先取 globalData.webUrl，否则用 baseUrl 的域名部分 */
  resolveWebUrl() {
    if (app.globalData.webUrl) return app.globalData.webUrl;
    const match = /^(https?:\/\/[^/]+)/.exec(app.globalData.baseUrl || '');
    return match ? match[1] : '';
  },

  copyWebUrl() {
    const url = this.resolveWebUrl();
    if (!url) {
      wx.showToast({ title: '未配置 Web 地址', icon: 'none' });
      return;
    }
    wx.setClipboardData({
      data: url,
      success: () => {
        wx.showToast({ title: '已复制，请在浏览器打开', icon: 'none' });
      }
    });
  },

  goToReports() {
    wx.navigateTo({ url: '/pages/reports/reports' });
  },

  goToKnowledge() {
    wx.navigateTo({ url: '/pages/knowledge/knowledge' });
  },

  onLogout() {
    wx.showModal({
      title: '确认退出',
      content: '确定要退出登录吗？',
      success: (res) => {
        if (res.confirm) {
          // 先通知服务端撤销 refresh_token（失败不阻断本地登出）
          const refreshToken = wx.getStorageSync('refresh_token');
          if (refreshToken) {
            request.post('/auth/logout', { refresh_token: refreshToken }).catch(() => {});
          }
          // 存储键与 app.js / request.js 保持一致（access_token / refresh_token）
          wx.removeStorageSync('access_token');
          wx.removeStorageSync('refresh_token');
          app.globalData.token = '';
          app.globalData.userInfo = null;
          wx.reLaunch({ url: '/pages/login/login' });
        }
      }
    });
  }
});
