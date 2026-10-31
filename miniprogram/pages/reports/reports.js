const request = require('../../utils/request');

function unwrap(res) {
  const data = res && res.data;
  if (Array.isArray(data)) return data;
  if (data && Array.isArray(data.items)) return data.items;
  return [];
}

Page({
  data: { tab: 'reports', reports: [], allReports: [], inbox: [], unreadCount: 0, projects: [], selectedProjectId: '', selectedProjectIndex: 0, projectReports: [], projectSummary: null, leadershipSummary: null, isLeader: false, companyId: '', loading: false, managerLoading: false },

  onLoad(options) { this.setData({ selectedProjectId: options && options.project_id ? String(options.project_id) : '' }); },
  onShow() { this.load(); },

  async load() {
    this.setData({ loading: true });
    try {
      const companies = await request.get('/companies/mine');
      const companyItems = (companies.data && companies.data.items) || [];
      const companyId = companyItems.length ? companyItems[0].id : null;
      const isLeader = !!(companyItems.length && companyItems[0].my_membership && (companyItems[0].my_membership.is_org_leader || companyItems[0].my_membership.is_super_admin));
      const [mine, inbox, projects] = await Promise.all([
        request.get('/reports/my'),
        request.get('/reports/inbox'),
        companyId ? request.get('/projects?company_id=' + companyId + '&page_size=100') : Promise.resolve({ data: { items: [] } })
      ]);
      const projectItems = unwrap(projects);
      const selected = projectItems.some(p => String(p.id) === this.data.selectedProjectId) ? this.data.selectedProjectId : (projectItems[0] && String(projectItems[0].id)) || '';
      const selectedIndex = Math.max(0, projectItems.findIndex(p => String(p.id) === String(selected)));
      const inboxItems = unwrap(inbox);
      this.setData({ allReports: unwrap(mine), reports: unwrap(mine).filter(item => String(item.project_id) === String(selected)), inbox: inboxItems, unreadCount: inboxItems.filter(item => !(item.read || item.is_read)).length, projects: projectItems, selectedProjectId: selected, selectedProjectIndex: selectedIndex, companyId: companyId || '', isLeader, loading: false });
      if (selected) this.loadProjectReports(selected);
      if (isLeader && companyId) this.loadLeadershipSummary(companyId);
    } catch (e) {
      this.setData({ loading: false });
      wx.showToast({ title: (e && e.message) || '汇报加载失败', icon: 'none' });
    }
  },

  switchTab(e) { this.setData({ tab: e.currentTarget.dataset.tab }); },

  openKnowledge() {
    const id = this.data.selectedProjectId;
    wx.navigateTo({ url: '/pages/knowledge/knowledge' + (id ? '?project_id=' + encodeURIComponent(id) : '') });
  },

  onProjectChange(e) {
    const id = e.detail.value;
    const project = this.data.projects[id];
    if (!project) return;
    this.setData({ selectedProjectId: String(project.id), selectedProjectIndex: Number(id), reports: this.data.allReports.filter(item => String(item.project_id) === String(project.id)), projectReports: [], projectSummary: null });
    this.loadProjectReports(project.id);
  },

  async loadProjectReports(projectId) {
    this.setData({ managerLoading: true, projectReports: [] });
    try {
      const res = await request.get('/projects/' + projectId + '/agent-reports');
      if (String(this.data.selectedProjectId) !== String(projectId)) return;
      this.setData({ projectReports: unwrap(res), managerLoading: false });
    } catch (e) {
      if (String(this.data.selectedProjectId) !== String(projectId)) return;
      this.setData({ projectReports: [], managerLoading: false });
      wx.showToast({ title: (e && e.message) || '项目汇报加载失败', icon: 'none' });
    }
  },

  async aggregateProject() {
    const projectId = this.data.selectedProjectId;
    if (!projectId) return;
    wx.showLoading({ title: '汇总中...' });
    try {
      await request.post('/projects/' + projectId + '/report-agents/bindings', {});
      const res = await request.post('/projects/' + projectId + '/agent-reports/aggregate', {});
      if (String(this.data.selectedProjectId) !== String(projectId)) return;
      this.setData({ projectSummary: res.data });
      await this.loadProjectReports(this.data.selectedProjectId);
      wx.showToast({ title: '项目汇报已汇总', icon: 'success' });
    } catch (e) { wx.showToast({ title: (e && e.message) || '项目汇总失败', icon: 'none' }); }
    finally { wx.hideLoading(); }
  },

  async loadLeadershipSummary(companyId) {
    try {
      const res = await request.get('/companies/' + companyId + '/leadership-reports/latest');
      this.setData({ leadershipSummary: res.data || null });
    } catch (_) { this.setData({ leadershipSummary: null }); }
  },

  async aggregateLeadership() {
    if (!this.data.companyId) return;
    wx.showLoading({ title: '汇总中...' });
    try {
      const res = await request.post('/companies/' + this.data.companyId + '/leadership-reports/aggregate', { project_ids: [] });
      this.setData({ leadershipSummary: res.data || null });
      wx.showToast({ title: '总领导摘要已更新', icon: 'success' });
    } catch (e) { wx.showToast({ title: (e && e.message) || '暂无总领导权限', icon: 'none' }); }
    finally { wx.hideLoading(); }
  },

  openReport(e) {
    const id = e.currentTarget.dataset.id;
    if (id == null) return;
    wx.navigateTo({ url: '/pages/report-detail/report-detail?id=' + id });
  },

  async markRead(e) {
    const id = e.currentTarget.dataset.id;
    if (id == null) return;
    try {
      await request.put('/reports/inbox/' + id + '/read', {});
      this.setData({ inbox: this.data.inbox.map(item => item.id == id ? Object.assign({}, item, { read: true, is_read: true }) : item), unreadCount: Math.max(0, this.data.unreadCount - 1) });
    } catch (_) {}
  },

  generate() {
    const projectId = this.data.selectedProjectId;
    if (!projectId) { wx.showToast({ title: '请先选择汇报项目', icon: 'none' }); return; }
    wx.showModal({
      title: '生成汇报',
      content: '智能体会根据你已提交的任务、材料和主动输入生成汇报草稿。',
      success: async (r) => {
        if (!r.confirm) return;
        wx.showLoading({ title: '生成中...' });
        try {
          const body = { project_id: Number(projectId) };
          await request.post('/reports/generate', body);
          wx.showToast({ title: '草稿已生成', icon: 'success' });
          this.load();
        } catch (e) {
          wx.showToast({ title: (e && e.message) || '生成失败', icon: 'none' });
        } finally { wx.hideLoading(); }
      }
    });
  },

  onPullDownRefresh() { this.load().then(() => wx.stopPullDownRefresh()); }
});
