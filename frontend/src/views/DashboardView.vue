<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { useAuthStore } from '@/stores/auth'

const router = useRouter()
const taskStore = useTaskStore()
const authStore = useAuthStore()

const searchQuery = ref('')
const unreadCount = ref(3)

const defaultAvatar = 'data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHdpZHRoPSI0MCIgaGVpZ2h0PSI0MCIgdmlld0JveD0iMCAwIDQwIDQwIj48cmVjdCB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIGZpbGw9IiMwMDU4YmUiLz48dGV4dCB4PSI1MCUiIHk9IjUwJSIgZG9taW5hbnQtYmFzZWxpbmU9ImNlbnRyYWwiIHRleHQtYW5jaG9yPSJtaWRkbGUiIGZpbGw9IndoaXRlIiBmb250LXNpemU9IjE2IiBmb250LWZhbWlseT0ic2Fucy1zZXJpZiI+VTwvdGV4dD48L3N2Zz4='

// Stats from store
const stats = computed(() => taskStore.stats || {
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
})

const highPriorityCount = computed(() => {
  const bp = stats.value.by_priority
  if (bp) {
    return bp.high.total - bp.high.completed
  }
  // Fallback: count from tasks list
  return (taskStore.tasks || []).filter(t => t.priority === 2 && t.status !== 2).length
})

// Remaining tasks for weekly goal
const remainingForGoal = computed(() => {
  return Math.max(0, stats.value.total - stats.value.completed)
})

// Greeting based on time of day
const greeting = computed(() => {
  const hour = new Date().getHours()
  if (hour < 6) return '夜深了'
  if (hour < 12) return '早上好'
  if (hour < 14) return '中午好'
  if (hour < 18) return '下午好'
  return '晚上好'
})

// Progress circle calculations
const circleRadius = 58
const circleCircumference = 2 * Math.PI * circleRadius
const dashOffset = computed(() => {
  const rate = stats.value.completion_rate || 0
  return circleCircumference - (circleCircumference * rate) / 100
})

// Upcoming deadlines: non-completed tasks with due dates, sorted soonest first, top 5
const upcomingDeadlines = computed(() => {
  const tasks = taskStore.tasks || []
  return tasks
    .filter((t) => t.due_date && t.status !== 2)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 5)
})

// Deadline urgency level: 'overdue' | 'urgent' | 'soon' | 'normal'
function deadlineUrgency(task: any): string {
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
    case 'overdue': return 'bg-error'
    case 'urgent': return 'bg-tertiary'
    case 'soon': return 'bg-primary'
    case 'normal': default: return 'bg-primary-container'
  }
}

function urgencyTextClass(urgency: string): string {
  switch (urgency) {
    case 'overdue': return 'text-error'
    case 'urgent': return 'text-tertiary'
    case 'soon': return 'text-primary'
    case 'normal': default: return 'text-on-surface-variant'
  }
}

function statusIcon(status: number): string {
  switch (status) {
    case 2: return 'check_circle'
    case 1: return 'pending'
    case 0: default: return 'radio_button_unchecked'
  }
}

function statusIconClass(status: number): string {
  switch (status) {
    case 2: return 'text-secondary'
    case 1: return 'text-primary'
    case 0: default: return 'text-on-surface-variant'
  }
}

// Recent activity: last 6 tasks updated, with more detail
const recentActivities = computed(() => {
  const tasks = taskStore.tasks || []
  return tasks
    .slice()
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
      created_at: t.updated_at || t.created_at,
      category: taskCategoryName(t),
      priority: t.priority,
    }))
})

function getActivityType(task: any): string {
  if (task.status === 2) return 'completed'
  if (task.needs_follow_up) return 'follow_up'
  if (task.status === 1) return 'in_progress'
  if (task.priority === 2) return 'urgent'
  return 'created'
}

function getActivityActionLabel(type: string): string {
  switch (type) {
    case 'completed': return '完成了任务'
    case 'follow_up': return '设置了跟进'
    case 'in_progress': return '更新了任务'
    case 'urgent': return '创建了高优任务'
    case 'created': default: return '创建了任务'
  }
}

function activityIcon(type: string): string {
  switch (type) {
    case 'completed': return 'check'
    case 'follow_up': return 'campaign'
    case 'in_progress': return 'edit'
    case 'urgent': return 'priority_high'
    case 'created': default: return 'add'
  }
}

function activityDotClass(type: string): string {
  switch (type) {
    case 'completed': return 'bg-secondary-container text-on-secondary-container'
    case 'follow_up': return 'bg-tertiary-fixed text-on-tertiary-fixed'
    case 'in_progress': return 'bg-primary-fixed text-on-primary-fixed'
    case 'urgent': return 'bg-error-container text-on-error-container'
    case 'created': default: return 'bg-tertiary-fixed text-on-tertiary-fixed'
  }
}

