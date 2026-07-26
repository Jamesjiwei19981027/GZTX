const request = require('../../utils/request');
const dateUtils = require('../../utils/date');

Page({
  data: {
    isEdit: false,
    taskId: null,
    title: '',
    description: '',
    priority: 1,
    categoryId: null,
    tagIds: [],
    dueDate: '',
    isRecurring: false,
    categories: [],
    tags: [],
    loading: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, taskId: options.id });
      this.fetchTaskDetail(options.id);
    }
    this.fetchCategoriesAndTags();
  },

  fetchTaskDetail(taskId) {
    this.setData({ loading: true });
    request.get(`/tasks/${taskId}`, true)
      .then(data => {
        this.setData({
          title: data.title,
          description: data.description || '',
          priority: data.priority,
          categoryId: data.category ? data.category.id : null,
          tagIds: data.tags ? data.tags.map(t => t.id) : [],
          dueDate: data.due_date ? dateUtils.formatDate(data.due_date, 'YYYY-MM-DDTHH:mm') : '',
          isRecurring: data.is_recurring,
          loading: false
        });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  fetchCategoriesAndTags() {
    Promise.all([
      request.get('/categories', true),
      request.get('/tags', true)
    ]).then(([categories, tags]) => {
      this.setData({ categories, tags });
    });
  },

  onTitleChange(e) {
    this.setData({ title: e.detail.value });
  },

  onDescriptionChange(e) {
    this.setData({ description: e.detail.value });
  },

  onPriorityChange(e) {
    this.setData({ priority: parseInt(e.detail.value) });
  },

  onCategoryChange(e) {
    this.setData({ categoryId: parseInt(e.detail.value) });
  },

  onTagChange(e) {
    this.setData({ tagIds: e.detail.value });
  },

  onDueDateChange(e) {
    this.setData({ dueDate: e.detail.value });
  },

  onRecurringChange(e) {
    this.setData({ isRecurring: e.detail.value.length > 0 });
  },

  onSave() {
    const { title, priority, categoryId, tagIds, dueDate, isRecurring } = this.data;

    if (!title.trim()) {
      wx.showToast({ title: '请输入任务标题', icon: 'none' });
      return;
    }

    const data = {
      title: title.trim(),
      description: this.data.description.trim(),
      priority,
      category_id: categoryId,
      tag_ids: tagIds,
      due_date: dueDate ? new Date(dueDate).toISOString() : null,
      is_recurring: isRecurring
    };

    const api = this.data.isEdit
      ? request.put(`/tasks/${this.data.taskId}`, data, true)
      : request.post('/tasks', data, true);

    // 必须有 catch：否则失败时既不提示也不返回，用户只会反复点提交
    api
      .then(() => {
        wx.showToast({ title: this.data.isEdit ? '更新成功' : '创建成功' });
        wx.navigateBack();
      })
      .catch((err) => {
        wx.showToast({
          title: (err && err.message) || '保存失败',
          icon: 'none'
        });
      });
  }
});