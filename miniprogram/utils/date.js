/**
 * 日期工具函数
 */

function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const days = Math.ceil(diff / (1000 * 60 * 60 * 24))
  
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days === -1) return '昨天'
  if (days > 0 && days <= 7) return days + '天后'
  if (days < 0) return '已逾期' + Math.abs(days) + '天'
  
  const month = date.getMonth() + 1
  const day = date.getDate()
  return month + '月' + day + '日'
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  return date.getHours().toString().padStart(2, '0') + ':' + 
         date.getMinutes().toString().padStart(2, '0')
}

module.exports = { formatDate, formatTime }