// Weekly daily completion data (Mon-Sun)
const weeklyDailyData = computed(() => {
  const tasks = taskStore.tasks || []
  const days = ['周一', '周二', '周三', '周四', '周五', '周六', '周日']
  const today = new Date()
  const dayOfWeek = today.getDay() || 7  // Convert Sunday(0) to 7
  const monday = new Date(today)
  monday.setDate(today.getDate() - dayOfWeek + 1)
  monday.setHours(0, 0, 0, 0)

  const data = days.map((label, i) => {
    const dayStart = new Date(monday)
    dayStart.setDate(monday.getDate() + i)
    dayStart.setHours(0, 0, 0, 0)
    const dayEnd = new Date(dayStart)
    dayEnd.setHours(23, 59, 59, 999)

    const completedCount = tasks.filter(t => {
      if (t.status !== 2 || !t.completed_at) return false
      const completedDate = new Date(t.completed_at)
      return completedDate >= dayStart && completedDate <= dayEnd
    }).length

    const pendingCount = tasks.filter(t => {
      const createdDate = new Date(t.created_at || 0)
      return createdDate <= dayEnd && t.status !== 2
    }).length

    return { label, completed: completedCount, total: pendingCount + completedCount }
  })
  return data
})

const weeklyCompletedTotal = computed(() => {
  return weeklyDailyData.value.reduce((sum, d) => sum + d.completed, 0)
})

const weeklyMaxCompleted = computed(() => {
  return Math.max(...weeklyDailyData.value.map(d => d.completed), 1)
})

const todayIndex = computed(() => {
  return (new Date().getDay() || 7) - 1
})

