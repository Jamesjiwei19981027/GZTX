const request = require('../../utils/request');
const dateUtils = require('../../utils/date');

Page({
  data: {
    task: null,
    loading: false
  },

  onLoad(options) {
    if (options.id) {
      this.taskId = options.id;
    }
  },

  onShow() {
    // 从编辑页返回时刷新
    if (this.taskId) {
      this.fetchTaskDetail(this.taskId);
    }
  },

  fetchTaskDetail(taskId) {
    this.setData({ loading: true });
    request.get(`/tasks/${taskId}`)
      .then((res) => {
        // 后端响应信封 {code, message, data}，任务在 data 里
        const data = res.data;
        data.due_date_formatted = dateUtils.formatDate(data.due_date, 'YYYY-MM-DD HH:mm');
        data.due_date_relative = dateUtils.getRelativeTime(data.due_date);
        data.is_overdue = dateUtils.isOverdue(data.due_date) && data.status !== 2;
        this.setData({ task: data, loading: false });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  onComplete() {
    const task = this.data.task;
    // PATCH /tasks/{id}/complete，body 字段全有默认值
    request.patch(`/tasks/${task.id}/complete`, {})
      .then(() => {
        wx.showToast({ title: '任务已完成' });
        this.fetchTaskDetail(task.id);
      })
      .catch((err) => {
        wx.showToast({ title: (err && err.message) || '操作失败', icon: 'none' });
      });
  },

  onEdit() {
    wx.navigateTo({ url: `/pages/task-edit/task-edit?id=${this.data.task.id}` });
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？',
      success: (res) => {
        if (res.confirm) {
          request.del(`/tasks/${this.data.task.id}`)
            .then(() => {
              wx.showToast({ title: '删除成功' });
              wx.navigateBack();
            })
            .catch((err) => {
              wx.showToast({ title: (err && err.message) || '删除失败', icon: 'none' });
            });
        }
      }
    });
  }
});
