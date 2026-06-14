// 日历视图页面
const app = getApp()
const request = require('../../utils/request')
const dateUtils = require('../../utils/date')

Page({
  data: {
    // 当前年月
    currentYear: new Date().getFullYear(),
    currentMonth: new Date().getMonth() + 1,
    // 日历数据
    calendarDays: [],
    // 当前选中日期的任务
    selectedDate: null,
    selectedDateTasks: [],
    // 某天有任务的标记
    taskDates: {},
    // 加载状态
    loading: false
  },

  onLoad() {
    this.initCalendar()
  },

  onShow() {
    this.loadTasksForMonth()
  },

  onPullDownRefresh() {
    this.loadTasksForMonth().finally(() => {
      wx.stopPullDownRefresh()
    })
  },

  // 初始化日历
  initCalendar() {
    const { currentYear, currentMonth } = this.data
    const calendarDays = dateUtils.getCalendarDays(currentYear, currentMonth)
    this.setData({
      calendarDays,
      selectedDate: dateUtils.formatDateOnly(new Date())
    })
    this.updateCalendarDays(calendarDays)
  },

  // 更新日历天的任务信息
  updateCalendarDays(days) {
    const taskDates = this.data.taskDates
    const updatedDays = days.map(day => {
      const dateStr = dateUtils.formatDateOnly(day.date)
      return {
        ...day,
        hasTask: !!taskDates[dateStr],
        taskCount: taskDates[dateStr] || 0
      }
    })
    this.setData({ calendarDays: updatedDays })
  },

  // 加载当月任务
  async loadTasksForMonth() {
    const { currentYear, currentMonth } = this.data

    this.setData({ loading: true })

    try {
      // 获取本月开始和结束日期
      const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`
      const endDate = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0]

      const data = await request.get('/tasks', {
        due_date_from: startDate,
        due_date_to: endDate,
        page_size: 100
      })

      // 整理任务日期标记
      const taskDates = {}
      data.items.forEach(task => {
        if (task.due_date) {
          const dateStr = task.due_date.split('T')[0]
          taskDates[dateStr] = (taskDates[dateStr] || 0) + 1
        }
      })

      this.setData({ taskDates, loading: false })
      this.updateCalendarDays(this.data.calendarDays)

      // 如果有选中的日期，更新该日期的任务
      if (this.data.selectedDate) {
        this.loadTasksForDate(this.data.selectedDate)
      }
    } catch (err) {
      this.setData({ loading: false })
      console.error('加载任务失败:', err)
    }
  },

  // 选择日期
  onDateSelect(e) {
    const dateStr = e.currentTarget.dataset.date
    const day = this.data.calendarDays.find(d => dateUtils.formatDateOnly(d.date) === dateStr)

    if (day && day.isCurrentMonth) {
      this.setData({ selectedDate: dateStr })
      this.loadTasksForDate(dateStr)
    }
  },

  // 加载选中日期的任务
  async loadTasksForDate(dateStr) {
    try {
      const data = await request.get('/tasks', {
        due_date_from: dateStr,
        due_date_to: dateStr
      })
      this.setData({ selectedDateTasks: data.items })
    } catch (err) {
      console.error('加载任务失败:', err)
    }
  },

  // 上一个月
  prevMonth() {
    let { currentYear, currentMonth } = this.data
    if (currentMonth === 1) {
      currentYear -= 1
      currentMonth = 12
    } else {
      currentMonth -= 1
    }
    this.setData({ currentYear, currentMonth })
    this.initCalendar()
    this.loadTasksForMonth()
  },

  // 下一个月
  nextMonth() {
    let { currentYear, currentMonth } = this.data
    if (currentMonth === 12) {
      currentYear += 1
      currentMonth = 1
    } else {
      currentMonth += 1
    }
    this.setData({ currentYear, currentMonth })
    this.initCalendar()
    this.loadTasksForMonth()
  },

  // 跳转到今天
  goToToday() {
    const today = new Date()
    this.setData({
      currentYear: today.getFullYear(),
      currentMonth: today.getMonth() + 1
    })
    this.initCalendar()
    this.loadTasksForMonth()
  },

  // 跳转任务详情
  onTaskTap(e) {
    const taskId = e.currentTarget.dataset.id
    wx.navigateTo({
      url: `/pages/task-detail/index?id=${taskId}`
    })
  },

  // 获取月份标题
  get monthTitle() {
    const { currentYear, currentMonth } = this.data
    return `${currentYear}年${currentMonth}月`
  },

  // 星期标题
  weekdays: ['日', '一', '二', '三', '四', '五', '六']
})