function priorityBarClass(priority: number): string {
  switch (priority) {
    case 2: return 'bg-error'
    case 1: return 'bg-tertiary'
    case 0: default: return 'bg-primary'
  }
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

function taskCategoryName(task: any): string {
  if (task.category?.name) return task.category.name
  if (task.tags && task.tags.length > 0) return task.tags.map((t: any) => t.name).join(', ')
  return '个人'
}

function goToTask(taskId: number) {
  router.push(`/tasks/${taskId}`)
}

function goToUpcomingAll() {
  const today = new Date()
  const inWeek = new Date(today)
  inWeek.setDate(today.getDate() + 7)
  const from = today.toISOString().split('T')[0]
  const to = inWeek.toISOString().split('T')[0]
  router.push(`/tasks?due_date_from=${from}&due_date_to=${to}`)
}

function goToStatsDetail() {
  router.push('/tasks?status=2')
}

onMounted(() => {
  taskStore.resetFilter()
  taskStore.fetchTasks().catch(() => {})
  taskStore.fetchStats('week').catch(() => {})
})
</script>

<template>
  <div class="min-h-screen bg-surface-container-low text-on-surface flex flex-col">
    <!-- Top App Bar -->
    <header class="sticky top-0 z-40 bg-surface border-b border-surface-variant flex justify-between items-center w-full px-lg h-16">
      <div class="flex items-center gap-lg">
        <div class="relative hidden sm:block">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            v-model="searchQuery"
            class="pl-10 pr-4 py-2 bg-surface-container-low rounded-full border-none focus:ring-2 focus:ring-primary w-64 text-label-md"
            placeholder="搜索任务..."
            type="text"
          />
        </div>
      </div>
      <div class="flex items-center gap-md">
        <button class="relative p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant">
          <span class="material-symbols-outlined">notifications</span>
          <span
            v-if="unreadCount > 0"
            class="absolute top-1 right-1 w-2.5 h-2.5 bg-error rounded-full border-2 border-surface"
          ></span>
        </button>
        <button class="p-2 rounded-full hover:bg-surface-container transition-colors text-on-surface-variant">
          <span class="material-symbols-outlined">help_outline</span>
        </button>
        <img
          :src="authStore.user?.avatar_url || defaultAvatar"
          :alt="authStore.nickname"
          class="w-10 h-10 rounded-full object-cover border-2 border-primary-container"
        />
      </div>
    </header>

    <!-- Main Content Area -->
    <main class="p-lg max-w-[1400px] mx-auto w-full flex-grow">
      <!-- Page Title -->
      <h2 class="font-headline text-[28px] font-bold text-on-surface mb-lg">
        今日工作总览
      </h2>

      <!-- Top Section: Metric Cards + Weekly Progress -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg mb-lg">
        <!-- Metric Cards (8 cols) -->
        <div class="lg:col-span-8 grid grid-cols-3 gap-4">
          <!-- Row 1 -->
          <div
            class="bg-[#e74c3c] text-white rounded-xl p-5 cursor-pointer hover:brightness-110 transition-all"
            @click="router.push('/tasks?priority=2&status=0')"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="material-symbols-outlined text-2xl opacity-80">warning</span>
              <span class="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </div>
            <p class="font-label text-[12px] opacity-80 mb-1">已逾期任务</p>
            <p class="font-headline text-[28px] font-bold">{{ stats.overdue }}<span class="text-[14px] ml-1 opacity-70">项</span></p>
          </div>

          <div
            class="bg-[#e67e22] text-white rounded-xl p-5 cursor-pointer hover:brightness-110 transition-all"
            @click="router.push('/tasks?status=0')"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="material-symbols-outlined text-2xl opacity-80">schedule</span>
              <span class="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </div>
            <p class="font-label text-[12px] opacity-80 mb-1">待处理任务</p>
            <p class="font-headline text-[28px] font-bold">{{ stats.pending }}<span class="text-[14px] ml-1 opacity-70">项</span></p>
          </div>

          <div
            class="bg-[#e67e22] text-white rounded-xl p-5 cursor-pointer hover:brightness-110 transition-all"
            @click="router.push('/tasks?priority=2')"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="material-symbols-outlined text-2xl opacity-80">priority_high</span>
              <span class="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </div>
            <p class="font-label text-[12px] opacity-80 mb-1">今日紧急任务</p>
            <p class="font-headline text-[28px] font-bold">{{ highPriorityCount }}<span class="text-[14px] ml-1 opacity-70">项</span></p>
          </div>

          <!-- Row 2 -->
          <div
            class="bg-[#3498db] text-white rounded-xl p-5 cursor-pointer hover:brightness-110 transition-all"
            @click="router.push('/tasks')"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="material-symbols-outlined text-2xl opacity-80">inventory_2</span>
              <span class="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </div>
            <p class="font-label text-[12px] opacity-80 mb-1">总任务数</p>
            <p class="font-headline text-[28px] font-bold">{{ stats.total }}<span class="text-[14px] ml-1 opacity-70">项</span></p>
          </div>

          <div
            class="bg-[#3498db] text-white rounded-xl p-5 cursor-pointer hover:brightness-110 transition-all"
            @click="router.push('/tasks?status=1')"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="material-symbols-outlined text-2xl opacity-80">pending</span>
              <span class="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </div>
            <p class="font-label text-[12px] opacity-80 mb-1">进行中任务</p>
            <p class="font-headline text-[28px] font-bold">{{ stats.in_progress }}<span class="text-[14px] ml-1 opacity-70">项</span></p>
          </div>

          <div
            class="bg-[#27ae60] text-white rounded-xl p-5 cursor-pointer hover:brightness-110 transition-all"
            @click="router.push('/tasks?status=2')"
          >
            <div class="flex items-center justify-between mb-2">
              <span class="material-symbols-outlined text-2xl opacity-80">check_circle</span>
              <span class="material-symbols-outlined text-lg opacity-50">chevron_right</span>
            </div>
            <p class="font-label text-[12px] opacity-80 mb-1">已完成任务</p>
            <p class="font-headline text-[28px] font-bold">{{ stats.completed }}<span class="text-[14px] ml-1 opacity-70">项</span></p>
          </div>
        </div>

        <!-- Weekly Progress (4 cols) -->
        <div class="lg:col-span-4 bg-surface rounded-xl p-6 border border-surface-variant flex flex-col items-center justify-center">
          <h3 class="font-headline text-headline-sm text-on-surface mb-4">本周进度</h3>
          <div class="relative inline-flex mb-3">
            <svg class="w-36 h-36 transform -rotate-90">
              <circle
                class="text-surface-container-high"
                cx="72" cy="72" fill="transparent" r="60"
                stroke="currentColor" stroke-width="10"
              ></circle>
              <circle
                class="text-primary transition-all duration-1000 ease-out"
                cx="72" cy="72" fill="transparent" r="60"
                stroke="currentColor"
                :stroke-dasharray="2 * Math.PI * 60"
                :stroke-dashoffset="2 * Math.PI * 60 - (2 * Math.PI * 60 * (stats.completion_rate || 0)) / 100"
                stroke-width="10"
                stroke-linecap="round"
              ></circle>
            </svg>
            <span class="absolute inset-0 flex items-center justify-center font-headline text-[32px] font-bold text-on-surface">
              {{ Math.round(stats.completion_rate || 0) }}%
            </span>
          </div>
          <p class="font-body text-body-sm text-on-surface-variant text-center">
            本周还需完成 <span class="font-bold text-on-surface">{{ remainingForGoal }}</span> 项
          </p>
        </div>
      </div>

      <!-- Bottom Section: Today's Tasks + Recent Activity -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg">
        <!-- Today's Tasks (7 cols) -->
        <section class="lg:col-span-7 bg-surface p-6 rounded-xl border border-surface-variant">
          <div class="flex justify-between items-center mb-5">
            <h3 class="font-headline text-headline-sm text-on-surface">今日待办 · 优先处理逾期项</h3>
            <span
              class="text-primary font-label text-label-md hover:underline cursor-pointer"
              @click="goToUpcomingAll"
            >延后</span>
          </div>

          <div class="space-y-3">
            <div
              v-for="task in upcomingDeadlines"
              :key="task.id"
              class="flex items-center gap-3 p-3 rounded-lg hover:bg-surface-container-low transition-all group cursor-pointer"
              @click="goToTask(task.id)"
            >
              <!-- Radio/Checkbox -->
              <button
                class="w-5 h-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition-all"
                :class="task.status === 2 ? 'bg-secondary border-secondary' : 'border-outline hover:border-primary'"
                @click.stop="task.status !== 2 && router.push(`/tasks/${task.id}/complete`)"
              >
                <span v-if="task.status === 2" class="material-symbols-outlined text-white text-xs">check</span>
              </button>

              <!-- Urgency indicator -->
              <div
                class="w-1 h-10 rounded-full flex-shrink-0"
                :class="urgencyBarClass(deadlineUrgency(task))"
              ></div>

              <!-- Task info -->
              <div class="flex-grow min-w-0">
                <div class="flex items-center gap-2">
                  <h4 class="font-label text-label-md text-on-surface truncate">{{ task.title }}</h4>
                  <span
                    v-if="deadlineUrgency(task) === 'overdue'"
                    class="bg-error/10 text-error font-label text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
                  >已逾期</span>
                </div>
                <p class="font-body text-[12px] text-on-surface-variant mt-0.5">
                  {{ taskCategoryName(task) }} · {{ formatDeadline(task.due_date || '') }}
                </p>
              </div>

              <!-- Complete button -->
              <button
                v-if="task.status !== 2"
                class="bg-secondary text-on-secondary font-label text-[12px] px-4 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-all hover:brightness-110 flex-shrink-0"
                @click.stop="router.push(`/tasks/${task.id}/complete`)"
              >
                完成
              </button>
            </div>

            <!-- Empty state -->
            <div
              v-if="upcomingDeadlines.length === 0"
              class="text-center py-8 text-on-surface-variant"
            >
              <span class="material-symbols-outlined text-4xl block mb-2 opacity-40">task_alt</span>
              <p class="font-body text-body-md">暂无待办任务，今天轻松一下！</p>
            </div>
          </div>
        </section>

        <!-- Recent Activity (5 cols) -->
        <section class="lg:col-span-5 bg-surface p-6 rounded-xl border border-surface-variant overflow-hidden flex flex-col">
          <h3 class="font-headline text-headline-sm text-on-surface mb-5">最近动态</h3>
          <div class="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-variant">
            <div
              v-for="activity in recentActivities"
              :key="activity.id"
              class="flex gap-3 relative cursor-pointer hover:opacity-80 transition-opacity"
              @click="goToTask(activity.id)"
            >
              <div
                class="w-6 h-6 rounded-full flex items-center justify-center z-10 shrink-0"
                :class="activityDotClass(activity.type)"
              >
                <span
                  class="material-symbols-outlined !text-[14px]"
                  :style="activity.type === 'completed' ? 'font-variation-settings: \'FILL\' 1;' : ''"
                >{{ activityIcon(activity.type) }}</span>
              </div>
              <div class="flex-grow min-w-0">
                <p class="font-body text-body-sm">
                  <span class="font-label text-on-surface">{{ getActivityActionLabel(activity.type) }}</span>
                  <span class="text-on-surface-variant ml-1">{{ activity.title }}</span>
                </p>
                <p class="font-label text-[11px] text-on-surface-variant/70 mt-0.5">
                  {{ activity.category }} · {{ formatTimeAgo(activity.created_at) }}
                </p>
              </div>
            </div>

            <!-- Empty state -->
            <div
              v-if="recentActivities.length === 0"
              class="text-center py-8 text-on-surface-variant"
            >
              <span class="material-symbols-outlined text-4xl block mb-2 opacity-40">history</span>
              <p class="font-body text-body-md">暂无最近动态</p>
            </div>
          </div>
        </section>
      </div>
    </main>
  </div>
</template>

<style scoped>
.bg-surface {
  transition: box-shadow 0.3s ease, transform 0.3s ease;
}
</style>
