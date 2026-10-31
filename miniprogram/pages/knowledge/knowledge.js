const request = require('../../utils/request');
const items = res => Array.isArray(res.data) ? res.data : ((res.data && res.data.items) || []);
const same = (a, b) => String(a) === String(b);
const idOf = e => e.currentTarget.dataset.id;
const modal = options => new Promise(resolve => wx.showModal(Object.assign({}, options, { success: resolve, fail: () => resolve({ confirm: false }) })));
const sourceNames = { manual: '手写笔记', evidence_package: '我的材料', evidence_file: '我的文件', agent_report: '我的汇报', agent_message: '我的 AI 输入', project_summary: '项目知识总结' };

Page({
  data: {
    projects: [], projectIndex: 0, projectId: '', projectName: '', scope: null,
    entries: [], links: [], filteredEntries: [], nodes: [], edges: [], visibleLinks: [],
    loading: false, projectsLoading: false, saving: false, syncing: false, error: '', syncMessage: '',
    mode: 'list', query: '', zoom: 0.8, boardWidth: 1200, boardHeight: 900, scrollLeft: 0, scrollTop: 0, graphOrigin: { x: 0, y: 0 },
    detail: null, editorOpen: false, editingId: null, formTitle: '', formBody: '', formTags: '',
    linkOpen: false, linkSourceIndex: 0, linkTargetIndex: 1, linkLabel: '',
  },

  onLoad(options) { this._requestedProject = String((options && options.project_id) || ''); this._requestedEntry = options && options.entry_id; return this.loadProjects(); },
  onReady() { this.drawEdges(); },
  onUnload() { this._epoch = (this._epoch || 0) + 1; this._projectsRequest = (this._projectsRequest || 0) + 1; },

  async loadProjects() {
    const token = this._projectsRequest = (this._projectsRequest || 0) + 1;
    this.setData({ projectsLoading: true, error: '' });
    try {
      const companies = items(await request.get('/companies/mine'));
      const groups = await Promise.all(companies.map(company => request.get('/projects?company_id=' + company.id + '&page_size=100')));
      if (token !== this._projectsRequest) return;
      const projects = groups.reduce((all, res) => all.concat(items(res)), []).filter((item, index, all) => all.findIndex(other => same(other.id, item.id)) === index);
      this.setData({ projects, projectsLoading: false });
      const wanted = this.data.projectId || this._requestedProject;
      const selected = projects.find(project => same(project.id, wanted)) || projects[0];
      if (selected) await this.selectProject(String(selected.id));
      else this.setData({ error: '暂无可用项目，请先加入一个具体项目' });
    } catch (error) {
      if (token === this._projectsRequest) this.setData({ projectsLoading: false, error: error.message || '项目加载失败' });
    }
  },
  onProjectChange(e) { const project = this.data.projects[Number(e.detail.value)]; if (project) return this.selectProject(String(project.id)); },
  selectProject(projectId) {
    const project = this.data.projects.find(item => same(item.id, projectId));
    if (!project) return;
    this._epoch = (this._epoch || 0) + 1;
    this._dragPositions = {}; this._positionVersions = {};
    this.setData({ projectId: String(project.id), projectName: project.name, projectIndex: this.data.projects.indexOf(project),
      scope: null, entries: [], links: [], filteredEntries: [], nodes: [], edges: [], visibleLinks: [],
      detail: null, editorOpen: false, editingId: null, formTitle: '', formBody: '', formTags: '', linkOpen: false,
      linkSourceIndex: 0, linkTargetIndex: 1, linkLabel: '', saving: false, syncing: false, query: '', syncMessage: '', error: '', scrollLeft: 0, scrollTop: 0, graphOrigin: { x: 0, y: 0 } });
    this.drawEdges();
    return this.reload();
  },
  endpoint(projectId) { return '/projects/' + encodeURIComponent(projectId || this.data.projectId) + '/personal-knowledge'; },
  openProjectKnowledge() {
    if (this.data.projectId && !this.data.loading && !this.data.saving) wx.navigateTo({ url: '/pages/project-knowledge/project-knowledge?project_id=' + encodeURIComponent(this.data.projectId) + '&project_name=' + encodeURIComponent(this.data.projectName) });
  },
  isCurrent(projectId, epoch) { return same(projectId, this.data.projectId) && epoch === (this._epoch || 0); },
  async reload() {
    if (!this.data.projectId) return;
    const projectId = this.data.projectId, epoch = this._epoch || 0;
    const loadId = this._loadId = (this._loadId || 0) + 1;
    this.setData({ loading: true, error: '' });
    try {
      const res = await request.get(this.endpoint(projectId));
      if (!this.isCurrent(projectId, epoch) || loadId !== this._loadId) return;
      const data = res.data || {};
      if (data.scope && !same(data.scope.project_id, projectId)) throw new Error('项目空间不匹配，请重新选择项目');
      this.setData({ scope: data.scope || null, entries: data.entries || [], links: data.links || [], loading: false }); this.refreshView();
      if (this._requestedEntry) {
        const entry = this.data.entries.find(item => same(item.id, this._requestedEntry));
        if (entry) this.setData({ detail: entry });
        this._requestedEntry = null;
      }
    } catch (error) {
      if (this.isCurrent(projectId, epoch) && loadId === this._loadId) {
        this.setData({ loading: false, entries: [], links: [], detail: null, error: error.message || '知识空间加载失败' }); this.refreshView();
      }
    }
  },
  retry() { return this.data.projectId ? this.reload() : this.loadProjects(); },
  refreshView() {
    const query = this.data.query.trim().toLowerCase(), zoom = this.data.zoom;
    const entries = this.data.entries.map((entry, index) => Object.assign({}, entry, {
      position: entry.position || { x: 40 + (index % 3) * 300, y: 40 + Math.floor(index / 3) * 170 },
      sourceLabel: sourceNames[entry.source_type] || '来源资料', tagsText: (entry.tags || []).join(' · '),
    }));
    // The bounded mini-program canvas uses nonnegative display coordinates.
    // Keep its origin stable as nodes move; API positions stay in world coordinates.
    const graphOrigin = {
      x: Math.min(this.data.graphOrigin.x, 0, ...entries.map(entry => entry.position.x)),
      y: Math.min(this.data.graphOrigin.y, 0, ...entries.map(entry => entry.position.y)),
    };
    const filteredEntries = entries.filter(entry => !query || [entry.title, entry.body_text, (entry.tags || []).join(' ')].join(' ').toLowerCase().includes(query));
    const nodes = filteredEntries.map(entry => Object.assign({}, entry, { x: (entry.position.x - graphOrigin.x) * zoom, y: (entry.position.y - graphOrigin.y) * zoom }));
    const edges = this.data.links.map(link => {
      const source = nodes.find(node => same(node.id, link.source_entry_id)), target = nodes.find(node => same(node.id, link.target_entry_id));
      if (!source || !target) return null;
      return Object.assign({}, link, { startX: source.x + 220 * zoom, startY: source.y + 52 * zoom, endX: target.x, endY: target.y + 52 * zoom,
        sourceTitle: source.title, targetTitle: target.title });
    }).filter(Boolean);
    const boardWidth = Math.max(1200 * zoom, ...nodes.map(node => node.x + 300 * zoom));
    const boardHeight = Math.max(900 * zoom, ...nodes.map(node => node.y + 220 * zoom));
    const detail = this.data.detail && entries.find(entry => same(entry.id, this.data.detail.id));
    this.setData({ entries, filteredEntries, nodes, edges, visibleLinks: edges, boardWidth, boardHeight, graphOrigin, detail: detail || null }, () => this.drawEdges());
  },
  drawEdges() {
    if (!wx.createCanvasContext || this.data.mode !== 'graph' || this.data.detail || this.data.editorOpen || this.data.linkOpen) return;
    const ctx = wx.createCanvasContext('knowledgeEdges', this);
    ctx.clearRect(0, 0, this.data.boardWidth, this.data.boardHeight);
    ctx.setLineWidth(2); ctx.setStrokeStyle('#6c8cbd'); ctx.setFontSize(12); ctx.setFillStyle('#475569');
    this.data.edges.forEach(edge => {
      const bend = Math.max(65, Math.abs(edge.endX - edge.startX) * 0.5);
      ctx.beginPath(); ctx.moveTo(edge.startX, edge.startY);
      ctx.bezierCurveTo(edge.startX + bend, edge.startY, edge.endX - bend, edge.endY, edge.endX, edge.endY);
      ctx.stroke();
      if (edge.label) ctx.fillText(edge.label.slice(0, 24), (edge.startX + edge.endX) / 2, (edge.startY + edge.endY) / 2 - 8);
      ctx.beginPath(); ctx.moveTo(edge.endX - 7, edge.endY - 4); ctx.lineTo(edge.endX, edge.endY); ctx.lineTo(edge.endX - 7, edge.endY + 4); ctx.stroke();
    });
    ctx.draw();
  },
  switchMode(e) { this.setData({ mode: e.currentTarget.dataset.mode }, () => this.drawEdges()); },
  onSearch(e) { this.setData({ query: e.detail.value }); this.refreshView(); },
  onZoom(e) { this.setData({ zoom: Number(e.detail.value) / 100 }); this.refreshView(); },
  locateEntry(e) {
    const node = this.data.nodes.find(item => same(item.id, idOf(e)));
    if (node) this.setData({ mode: 'graph', scrollLeft: Math.max(0, node.x - 30), scrollTop: Math.max(0, node.y - 40) }, () => this.drawEdges());
  },
  resetView() { this.setData({ scrollLeft: 0, scrollTop: 0, zoom: 0.8 }); this.refreshView(); },
  openEntry(e) {
    if (this._movedId && same(this._movedId, idOf(e))) { this._movedId = null; return; }
    const entry = this.data.entries.find(item => same(item.id, idOf(e)));
    if (entry) this.setData({ detail: entry });
  },
  closeDetail() { this.setData({ detail: null }, () => this.drawEdges()); },
  openNew() { if (!this.data.projectId || this.data.loading || this.data.saving) return; this.setData({ editorOpen: true, editingId: null, formTitle: '', formBody: '', formTags: '' }); },
  editEntry(e) {
    if (this.data.saving) return;
    const entry = this.data.entries.find(item => same(item.id, idOf(e)));
    if (entry) this.setData({ editorOpen: true, editingId: entry.id, formTitle: entry.title, formBody: entry.body_text, formTags: (entry.tags || []).join(', ') });
  },
  closeEditor() { if (!this.data.saving) this.setData({ editorOpen: false, editingId: null, formTitle: '', formBody: '', formTags: '' }, () => this.drawEdges()); },
  onTitle(e) { this.setData({ formTitle: e.detail.value }); },
  onBody(e) { this.setData({ formBody: e.detail.value }); },
  onTags(e) { this.setData({ formTags: e.detail.value }); },
  async saveEntry() {
    if (!this.data.projectId || this.data.saving) return;
    const title = this.data.formTitle.trim();
    if (!title) { wx.showToast({ title: '请填写知识标题', icon: 'none' }); return; }
    const projectId = this.data.projectId, epoch = this._epoch || 0, id = this.data.editingId;
    const body = { title, body_text: this.data.formBody, tags: [...new Set(this.data.formTags.split(/[,，\n]/).map(tag => tag.trim()).filter(Boolean))] };
    this.setData({ saving: true });
    try {
      const res = id == null ? await request.post(this.endpoint(projectId) + '/entries', body) : await request.patch(this.endpoint(projectId) + '/entries/' + id, body);
      if (!this.isCurrent(projectId, epoch)) return;
      const entries = id == null ? this.data.entries.concat([res.data]) : this.data.entries.map(entry => same(entry.id, id) ? res.data : entry);
      this.setData({ entries, editorOpen: false, editingId: null, formTitle: '', formBody: '', formTags: '' }); this.refreshView();
    } catch (error) { if (this.isCurrent(projectId, epoch)) wx.showToast({ title: error.message || '保存失败，草稿已保留', icon: 'none' }); }
    finally { if (this.isCurrent(projectId, epoch)) this.setData({ saving: false }); }
  },
  async deleteEntry(e) {
    const id = idOf(e), entry = this.data.entries.find(item => same(item.id, id));
    if (!entry || this.data.saving) return;
    const projectId = this.data.projectId, epoch = this._epoch || 0;
    const answer = await modal({ title: '删除知识条目', content: '删除“' + entry.title + '”及其关联关系？原始材料、汇报和对话会保留。', confirmColor: '#c2413b' });
    if (!answer.confirm || !this.isCurrent(projectId, epoch)) return;
    this.setData({ saving: true });
    try {
      await request.del(this.endpoint(projectId) + '/entries/' + id);
      if (!this.isCurrent(projectId, epoch)) return;
      this.setData({ entries: this.data.entries.filter(item => !same(item.id, id)), links: this.data.links.filter(link => !same(link.source_entry_id, id) && !same(link.target_entry_id, id)), detail: null }); this.refreshView();
    } catch (error) { if (this.isCurrent(projectId, epoch)) wx.showToast({ title: error.message || '删除失败', icon: 'none' }); }
    finally { if (this.isCurrent(projectId, epoch)) this.setData({ saving: false }); }
  },
  viewSource(e) {
    const entry = this.data.entries.find(item => same(item.id, idOf(e)));
    if (entry) wx.showModal({ title: sourceNames[entry.source_type] || '原始来源', content: entry.source_type === 'manual' ? '由你在当前项目中创建的笔记。' : '来源编号：' + entry.source_id + '\n' + JSON.stringify(entry.source_ref || {}, null, 2), showCancel: false });
  },
  async syncSources() {
    if (!this.data.projectId || this.data.syncing || this.data.loading || this.data.saving) return;
    const projectId = this.data.projectId, epoch = this._epoch || 0;
    this.setData({ syncing: true, syncMessage: '' });
    try {
      const res = await request.post(this.endpoint(projectId) + '/sync', {});
      if (!this.isCurrent(projectId, epoch)) return;
      this.setData({ syncMessage: '新增 ' + res.data.created + ' 条，已有 ' + res.data.skipped + ' 条' }); await this.reload();
    } catch (error) { if (this.isCurrent(projectId, epoch)) wx.showToast({ title: error.message || '整理失败', icon: 'none' }); }
    finally { if (this.isCurrent(projectId, epoch)) this.setData({ syncing: false }); }
  },
  openLink() { if (this.data.entries.length >= 2) this.setData({ linkOpen: true, linkSourceIndex: 0, linkTargetIndex: 1, linkLabel: '' }); },
  closeLink() { if (!this.data.saving) this.setData({ linkOpen: false }, () => this.drawEdges()); },
  onLinkSource(e) { this.setData({ linkSourceIndex: Number(e.detail.value) }); },
  onLinkTarget(e) { this.setData({ linkTargetIndex: Number(e.detail.value) }); },
  onLinkLabel(e) { this.setData({ linkLabel: e.detail.value }); },
  async saveLink() {
    const source = this.data.entries[this.data.linkSourceIndex], target = this.data.entries[this.data.linkTargetIndex];
    if (!source || !target || this.data.saving || !this.data.projectId) return;
    if (same(source.id, target.id)) { wx.showToast({ title: '请选择两个不同条目', icon: 'none' }); return; }
    const projectId = this.data.projectId, epoch = this._epoch || 0;
    this.setData({ saving: true });
    try {
      const res = await request.post(this.endpoint(projectId) + '/links', { source_entry_id: source.id, target_entry_id: target.id, label: this.data.linkLabel.trim() });
      if (this.isCurrent(projectId, epoch)) { this.setData({ links: this.data.links.concat([res.data]), linkOpen: false }); this.refreshView(); }
    } catch (error) { if (this.isCurrent(projectId, epoch)) wx.showToast({ title: error.message || '关联失败', icon: 'none' }); }
    finally { if (this.isCurrent(projectId, epoch)) this.setData({ saving: false }); }
  },
  async deleteLink(e) {
    const id = idOf(e), projectId = this.data.projectId, epoch = this._epoch || 0;
    if (this.data.saving || !this.data.links.some(link => same(link.id, id))) return;
    const answer = await modal({ title: '移除关联', content: '确认移除这条知识关联？' });
    if (!answer.confirm || !this.isCurrent(projectId, epoch)) return;
    this.setData({ saving: true });
    try {
      await request.del(this.endpoint(projectId) + '/links/' + id);
      if (this.isCurrent(projectId, epoch)) { this.setData({ links: this.data.links.filter(link => !same(link.id, id)) }); this.refreshView(); }
    } catch (error) { if (this.isCurrent(projectId, epoch)) wx.showToast({ title: error.message || '移除失败', icon: 'none' }); }
    finally { if (this.isCurrent(projectId, epoch)) this.setData({ saving: false }); }
  },
  async editLink(e) {
    const id = idOf(e), link = this.data.links.find(item => same(item.id, id));
    if (!link || this.data.saving) return;
    const projectId = this.data.projectId, epoch = this._epoch || 0;
    const answer = await modal({ title: '编辑关系说明', editable: true, content: link.label || '', placeholderText: '写下两条知识之间的关系' });
    if (!answer.confirm || !this.isCurrent(projectId, epoch)) return;
    this.setData({ saving: true });
    try {
      const res = await request.patch(this.endpoint(projectId) + '/links/' + id, { label: (answer.content || '').trim() });
      if (this.isCurrent(projectId, epoch)) { this.setData({ links: this.data.links.map(item => same(item.id, id) ? res.data : item) }); this.refreshView(); }
    } catch (error) { if (this.isCurrent(projectId, epoch)) wx.showToast({ title: error.message || '关系说明保存失败', icon: 'none' }); }
    finally { if (this.isCurrent(projectId, epoch)) this.setData({ saving: false }); }
  },
  onNodeTouchStart() { this._movedId = null; },
  onNodeMove(e) {
    if (e.detail.source !== 'touch' && e.detail.source !== 'touch-out-of-bounds') return;
    const id = idOf(e), position = {
      x: Math.max(0, e.detail.x / this.data.zoom) + this.data.graphOrigin.x,
      y: Math.max(0, e.detail.y / this.data.zoom) + this.data.graphOrigin.y,
    };
    this._movedId = id; this._dragPositions = this._dragPositions || {}; this._dragPositions[id] = position;
    this.setData({ entries: this.data.entries.map(entry => same(entry.id, id) ? Object.assign({}, entry, { position }) : entry) }); this.refreshView();
  },
  async onNodeDragEnd(e) {
    const id = idOf(e), position = (this._dragPositions || {})[id];
    if (!position) return;
    delete this._dragPositions[id];
    const projectId = this.data.projectId, epoch = this._epoch || 0;
    this._positionVersions = this._positionVersions || {};
    const version = this._positionVersions[id] = (this._positionVersions[id] || 0) + 1;
    this._positionQueues = this._positionQueues || {};
    const key = projectId + ':' + epoch + ':' + id;
    const previous = this._positionQueues[key];
    const persist = async () => {
      if (previous) await previous.catch(() => {});
      return request.patch(this.endpoint(projectId) + '/entries/' + id, { position });
    };
    const pending = persist();
    this._positionQueues[key] = pending;
    try {
      await pending;
    } catch (error) {
      if (this.isCurrent(projectId, epoch) && version === this._positionVersions[id]) this.setData({ error: '位置保存失败，请再拖动一次重试：' + (error.message || '网络异常') });
    } finally { if (this._positionQueues[key] === pending) delete this._positionQueues[key]; }
  },
});
