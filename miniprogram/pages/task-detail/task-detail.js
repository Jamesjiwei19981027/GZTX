const request = require('../../utils/request');
const dateUtils = require('../../utils/date');

Page({
  data: {
    task: null,
    loading: false
  },

  onLoad(options) {
    if (options.id) {
      this.fetchTaskDetail(options.id);
    }
  },

  fetchTaskDetail(taskId) {
    this.setData({ loading: true });
    request.get(`/tasks/${taskId}`, true)
      .then(data => {
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
    request.patch(`/tasks/${task.id}/complete`, null, true)
      .then(() => {
        wx.showToast({ title: '任务已完成' });
        this.fetchTaskDetail(task.id);
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
          request.del(`/tasks/${this.data.task.id}`, null, true)
            .then(() => {
              wx.showToast({ title: '删除成功' });
              wx.navigateBack();
            });
        }
      }
    });
  }
});