import { useCallback, useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spin } from 'antd'
import { message } from '@/utils/antdMessage'
import dayjs, { type Dayjs } from 'dayjs'
import { useTaskStore } from '@/stores/task'
import type { Task } from '@/types'
import { getErrorMessage } from '@/api/request'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']

const priorityClass: Record<number, string> = {
  0: 'bg-surface-variant/60 text-on-surface-variant border-outline-variant/40',
  1: 'bg-primary/15 text-primary border-primary/30',
  2: 'bg-error/15 text-error border-error/30',
}

const statusIcon: Record<number, string> = {
  0: 'radio_button_unchecked',
  1: 'pending',
  2: 'check_circle',
}

function startOfMonthGrid(month: Dayjs): Dayjs {
  const first = month.startOf('month')
  return first.subtract(first.day(), 'day')
}

function buildMonthCells(month: Dayjs): Dayjs[] {
  const start = startOfMonthGrid(month)
  return Array.from({ length: 42 }, (_, i) => start.add(i, 'day'))
}

function dateKey(d: Dayjs): string {
  return d.format('YYYY-MM-DD')
}

function taskDateKey(task: Task): string | null {
  if (!task.due_date) return null
  return dayjs(task.due_date).format('YYYY-MM-DD')
}

export default function CalendarPage() {
  const navigate = useNavigate()
  const tasks = useTaskStore((s) => s.tasks)
  const loading = useTaskStore((s) => s.loading)
  const fetchTasks = useTaskStore((s) => s.fetchTasks)

  const [currentMonth, setCurrentMonth] = useState(() => dayjs().startOf('month'))
  const [selectedDate, setSelectedDate] = useState(() => dayjs())

  const cells = useMemo(() => buildMonthCells(currentMonth), [currentMonth])

  const loadMonth = useCallback(async () => {
    const start = startOfMonthGrid(currentMonth)
    const end = start.add(41, 'day')
    try {
      await fetchTasks({
        due_date_from: start.format('YYYY-MM-DD'),
        due_date_to: end.format('YYYY-MM-DD'),
        page: 1,
        page_size: 200,
      })
    } catch (e) {
      message.error(getErrorMessage(e, '加载日历任务失败'))
    }
  }, [currentMonth, fetchTasks])

  useEffect(() => {
    void loadMonth()
  }, [loadMonth])

  const tasksByDate = useMemo(() => {
    const map = new Map<string, Task[]>()
    for (const task of tasks) {
      const key = taskDateKey(task)
      if (!key) continue
      const list = map.get(key)
      if (list) list.push(task)
      else map.set(key, [task])
    }
    return map
  }, [tasks])

  const selectedTasks = useMemo(() => {
    return tasksByDate.get(dateKey(selectedDate)) ?? []
  }, [tasksByDate, selectedDate])

  const monthTitle = `${currentMonth.year()}年 ${currentMonth.month() + 1}月`
  const selectedLabel = `${selectedDate.month() + 1}月${selectedDate.date()}日，周${WEEKDAYS[selectedDate.day()]}`

  function prevMonth() {
    setCurrentMonth((m) => m.subtract(1, 'month'))
  }

  function nextMonth() {
    setCurrentMonth((m) => m.add(1, 'month'))
  }

  function goToday() {
    const today = dayjs()
    setCurrentMonth(today.startOf('month'))
    setSelectedDate(today)
  }

  function openTask(task: Task) {
    navigate(`/tasks/${task.id}`)
  }

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex-grow flex flex-col p-lg min-w-0">
        <div className="flex items-center justify-between mb-lg flex-wrap gap-md">
          <div className="flex items-center gap-md">
            <h1 className="font-headline text-headline-lg text-primary">{monthTitle}</h1>
            <div className="flex gap-xs">
              <button
                type="button"
                className="p-2 hover:bg-surface-variant/30 rounded-full transition-colors"
                onClick={prevMonth}
                aria-label="上个月"
              >
                <span className="material-symbols-outlined text-primary">chevron_left</span>
              </button>
              <button
                type="button"
                className="p-2 hover:bg-surface-variant/30 rounded-full transition-colors"
                onClick={nextMonth}
                aria-label="下个月"
              >
                <span className="material-symbols-outlined text-primary">chevron_right</span>
              </button>
            </div>
            <button
              type="button"
              className="px-md py-1.5 border border-primary/40 rounded-full text-label-sm text-primary hover:bg-primary/10 transition-colors"
              onClick={goToday}
            >
              今天
            </button>
          </div>
        </div>

        <div className="flex-grow bg-surface border border-surface-variant rounded-xl shadow-sm overflow-hidden flex flex-col min-h-0">
          <div className="grid grid-cols-7 border-b border-surface-variant bg-surface-container/30 shrink-0">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-sm text-center text-label-sm text-primary/70 font-label">
                周{d}
              </div>
            ))}
          </div>

          <Spin spinning={loading} className="flex-grow min-h-0">
            <div
              className="grid grid-cols-7 flex-grow min-h-[420px]"
              style={{ gridTemplateRows: 'repeat(6, minmax(72px, 1fr))' }}
            >
              {cells.map((date) => {
                const key = dateKey(date)
                const dayTasks = tasksByDate.get(key) ?? []
                const inMonth = date.month() === currentMonth.month()
                const isToday = date.isSame(dayjs(), 'day')
                const isSelected = date.isSame(selectedDate, 'day')
                const busy = dayTasks.length > 0

                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedDate(date)}
                    className={[
                      'border-r border-b border-surface-variant p-sm text-left flex flex-col transition-colors min-h-[72px]',
                      !inMonth ? 'bg-surface-container-lowest/50 opacity-40' : 'hover:bg-surface-variant/20',
                      isToday ? 'bg-primary/10' : '',
                      isSelected && inMonth ? 'ring-2 ring-inset ring-primary/50' : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    <div className="flex items-center justify-between mb-xs">
                      <span
                        className={[
                          'text-label-sm font-label inline-flex items-center justify-center min-w-6 h-6 rounded',
                          isToday ? 'bg-primary text-on-primary font-bold px-1' : 'text-on-surface',
                        ].join(' ')}
                      >
                        {date.date()}
                      </span>
                      {busy && (
                        <span className="w-1.5 h-1.5 rounded-full bg-primary shrink-0" title={`${dayTasks.length} 项任务`} />
                      )}
                    </div>

                    {busy ? (
                      <div className="space-y-0.5 overflow-hidden flex-1 min-h-0">
                        {dayTasks.slice(0, 2).map((task) => (
                          <div
                            key={task.id}
                            role="link"
                            tabIndex={0}
                            className={[
                              'text-[10px] px-1 py-0.5 rounded truncate border font-medium cursor-pointer hover:opacity-80',
                              priorityClass[task.priority] ?? priorityClass[1],
                              task.status === 2 ? 'line-through opacity-60' : '',
                            ].join(' ')}
                            title={task.title}
                            onClick={(e) => {
                              e.stopPropagation()
                              setSelectedDate(date)
                              openTask(task)
                            }}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                e.stopPropagation()
                                openTask(task)
                              }
                            }}
                          >
                            {task.title}
                          </div>
                        ))}
                        {dayTasks.length > 2 && (
                          <div className="text-[10px] text-primary font-label px-1">+{dayTasks.length - 2} 更多</div>
                        )}
                      </div>
                    ) : (
                      inMonth && (
                        <div className="flex-1 flex items-center justify-center text-on-surface-variant/25">
                          <span className="material-symbols-outlined text-sm">event_available</span>
                        </div>
                      )
                    )}
                  </button>
                )
              })}
            </div>
          </Spin>
        </div>
      </div>

      <aside className="w-80 border-l border-surface-variant bg-surface hidden lg:flex flex-col shrink-0 overflow-hidden">
        <div className="p-lg border-b border-surface-variant shrink-0">
          <h3 className="font-headline text-headline-sm text-primary font-bold mb-xs">{selectedLabel}</h3>
          <p className="text-body-sm text-on-surface-variant">
            {selectedTasks.length > 0 ? `已安排 ${selectedTasks.length} 项任务` : '暂无日程安排'}
          </p>
        </div>

        <div className="flex-grow overflow-y-auto p-lg space-y-md">
          {selectedTasks.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-xl text-on-surface-variant">
              <span className="material-symbols-outlined text-5xl mb-sm text-primary/20">event_available</span>
              <span className="text-body-sm">这一天比较轻松</span>
              <span className="text-body-sm text-on-surface-variant/50 mt-0.5">点击格子可切换日期</span>
            </div>
          ) : (
            selectedTasks.map((task) => (
              <button
                key={task.id}
                type="button"
                className="w-full text-left group cursor-pointer bg-surface-container border border-surface-variant p-md rounded-lg shadow-sm hover:shadow-md hover:border-primary/40 transition-all"
                onClick={() => openTask(task)}
              >
                <div className="flex items-start gap-md">
                  <span
                    className={[
                      'material-symbols-outlined text-[18px] mt-0.5 shrink-0',
                      task.status === 2 ? 'text-secondary' : task.status === 1 ? 'text-primary' : 'text-on-surface-variant',
                    ].join(' ')}
                  >
                    {statusIcon[task.status] ?? 'radio_button_unchecked'}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p
                      className={[
                        'font-label text-label-md text-on-surface truncate',
                        task.status === 2 ? 'line-through opacity-60' : '',
                      ].join(' ')}
                    >
                      {task.title}
                    </p>
                    <p className="text-body-sm text-on-surface-variant mt-xs">
                      {task.due_date ? dayjs(task.due_date).format('HH:mm') : '全天'}
                      {task.priority_label ? ` · ${task.priority_label}` : ''}
                      {task.status_label ? ` · ${task.status_label}` : ''}
                    </p>
                    {task.description && (
                      <p className="text-[11px] text-on-surface-variant/60 mt-1 truncate">{task.description}</p>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>

        <div className="p-lg border-t border-surface-variant shrink-0">
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => navigate('/tasks/new')}
          >
            <span className="material-symbols-outlined" style={{ fontVariationSettings: "'FILL' 1" }}>
              add
            </span>
            新建任务
          </button>
        </div>
      </aside>
    </div>
  )
}
