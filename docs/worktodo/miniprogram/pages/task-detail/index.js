// 任务详情页
const app = getApp()
const request = require('../../utils/request')
const dateUtils = require('../../utils/date')

Page({
  data: {
    taskId: null,
    task: null,
    loading: true
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ taskId: parseInt(options.id) })
      this.loadTaskDetail()
    }
  },

  async loadTaskDetail() {
    this.setData({ loading: true })
    try {
      const task = await request.get(`/tasks/${this.data.taskId}`)
      this.setData({
        task,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  onEdit() {
    wx.navigateTo({
      url: `/pages/task-edit/index?id=${this.data.taskId}`
    })
  },

  async onComplete() {
    try {
      await request.patch(`/tasks/${this.data.taskId}/complete`)
      wx.showToast({ title: '已完成' })
      this.loadTaskDetail()
    } catch (err) {
      wx.showToast({
        title: err.message || '操作失败',
        icon: 'none'
      })
    }
  },

  async onUncomplete() {
    try {
      await request.patch(`/tasks/${this.data.taskId}/uncomplete`)
      wx.showToast({ title: '已取消完成' })
      this.loadTaskDetail()
    } catch (err) {
      wx.showToast({
        title: err.message || '操作失败',
        icon: 'none'
      })
    }
  },

  onDelete() {
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await request.delete(`/tasks/${this.data.taskId}`)
            wx.showToast({ title: '已删除' })
            setTimeout(() => {
              wx.navigateBack()
            }, 1500)
          } catch (err) {
            wx.showToast({
              title: err.message || '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 请求订阅消息提醒
  async onSubscribeRemind() {
    try {
      const templateId = 'YOUR_TEMPLATE_ID' // 需要配置微信模板ID

      wx.requestSubscribeMessage({
        tmplIds: [templateId],
        success: async (res) => {
          if (res[templateId] === 'accept') {
            // 用户同意了订阅，可以发送提醒
            wx.showToast({ title: '订阅成功，到期会提醒您' })
          }
        },
        fail: () => {
          wx.showToast({
            title: '订阅失败',
            icon: 'none'
          })
        }
      })
    } catch (err) {
      wx.showToast({
        title: '订阅失败',
        icon: 'none'
      })
    }
  },

  formatDateTime(date) {
    return dateUtils.formatDateTime(date)
  },

  getPriorityText(priority) {
    const map = { 0: '低', 1: '中', 2: '高' }
    return map[priority] || '中'
  },

  getPriorityClass(priority) {
    const map = { 0: 'priority-low', 1: 'priority-medium', 2: 'priority-high' }
    return map[priority] || 'priority-medium'
  }
})