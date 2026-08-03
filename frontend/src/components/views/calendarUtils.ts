export function dateFromIso(value: string): Date {
  const [year, month, day] = value.split('-').map(Number)
  return new Date(year, (month || 1) - 1, day || 1)
}

export function formatDateLocal(date: Date): string {
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

export function addDays(date: Date, amount: number): Date {
  const next = new Date(date)
  next.setDate(next.getDate() + amount)
  return next
}

export type CalendarViewType = 'month' | 'week' | 'day'

export function shiftCalendarCursor(
  date: Date,
  viewType: CalendarViewType,
  amount: number,
): Date {
  if (viewType === 'month') {
    return new Date(date.getFullYear(), date.getMonth() + amount, 1)
  }
  return addDays(date, amount * (viewType === 'week' ? 7 : 1))
}

export function startOfWeek(date: Date): Date {
  return addDays(date, -date.getDay())
}

export function monthGrid(date: Date): Date[] {
  const first = new Date(date.getFullYear(), date.getMonth(), 1)
  const gridStart = startOfWeek(first)
  return Array.from({ length: 42 }, (_, index) => addDays(gridStart, index))
}

export function weekDays(date: Date): Date[] {
  const first = startOfWeek(date)
  return Array.from({ length: 7 }, (_, index) => addDays(first, index))
}

export function isSameDay(a: Date, b: Date): boolean {
  return formatDateLocal(a) === formatDateLocal(b)
}

export function isSameMonth(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth()
}
