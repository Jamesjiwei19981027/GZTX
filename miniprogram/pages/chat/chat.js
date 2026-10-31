const request = require('../../utils/request')

function items(res) {
  const data = res && res.data
  return Array.isArray(data) ? data : ((data && data.items) || [])
}

Page({
  data: {
    channels: [],
    conversations: [],
    companyId: null,
    messages: [],
    activeType: 'channel',
    activeId: null,
    activeName: '团队消息',
    input: '',
    summary: null,
    loading: true,
    sending: false
  },

  async onLoad() {
    try {
      const companies = await request.get('/companies/mine')
      const company = items(companies)[0]
      if (!company) { this.setData({ loading: false }); return }
      this.setData({ companyId: company.id })
      const [channels, conversations] = await Promise.all([
        request.get('/companies/' + company.id + '/channels'),
        request.get('/companies/' + company.id + '/conversations').catch(() => ({ data: { items: [] } }))
      ])
      const ch = items(channels)
      const dm = items(conversations)
      this.setData({ channels: ch, conversations: dm, loading: false })
      if (ch[0]) this.selectScope({ currentTarget: { dataset: { type: 'channel', id: ch[0].id, name: ch[0].name || ch[0].key } } })
      else if (dm[0]) this.selectScope({ currentTarget: { dataset: { type: 'conversation', id: dm[0].id, name: dm[0].title || '私信' } } })
    } catch (e) {
      this.setData({ loading: false })
      wx.showToast({ title: (e && e.message) || '消息加载失败', icon: 'none' })
    }
  },

  async selectScope(e) {
    const { type, id, name } = e.currentTarget.dataset
    if (!id) return
    this.setData({ activeType: type, activeId: Number(id), activeName: name || '消息', summary: null, loading: true })
    try {
      const res = type === 'channel'
        ? await request.get('/channels/' + id + '/messages')
        : await request.get('/conversations/' + id + '/messages')
      this.setData({ messages: items(res), loading: false })
    } catch (err) {
      this.setData({ messages: [], loading: false })
      wx.showToast({ title: (err && err.message) || '消息加载失败', icon: 'none' })
    }
  },

  onInput(e) { this.setData({ input: e.detail.value }) },

  openContacts() {
    if (!this.data.companyId) return
    wx.navigateTo({url:'/pages/contacts/contacts?companyId='+this.data.companyId,events:{
      conversationCreated: async conversation => {
        const result=await request.get('/companies/'+this.data.companyId+'/conversations')
        this.setData({conversations:items(result)})
        await this.selectScope({currentTarget:{dataset:{type:'conversation',id:conversation.id,name:conversation.name}}})
      }
    }})
  },

  async send() {
    const body = (this.data.input || '').trim()
    if (!body || !this.data.activeId || this.data.sending) return
    this.setData({ sending: true })
    try {
      if (this.data.activeType === 'channel') await request.post('/channels/' + this.data.activeId + '/messages', { body })
      else await request.post('/conversations/' + this.data.activeId + '/messages', { body })
      this.setData({ input: '' })
      await this.selectScope({ currentTarget: { dataset: { type: this.data.activeType, id: this.data.activeId, name: this.data.activeName } } })
    } catch (e) { wx.showToast({ title: (e && e.message) || '发送失败', icon: 'none' }) }
    finally { this.setData({ sending: false }) }
  },

  async summarize() {
    if (!this.data.activeId) return
    wx.showLoading({ title: 'AI总结中' })
    try {
      const path = this.data.activeType === 'channel' ? '/channels/' : '/conversations/'
      const res = await request.post(path + this.data.activeId + '/summaries', {})
      this.setData({ summary: res.data || null })
    } catch (e) { wx.showToast({ title: (e && e.message) || '总结失败', icon: 'none' }) }
    finally { wx.hideLoading() }
  }
})
