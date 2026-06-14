function formatDate(date, format = 'YYYY-MM-DD') {
  const d = new Date(date)
  const year = d.getFullYear()
  const month = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  const hours = String(d.getHours()).padStart(2, '0')
  const minutes = String(d.getMinutes()).padStart(2, '0')
  const seconds = String(d.getSeconds()).padStart(2, '0')
  
  format = format.replace('YYYY', year)
  format = format.replace('MM', month)
  format = format.replace('DD', day)
  format = format.replace('HH', hours)
  format = format.replace('mm', minutes)
  format = format.replace('ss', seconds)
  
  return format
}

function getToday() {
  return formatDate(new Date())
}

function getTomorrow() {
  const d = new Date()
  d.setDate(d.getDate() + 1)
  return formatDate(d)
}

function getDaysAgo(days) {
  const d = new Date()
  d.setDate(d.getDate() - days)
  return formatDate(d)
}

module.exports = {
  formatDate,
  getToday,
  getTomorrow,
  getDaysAgo
}
