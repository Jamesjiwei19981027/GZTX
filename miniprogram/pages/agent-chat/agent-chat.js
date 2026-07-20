const collab = require('../../utils/api-collab')

Page({
  data: {
    projectId: 0,
    companyId: 1,
    nodeId: null,
    title: '',
    messages: [],
    input: '',
    sending: false,
  },

  onLoad(query) {
    this.setData({
      projectId: parseInt(query.project_id, 10) || 0,
      companyId: parseInt(query.company_id, 10) || wx.getStorageSync('company_id') || 1,
      nodeId: query.node_id ? parseInt(query.node_id, 10) : null,
      title: query.title ? decodeURIComponent(query.title) : '',
      messages: [
        {
          role: 'system',
          content: '可聊、可更新进度说明。本通道不可交材料文件（40320）。',
        },
      ],
    })
  },

  onInput(e) {
    this.setData({ input: e.detail.value })
  },

  send() {
    const text = (this.data.input || '').trim()
    if (!text || this.data.sending) return
    const messages = this.data.messages.concat([{ role: 'user', content: text }])
    this.setData({ messages: messages, input: '', sending: true })

    const body = {
      company_id: this.data.companyId,
      project_id: this.data.projectId || null,
      node_id: this.data.nodeId,
      message: text,
    }

    // 小程序优先走微信协作通道（channel=wechat）
    collab
      .wxCollabChat(body)
      .then((res) => {
        const data = res && res.data !== undefined ? res.data : res
        const reply =
          (data && data.reply && data.reply.content) ||
          (data && data.reply) ||
          '（无回复）'
        this.setData({
          messages: this.data.messages.concat([{ role: 'assistant', content: reply }]),
          sending: false,
        })
      })
      .catch((err) => {
        // fallback agent chat web channel
        collab
          .agentChat({
            company_id: this.data.companyId,
            project_id: this.data.projectId || null,
            channel: 'miniprogram',
            message: this.data.nodeId ? '[node:' + this.data.nodeId + '] ' + text : text,
          })
          .then((res2) => {
            const data2 = res2 && res2.data !== undefined ? res2.data : res2
            this.setData({
              messages: this.data.messages.concat([
                { role: 'assistant', content: (data2 && data2.reply) || '（无回复）' },
              ]),
              sending: false,
            })
          })
          .catch(() => {
            this.setData({ sending: false })
            wx.showToast({
              title: (err && err.message) || '发送失败',
              icon: 'none',
            })
          })
      })
  },
})
