import { useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { Spin } from 'antd'
import { useTaskStore } from '@/stores/task'
import { useAuthStore, selectNickname } from '@/stores/auth'
import type { Task, TaskStats } from '@/types'

const emptyStats: TaskStats = {
  total: 0,
  completed: 0,
  pending: 0,
  in_progress: 0,
  overdue: 0,
  completion_rate: 0,
  by_priority: {
    high: { total: 0, completed: 0 },
    medium: { total: 0, completed: 0 },
    low: { total: 0, completed: 0 },
  },
  by_category: [],
}

function formatDeadline(dateStr: string): string {
  if (!dateStr) return '无截止日期'
  const date = new Date(dateStr)
  const now = new Date()
  const diff = date.getTime() - now.getTime()
  const hours = Math.floor(diff / (1000 * 60 * 60))
  const days = Math.floor(diff / (1000 * 60 * 60 * 24))
  if (hours < 0) return '已过期'
  if (hours < 1) return '即将到期'
  if (hours < 24) return `${hours} 小时后截止`
  if (days === 1) return '1 天后截止'
  if (days <= 7) return `${days} 天后截止`
  return `${date.getMonth() + 1}月${date.getDate()}日截止`
}

function formatTimeAgo(dateStr: string): string {
  if (!dateStr) return '刚刚'
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now.getTime() - date.getTime()
  const minutes = Math.floor(diffMs / (1000 * 60))
  const hours = Math.floor(diffMs / (1000 * 60 * 60))
  const days = Math.floor(diffMs / (1000 * 60 * 60 * 24))
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes} 分钟前`
  if (hours < 24) return `${hours} 小时前`
  if (days < 7) return `${days} 天前`
  return `${date.getMonth() + 1}月${date.getDate()}日`
}

function deadlineUrgency(task: Task): string {
  if (!task.due_date) return 'normal'
  const diff = new Date(task.due_date).getTime() - Date.now()
  const hours = diff / (1000 * 60 * 60)
  if (hours < 0) return 'overdue'
  if (hours < 24) return 'urgent'
  if (hours < 72) return 'soon'
  return 'normal'
}

function urgencyBarClass(urgency: string): string {
  switch (urgency) {
    case 'overdue':
      return 'bg-red-500'
    case 'urgent':
      return 'bg-amber-500'
    case 'soon':
      return 'bg-blue-500'
    default:
      return 'bg-blue-200'
  }
}

function getActivityType(task: Task): string {
  if (task.status === 2) return 'completed'
  if (task.needs_follow_up) return 'follow_up'
  if (task.status === 1) return 'in_progress'
  if (task.priority === 2) return 'urgent'
  return 'created'
}

function getActivityActionLabel(type: string): string {
  switch (type) {
    case 'completed':
      return '完成了任务'
    case 'follow_up':
      return '设置了跟进'
    case 'in_progress':
      return '更新了任务'
    case 'urgent':
      return '创建了高优任务'
    default:
      return '创建了任务'
  }
}

function taskCategoryName(task: Task): string {
  if (task.category?.name) return task.category.name
  if (task.tags?.length) return task.tags.map((t) => t.name).join(', ')
  return '个人'
}

type MetricCardProps = {
  label: string
  value: number
  icon: string
  color: string
  onClick: () => void
}

function MetricCard({ label, value, icon, color, onClick }: MetricCardProps) {
  return (
    <button
      type="button"
      className={`${color} text-white rounded-xl p-5 text-left cursor-pointer hover:brightness-110 transition-all w-full`}
      onClick={onClick}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="material-symbols-outlined text-2xl opacity-80">{icon}</span>
        <span className="material-symbols-outlined text-lg opacity-50">chevron_right</span>
      </div>
      <p className="text-xs opacity-80 mb-1 m-0">{label}</p>
      <p className="text-[28px] font-bold m-0">
        {value}
        <span className="text-sm ml-1 opacity-70">项</span>
      </p>
    </button>
  )
}

export default function DashboardPage() {
  const navigate = useNavigate()
  const user = useAuthStore((s) => s.user)
  const tasks = useTaskStore((s) => s.tasks)
  const statsRaw = useTaskStore((s) => s.stats)
  const loading = useTaskStore((s) => s.loading)
  const fetchTasks = useTaskStore((s) => s.fetchTasks)
  const fetchStats = useTaskStore((s) => s.fetchStats)
  const resetFilter = useTaskStore((s) => s.resetFilter)

  const stats = statsRaw || emptyStats
  const nickname = selectNickname(user) || '用户'

  const highPriorityCount = useMemo(() => {
    const bp = stats.by_priority
    if (bp) return bp.high.total - bp.high.completed
    return tasks.filter((t) => t.priority === 2 && t.status !== 2).length
  }, [stats, tasks])

  const remainingForGoal = Math.max(0, stats.total - stats.completed)

  const greeting = useMemo(() => {
    const hour = new Date().getHours()
    if (hour < 6) return '夜深了'
    if (hour < 12) return '早上好'
    if (hour < 14) return '中午好'
    if (hour < 18) return '下午好'
    return '晚上好'
  }, [])

  const upcomingDeadlines = useMemo(() => {
    return tasks
      .filter((t) => t.due_date && t.status !== 2)
      .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
      .slice(0, 5)
  }, [tasks])

  const recentActivities = useMemo(() => {
    return [...tasks]
      .sort((a, b) => {
        const dateA = new Date(a.updated_at || a.created_at || 0).getTime()
        const dateB = new Date(b.updated_at || b.created_at || 0).getTime()
        return dateB - dateA
      })
      .slice(0, 6)
      .map((t) => ({
        id: t.id,
        title: t.title,
        type: getActivityType(t),
        created_at: t.updated_at || t.created_at || '',
        category: taskCategoryName(t),
      }))
  }, [tasks])

  useEffect(() => {
    resetFilter()
    void fetchTasks().catch(() => {})
    void fetchStats('week').catch(() => {})
  }, [fetchTasks, fetchStats, resetFilter])

  const rate = Math.round(stats.completion_rate || 0)
  const circumference = 2 * Math.PI * 60
  const dashOffset = circumference - (circumference * rate) / 100

  return (
    <div className="min-h-full bg-surface-container-low text-on-surface flex flex-col">
      <header className="sticky top-0 z-40 bg-surface border-b border-surface-variant flex justify-between items-center w-full px-6 h-16">
        <div className="font-body text-sm text-on-surface-variant">
          {greeting}，{nickname}
        </div>
        <button
          type="button"
          className="bg-primary text-on-primary rounded-xl px-4 py-2 flex items-center gap-2 text-sm font-medium hover:opacity-90"
          onClick={() => navigate('/tasks/new')}
        >
          <span className="material-symbols-outlined text-xl">add</span>
          新建任务
        </button>
      </header>

      <main className="p-6 max-w-[1400px] mx-auto w-full flex-grow">
        <h2 className="text-[28px] font-bold text-on-surface mb-6 m-0">今日工作总览</h2>

        {loading && !statsRaw && tasks.length === 0 ? (
          <div className="flex justify-center py-20">
            <Spin size="large" />
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 mb-6">
              <div className="lg:col-span-8 grid grid-cols-2 sm:grid-cols-3 gap-4">
                <MetricCard
                  label="已逾期任务"
                  value={stats.overdue}
                  icon="warning"
                  color="bg-[#e74c3c]"
                  onClick={() => navigate('/tasks?priority=2&status=0')}
                />
                <MetricCard
                  label="待处理任务"
                  value={stats.pending}
                  icon="schedule"
                  color="bg-[#e67e22]"
                  onClick={() => navigate('/tasks?status=0')}
                />
                <MetricCard
                  label="今日紧急任务"
                  value={highPriorityCount}
                  icon="priority_high"
                  color="bg-[#e67e22]"
                  onClick={() => navigate('/tasks?priority=2')}
                />
                <MetricCard
                  label="总任务数"
                  value={stats.total}
                  icon="inventory_2"
                  color="bg-[#3498db]"
                  onClick={() => navigate('/tasks')}
                />
                <MetricCard
                  label="进行中任务"
                  value={stats.in_progress}
                  icon="pending"
                  color="bg-[#3498db]"
                  onClick={() => navigate('/tasks?status=1')}
                />
                <MetricCard
                  label="已完成任务"
                  value={stats.completed}
                  icon="check_circle"
                  color="bg-[#27ae60]"
                  onClick={() => navigate('/tasks?status=2')}
                />
              </div>

              <div className="lg:col-span-4 bg-surface rounded-xl p-6 border border-surface-variant flex flex-col items-center justify-center">
                <h3 className="text-lg font-semibold text-on-surface mb-4 m-0">本周进度</h3>
                <div className="relative inline-flex mb-3">
                  <svg className="w-36 h-36 transform -rotate-90" viewBox="0 0 144 144">
                    <circle
                      className="text-gray-200"
                      cx="72"
                      cy="72"
                      fill="transparent"
                      r="60"
                      stroke="currentColor"
                      strokeWidth="10"
                    />
                    <circle
                      className="text-primary transition-all duration-1000 ease-out"
                      cx="72"
                      cy="72"
                      fill="transparent"
                      r="60"
                      stroke="currentColor"
                      strokeDasharray={circumference}
                      strokeDashoffset={dashOffset}
                      strokeWidth="10"
                      strokeLinecap="round"
                    />
                  </svg>
                  <span className="absolute inset-0 flex items-center justify-center text-[32px] font-bold text-on-surface">
                    {rate}%
                  </span>
                </div>
                <p className="text-sm text-on-surface-variant text-center m-0">
                  本周还需完成 <span className="font-bold text-on-surface">{remainingForGoal}</span> 项
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
              <section className="lg:col-span-7 bg-surface p-6 rounded-xl border border-surface-variant">
                <div className="flex justify-between items-center mb-5">
                  <h3 className="text-lg font-semibold text-on-surface m-0">今日待办 · 优先处理逾期项</h3>
                  <button
                    type="button"
                    className="text-primary text-sm hover:underline bg-transparent border-0 cursor-pointer"
                    onClick={() => {
                      const today = new Date()
                      const inWeek = new Date(today)
                      inWeek.setDate(today.getDate() + 7)
                      const from = today.toISOString().split('T')[0]
                      const to = inWeek.toISOString().split('T')[0]
                      navigate(`/tasks?due_date_from=${from}&due_date_to=${to}`)
                    }}
                  >
                    查看更多
                  </button>
                </div>

                <div className="space-y-3">
                  {upcomingDeadlines.map((task) => {
                    const urgency = deadlineUrgency(task)
                    return (
                      <div
                        key={task.id}
                        className="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-container-low transition-all cursor-pointer"
                        onClick={() => navigate(`/tasks/${task.id}`)}
                        role="button"
                        tabIndex={0}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') navigate(`/tasks/${task.id}`)
                        }}
                      >
                        <div className={`w-1 h-10 rounded-full flex-shrink-0 ${urgencyBarClass(urgency)}`} />
                        <div className="flex-grow min-w-0">
                          <div className="flex items-center gap-2">
                            <h4 className="text-sm font-medium text-on-surface truncate m-0">{task.title}</h4>
                            {urgency === 'overdue' && (
                              <span className="bg-red-100 text-red-600 text-[10px] px-2 py-0.5 rounded-full flex-shrink-0">
                                已逾期
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-on-surface-variant mt-0.5 m-0">
                            {taskCategoryName(task)} · {formatDeadline(task.due_date || '')}
                          </p>
                        </div>
                      </div>
                    )
                  })}

                  {upcomingDeadlines.length === 0 && (
                    <div className="text-center py-8 text-on-surface-variant">
                      <span className="material-symbols-outlined text-4xl block mb-2 opacity-40">task_alt</span>
                      <p className="text-sm m-0">暂无待办任务，今天轻松一下！</p>
                    </div>
                  )}
                </div>
              </section>

              <section className="lg:col-span-5 bg-surface p-6 rounded-xl border border-surface-variant">
                <h3 className="text-lg font-semibold text-on-surface mb-5 m-0">最近动态</h3>
                <div className="space-y-4">
                  {recentActivities.map((activity) => (
                    <div
                      key={activity.id}
                      className="flex gap-3 cursor-pointer hover:opacity-80 transition-opacity"
                      onClick={() => navigate(`/tasks/${activity.id}`)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') navigate(`/tasks/${activity.id}`)
                      }}
                    >
                      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-sm">history</span>
                      </div>
                      <div className="flex-grow min-w-0">
                        <p className="text-sm m-0">
                          <span className="font-medium text-on-surface">{getActivityActionLabel(activity.type)}</span>
                          <span className="text-on-surface-variant ml-1">{activity.title}</span>
                        </p>
                        <p className="text-[11px] text-on-surface-variant/70 mt-0.5 m-0">
                          {activity.category} · {formatTimeAgo(activity.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}

                  {recentActivities.length === 0 && (
                    <div className="text-center py-8 text-on-surface-variant">
                      <span className="material-symbols-outlined text-4xl block mb-2 opacity-40">history</span>
                      <p className="text-sm m-0">暂无最近动态</p>
                    </div>
                  )}
                </div>
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  )
}
