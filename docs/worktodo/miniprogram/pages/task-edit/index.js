// 新建/编辑任务页面
const app = getApp()
const request = require('../../utils/request')
const dateUtils = require('../../utils/date')

Page({
  data: {
    // 是否编辑模式
    isEdit: false,
    taskId: null,
    // 表单数据
    formData: {
      title: '',
      description: '',
      priority: 1,
      category_id: null,
      due_date: '',
      due_time: '',
      is_recurring: false,
      reminders: []
    },
    // 分类列表
    categories: [],
    // 可选的提醒时间
    reminderOptions: [
      { label: '不提醒', value: 0 },
      { label: '15分钟前', value: 15 },
      { label: '30分钟前', value: 30 },
      { label: '1小时前', value: 60 },
      { label: '1天前', value: 1440 }
    ],
    selectedReminder: 0,
    // 日期选择器显示状态
    showDatePicker: false,
    showTimePicker: false,
    // 当前日期
    currentDate: dateUtils.getToday(),
    currentTime: '12:00',
    // 加载状态
    loading: false,
    submitting: false
  },

  onLoad(options) {
    // 加载分类列表
    this.loadCategories()

    // 编辑模式
    if (options.id) {
      this.setData({
        isEdit: true,
        taskId: parseInt(options.id)
      })
      this.loadTaskData(options.id)
    }
  },

  async loadCategories() {
    try {
      const categories = await request.get('/categories')
      this.setData({ categories })
    } catch (err) {
      console.error('加载分类失败:', err)
    }
  },

  async loadTaskData(taskId) {
    this.setData({ loading: true })
    try {
      const task = await request.get(`/tasks/${taskId}`)

      // 解析截止日期和时间
      let dueDate = ''
      let dueTime = '12:00'
      if (task.due_date) {
        dueDate = dateUtils.formatDateOnly(task.due_date)
        dueTime = dateUtils.formatTime(task.due_date)
      }

      // 解析提醒设置
      let selectedReminder = 0
      if (task.reminders && task.reminders.length > 0) {
        const firstReminder = new Date(task.reminders[0].remind_at)
        const taskTime = new Date(task.due_date)
        const diffMinutes = Math.floor((taskTime - firstReminder) / (1000 * 60))
        selectedReminder = diffMinutes
      }

      this.setData({
        formData: {
          title: task.title,
          description: task.description || '',
          priority: task.priority,
          category_id: task.category ? task.category.id : null,
          due_date: dueDate,
          due_time: dueTime,
          is_recurring: task.is_recurring || false
        },
        selectedReminder,
        currentDate: dueDate || dateUtils.getToday(),
        currentTime: dueTime,
        loading: false
      })
    } catch (err) {
      this.setData({ loading: false })
      wx.showToast({
        title: '加载失败',
        icon: 'none'
      })
    }
  },

  // 标题输入
  onTitleInput(e) {
    this.setData({
      'formData.title': e.detail.value
    })
  },

  // 描述输入
  onDescriptionInput(e) {
    this.setData({
      'formData.description': e.detail.value
    })
  },

  // 优先级选择
  onPriorityChange(e) {
    this.setData({
      'formData.priority': parseInt(e.currentTarget.dataset.value)
    })
  },

  // 分类选择
  onCategoryChange(e) {
    this.setData({
      'formData.category_id': e.currentTarget.dataset.id || null
    })
  },

  // 日期选择
  onDateChange(e) {
    this.setData({
      'formData.due_date': e.detail.value,
      showDatePicker: false
    })
  },

  // 时间选择
  onTimeChange(e) {
    this.setData({
      'formData.due_time': e.detail.value,
      showTimePicker: false
    })
  },

  // 显示日期选择器
  showDatePickerModal() {
    this.setData({ showDatePicker: true })
  },

  // 显示时间选择器
  showTimePickerModal() {
    this.setData({ showTimePicker: true })
  },

  // 关闭日期选择器
  closeDatePicker() {
    this.setData({ showDatePicker: false })
  },

  // 关闭时间选择器
  closeTimePicker() {
    this.setData({ showTimePicker: false })
  },

  // 清除日期
  onClearDate() {
    this.setData({
      'formData.due_date': '',
      'formData.due_time': ''
    })
  },

  // 提醒选择
  onReminderChange(e) {
    this.setData({
      selectedReminder: parseInt(e.currentTarget.dataset.value)
    })
  },

  // 是否重复
  onRecurringChange(e) {
    this.setData({
      'formData.is_recurring': e.detail.value
    })
  },

  // 提交表单
  async onSubmit() {
    const { formData, selectedReminder, isEdit, taskId } = this.data

    // 验证必填项
    if (!formData.title.trim()) {
      wx.showToast({
        title: '请输入任务标题',
        icon: 'none'
      })
      return
    }

    if (formData.title.length > 100) {
      wx.showToast({
        title: '标题不能超过100字',
        icon: 'none'
      })
      return
    }

    this.setData({ submitting: true })

    try {
      // 组合截止日期时间
      let dueDate = null
      if (formData.due_date) {
        const time = formData.due_time || '12:00'
        dueDate = `${formData.due_date}T${time}:00+08:00`
      }

      // 构建请求数据
      const data = {
        title: formData.title.trim(),
        description: formData.description.trim(),
        priority: formData.priority,
        category_id: formData.category_id,
        is_recurring: formData.is_recurring
      }

      if (dueDate) {
        data.due_date = dueDate
      }

      // 处理提醒
      if (selectedReminder > 0 && dueDate) {
        const dueTimeMs = new Date(dueDate).getTime()
        const remindAt = new Date(dueTimeMs - selectedReminder * 60 * 1000).toISOString()
        data.reminders = [{ remind_at: remindAt, remind_type: 0 }]
      }

      if (isEdit) {
        await request.put(`/tasks/${taskId}`, data)
        wx.showToast({ title: '更新成功' })
      } else {
        await request.post('/tasks', data)
        wx.showToast({ title: '创建成功' })
      }

      setTimeout(() => {
        wx.navigateBack()
      }, 1500)
    } catch (err) {
      this.setData({ submitting: false })
      wx.showToast({
        title: err.message || '保存失败',
        icon: 'none'
      })
    }
  },

  // 重置表单
  onReset() {
    this.setData({
      formData: {
        title: '',
        description: '',
        priority: 1,
        category_id: null,
        due_date: '',
        due_time: '',
        is_recurring: false
      },
      selectedReminder: 0
    })
  }
})