/**
 * 日期工具函数
 *
 * 注意：iOS 的 JavaScriptCore 不认 "YYYY-MM-DD HH:mm" 这种带空格的字符串，
 * 统一先换成 "T" 分隔再交给 Date 解析。
 */

function toDate(value) {
  if (!value) return null
  if (value instanceof Date) return value
  const date = new Date(String(value).replace(' ', 'T'))
  return isNaN(date.getTime()) ? null : date
}

function pad(n) {
  return String(n).padStart(2, '0')
}

/**
 * 按格式串输出日期，支持 YYYY / MM / DD / HH / mm
 * 例：formatDate(x, 'YYYY-MM-DD HH:mm')
 */
function formatDate(value, format) {
  const date = toDate(value)
  if (!date) return ''
  return (format || 'YYYY-MM-DD')
    .replace('YYYY', String(date.getFullYear()))
    .replace('MM', pad(date.getMonth() + 1))
    .replace('DD', pad(date.getDate()))
    .replace('HH', pad(date.getHours()))
    .replace('mm', pad(date.getMinutes()))
}

/** 相对时间文案：今天 / 明天 / N天后 / 已逾期N天 */
function getRelativeTime(value) {
  const date = toDate(value)
  if (!date) return ''
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate())
  const days = Math.round(
    (startOfDay(date).getTime() - startOfDay(new Date()).getTime()) / 86400000
  )
  if (days === 0) return '今天'
  if (days === 1) return '明天'
  if (days === -1) return '昨天'
  if (days > 1) return days + '天后'
  return '已逾期' + Math.abs(days) + '天'
}

/** 是否已过截止时间 */
function isOverdue(value) {
  const date = toDate(value)
  if (!date) return false
  return date.getTime() < Date.now()
}

/**
 * 本地日期键 YYYY-MM-DD（日历分桶用）。
 *
 * 不能用 `due_date.split('T')[0]`：出参是 UTC，UTC+8 下「本地 5/28 07:00 截止」
 * 的串是 `2026-05-27T23:00:00Z`，切出来会挂到前一天。
 */
function toLocalDateKey(value) {
  const date = toDate(value)
  if (!date) return ''
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** 本地某天 00:00:00 对应的 UTC ISO，用作 due_date_from */
function localDayStartToApi(year, month, day) {
  return new Date(year, month - 1, day, 0, 0, 0, 0).toISOString()
}

/** 本地某天 23:59:59.999 对应的 UTC ISO，用作 due_date_to */
function localDayEndToApi(year, month, day) {
  return new Date(year, month - 1, day, 23, 59, 59, 999).toISOString()
}

function formatTime(value) {
  const date = toDate(value)
  if (!date) return ''
  return pad(date.getHours()) + ':' + pad(date.getMinutes())
}

module.exports = {
  formatDate,
  formatTime,
  getRelativeTime,
  isOverdue,
  toLocalDateKey,
  localDayStartToApi,
  localDayEndToApi,
}
