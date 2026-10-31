const request = require('../../utils/request');
const items = res => Array.isArray(res.data) ? res.data : ((res.data && res.data.items) || []);
const modal = options => new Promise(resolve => wx.showModal(Object.assign({}, options, { success: resolve, fail: () => resolve({ confirm: false }) })));
const inferKind = files => {
  const kinds = files.map(file => {
    const extension = (file.name.split('.').pop() || '').toLowerCase();
    if (/^(fig|sketch)$/.test(extension)) return 'figma';
    if (extension === 'log') return 'log';
    if (/^(ts|tsx|js|jsx|py|java|go|rs|c|cpp|h|css|html|sql|patch|diff)$/.test(extension)) return 'commit';
    return /^(pdf|doc|docx|xls|xlsx|ppt|pptx|txt|md|csv|rtf|odt)$/.test(extension) ? 'document' : 'delivery';
  });
  return kinds.length && kinds.every(kind => kind === kinds[0]) ? kinds[0] : kinds.length ? 'delivery' : 'document';
};

Page({
  data: {
    projectId: '', project: null, cards: [], nodes: [], members: [], permissions: {}, loading: false, saving: false, error: '',
    focusId: null, detail: null, editorOpen: false, editingId: null, formTitle: '', formDescription: '', memberIndex: 0,
    parentIndex: 0, parentOptions: [], addParentId: null, canAddMain: false, canChangeParent: false, canChangeMember: false,
    deletion: null, deletionChoices: [], deletionChoiceIndex: 0, evidenceNodeId: null, caption: '', uploadedFiles: [], uploading: false,
    voiceRecording: false, voiceAsking: false, voiceTranscribing: false, voiceError: '', voiceAudioPath: '',
  },

  onLoad(options) {
    this.setData({ projectId: String(options.project_id || options.id || '') });
    return this.reload();
  },

  onHide() { this.cancelVoice(); },
  onUnload() { this.cancelVoice(); if (this._recorder) { this._recorder.offStart(this._voiceOnStart); this._recorder.offStop(this._voiceOnStop); this._recorder.offError(this._voiceOnError); } },

  async reload() {
    if (!this.data.projectId) { this.setData({ error: '缺少项目，请从项目页进入' }); return; }
    this.setData({ loading: true, error: '' });
    try {
      const id = this.data.projectId;
      const [tree, permissions, members, project] = await Promise.all([
        request.get('/projects/' + id + '/tree?format=flat'), request.get('/projects/' + id + '/my-permissions'),
        request.get('/projects/' + id + '/members'), request.get('/projects/' + id),
      ]);
      this.setData({ nodes: (tree.data && tree.data.nodes) || [], permissions: permissions.data || {},
        members: items(members).filter(member => !member.left_at).map(member => Object.assign({}, member, { name: member.display_name || member.nickname || member.username || '成员' + member.user_id })),
        project: project.data, canAddMain: !!(permissions.data && (permissions.data.is_pm || permissions.data.is_superadmin)) });
      this.refreshCards();
    } catch (error) { this.setData({ error: error.message || '加载责任树失败' }); }
    finally { this.setData({ loading: false }); }
  },

  isDescendant(id, ancestorId) {
    let node = this.data.nodes.find(item => String(item.id) === String(id));
    const seen = new Set();
    while (node && !seen.has(node.id)) {
      if (String(node.id) === String(ancestorId)) return true;
      seen.add(node.id);
      node = this.data.nodes.find(item => String(item.id) === String(node.parent_id));
    }
    return false;
  },

  refreshCards() {
    const { nodes, permissions, members, focusId } = this.data;
    const managers = !!(permissions.is_pm || permissions.is_superadmin);
    const cards = nodes.filter(node => node.node_type_key === 'person' && (!focusId || this.isDescendant(node.id, focusId))).map(node => {
      const capability = (permissions.node_permissions || {})[node.id] || {};
      const primary = (node.assignees || []).find(assignment => assignment.role_key === 'primary');
      const member = primary && members.find(item => String(item.user_id) === String(primary.user_id));
      const matters = nodes.filter(item => String(item.parent_id) === String(node.id) && item.node_type_key !== 'person');
      const parent = nodes.find(item => String(item.id) === String(node.parent_id));
      return Object.assign({}, node, {
        originLabel: node.node_origin === 'subordinate' ? '下辖分支' : '项目主责任',
        personName: (member && member.name) || (primary && (primary.display_name || primary.nickname)) || '未指定责任人',
        parentTitle: parent ? parent.title : '项目根级', matters: matters.slice(0, 3), matterCount: matters.length,
        canEdit: !!capability.can_edit_person && (managers || node.node_origin === 'subordinate'),
        canMove: !!capability.can_move_person && (managers || node.node_origin === 'subordinate'),
        canDelete: !!capability.can_delete_person, canAdd: !!capability.can_add_subordinate,
        canChannel: !!capability.can_manage_channel_access, channelAccess: !!(node.responsibility_permissions || {}).channel_access,
        canSubmit: !!capability.can_submit_evidence,
      });
    });
    this.setData({ cards });
    if (this.data.detail) this.openDetail({ currentTarget: { dataset: { id: this.data.detail.id } } });
  },

  focusBranch(e) { this.setData({ focusId: e.currentTarget.dataset.id || null, detail: null }); this.refreshCards(); },
  resetFocus() { this.setData({ focusId: null }); this.refreshCards(); },
  openDetail(e) {
    const card = this.data.cards.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    if (card) this.setData({ detail: Object.assign({}, card, { allMatters: this.data.nodes.filter(node => String(node.parent_id) === String(card.id) && node.node_type_key !== 'person') }) });
  },
  closeDetail() { this.setData({ detail: null }); },

  openAdd(e) {
    const parentId = e.currentTarget.dataset.id || null;
    const parent = this.data.cards.find(card => String(card.id) === String(parentId));
    if (!(parent ? parent.canAdd : this.data.canAddMain)) return;
    this.setData({ editorOpen: true, editingId: null, addParentId: parentId, formTitle: '', formDescription: '', memberIndex: 0,
      canChangeMember: true, canChangeParent: false, parentOptions: [], parentIndex: 0 });
  },

  editPerson(e) {
    const node = this.data.cards.find(card => String(card.id) === String(e.currentTarget.dataset.id));
    if (!node || !node.canEdit) return;
    const capability = (this.data.permissions.node_permissions || {})[node.id] || {};
    const primary = (node.assignees || []).find(item => item.role_key === 'primary');
    const parentOptions = this.data.nodes.filter(item => item.node_type_key === 'person' && !this.isDescendant(item.id, node.id)
      && (node.node_origin === 'subordinate' || item.node_origin !== 'subordinate'));
    if (this.data.canAddMain) parentOptions.unshift({ id: null, title: '项目根级' });
    this.setData({ editorOpen: true, editingId: node.id, addParentId: node.parent_id, formTitle: node.title,
      formDescription: node.description || '', memberIndex: Math.max(0, this.data.members.findIndex(item => primary && String(item.user_id) === String(primary.user_id))),
      parentOptions, parentIndex: Math.max(0, parentOptions.findIndex(item => String(item.id) === String(node.parent_id))),
      canChangeParent: node.canMove, canChangeMember: !!capability.can_manage_assignees });
  },
  closeEditor() { if (!this.data.saving) this.setData({ editorOpen: false }); },
  onTitle(e) { this.setData({ formTitle: e.detail.value }); },
  onDescription(e) { this.setData({ formDescription: e.detail.value }); },
  onMember(e) { this.setData({ memberIndex: Number(e.detail.value) }); },
  onParent(e) { this.setData({ parentIndex: Number(e.detail.value) }); },

  async savePerson() {
    const title = this.data.formTitle.trim();
    const member = this.data.members[this.data.memberIndex];
    if (!title || this.data.saving || (!this.data.editingId && !member)) return;
    this.setData({ saving: true });
    try {
      if (this.data.editingId) {
        const node = this.data.cards.find(item => String(item.id) === String(this.data.editingId));
        if (!node || !node.canEdit) throw new Error('无权编辑此责任人');
        const body = { title, description: this.data.formDescription };
        if (this.data.canChangeMember && member) body.assignees = [{ user_id: member.user_id, role_key: 'primary' }].concat((node.assignees || []).filter(item => item.role_key !== 'primary' && item.user_id !== member.user_id));
        await request.patch('/nodes/' + node.id, body);
        const parent = this.data.parentOptions[this.data.parentIndex];
        if (this.data.canChangeParent && parent && String(parent.id) !== String(node.parent_id)) await request.post('/nodes/' + node.id + '/move', { new_parent_id: parent.id });
      } else {
        const parent = this.data.cards.find(item => String(item.id) === String(this.data.addParentId));
        if (!(parent ? parent.canAdd : this.data.canAddMain)) throw new Error('无权在此新增责任人');
        await request.post('/projects/' + this.data.projectId + '/nodes', {
          title, description: this.data.formDescription, parent_id: this.data.addParentId, node_type_key: 'person',
          node_origin: this.data.canAddMain && (!parent || parent.node_origin === 'project') ? 'project' : 'subordinate',
          assignees: [{ user_id: member.user_id, role_key: 'primary' }],
        });
      }
      this.setData({ editorOpen: false });
      await this.reload();
    } catch (error) { wx.showToast({ title: error.message || '保存失败', icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  },

  async toggleChannel(e) {
    const card = this.data.cards.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    if (!card || !card.canChannel) return;
    try {
      await request.patch('/nodes/' + card.id, { responsibility_permissions: Object.assign({}, card.responsibility_permissions || {}, { channel_access: !!e.detail.value }) });
      await this.reload();
    } catch (error) { wx.showToast({ title: error.message || '授权失败', icon: 'none' }); }
  },

  async previewDelete(e) {
    const card = this.data.cards.find(item => String(item.id) === String(e.currentTarget.dataset.id));
    if (!card || !card.canDelete) return;
    try {
      const res = await request.get('/nodes/' + card.id + '/deletion-preview');
      this.setData({ deletion: res.data, deletionChoiceIndex: 0, deletionChoices: [{ id: null, title: '删除本人及全部下级' }].concat((res.data.handover_candidates || []).map(item => ({ id: item.id, title: '交接给：' + item.title }))) });
    } catch (error) { wx.showToast({ title: error.message || '无法加载删除影响', icon: 'none' }); }
  },
  closeDeletion() { if (!this.data.saving) this.setData({ deletion: null }); },
  onDeletionChoice(e) { this.setData({ deletionChoiceIndex: Number(e.detail.value) }); },
  async confirmDelete() {
    const preview = this.data.deletion;
    if (!preview || !preview.preview_token || this.data.saving) return;
    const choice = this.data.deletionChoices[this.data.deletionChoiceIndex];
    const answer = await modal({ title: choice && choice.id ? '确认交接并删除人员' : '确认删除整条责任分支', content: preview.warning || '此操作将影响关联人员、任务与材料，请确认已核对影响。', confirmText: '确认操作', confirmColor: '#c22' });
    if (!answer.confirm) return;
    this.setData({ saving: true });
    try {
      const query = '?preview_token=' + encodeURIComponent(preview.preview_token) + (choice && choice.id ? '&handover_to_node_id=' + choice.id : '&cascade=true');
      await request.del('/nodes/' + preview.node_id + query);
      this.setData({ deletion: null, detail: null });
      await this.reload();
    } catch (error) { wx.showToast({ title: error.message || '删除失败，请重新获取预览', icon: 'none' }); this.setData({ deletion: null }); }
    finally { this.setData({ saving: false }); }
  },

  openEvidence(e) { this.cancelVoice(); this.setData({ evidenceNodeId: e.currentTarget.dataset.id, caption: '', uploadedFiles: [] }); },
  closeEvidence() { if (!this.data.uploading && !this.data.saving) { this.cancelVoice(); this.setData({ evidenceNodeId: null }); } },
  onCaption(e) { this.setData({ caption: e.detail.value }); },
  startVoice() {
    if (this.data.saving || this.data.voiceRecording || this.data.voiceAsking || this.data.voiceTranscribing) return;
    if (!wx.getRecorderManager) { this.setData({ voiceError: '当前环境无法录音，请直接输入文字。' }); return; }
    if (!this._recorder) {
      this._recorder = wx.getRecorderManager();
      this._voiceOnStart = () => { if (!this._voiceCancelled) this.setData({ voiceAsking:false, voiceRecording:true }); };
      this._voiceOnStop = result => {
        const cancelled = this._voiceCancelled;
        this.setData({ voiceAsking:false, voiceRecording:false });
        if (!cancelled && result.tempFilePath) void this.transcribeVoice(result.tempFilePath);
      };
      this._voiceOnError = () => this.setData({ voiceRecording:false, voiceAsking:false, voiceError:'录音未启动或已中断，请检查微信麦克风权限，或直接输入文字。' });
      this._recorder.onStart(this._voiceOnStart); this._recorder.onStop(this._voiceOnStop); this._recorder.onError(this._voiceOnError);
    }
    this._voiceCancelled = false;
    this.setData({ voiceAsking:true, voiceError:'', voiceAudioPath:'' });
    this._recorder.start({ duration:120000, sampleRate:16000, numberOfChannels:1, encodeBitRate:48000, format:'mp3' });
  },
  stopVoice() { if (this.data.voiceRecording) this._recorder.stop(); },
  cancelVoice() {
    this._voiceCancelled = true; this._voiceRevision = (this._voiceRevision || 0) + 1;
    this._voiceUpload && this._voiceUpload.abort(); this._voiceUpload = null;
    if (this._recorder && (this.data.voiceRecording || this.data.voiceAsking)) this._recorder.stop();
    this.setData({ voiceRecording:false, voiceAsking:false, voiceTranscribing:false, voiceError:'', voiceAudioPath:'' });
  },
  async transcribeVoice(filePath) {
    const revision = this._voiceRevision = (this._voiceRevision || 0) + 1;
    const nodeId = this.data.evidenceNodeId, projectId = this.data.projectId;
    const app = getApp();
    this.setData({ voiceTranscribing:true, voiceError:'', voiceAudioPath:filePath });
    try {
      const res = await new Promise((resolve,reject) => {
        this._voiceUpload = wx.uploadFile({ url:app.globalData.baseUrl + '/asr/transcribe', filePath, name:'file',
          formData:{ company_id:String(this.data.project.company_id), project_id:projectId },
          header:{ Authorization:'Bearer ' + app.globalData.token, 'X-Client-Channel':'miniprogram' }, success:resolve, fail:reject });
      });
      if (revision !== this._voiceRevision || nodeId !== this.data.evidenceNodeId || projectId !== this.data.projectId) return;
      const response = JSON.parse(res.data), text = response.data && response.data.text;
      if (res.statusCode < 200 || res.statusCode >= 300) throw new Error(response.message || '语音转写失败，请重试或直接输入。');
      if (!text || !text.trim() || text.indexOf('[builtin-asr]') === 0) throw new Error('没有识别到有效文字，请重试。');
      this.setData({ caption:[this.data.caption.replace(/\s+$/,''),text.trim()].filter(Boolean).join('\n'), voiceAudioPath:'' });
    } catch (error) { if (revision === this._voiceRevision) this.setData({ voiceError:error.message || '语音转写失败，请重试或直接输入。' }); }
    finally { if (revision === this._voiceRevision) { this._voiceUpload = null; this.setData({ voiceTranscribing:false }); } }
  },
  retryVoice() { if (this.data.voiceAudioPath && !this.data.voiceTranscribing) void this.transcribeVoice(this.data.voiceAudioPath); },
  async chooseFiles() {
    if (this.data.uploading || this.data.saving) return;
    const result = await new Promise(resolve => wx.chooseMessageFile({ count: 9, type: 'file', success: resolve, fail: () => resolve({ tempFiles: [] }) }));
    const app = getApp();
    this.setData({ uploading: true });
    try {
      for (const file of result.tempFiles || []) {
        const res = await new Promise((resolve, reject) => wx.uploadFile({ url: app.globalData.baseUrl + '/evidence/files', filePath: file.path, name: 'file',
          formData: { company_id: String(this.data.project.company_id), project_id: this.data.projectId }, header: { Authorization: 'Bearer ' + app.globalData.token, 'X-Client-Channel': 'miniprogram' }, success: resolve, fail: reject }));
        const data = JSON.parse(res.data);
        if (res.statusCode < 200 || res.statusCode >= 300 || !data.data || !data.data.file_id) throw new Error(data.message || '文件上传失败');
        this.setData({ uploadedFiles: this.data.uploadedFiles.concat([{ id: data.data.file_id, name: file.name }]) });
      }
    } catch (error) { wx.showToast({ title: error.message || '文件上传失败', icon: 'none' }); }
    finally { this.setData({ uploading: false }); }
  },
  async submitEvidence() {
    if (this.data.saving || this.data.uploading || this.data.voiceRecording || this.data.voiceAsking || this.data.voiceTranscribing || !this.data.caption.trim()) return;
    const capability = (this.data.permissions.node_permissions || {})[this.data.evidenceNodeId] || {};
    if (!capability.can_submit_evidence) return;
    this.setData({ saving: true });
    try {
      await request.post('/nodes/' + this.data.evidenceNodeId + '/evidence', { summary_text: this.data.caption.trim(), evidence_kind: inferKind(this.data.uploadedFiles), file_ids: this.data.uploadedFiles.map(file => file.id) });
      this.setData({ evidenceNodeId: null });
      wx.showToast({ title: '材料已提交', icon: 'success' });
    } catch (error) { wx.showToast({ title: error.message || '提交失败', icon: 'none' }); }
    finally { this.setData({ saving: false }); }
  },
});
