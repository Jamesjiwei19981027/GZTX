import React, { useMemo, useState } from 'react'
import { Language, Task } from '../../types'
import { getT } from '../../i18n'
import { downloadTasksIcs, getCalendarFeedUrl } from '../../api/backend'
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
      className={`w-full text-left rounded px-1.5 py-1 text-[10px] font-semibold transition-transform hover:scale-[1.02] flex items-center gap-1 ${
        task.status === 'Done'
          ? 'bg-secondary/20 text-secondary line-through'
          : task.priority === 'Urgent' || task.priority === 'High'
            ? 'bg-error-container text-on-error-container font-bold'
            : 'bg-primary-fixed text-on-primary-fixed-variant'
      } ${compact ? '' : 'text-xs'}`}
      title={task.title}
    >
      <span className="w-1 h-1 rounded-full bg-current flex-shrink-0"></span>
      <span className="truncate">{task.title}</span>
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
  const timelineTasks = [...selectedTasks].sort((a, b) => (a.dueTime || '23:59').localeCompare(b.dueTime || '23:59'))
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
            <button
              onClick={() => moveCursor(-1)}
              className="p-1 hover:bg-surface dark:hover:bg-[#2e3132] rounded-lg text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-sm">chevron_left</span>
            </button>
            <button
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()))}
              className="px-2.5 py-1 text-xs font-bold text-primary hover:bg-surface dark:hover:bg-[#2e3132] rounded-lg transition-colors"
            >
              {t.today}
            </button>
            <button
              onClick={() => moveCursor(1)}
              className="p-1 hover:bg-surface dark:hover:bg-[#2e3132] rounded-lg text-on-surface-variant transition-colors"
            >
              <span className="material-symbols-outlined text-sm">chevron_right</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <button
          onClick={() => {
            void downloadTasksIcs().catch((e) =>
              alert(e instanceof Error ? e.message : lang === 'zh' ? '导出失败' : 'Export failed'),
            )
          }}
          title={lang === 'zh' ? '导出 .ics（导入系统日历）' : 'Export .ics'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant bg-surface-container dark:bg-[#191c1d] text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-sm">download</span>
          <span className="hidden md:inline">{lang === 'zh' ? '导出日历' : 'Export'}</span>
        </button>
        <button
          onClick={() => {
            void getCalendarFeedUrl()
              .then(async (url) => {
                await navigator.clipboard.writeText(url)
                alert(
                  lang === 'zh'
                    ? '订阅地址已复制。在系统日历「按 URL 订阅」粘贴即可持续同步任务。'
                    : 'Subscription URL copied. Paste it into your calendar app ("subscribe by URL").',
                )
              })
              .catch((e) =>
                alert(e instanceof Error ? e.message : lang === 'zh' ? '获取订阅地址失败' : 'Failed'),
              )
          }}
          title={lang === 'zh' ? '复制 ICS 订阅地址（系统日历持续同步）' : 'Copy ICS subscription URL'}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl border border-outline-variant bg-surface-container dark:bg-[#191c1d] text-xs font-bold text-on-surface-variant hover:text-on-surface transition-colors"
        >
          <span className="material-symbols-outlined text-sm">link</span>
          <span className="hidden md:inline">{lang === 'zh' ? '订阅' : 'Subscribe'}</span>
        </button>
        <div className="flex bg-surface-container dark:bg-[#191c1d] p-1 rounded-xl border border-outline-variant shadow-xs">
          {(['month', 'week', 'day'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewType(mode)}
              className={`px-4 py-1.5 rounded-lg text-xs font-bold capitalize transition-all ${
                viewType === mode
                  ? 'bg-primary text-on-primary shadow-sm'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
            >
              {mode === 'month' ? t.month : mode === 'week' ? t.week : t.day}
            </button>
          ))}
        </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-8 bg-surface dark:bg-[#191c1d] rounded-2xl border border-surface-variant dark:border-outline-variant p-4 md:p-6 shadow-sm">
          <div className={`grid gap-2 mb-3 text-center ${viewType === 'day' ? 'grid-cols-1' : 'grid-cols-7'}`}>
            {(viewType === 'day' ? [cursor] : visibleDays.slice(0, 7)).map((date, index) => (
              <div
                key={formatDateLocal(date)}
                className={`text-xs font-extrabold py-2 uppercase ${
                  viewType !== 'day' && (index === 0 || index === 6) ? 'text-error' : 'text-on-surface-variant'
                }`}
              >
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
              const dateStr = formatDateLocal(date)
              return renderDropTarget(
                date,
                <>
                  <div className="flex justify-between items-start">
                    <span
                      className={`text-xs md:text-sm font-bold w-7 h-7 flex items-center justify-center rounded-full ${
                        isSameDay(date, today)
                          ? 'bg-primary text-on-primary shadow-sm ring-2 ring-primary/30'
                          : isSameDay(date, cursor)
                            ? 'bg-primary/10 text-primary font-extrabold'
                            : 'text-on-surface dark:text-[#f0f1f2]'
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {dayTasks.length > 0 && <span className="text-[10px] bg-secondary-container text-on-secondary-container font-extrabold px-1.5 py-0.5 rounded-full">{dayTasks.length}</span>}
                  </div>
                  <div className="space-y-1 mt-1 overflow-hidden">
                    {dayTasks.slice(0, viewType === 'day' ? 20 : 3).map((task) => renderTask(task, viewType !== 'day'))}
                    {dayTasks.length > 3 && viewType !== 'day' && <div className="text-[9px] text-center font-bold text-on-surface-variant">+{dayTasks.length - 3} {lang === 'zh' ? '更多' : 'more'}</div>}
                  </div>
                  {/* Quick Add icon on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenNewTaskWithDate(dateStr)
                    }}
                    className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 p-0.5 bg-primary text-on-primary rounded-full shadow transition-opacity"
                    title={lang === 'zh' ? '在此日添加任务' : 'Add task on this day'}
                  >
                    <span className="material-symbols-outlined text-xs">add</span>
                  </button>
                </>,
                `${dayCellClass} rounded-xl p-2 transition-all cursor-pointer flex flex-col gap-2 border relative group overflow-hidden ${isSameDay(date, cursor) ? 'bg-primary-fixed/20 dark:bg-primary-container/30 border-primary shadow-md' : 'bg-surface-container-low dark:bg-[#2e3132] border-surface-variant hover:border-primary/50'}`,
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
              <h3 className="font-bold text-base text-on-surface dark:text-[#f0f1f2] flex items-center gap-2">
                <span className="material-symbols-outlined text-primary">view_timeline</span>
                <span>{lang === 'zh' ? `${selectedDate} 任务列表` : `Tasks for ${selectedDate}`}</span>
              </h3>
              <button
                onClick={() => onOpenNewTaskWithDate(selectedDate)}
                className="p-1.5 bg-primary/10 text-primary hover:bg-primary hover:text-on-primary rounded-lg transition-colors text-xs font-bold flex items-center gap-1"
              >
                <span className="material-symbols-outlined text-sm">add</span>
                <span>{lang === 'zh' ? '增加' : 'Add'}</span>
              </button>
            </div>
            {selectedTasks.length === 0 ? (
              <div className="text-center py-10 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl mb-1 opacity-50">event_available</span>
                <p className="text-sm font-semibold">{lang === 'zh' ? '此日没有任何安排' : 'No tasks scheduled'}</p>
                <p className="text-xs mt-1">{lang === 'zh' ? '双击日期方格即可创建任务' : 'Double click any day to add tasks'}</p>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedTasks.map((task) => {
                  const isDone = task.status === 'Done'
                  return (
                    <div
                      key={task.id}
                      onClick={() => onSelectTask(task)}
                      className={`p-3.5 rounded-xl border transition-all cursor-pointer flex items-center justify-between ${
                        isDone
                          ? 'bg-surface-container-lowest border-surface-variant opacity-75'
                          : 'bg-surface-container-low dark:bg-[#2e3132] border-transparent hover:border-primary/50 shadow-xs'
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`w-2 h-10 rounded-full flex-shrink-0 ${
                            isDone ? 'bg-secondary' : task.priority === 'Urgent' || task.priority === 'High' ? 'bg-error' : 'bg-primary'
                          }`}
                        ></div>
                        <div className="overflow-hidden">
                          <p className={`text-sm font-bold truncate ${isDone ? 'line-through text-on-surface-variant' : 'text-on-surface dark:text-[#f0f1f2]'}`}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-0.5">
                            <span className="font-semibold text-primary">{task.dueTime || (lang === 'zh' ? '全天' : 'All day')}</span>
                            <span>•</span>
                            <span className="truncate">#{task.tag || task.category}</span>
                          </div>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-on-surface-variant/60 text-lg flex-shrink-0 ml-2">
                        chevron_right
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="bg-surface dark:bg-[#191c1d] p-6 rounded-2xl border border-surface-variant dark:border-outline-variant shadow-sm">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-surface-variant"><h3 className="font-bold text-base text-on-surface dark:text-[#f0f1f2]">{lang === 'zh' ? '时间轴' : 'Time axis'}</h3><span className="text-xs text-on-surface-variant">{timelineTasks.length} {lang === 'zh' ? '项' : 'items'}</span></div>
            <div className="relative space-y-3">
              <div className="absolute left-[43px] top-1 bottom-1 w-px bg-outline-variant/60" />
              {timelineTasks.length === 0 ? <p className="text-center py-4 text-xs text-on-surface-variant">{lang === 'zh' ? '暂无时间段安排' : 'No timed tasks'}</p> : timelineTasks.map((task) => <button type="button" key={task.id} onClick={() => onSelectTask(task)} className="relative z-10 w-full flex items-center gap-3 text-left"><span className="w-9 text-[10px] text-on-surface-variant text-right">{task.dueTime || '—'}</span><span className={`w-2.5 h-2.5 rounded-full ${task.status === 'Done' ? 'bg-secondary' : 'bg-primary'}`} /><span className="flex-1 p-2 rounded-lg bg-surface-container-low text-xs font-semibold truncate">{task.title}</span></button>)}
            </div>
            <div className="mt-4 pt-3 border-t border-surface-variant text-xs text-on-surface-variant">{lang === 'zh' ? `完成 ${timelineTasks.filter((task) => task.status === 'Done').length} / ${timelineTasks.length}，效率 ${timelineTasks.length ? Math.round(timelineTasks.filter((task) => task.status === 'Done').length / timelineTasks.length * 100) : 0}%` : `${timelineTasks.filter((task) => task.status === 'Done').length}/${timelineTasks.length} complete · ${timelineTasks.length ? Math.round(timelineTasks.filter((task) => task.status === 'Done').length / timelineTasks.length * 100) : 0}% efficiency`}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
