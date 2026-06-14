// 任务项组件
Component({
  properties: {
    task: {
      type: Object,
      value: {}
    }
  },

  data: {
    // 优先级映射
    priorityMap: {
      0: { text: '低', class: 'priority-low' },
      1: { text: '中', class: 'priority-medium' },
      2: { text: '高', class: 'priority-high' }
    }
  },

  methods: {
    // 点击任务
    onTap() {
      this.triggerEvent('tap', { id: this.data.task.id })
    },

    // 完成/取消完成
    onComplete(e) {
      e.stopPropagation()
      const taskId = this.data.task.id

      if (this.data.task.status === 2) {
        this.triggerEvent('uncomplete', { id: taskId })
      } else {
        this.triggerEvent('complete', { id: taskId })
      }
    },

    // 编辑
    onEdit(e) {
      e.stopPropagation()
      this.triggerEvent('edit', { id: this.data.task.id })
    },

    // 删除
    onDelete(e) {
      e.stopPropagation()
      this.triggerEvent('delete', { id: this.data.task.id })
    },

    // 格式化时间
    formatTime(dateStr) {
      if (!dateStr) return ''
      const date = new Date(dateStr)
      const now = new Date()
      const today = new Date(now.getFullYear(), now.getMonth(), now.getDate())
      const targetDate = new Date(date.getFullYear(), date.getMonth(), date.getDate())

      const diff = targetDate - today
      const dayDiff = Math.floor(diff / (24 * 60 * 60 * 1000))

      let dayStr = ''
      if (dayDiff === 0) dayStr = '今天'
      else if (dayDiff === 1) dayStr = '明天'
      else if (dayDiff === -1) dayStr = '昨天'
      else dayStr = `${date.getMonth() + 1}/${date.getDate()}`

      const timeStr = `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`
      return `${dayStr} ${timeStr}`
    }
  }
})