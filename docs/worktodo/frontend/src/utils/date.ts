import dayjs from 'dayjs'

// 日期格式化
export function formatDate(date: string | Date, format: string = 'YYYY-MM-DD HH:mm'): string {
  return dayjs(date).format(format)
}

// 相对时间显示
export function relativeTime(date: string | Date): string {
  const now = dayjs()
  const target = dayjs(date)
  const diffMinutes = target.diff(now, 'minute')
  const diffHours = target.diff(now, 'hour')
  const diffDays = target.diff(now, 'day')

  if (diffMinutes < 0) {
    // 已过期
    if (diffMinutes > -60) {
      return `${Math.abs(diffMinutes)}分钟前过期`
    } else if (diffHours > -24) {
      return `${Math.abs(diffHours)}小时前过期`
    } else if (diffDays > -7) {
      return `${Math.abs(diffDays)}天前过期`
    } else {
      return target.format('MM-DD HH:mm')
    }
  } else if (diffMinutes < 60) {
    return `${diffMinutes}分钟后`
  } else if (diffHours < 24) {
    return `${diffHours}小时后`
  } else if (diffDays < 7) {
    return `${diffDays}天后`
  } else {
    return target.format('MM-DD HH:mm')
  }
}

// 是否过期
export function isOverdue(date: string | Date): boolean {
  return dayjs(date).isBefore(dayjs())
}

// 是否今天
export function isToday(date: string | Date): boolean {
  return dayjs(date).isSame(dayjs(), 'day')
}

// 是否明天
export function isTomorrow(date: string | Date): boolean {
  return dayjs(date).isSame(dayjs().add(1, 'day'), 'day')
}

// 获取今天开始时间
export function getTodayStart(): string {
  return dayjs().startOf('day').toISOString()
}

// 获取今天结束时间
export function getTodayEnd(): string {
  return dayjs().endOf('day').toISOString()
}

// 获取本周开始时间
export function getWeekStart(): string {
  return dayjs().startOf('week').toISOString()
}

// 获取本周结束时间
export function getWeekEnd(): string {
  return dayjs().endOf('week').toISOString()
}

// 日期范围快捷选项
export const dateRangePresets = [
  { label: '今天', value: () => [getTodayStart(), getTodayEnd()] },
  { label: '明天', value: () => [dayjs().add(1, 'day').startOf('day').toISOString(), dayjs().add(1, 'day').endOf('day').toISOString()] },
  { label: '本周', value: () => [getWeekStart(), getWeekEnd()] },
  { label: '本月', value: () => [dayjs().startOf('month').toISOString(), dayjs().endOf('month').toISOString()] }
]

// 提醒时间快捷选项
export const reminderPresets = [
  { label: '15分钟前', value: 15 },
  { label: '30分钟前', value: 30 },
  { label: '1小时前', value: 60 },
  { label: '2小时前', value: 120 },
  { label: '1天前', value: 1440 }
]

// 计算提醒时间
export function calculateReminderTime(dueDate: string, minutesBefore: number): string {
  return dayjs(dueDate).subtract(minutesBefore, 'minute').toISOString()
}

// 获取日历日期范围
export function getMonthCalendarDates(year: number, month: number): Date[] {
  const start = dayjs().year(year).month(month).startOf('month')
  const end = dayjs().year(year).month(month).endOf('month')
  const startDay = start.day() // 0-6, Sunday = 0

  const dates: Date[] = []

  // 添加上月的日期填充
  for (let i = startDay; i > 0; i--) {
    dates.push(start.subtract(i, 'day').toDate())
  }

  // 添加本月的日期
  let current = start
  while (current.isSame(end, 'month') || current.isBefore(end)) {
    dates.push(current.toDate())
    current = current.add(1, 'day')
  }

  // 添加下月的日期填充到42天（6周）
  while (dates.length < 42) {
    dates.push(current.toDate())
    current = current.add(1, 'day')
  }

  return dates
}