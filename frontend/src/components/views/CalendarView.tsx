import React, { useMemo, useState } from 'react'
import { Language, Task } from '../../types'
import { getT } from '../../i18n'
import {
  formatDateLocal,
  isSameDay,
  isSameMonth,
  monthGrid,
  shiftCalendarCursor,
  weekDays,
} from './calendarUtils'

interface CalendarViewProps {
  tasks: Task[]
  onSelectTask: (task: Task) => void
  onOpenNewTaskWithDate: (dateStr: string) => void
  onMoveTask: (task: Task, dateStr: string) => Promise<void> | void
  lang: Language
}

const today = new Date()

export const CalendarView: React.FC<CalendarViewProps> = ({
  tasks,
  onSelectTask,
  onOpenNewTaskWithDate,
  onMoveTask,
  lang,
}) => {
  const t = getT(lang)
  const [viewType, setViewType] = useState<'month' | 'week' | 'day'>('month')
  const [cursor, setCursor] = useState(() => new Date(today.getFullYear(), today.getMonth(), today.getDate()))

  const selectedDate = formatDateLocal(cursor)
  const grouped = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      if (!task.dueDate) continue
      const list = map.get(task.dueDate) || []
      list.push(task)
      map.set(task.dueDate, list)
    }
    return map
  }, [tasks])

  const moveCursor = (amount: number) => {
    setCursor(shiftCalendarCursor(cursor, viewType, amount))
  }

  const renderTask = (task: Task, compact = false) => (
    <button
      key={task.id}
      draggable
      onDragStart={(event) => event.dataTransfer.setData('text/plain', task.id)}
      onClick={(event) => {
        event.stopPropagation()
        onSelectTask(task)
      }}
      className={`w-full text-left truncate rounded px-1.5 py-1 text-[10px] font-semibold transition hover:scale-[1.01] ${
        task.status === 'Done'
          ? 'bg-secondary/20 text-secondary line-through'
          : task.priority === 'Urgent' || task.priority === 'High'
            ? 'bg-error-container text-on-error-container'
            : 'bg-primary-fixed text-on-primary-fixed-variant'
      } ${compact ? '' : 'text-xs'}`}
      title={task.title}
    >
      {task.title}
    </button>
  )

  const renderDropTarget = (date: Date, children: React.ReactNode, className = '') => {
    const dateStr = formatDateLocal(date)
    return (
      <div
        key={dateStr}
        onClick={() => setCursor(date)}
        onDoubleClick={() => onOpenNewTaskWithDate(dateStr)}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault()
          const task = tasks.find((item) => item.id === event.dataTransfer.getData('text/plain'))
          if (task && task.dueDate !== dateStr) void onMoveTask(task, dateStr)
        }}
        className={className}
      >
        {children}
      </div>
    )
  }

  const visibleDays = viewType === 'month' ? monthGrid(cursor) : weekDays(cursor)
  const dayCellClass = viewType === 'day'
    ? 'min-h-[420px] md:min-h-[520px]'
    : 'min-h-[96px] md:min-h-[112px]'
  const selectedTasks = grouped.get(selectedDate) || []
  const label = cursor.toLocaleDateString(lang === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    ...(viewType === 'day' ? { day: 'numeric' } : {}),
  })

  return (
    <div className="max-w-[1400px] mx-auto w-full pb-20 md:pb-8 animate-in fade-in duration-300">
      <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-4">
          <h1 className="text-3xl font-extrabold text-on-surface dark:text-[#f0f1f2] tracking-tight flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-3xl">calendar_month</span>
            <span>{label}</span>
          </h1>
          <div className="flex items-center bg-surface-container dark:bg-[#191c1d] rounded-xl p-1 border border-outline-variant">
            <button onClick={() => moveCursor(-1)} className="p-1 hover:bg-surface rounded-lg text-on-surface-variant">
              <span className="material-symbols-outlined text-sm">chevron_left</span>
            </button>
            <button onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()))} className="px-2.5 py-1 text-xs font-bold text-primary hover:bg-surface rounded-lg">
              {t.today}
            </button>
            <button onClick={() => moveCursor(1)} className="p-1 hover:bg-surface rounded-lg text-on-surface-variant">
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>
        <div className="flex bg-surface-container dark:bg-[#191c1d] p-1 rounded-xl border border-outline-variant">
          {(['month', 'week', 'day'] as const).map((mode) => (
            <button key={mode} onClick={() => setViewType(mode)} className={`px-4 py-1.5 rounded-lg text-xs font-bold ${viewType === mode ? 'bg-primary text-on-primary' : 'text-on-surface-variant'}`}>
              {mode === 'month' ? t.month : mode === 'week' ? t.week : t.day}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-surface dark:bg-[#191c1d] rounded-2xl border border-surface-variant dark:border-outline-variant p-4 md:p-6 shadow-sm">
          <div className={`grid gap-2 mb-3 text-center ${viewType === 'day' ? 'grid-cols-1' : 'grid-cols-7'}`}>
            {(viewType === 'day' ? [cursor] : visibleDays.slice(0, 7)).map((date, index) => (
              <div key={formatDateLocal(date)} className="text-xs font-extrabold py-2 text-on-surface-variant">
                {viewType === 'day' ? formatDateLocal(date) : (lang === 'zh' ? ['日', '一', '二', '三', '四', '五', '六'][index] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][index])}
              </div>
            ))}
          </div>
          <div className={`grid gap-2 ${viewType === 'day' ? 'grid-cols-1' : 'grid-cols-7'}`}>
            {visibleDays.map((date) => {
              if (viewType === 'day' && !isSameDay(date, cursor)) return null
              if (viewType === 'month' && !isSameMonth(date, cursor)) {
                return renderDropTarget(date, null, 'h-24 md:h-28 rounded-xl bg-surface-container-lowest/30 border border-transparent opacity-40')
              }
              const dayTasks = grouped.get(formatDateLocal(date)) || []
              return renderDropTarget(
                date,
                <>
                  <div className="flex justify-between items-start">
                    <span className={`text-xs md:text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${isSameDay(date, today) ? 'bg-primary text-on-primary' : isSameDay(date, cursor) ? 'bg-primary/10 text-primary' : 'text-on-surface dark:text-[#f0f1f2]'}`}>
                      {date.getDate()}
                    </span>
                    {dayTasks.length > 0 && <span className="text-[10px] bg-secondary-container text-on-secondary-container font-extrabold px-1.5 py-0.5 rounded-full">{dayTasks.length}</span>}
                  </div>
                  <div className="space-y-1 mt-1 overflow-hidden">
                    {dayTasks.slice(0, viewType === 'day' ? 20 : 3).map((task) => renderTask(task, viewType !== 'day'))}
                    {dayTasks.length > 3 && viewType !== 'day' && <div className="text-[9px] text-center font-bold text-on-surface-variant">+{dayTasks.length - 3}</div>}
                  </div>
                </>,
                `${dayCellClass} rounded-xl p-2 transition-all cursor-pointer flex flex-col gap-2 border ${isSameDay(date, cursor) ? 'bg-primary-fixed/20 border-primary shadow-md' : 'bg-surface-container-low dark:bg-[#2e3132] border-surface-variant hover:border-primary/50'}`,
              )
            })}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-gradient-to-br from-[#1d4ed8] to-[#1e40af] text-white p-6 rounded-2xl shadow-md">
            <h3 className="text-xs font-bold uppercase tracking-wider opacity-80">{t.todayOutlook}</h3>
            <p className="text-2xl font-extrabold mt-1">{selectedDate}</p>
            <p className="text-xs font-medium bg-white/10 p-3 rounded-xl mt-4">{selectedTasks.length ? `${selectedTasks.length} ${lang === 'zh' ? '个任务已安排' : 'task(s) scheduled'}` : t.outlookDesc}</p>
          </div>
          <div className="bg-surface dark:bg-[#191c1d] p-6 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-surface-variant">
              <h3 className="font-bold text-base text-on-surface dark:text-[#f0f1f2]">{lang === 'zh' ? '当日任务' : 'Selected day'}</h3>
              <button onClick={() => onOpenNewTaskWithDate(selectedDate)} className="p-1.5 bg-primary/10 text-primary rounded-lg text-xs font-bold">+</button>
            </div>
            {selectedTasks.length === 0 ? <p className="text-center py-8 text-sm text-on-surface-variant">{lang === 'zh' ? '此日没有安排' : 'No tasks scheduled'}</p> : <div className="space-y-3">{selectedTasks.map((task) => <div key={task.id} onClick={() => onSelectTask(task)} className="p-3 rounded-xl bg-surface-container-low dark:bg-[#2e3132] cursor-pointer"><p className="text-sm font-bold truncate">{task.title}</p><p className="text-xs text-on-surface-variant mt-1">{task.dueTime || (lang === 'zh' ? '全天' : 'All day')} · #{task.tag || task.category}</p></div>)}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}
