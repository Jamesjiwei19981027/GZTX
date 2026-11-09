import React, { useMemo, useState } from 'react'
import { Language, Task } from '../../types'
import { getT } from '../../i18n'
import { downloadTasksIcs, getCalendarFeedUrl, resetCalendarFeedUrl } from '../../api/backend'
import { useToast } from '../toast/ToastProvider'
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
  const toast = useToast()
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
      className={`w-full text-left rounded px-2 py-1 text-xs font-medium transition-transform  flex items-center gap-1 ${
        task.status === 'Done'
          ? 'bg-surface-container text-on-surface-variant'
          : 'bg-surface-container text-on-surface'
      } ${compact ? '' : 'text-xs'}`}
      title={task.title}
    >
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${task.priority === 'High' ? 'bg-error' : task.priority === 'Medium' ? 'bg-[#a86412]' : 'bg-outline'}`}></span>
      <span className={`truncate ${task.status === 'Done' ? 'ink-done' : ''}`}>{task.title}</span>
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
          <h1 className="text-3xl font-medium text-on-surface dark:text-on-surface  flex items-center gap-2 tabular-nums">
            <span className="material-symbols-outlined text-inherit text-[18px]">calendar_month</span>
            <span>{label}</span>
          </h1>
          <div className="flex items-center bg-surface-container-lowest dark:bg-surface-container rounded-xl p-1 border border-outline-variant">
            <button
              onClick={() => moveCursor(-1)}
              className="p-1 hover:bg-surface dark:hover:bg-surface-container-high rounded-lg text-on-surface-variant transition-ink-colors"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_left</span>
            </button>
            <button
              onClick={() => setCursor(new Date(today.getFullYear(), today.getMonth(), today.getDate()))}
              className="px-2 py-1 text-xs font-medium text-primary hover:bg-surface dark:hover:bg-surface-container-high rounded-lg transition-ink-colors tabular-nums"
            >
              {t.today}
            </button>
            <button
              onClick={() => moveCursor(1)}
              className="p-1 hover:bg-surface dark:hover:bg-surface-container-high rounded-lg text-on-surface-variant transition-ink-colors"
            >
              <span className="material-symbols-outlined text-[18px]">chevron_right</span>
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2">
        <button
          onClick={() => {
            void downloadTasksIcs().then(() => toast.success(lang === 'zh' ? '日历已导出为 worktodo.ics' : 'Calendar exported as worktodo.ics')).catch((e) =>
              toast.error(e instanceof Error ? e.message : lang === 'zh' ? '导出失败' : 'Export failed'),
            )
          }}
          title={lang === 'zh' ? '导出 .ics（导入系统日历）' : 'Export .ics'}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container dark:bg-surface-container-low text-xs font-medium text-on-surface-variant hover:text-on-surface transition-ink-colors tabular-nums"
        >
          <span className="material-symbols-outlined text-[18px]">download</span>
          <span className="hidden md:inline">{lang === 'zh' ? '导出日历' : 'Export'}</span>
        </button>
        <button
          onClick={() => {
            void getCalendarFeedUrl()
              .then(async (url) => {
                // navigator.clipboard 仅安全上下文（HTTPS / localhost）可用；
                // 局域网 http 访问时降级为弹窗展示，让用户手动复制
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(url)
                  toast.success(
                    lang === 'zh'
                      ? '订阅地址已复制。在系统日历「按 URL 订阅」粘贴即可持续同步任务。'
                      : 'Subscription URL copied. Paste it into your calendar app ("subscribe by URL").',
                  )
                } else {
                  window.prompt(
                    lang === 'zh'
                      ? '请手动复制订阅地址（在系统日历「按 URL 订阅」粘贴）：'
                      : 'Copy this subscription URL (paste into "subscribe by URL"):',
                    url,
                  )
                }
              })
              .catch((e) =>
                toast.error(e instanceof Error ? e.message : lang === 'zh' ? '获取订阅地址失败' : 'Failed'),
              )
          }}
          title={lang === 'zh' ? '复制 ICS 订阅地址（系统日历持续同步）' : 'Copy ICS subscription URL'}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container dark:bg-surface-container-low text-xs font-medium text-on-surface-variant hover:text-on-surface transition-ink-colors tabular-nums"
        >
          <span className="material-symbols-outlined text-[18px]">link</span>
          <span className="hidden md:inline">{lang === 'zh' ? '订阅' : 'Subscribe'}</span>
        </button>
        <button
          onClick={() => {
            const confirmed = window.confirm(
              lang === 'zh'
                ? '重置后旧的订阅地址立即失效，已添加的系统日历需要重新订阅。确定重置？'
                : 'Resetting invalidates the old URL. Calendars already subscribed will stop updating. Continue?',
            )
            if (!confirmed) return
            void resetCalendarFeedUrl()
              .then(async (url) => {
                if (navigator.clipboard?.writeText) {
                  await navigator.clipboard.writeText(url)
                  toast.success(
                    lang === 'zh'
                      ? '订阅地址已重置并复制。请在系统日历中重新添加。'
                      : 'Subscription URL reset and copied. Re-add it in your calendar app.',
                  )
                } else {
                  window.prompt(
                    lang === 'zh' ? '新的订阅地址（旧地址已失效）：' : 'New subscription URL (old one is invalid):',
                    url,
                  )
                }
              })
              .catch((e) =>
                toast.error(e instanceof Error ? e.message : lang === 'zh' ? '重置失败' : 'Reset failed'),
              )
          }}
          title={lang === 'zh' ? '重置 ICS 订阅地址（旧地址立即失效）' : 'Reset ICS subscription URL'}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-outline-variant bg-surface-container dark:bg-surface-container-low text-xs font-medium text-on-surface-variant hover:text-on-surface transition-ink-colors tabular-nums"
        >
          <span className="material-symbols-outlined text-[18px]">restart_alt</span>
          <span className="hidden md:inline">{lang === 'zh' ? '重置订阅' : 'Reset'}</span>
        </button>
        <div className="flex bg-surface-container-lowest dark:bg-surface-container p-1 rounded-xl border border-outline-variant shadow-sm dark:shadow-none">
          {(['month', 'week', 'day'] as const).map((mode) => (
            <button
              key={mode}
              onClick={() => setViewType(mode)}
              className={`px-4 py-2 rounded-lg text-xs font-medium capitalize transition-ink-colors ${
                viewType === mode
                  ? 'bg-primary text-on-primary shadow-sm dark:shadow-none'
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
        <div className="lg:col-span-8 bg-surface-container-lowest dark:bg-surface-container rounded-xl border border-surface-variant dark:border-outline-variant p-4 md:p-6 shadow-sm dark:shadow-none">
          <div className={`grid gap-2 mb-3 text-center ${viewType === 'day' ? 'grid-cols-1' : 'grid-cols-7'}`}>
            {(viewType === 'day' ? [cursor] : visibleDays.slice(0, 7)).map((date, index) => (
              <div
                key={formatDateLocal(date)}
                className={`text-xs font-medium py-2  ${
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
                      className={`text-xs md:text-sm font-medium w-7 h-7 flex items-center justify-center rounded-full ${
                        isSameDay(date, today)
                          ? 'bg-primary text-on-primary shadow-sm dark:shadow-none ring-2 ring-primary/30'
                          : isSameDay(date, cursor)
                            ? 'bg-primary/10 text-primary font-medium'
                            : 'text-on-surface dark:text-on-surface'
                      }`}
                    >
                      {date.getDate()}
                    </span>
                    {dayTasks.length > 0 && <span className="text-xs bg-secondary-container text-on-secondary-container font-medium px-2 py-1 rounded-md tabular-nums">{dayTasks.length}</span>}
                  </div>
                  <div className="space-y-1 mt-1 overflow-hidden">
                    {dayTasks.slice(0, viewType === 'day' ? 20 : 3).map((task) => renderTask(task, viewType !== 'day'))}
                    {dayTasks.length > 3 && viewType !== 'day' && <div className="text-[9px] text-center font-medium text-on-surface-variant tabular-nums">+{dayTasks.length - 3} {lang === 'zh' ? '更多' : 'more'}</div>}
                  </div>
                  {/* Quick Add icon on hover */}
                  <button
                    onClick={(e) => {
                      e.stopPropagation()
                      onOpenNewTaskWithDate(dateStr)
                    }}
                    className="absolute bottom-1 right-1 opacity-0 group-hover:opacity-100 p-1 bg-primary text-on-primary rounded-lg shadow transition-opacity"
                    title={lang === 'zh' ? '在此日添加任务' : 'Add task on this day'}
                  >
                    <span className="material-symbols-outlined text-[18px]">add</span>
                  </button>
                </>,
                `${dayCellClass} rounded-xl p-2 transition-ink-colors cursor-pointer flex flex-col gap-2 border relative group overflow-hidden ${isSameDay(date, cursor) ? 'bg-primary-fixed/20 dark:bg-primary-container/30 border-primary shadow-sm dark:shadow-none' : 'bg-surface-container-low dark:bg-surface-container-high border-surface-variant hover:border-primary/50'}`,
              )
            })}
          </div>
        </div>

        <div className="lg:col-span-4 space-y-6">
          <div className="bg-surface-container-lowest dark:bg-surface-container text-on-surface p-6 rounded-xl shadow-sm dark:shadow-none">
            <h3 className="text-xs font-medium   opacity-80 tabular-nums">{t.todayOutlook}</h3>
            <p className="text-2xl font-medium mt-1 tabular-nums">{selectedDate}</p>
            <p className="text-xs font-normal bg-surface-container-lowest/10 p-3 rounded-xl mt-4 tabular-nums">{selectedTasks.length ? `${selectedTasks.length} ${lang === 'zh' ? '个任务已安排' : 'task(s) scheduled'}` : t.outlookDesc}</p>
          </div>
          <div className="bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-surface-variant dark:border-outline-variant shadow-sm dark:shadow-none">
            <div className="flex justify-between items-center mb-4 pb-2 border-b border-surface-variant">
              <h3 className="font-medium text-base text-on-surface dark:text-on-surface flex items-center gap-2 tabular-nums">
                <span className="material-symbols-outlined text-inherit">view_timeline</span>
                <span>{lang === 'zh' ? `${selectedDate} 任务列表` : `Tasks for ${selectedDate}`}</span>
              </h3>
              <button
                onClick={() => onOpenNewTaskWithDate(selectedDate)}
                className="p-2 bg-primary/10 text-primary hover:bg-primary/90 hover:text-on-primary rounded-lg transition-ink-colors text-xs font-medium flex items-center gap-1 tabular-nums"
              >
                <span className="material-symbols-outlined text-[18px]">add</span>
                <span>{lang === 'zh' ? '增加' : 'Add'}</span>
              </button>
            </div>
            {selectedTasks.length === 0 ? (
              <div className="text-center py-10 text-on-surface-variant">
                <span className="material-symbols-outlined text-4xl mb-1 opacity-50">event_available</span>
                <p className="text-sm font-normal tabular-nums">{lang === 'zh' ? '此日没有任何安排' : 'No tasks scheduled'}</p>
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
                      className={`p-4  border-b transition-ink-colors cursor-pointer flex items-center justify-between ${
                        isDone
                          ? ' border-surface-variant opacity-75'
                          : 'bg-surface-container-low dark:bg-surface-container-high border-transparent hover:border-primary/50 '
                      }`}
                    >
                      <div className="flex items-center gap-3 overflow-hidden">
                        <div
                          className={`w-2 h-10 rounded-full flex-shrink-0 ${
                            isDone ? 'bg-secondary' : task.priority === 'High' ? 'bg-error' : 'bg-primary'
                          }`}
                        ></div>
                        <div className="overflow-hidden">
                          <p className={`text-sm font-medium truncate ${isDone ? 'ink-done' : 'text-on-surface dark:text-on-surface'}`}>
                            {task.title}
                          </p>
                          <div className="flex items-center gap-2 text-xs text-on-surface-variant mt-1">
                            <span className="font-medium text-primary tabular-nums">{task.dueTime || (lang === 'zh' ? '全天' : 'All day')}</span>
                            <span>•</span>
                            <span className="truncate">#{task.tag || task.category}</span>
                          </div>
                        </div>
                      </div>
                      <span className="material-symbols-outlined text-inherit text-[18px] flex-shrink-0 ml-2">
                        chevron_right
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
          <div className="bg-surface-container-lowest dark:bg-surface-container p-6 rounded-xl border border-surface-variant dark:border-outline-variant shadow-sm dark:shadow-none">
            <div className="flex items-center justify-between mb-4 pb-2 border-b border-surface-variant"><h3 className="font-medium text-base text-on-surface dark:text-on-surface tabular-nums">{lang === 'zh' ? '时间轴' : 'Time axis'}</h3><span className="text-xs text-on-surface-variant">{timelineTasks.length} {lang === 'zh' ? '项' : 'items'}</span></div>
            <div className="relative space-y-3">
              <div className="absolute left-[43px] top-1 bottom-1 w-px bg-outline-variant/60" />
              {timelineTasks.length === 0 ? <p className="text-center py-4 text-xs text-on-surface-variant">{lang === 'zh' ? '暂无时间段安排' : 'No timed tasks'}</p> : timelineTasks.map((task) => <button type="button" key={task.id} onClick={() => onSelectTask(task)} className="relative z-10 w-full flex items-center gap-3 text-left"><span className="w-9 text-xs text-on-surface-variant text-right">{task.dueTime || '—'}</span><span className={`w-2.5 h-2.5 rounded-full ${task.status === 'Done' ? 'bg-secondary' : 'bg-primary'}`} /><span className={`flex-1 py-2 text-xs font-medium truncate tabular-nums ${task.status === 'Done' ? 'ink-done' : 'text-on-surface'}`}>{task.title}</span></button>)}
            </div>
            <div className="mt-4 pt-3 border-t border-surface-variant text-xs text-on-surface-variant">{lang === 'zh' ? `完成 ${timelineTasks.filter((task) => task.status === 'Done').length} / ${timelineTasks.length}，效率 ${timelineTasks.length ? Math.round(timelineTasks.filter((task) => task.status === 'Done').length / timelineTasks.length * 100) : 0}%` : `${timelineTasks.filter((task) => task.status === 'Done').length}/${timelineTasks.length} complete · ${timelineTasks.length ? Math.round(timelineTasks.filter((task) => task.status === 'Done').length / timelineTasks.length * 100) : 0}% efficiency`}</div>
          </div>
        </div>
      </div>
    </div>
  )
}
