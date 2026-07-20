const collab = require('../../utils/api-collab')

function flattenTree(nodes, depth, out) {
  depth = depth || 0
  out = out || []
  ;(nodes || []).forEach(function (n) {
    out.push({
      id: n.id,
      title: n.title,
      depth: depth,
      status: (n.progress_json && n.progress_json.status) || '',
      percent: (n.progress_json && n.progress_json.percent) || 0,
      node_type_key: n.node_type_key,
    })
    if (n.children && n.children.length) {
      flattenTree(n.children, depth + 1, out)
    }
  })
  return out
}

Page({
  data: {
    projectId: 0,
    projectName: '',
    companyId: 1,
    nodes: [],
    selected: null,
    loading: false,
  },

  onLoad(query) {
    const id = parseInt(query.id, 10)
    const companyId = wx.getStorageSync('company_id') || 1
    this.setData({ projectId: id, companyId: Number(companyId) })
    this.load()
  },

  load() {
    this.setData({ loading: true })
    Promise.all([
      collab.getProject(this.data.projectId),
      collab.getProjectTree(this.data.projectId),
    ])
      .then(([projRes, treeRes]) => {
        const proj = projRes && projRes.data !== undefined ? projRes.data : projRes
        const tree = treeRes && treeRes.data !== undefined ? treeRes.data : treeRes
        const nodes = flattenTree((tree && tree.nodes) || [])
        this.setData({
          projectName: (proj && proj.name) || '项目',
          companyId: (proj && proj.company_id) || this.data.companyId,
          nodes: nodes,
          loading: false,
        })
      })
      .catch(() => {
        this.setData({ loading: false })
        wx.showToast({ title: '加载失败', icon: 'none' })
      })
  },

  selectNode(e) {
    const id = e.currentTarget.dataset.id
    const node = this.data.nodes.find((n) => n.id === id)
    this.setData({ selected: node || null })
  },

  goChat() {
    const s = this.data.selected
    const q =
      'project_id=' +
      this.data.projectId +
      '&company_id=' +
      this.data.companyId +
      (s ? '&node_id=' + s.id + '&title=' + encodeURIComponent(s.title) : '')
    wx.navigateTo({ url: '/pages/agent-chat/agent-chat?' + q })
  },

  goEvidence() {
    const s = this.data.selected
    if (!s) {
      wx.showToast({ title: '请先选择节点', icon: 'none' })
      return
    }
    wx.navigateTo({
      url:
        '/pages/evidence-submit/evidence-submit?node_id=' +
        s.id +
        '&title=' +
        encodeURIComponent(s.title),
    })
  },
})
