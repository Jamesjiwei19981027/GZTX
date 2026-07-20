const collab = require('../../utils/api-collab')
const app = getApp()

Page({
  data: {
    nodeId: 0,
    companyId: 0,
    projectId: 0,
    title: '',
    summary: '',
    percent: 50,
    fileIds: [],
    submitting: false,
  },

  onLoad(query) {
    this.setData({
      nodeId: parseInt(query.node_id, 10) || 0,
      companyId: parseInt(query.company_id, 10) || app.globalData.companyId || 0,
      projectId: parseInt(query.project_id, 10) || 0,
      title: query.title ? decodeURIComponent(query.title) : '',
    })
  },

  onSummary(e) {
    this.setData({ summary: e.detail.value })
  },

  onPercent(e) {
    this.setData({ percent: parseInt(e.detail.value, 10) || 0 })
  },

  submit() {
    if (!this.data.nodeId || this.data.submitting) return
    this.setData({ submitting: true })
    collab
      .submitEvidence(this.data.nodeId, {
        summary_text: this.data.summary || '小程序进度更新',
        structured: {
          percent: this.data.percent,
          status: this.data.percent >= 100 ? 'done' : 'in_progress',
        },
        file_ids: this.data.fileIds,
      })
      .then((res) => {
        const data = res && res.data !== undefined ? res.data : res
        wx.showToast({
          title: '已提交 ' + ((data && data.status) || ''),
          icon: 'success',
        })
        this.setData({ submitting: false })
        setTimeout(() => wx.navigateBack(), 800)
      })
      .catch((err) => {
        this.setData({ submitting: false })
        wx.showToast({
          title: (err && err.message) || '提交失败',
          icon: 'none',
        })
      })
  },

  /**
   * 选择图片并上传材料文件（仅小程序/Web；不用 wechat channel header）
   * 注意：request 封装未统一 multipart，此处直接 wx.uploadFile
   */
  chooseAndUpload() {
    const companyId = this.data.companyId
    if (!companyId) {
      wx.showToast({ title: '缺少公司 ID', icon: 'none' })
      return
    }
    wx.chooseImage({
      count: 1,
      success: (r) => {
        const path = r.tempFilePaths[0]
        const formData = { company_id: String(companyId) }
        if (this.data.projectId) {
          formData.project_id = String(this.data.projectId)
        }
        wx.uploadFile({
          url: app.globalData.baseUrl + '/evidence/files',
          filePath: path,
          name: 'file',
          formData,
          header: {
            Authorization: app.globalData.token ? 'Bearer ' + app.globalData.token : '',
            'X-Client-Channel': 'miniprogram',
          },
          success: (up) => {
            try {
              const body = JSON.parse(up.data || '{}')
              if (body.code === 200 && body.data && body.data.file_id) {
                this.setData({ fileIds: this.data.fileIds.concat(body.data.file_id) })
                wx.showToast({ title: '文件已上传 #' + body.data.file_id, icon: 'none' })
              } else {
                wx.showToast({ title: body.message || '上传失败', icon: 'none' })
              }
            } catch (e) {
              wx.showToast({ title: '上传解析失败', icon: 'none' })
            }
          },
          fail: () => wx.showToast({ title: '上传失败', icon: 'none' }),
        })
      },
    })
  },
})
