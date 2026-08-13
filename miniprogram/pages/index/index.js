// pages/index/index.js
const { get, patch } = require('../../utils/request')

Page({
  data: {
    tasks: [],
    loading: true
  },

  onShow() {
    this.fetchTasks()
  },

  async fetchTasks() {
    this.setData({ loading: true })
    try {
      const res = await get('/tasks?status=0&status=1&page_size=50')
      this.setData({ tasks: res.data.items || [], loading: false })
    } catch {
      this.setData({ loading: false })
    }
  },

  async onTaskComplete(e) {
    const { id } = e.currentTarget.dataset
    try {
      // 后端是 PATCH /tasks/{id}/complete，body 字段全有默认值，传空对象即可
      await patch('/tasks/' + id + '/complete', {})
      this.fetchTasks()
      wx.showToast({ title: '已完成', icon: 'success' })
    } catch {
      wx.showToast({ title: '操作失败', icon: 'none' })
    }
  },

  goToDetail(e) {
    const { id } = e.currentTarget.dataset
    wx.navigateTo({ url: '/pages/task-detail/task-detail?id=' + id })
  },

  goToAdd() {
    wx.navigateTo({ url: '/pages/task-edit/task-edit' })
  },

  onPullDownRefresh() {
    this.fetchTasks().then(() => wx.stopPullDownRefresh())
  }
})
