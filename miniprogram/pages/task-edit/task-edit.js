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
    categoryName: '',
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
    request.get(`/tasks/${taskId}`)
      .then((res) => {
        // 响应信封 {code, message, data}
        const data = res.data;
        this.setData({
          title: data.title,
          description: data.description || '',
          priority: data.priority,
          categoryId: data.category ? data.category.id : null,
          categoryName: data.category ? data.category.name : '',
          tagIds: data.tags ? data.tags.map(t => t.id) : [],
          dueDate: data.due_date ? dateUtils.formatDate(data.due_date, 'YYYY-MM-DD HH:mm') : '',
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
      request.get('/categories'),
      request.get('/tags')
    ]).then(([catRes, tagRes]) => {
      // 两个接口都是信封结构，列表在 data 里
      this.setData({ categories: catRes.data || [], tags: tagRes.data || [] });
    }).catch(() => {});
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
    // picker selector 返回的是下标，不是分类 id
    const index = parseInt(e.detail.value);
    const category = this.data.categories[index];
    if (category) {
      this.setData({ categoryId: category.id, categoryName: category.name });
    }
  },

  onTagChange(e) {
    // checkbox-group 的 value 是字符串数组，转回数字 id
    this.setData({ tagIds: e.detail.value.map(v => parseInt(v)) });
  },

  onDueDateChange(e) {
    this.setData({ dueDate: e.detail.value });
  },

  onRecurringChange(e) {
    this.setData({ isRecurring: e.detail.value });
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
      // iOS 不认带空格的日期串，转成 ISO 再发
      due_date: dueDate ? new Date(dueDate.replace(' ', 'T')).toISOString() : null,
      is_recurring: isRecurring
    };

    const api = this.data.isEdit
      ? request.put(`/tasks/${this.data.taskId}`, data)
      : request.post('/tasks', data);

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
