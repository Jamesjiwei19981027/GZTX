const collab = require('../../utils/api-collab')

Page({
  data: {
    companyId: 1,
    projects: [],
    loading: false,
  },

  onShow() {
    const cid = wx.getStorageSync('company_id') || this.data.companyId
    this.setData({ companyId: Number(cid) || 1 })
    this.load()
  },

  onCompanyInput(e) {
    const v = parseInt(e.detail.value, 10) || 1
    this.setData({ companyId: v })
    wx.setStorageSync('company_id', v)
  },

  load() {
    this.setData({ loading: true })
    collab
      .listProjects(this.data.companyId)
      .then((res) => {
        const data = res && res.data !== undefined ? res.data : res
        const items = (data && data.items) || []
        this.setData({ projects: items, loading: false })
      })
      .catch((err) => {
        this.setData({ loading: false, projects: [] })
        wx.showToast({
          title: (err && err.message) || '加载失败',
          icon: 'none',
        })
      })
  },

  openProject(e) {
    const id = e.currentTarget.dataset.id
    wx.navigateTo({ url: '/pages/project-tree/project-tree?id=' + id })
  },
})
