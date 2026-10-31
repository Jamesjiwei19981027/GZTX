const request = require('../../utils/request');

Page({
  data: { id: '', report: null, draft: '', loading: true, submitting: false },
  onLoad(options) { this.setData({ id: options.id || '' }); this.load(); },
  async load() {
    if (!this.data.id) return;
    this.setData({ loading: true });
    try {
      const res = await request.get('/reports/' + this.data.id);
      const report = res.data;
      this.setData({ report, draft: (report && (report.summary_text || report.summary || report.content || '')) || '', loading: false });
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '汇报加载失败', icon: 'none' });
    }
  },
  onDraftInput(e) { this.setData({ draft: e.detail.value }); },
  submit() {
    if (this.data.submitting) return;
    wx.showModal({ title: '提交汇报', content: '提交后直属领导和其 AI 会收到提醒，确定提交吗？', success: async (r) => {
      if (!r.confirm) return;
      this.setData({ submitting: true });
      try {
        const summary = (this.data.draft || '').trim();
        if (!summary) {
          wx.showToast({ title: '请先填写汇报内容', icon: 'none' });
          return;
        }
        await request.post('/reports/' + this.data.id + '/submit', { summary });
        wx.showToast({ title: '已提交并通知上级', icon: 'success' });
        this.load();
      } catch (e) { wx.showToast({ title: (e && e.message) || '提交失败', icon: 'none' }); }
      finally { this.setData({ submitting: false }); }
    }});
  }
});
