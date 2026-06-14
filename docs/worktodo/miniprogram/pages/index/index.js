// 首页（任务列表）页面逻辑
const app = getApp()
const request = require('../../utils/request')
const dateUtils = require('../../utils/date')

Page({
  data: {
    // 任务列表
    tasks: [],
    // 分类列表
    categories: [],
    // 当前选中的分类
    selectedCategoryId: null,
    // 筛选状态: all/pending/completed
    filterStatus: 'all',
    // 搜索关键词
    searchKeyword: '',
    // 分页
    page: 1,
    pageSize: 20,
    hasMore: true,
    // 加载状态
    loading: false,
    refreshing: false,
    // 今日待办统计
    todayStats: {
      total: 0,
      completed: 0,
      pending: 0
    },
    // 用户信息
    userInfo: null
  },

  onLoad() {
    this.setData({
      userInfo: app.globalData.userInfo
    })
  },

  onShow() {
    // 检查登录状态
    if (!app.globalData.token) {
      this.showLoginTip()
    } else {
      this.loadTasks()
      this.loadCategories()
      this.loadTodayStats()
    }
  },

  onPullDownRefresh() {
    this.setData({ refreshing: true, page: 1 })
    Promise.all([
      this.loadTasks(true),
      this.loadCategories(),
      this.loadTodayStats()
    ]).finally(() => {
      this.setData({ refreshing: false })
      wx.stopPullDownRefresh()
    })
  },

  onReachBottom() {
    if (this.data.hasMore && !this.data.loading) {
      this.loadMoreTasks()
    }
  },

  // 加载任务列表
  async loadTasks(reset = false) {
    if (this.data.loading) return

    const page = reset ? 1 : this.data.page

    this.setData({ loading: true })

    try {
      const params = {
        page,
        page_size: this.data.pageSize
      }

      // 添加筛选条件
      if (this.data.selectedCategoryId) {
        params.category_id = this.data.selectedCategoryId
      }

      if (this.data.filterStatus === 'pending') {
        params.status = 0
      } else if (this.data.filterStatus === 'completed') {
        params.status = 2
      }

      if (this.data.searchKeyword) {
        params.search = this.data.searchKeyword
      }

      const data = await request.get('/tasks', params)

      const tasks = reset ? data.items : [...this.data.tasks, ...data.items]

      this.setData({
        tasks,
        page: page + 1,
        hasMore: tasks.length < data.total,
        loading: false
      })
    } catch (err) {
      console.error('加载任务失败:', err)
      this.setData({ loading: false })
    }
  },

  // 加载更多任务
  loadMoreTasks() {
    this.loadTasks()
  },

  // 加载分类列表
  async loadCategories() {
    try {
      const categories = await request.get('/categories')
      this.setData({ categories })
    } catch (err) {
      console.error('加载分类失败:', err)
    }
  },

  // 加载今日统计
  async loadTodayStats() {
    try {
      const stats = await request.get('/tasks/stats', { period: 'today' })
      this.setData({ todayStats: stats })
    } catch (err) {
      console.error('加载统计失败:', err)
    }
  },

  // 显示登录提示
  showLoginTip() {
    wx.showModal({
      title: '提示',
      content: '您还未登录，是否去登录？',
      confirmText: '去登录',
      cancelText: '稍后',
      success: (res) => {
        if (res.confirm) {
          this.doLogin()
        }
      }
    })
  },

  // 执行微信登录
  async doLogin() {
    try {
      wx.showLoading({ title: '登录中...' })
      await app.wxLogin()
      wx.hideLoading()

      wx.showToast({ title: '登录成功' })
      this.onShow()
    } catch (err) {
      wx.hideLoading()
      wx.showToast({
        title: err.message || '登录失败',
        icon: 'none'
      })
    }
  },

  // 切换分类
  onCategoryChange(e) {
    const categoryId = e.currentTarget.dataset.id
    this.setData({
      selectedCategoryId: categoryId === this.data.selectedCategoryId ? null : categoryId,
      page: 1,
      tasks: [],
      hasMore: true
    })
    this.loadTasks(true)
  },

  // 切换状态筛选
  onStatusFilterChange(e) {
    const status = e.currentTarget.dataset.status
    this.setData({
      filterStatus: status,
      page: 1,
      tasks: [],
      hasMore: true
    })
    this.loadTasks(true)
  },

  // 搜索输入
  onSearchInput(e) {
    this.setData({ searchKeyword: e.detail.value })
  },

  // 搜索确认
  onSearchConfirm() {
    this.setData({
      page: 1,
      tasks: [],
      hasMore: true
    })
    this.loadTasks(true)
  },

  // 清除搜索
  onClearSearch() {
    this.setData({
      searchKeyword: '',
      page: 1,
      tasks: [],
      hasMore: true
    })
    this.loadTasks(true)
  },

  // 跳转到任务详情
  onTaskTap(e) {
    const taskId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/task-detail/index?id=${taskId}`
    })
  },

  // 跳转到新建任务
  onCreateTask() {
    wx.navigateTo({
      url: '/pages/task-edit/index'
    })
  },

  // 跳转到编辑任务
  onEditTask(e) {
    const taskId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/task-edit/index?id=${taskId}`
    })
  },

  // 标记任务完成
  async onCompleteTask(e) {
    const taskId = e.currentTarget.dataset.id
    try {
      await request.patch(`/tasks/${taskId}/complete`)
      wx.showToast({ title: '已完成' })

      // 更新本地任务状态
      const tasks = this.data.tasks.map(task => {
        if (task.id === taskId) {
          return { ...task, status: 2, completed_at: new Date().toISOString() }
        }
        return task
      })
      this.setData({ tasks })

      // 刷新统计
      this.loadTodayStats()
    } catch (err) {
      wx.showToast({
        title: err.message || '操作失败',
        icon: 'none'
      })
    }
  },

  // 取消任务完成
  async onUncompleteTask(e) {
    const taskId = e.currentTarget.dataset.id
    try {
      await request.patch(`/tasks/${taskId}/uncomplete`)
      wx.showToast({ title: '已取消完成' })

      const tasks = this.data.tasks.map(task => {
        if (task.id === taskId) {
          return { ...task, status: 0, completed_at: null }
        }
        return task
      })
      this.setData({ tasks })

      this.loadTodayStats()
    } catch (err) {
      wx.showToast({
        title: err.message || '操作失败',
        icon: 'none'
      })
    }
  },

  // 删除任务
  onDeleteTask(e) {
    const taskId = e.currentTarget.dataset.id
    wx.showModal({
      title: '确认删除',
      content: '确定要删除这个任务吗？',
      success: async (res) => {
        if (res.confirm) {
          try {
            await request.del(`/tasks/${taskId}`)
            wx.showToast({ title: '已删除' })

            // 从列表移除
            const tasks = this.data.tasks.filter(task => task.id !== taskId)
            this.setData({ tasks })

            this.loadTodayStats()
          } catch (err) {
            wx.showToast({
              title: err.message || '删除失败',
              icon: 'none'
            })
          }
        }
      }
    })
  },

  // 格式化任务相对时间
  formatTaskTime(dueDate) {
    if (!dueDate) return ''
    return dateUtils.getDateLabel(dueDate) + ' ' + dateUtils.formatTime(dueDate)
  },

  // 获取优先级文本
  getPriorityText(priority) {
    const map = { 0: '低', 1: '中', 2: '高' }
    return map[priority] || '中'
  },

  // 获取优先级样式
  getPriorityClass(priority) {
    const map = { 0: 'priority-low', 1: 'priority-medium', 2: 'priority-high' }
    return map[priority] || 'priority-medium'
  }
})