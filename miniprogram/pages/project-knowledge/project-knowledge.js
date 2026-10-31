const request = require('../../utils/request');
const same = (a, b) => String(a) === String(b);
const validId = value => /^[1-9]\d*$/.test(String(value || ''));
const idOf = event => event.currentTarget.dataset.id;
const errorText = error => (error && (error.message || error.errMsg)) || '请求失败，请重试';
const confirm = options => new Promise(resolve => wx.showModal(Object.assign({}, options, { success: resolve, fail: () => resolve({ confirm: false }) })));

Page({
  data: {
    projectId: '', projectName: '', scope: null, pages: [], members: [], selectedIds: [], instruction: '',
    permissions: { can_summarize: false, can_manage_grants: false },
    loading: false, generating: false, saving: false, grantPending: '', error: '', notice: '',
    detail: null, summary: null, formTitle: '', formBody: '', formTags: '', savedEntry: null,
    mode: 'list', nodes: [], edges: [], zoom: 0.8, graphOrigin: { x: 0, y: 0 }, boardWidth: 1000, boardHeight: 800,
  },
  onLoad(options) {
    this._unloaded = false;
    const user = getApp().globalData.userInfo;
    this._ownerId = user && user.id;
    return this.setProject(String(options.project_id || options.projectId || ''), options.project_name || '', options.summary_id);
  },
  onReady() { this.drawEdges(); },
  onUnload() { this._unloaded = true; this._epoch = (this._epoch || 0) + 1; },
  isCurrent(projectId, epoch) { return !this._unloaded && same(projectId, this.data.projectId) && epoch === (this._epoch || 0); },
  endpoint(projectId) { return '/projects/' + encodeURIComponent(projectId || this.data.projectId) + '/knowledge-space'; },
  busy() { return this.data.loading || this.data.generating || this.data.saving || !!this.data.grantPending || this._confirming; },
  async setProject(projectId, projectName, summaryId) {
    this._epoch = (this._epoch || 0) + 1; this._positions = {}; this._confirming = false;
    this.setData({ projectId, projectName, scope: null, pages: [], members: [], selectedIds: [], instruction: '',
      permissions: { can_summarize: false, can_manage_grants: false }, loading: false, generating: false, saving: false,
      grantPending: '', error: '', notice: '', detail: null, summary: null, formTitle: '', formBody: '', formTags: '', savedEntry: null,
      nodes: [], edges: [], graphOrigin: { x: 0, y: 0 } });
    if (!validId(projectId)) { this.setData({ error: '请先从我的知识空间选择具体项目' }); return; }
    const epoch = this._epoch;
    await this.reload();
    if (!this.isCurrent(projectId, epoch) || !this.data.scope) return;
    const restoreId = summaryId || (wx.getStorageSync && wx.getStorageSync(this.storageKey()));
    if (validId(restoreId)) await this.restoreSummary(restoreId);
  },
  storageKey() { return 'project-knowledge-draft:' + this.data.scope.owner_user_id + ':' + this.data.projectId; },
  async reload() {
    if (!validId(this.data.projectId) || this.busy()) return;
    const projectId = this.data.projectId, epoch = this._epoch || 0;
    this.setData({ loading: true, error: '' });
    try {
      const data = (await request.get(this.endpoint(projectId))).data;
      if (!this.isCurrent(projectId, epoch)) return;
      if (!data || !data.scope || !same(data.scope.project_id, projectId) || (this._ownerId && !same(data.scope.owner_user_id, this._ownerId))) throw new Error('知识空间归属不匹配，请重新选择项目');
      const selectedIds = this.data.selectedIds.filter(id => data.pages.some(page => same(page.id, id)));
      this.setData({ scope: data.scope, pages: data.pages, permissions: data.permissions, members: data.members || [], selectedIds });
      this.refreshView();
    } catch (error) {
      if (this.isCurrent(projectId, epoch)) {
        this.setData({ error: errorText(error), pages: [], members: [], detail: null,
          permissions: { can_summarize: false, can_manage_grants: false } }); this.refreshView();
      }
    } finally { if (this.isCurrent(projectId, epoch)) this.setData({ loading: false }); }
  },
  togglePage(event) {
    if (this.busy()) return;
    const page = this.data.pages.find(item => same(item.id, idOf(event)));
    if (!page) return;
    const selectedIds = this.data.selectedIds.some(id => same(id, page.id)) ? this.data.selectedIds.filter(id => !same(id, page.id)) : this.data.selectedIds.concat([page.id]);
    this.setData({ selectedIds }); this.refreshView();
  },
  onInstruction(event) { this.setData({ instruction: event.detail.value }); },
  async changeGrant(event) {
    if (!this.data.permissions.can_manage_grants || this.busy()) return;
    const member = this.data.members.find(item => same(item.user_id, idOf(event)));
    if (!member || member.is_manager) return;
    const projectId = this.data.projectId, epoch = this._epoch || 0;
    this.setData({ grantPending: String(member.user_id), error: '', notice: '' });
    try {
      const result = await request.put(this.endpoint(projectId) + '/grants/' + member.user_id, { can_summarize: !!event.detail.value });
      if (!this.isCurrent(projectId, epoch)) return;
      const confirmed = result.data;
      this.setData({ members: this.data.members.map(item => same(item.user_id, confirmed.user_id) ? confirmed : item), notice: '总结授权已更新' });
    } catch (error) { if (this.isCurrent(projectId, epoch)) this.setData({ error: errorText(error), members: this.data.members.map(item => Object.assign({}, item)) }); }
    finally { if (this.isCurrent(projectId, epoch)) this.setData({ grantPending: '' }); }
  },
  applySummary(summary) {
    this.setData({ summary, formTitle: summary.title, formBody: summary.body_text, formTags: '',
      savedEntry: summary.personal_entry_id ? { id: summary.personal_entry_id } : null });
    if (this.data.scope && wx.setStorageSync) wx.setStorageSync(this.storageKey(), summary.id);
  },
  async generateSummary() {
    if (!this.data.permissions.can_summarize || !this.data.selectedIds.length || this.busy()) return;
    const projectId = this.data.projectId, epoch = this._epoch || 0;
    const body = { page_ids: this.data.selectedIds.slice(), instruction: this.data.instruction.trim() };
    this.setData({ generating: true, error: '', notice: '' });
    try {
      const result = await request.post(this.endpoint(projectId) + '/summaries', body);
      if (this.isCurrent(projectId, epoch)) { this.applySummary(result.data); this.setData({ notice: '请核对引用并编辑总结，确认后再存入我的知识' }); }
    } catch (error) { if (this.isCurrent(projectId, epoch)) this.setData({ error: errorText(error) }); }
    finally { if (this.isCurrent(projectId, epoch)) this.setData({ generating: false }); }
  },
  async restoreSummary(id) {
    if (!validId(id) || this.busy()) return;
    const projectId = this.data.projectId, epoch = this._epoch || 0;
    this.setData({ loading: true, error: '' });
    try {
      const result = await request.get(this.endpoint(projectId) + '/summaries/' + id);
      if (this.isCurrent(projectId, epoch)) this.applySummary(result.data);
    } catch (error) { if (this.isCurrent(projectId, epoch)) this.setData({ error: errorText(error) }); }
    finally { if (this.isCurrent(projectId, epoch)) this.setData({ loading: false }); }
  },
  onTitle(event) { this.setData({ formTitle: event.detail.value }); },
  onBody(event) { this.setData({ formBody: event.detail.value }); },
  onTags(event) { this.setData({ formTags: event.detail.value }); },
  async saveSummary() {
    if (!this.data.summary || !this.data.permissions.can_summarize || !this.data.formTitle.trim() || this.busy()) return;
    const projectId = this.data.projectId, epoch = this._epoch || 0, summaryId = this.data.summary.id;
    const body = { title: this.data.formTitle.trim(), body_text: this.data.formBody,
      tags: [...new Set(this.data.formTags.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean))] };
    this._confirming = true;
    const answer = await confirm({ title: '存入我的项目知识', content: '确认已核对总结和来源？将保存到本人当前项目的私人知识空间。', confirmText: '确认保存' });
    if (!this.isCurrent(projectId, epoch)) return;
    this._confirming = false;
    if (!answer.confirm || !this.data.permissions.can_summarize) return;
    this.setData({ saving: true, error: '', notice: '' });
    try {
      const result = await request.post(this.endpoint(projectId) + '/summaries/' + summaryId + '/save', body);
      if (!this.isCurrent(projectId, epoch)) return;
      this.setData({ savedEntry: result.data.entry, summary: Object.assign({}, this.data.summary, { status: 'saved', personal_entry_id: result.data.entry.id }),
        notice: result.data.already_saved ? '此总结已保存，保留原有个人条目' : '已存入本人当前项目知识空间' });
    } catch (error) { if (this.isCurrent(projectId, epoch)) this.setData({ error: errorText(error) }); }
    finally { if (this.isCurrent(projectId, epoch)) this.setData({ saving: false }); }
  },
  openSavedEntry() {
    if (this.data.savedEntry) wx.navigateTo({ url: '/pages/knowledge/knowledge?project_id=' + encodeURIComponent(this.data.projectId) + '&entry_id=' + this.data.savedEntry.id });
  },
  backToPersonal() { wx.navigateBack(); },
  openPage(event) {
    if (this._movedId && same(this._movedId, idOf(event))) { this._movedId = null; return; }
    const id = String(idOf(event)).replace(/^page:/, '');
    const page = this.data.pages.find(item => same(item.id, id));
    if (page) this.setData({ detail: page });
  },
  closeDetail() { this.setData({ detail: null }, () => this.drawEdges()); },
  switchMode(event) { this.setData({ mode: event.currentTarget.dataset.mode }, () => this.drawEdges()); },
  onZoom(event) { this.setData({ zoom: Number(event.detail.value) / 100 }); this.refreshView(); },
  onNodeTouchStart() { this._movedId = null; },
  onNodeMove(event) {
    if (event.detail.source !== 'touch' && event.detail.source !== 'touch-out-of-bounds') return;
    const id = idOf(event);
    this._positions = this._positions || {};
    this._positions[id] = { x: Math.max(0, event.detail.x / this.data.zoom) + this.data.graphOrigin.x, y: Math.max(0, event.detail.y / this.data.zoom) + this.data.graphOrigin.y };
    this._movedId = id; this.refreshView();
  },
  refreshView() {
    const selected = this.data.selectedIds, packageIds = [], relationships = [];
    const pages = this.data.pages.map(page => {
      const facts = Array.isArray((page.meta || {}).facts) ? page.meta.facts : [];
      const citations = facts.map((fact, index) => ({ id: page.id + ':' + index, package_id: fact.package_id, source_name: fact.source_name || fact.source_id || '共享页引用', quote: fact.quote || '' }));
      const seen = new Set();
      facts.forEach(fact => {
        if (!validId(fact.package_id) || seen.has(String(fact.package_id))) return;
        seen.add(String(fact.package_id));
        if (!packageIds.some(id => same(id, fact.package_id))) packageIds.push(fact.package_id);
        relationships.push({ id: fact.package_id + ':' + page.id, source: 'package:' + fact.package_id, target: 'page:' + page.id, label: '来源引用' });
      });
      return Object.assign({}, page, { selected: selected.some(id => same(id, page.id)), citations, sourceLabel: page.source === 'manual' ? '项目手写知识' : '已发布项目知识' });
    });
    const rawNodes = packageIds.map((id, index) => ({ id: 'package:' + id, title: '材料包 #' + id, kind: 'package', subtitle: '已发布页面的来源', position: { x: 40, y: 40 + index * 160 } }))
      .concat(pages.map((page, index) => ({ id: 'page:' + page.id, title: page.title, kind: 'page', subtitle: page.sourceLabel, position: { x: packageIds.length ? 380 : 40, y: 40 + index * 160 } })));
    const positions = this._positions || {};
    const positioned = rawNodes.map(node => Object.assign({}, node, { position: positions[node.id] || node.position }));
    const graphOrigin = { x: Math.min(this.data.graphOrigin.x, 0, ...positioned.map(node => node.position.x)), y: Math.min(this.data.graphOrigin.y, 0, ...positioned.map(node => node.position.y)) };
    const zoom = this.data.zoom;
    const nodes = positioned.map(node => Object.assign({}, node, { x: (node.position.x - graphOrigin.x) * zoom, y: (node.position.y - graphOrigin.y) * zoom }));
    const edges = relationships.map(link => {
      const source = nodes.find(node => node.id === link.source), target = nodes.find(node => node.id === link.target);
      return Object.assign({}, link, { startX: source.x + 220 * zoom, startY: source.y + 52 * zoom, endX: target.x, endY: target.y + 52 * zoom });
    });
    this.setData({ pages, nodes, edges, graphOrigin, boardWidth: Math.max(1000 * zoom, ...nodes.map(node => node.x + 300 * zoom)), boardHeight: Math.max(800 * zoom, ...nodes.map(node => node.y + 220 * zoom)) }, () => this.drawEdges());
  },
  drawEdges() {
    if (!wx.createCanvasContext || this.data.mode !== 'graph' || this.data.detail) return;
    const ctx = wx.createCanvasContext('projectKnowledgeEdges', this);
    ctx.clearRect(0, 0, this.data.boardWidth, this.data.boardHeight); ctx.setLineWidth(2); ctx.setStrokeStyle('#6c8cbd');
    this.data.edges.forEach(edge => {
      const bend = Math.max(65, Math.abs(edge.endX - edge.startX) * 0.5);
      ctx.beginPath(); ctx.moveTo(edge.startX, edge.startY); ctx.bezierCurveTo(edge.startX + bend, edge.startY, edge.endX - bend, edge.endY, edge.endX, edge.endY); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(edge.endX - 7, edge.endY - 4); ctx.lineTo(edge.endX, edge.endY); ctx.lineTo(edge.endX - 7, edge.endY + 4); ctx.stroke();
    });
    ctx.draw();
  },
});
