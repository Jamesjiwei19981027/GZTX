const request = require('../../utils/request');
const dateUtils = require('../../utils/date');

Page({
  data: {
    currentDate: '',
    currentYear: 0,
    currentMonth: 0,
    daysInMonth: [],
    tasksByDate: {},
    selectedDate: null,
    selectedTasks: [],
    loading: false
  },

  onLoad() {
    const now = new Date();
    this.setData({
      currentYear: now.getFullYear(),
      currentMonth: now.getMonth() + 1,
      currentDate: dateUtils.formatDate(now, 'YYYY-MM-DD')
    });
    this.generateCalendar();
    this.fetchMonthTasks();
  },

  generateCalendar() {
    const { currentYear, currentMonth } = this.data;
    const firstDay = new Date(currentYear, currentMonth - 1, 1);
    const lastDay = new Date(currentYear, currentMonth, 0);
    const daysInMonth = lastDay.getDate();
    const startWeekday = firstDay.getDay();

    const days = [];
    // 填充空白
    for (let i = 0; i < startWeekday; i++) {
      days.push({ day: '', empty: true });
    }
    // 填充日期
    for (let i = 1; i <= daysInMonth; i++) {
      days.push({
        day: i,
        date: `${currentYear}-${String(currentMonth).padStart(2, '0')}-${String(i).padStart(2, '0')}`,
        hasTask: false,
        taskCount: 0
      });
    }
    this.setData({ daysInMonth: days });
  },

  fetchMonthTasks() {
    const { currentYear, currentMonth } = this.data;
    const startDate = `${currentYear}-${String(currentMonth).padStart(2, '0')}-01`;
    const endDate = new Date(currentYear, currentMonth, 0).toISOString().split('T')[0];

    this.setData({ loading: true });
    request.get(`/tasks?due_date_from=${startDate}&due_date_to=${endDate}`, true)
      .then(data => {
        const tasks = data.items || data || [];
        const tasksByDate = {};

        tasks.forEach(task => {
          if (task.due_date) {
            const dateKey = task.due_date.split('T')[0];
            if (!tasksByDate[dateKey]) {
              tasksByDate[dateKey] = [];
            }
            tasksByDate[dateKey].push(task);
          }
        });

        const daysInMonth = this.data.daysInMonth.map(day => {
          if (day.date && tasksByDate[day.date]) {
            day.hasTask = true;
            day.taskCount = tasksByDate[day.date].length;
          }
          return day;
        });

        this.setData({ tasksByDate, daysInMonth, loading: false });
      })
      .catch(() => {
        this.setData({ loading: false });
      });
  },

  onDayTap(e) {
    const date = e.currentTarget.dataset.date;
    if (!date) return;

    const tasks = this.data.tasksByDate[date] || [];
    this.setData({ selectedDate: date, selectedTasks: tasks });
  },

  onPreMonth() {
    let { currentYear, currentMonth } = this.data;
    if (currentMonth === 1) {
      currentYear--;
      currentMonth = 12;
    } else {
      currentMonth--;
    }
    this.setData({ currentYear, currentMonth, selectedDate: null, selectedTasks: [] });
    this.generateCalendar();
    this.fetchMonthTasks();
  },

  onNextMonth() {
    let { currentYear, currentMonth } = this.data;
    if (currentMonth === 12) {
      currentYear++;
      currentMonth = 1;
    } else {
      currentMonth++;
    }
    this.setData({ currentYear, currentMonth, selectedDate: null, selectedTasks: [] });
    this.generateCalendar();
    this.fetchMonthTasks();
  }
});