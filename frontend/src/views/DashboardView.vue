<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useTaskStore } from '@/stores/task'
import { useAuthStore } from '@/stores/auth'

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
  if (!bp) return 0
  return bp.high.total - bp.high.completed
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

// Upcoming deadlines: non-completed tasks with due dates, sorted soonest first, top 3
const upcomingDeadlines = computed(() => {
  const tasks = taskStore.tasks || []
  return tasks
    .filter((t) => t.due_date && t.status !== 2)
    .sort((a, b) => new Date(a.due_date!).getTime() - new Date(b.due_date!).getTime())
    .slice(0, 3)
})

// Recent activity: last 4 tasks updated
const recentActivities = computed(() => {
  const tasks = taskStore.tasks || []
  return tasks
    .slice()
    .sort((a, b) => {
      const dateA = new Date(a.updated_at || a.created_at || 0).getTime()
      const dateB = new Date(b.updated_at || b.created_at || 0).getTime()
      return dateB - dateA
    })
    .slice(0, 4)
    .map((t) => ({
      id: t.id,
      title: t.title,
      type: getActivityType(t),
      created_at: t.updated_at || t.created_at,
    }))
})

function getActivityType(task: any): string {
  if (task.status === 2) return 'completed'
  if (task.status === 1) return 'in_progress'
  if (task.priority === 2) return 'urgent'
  return 'created'
}

function getActivityActionLabel(type: string): string {
  switch (type) {
    case 'completed': return '任务已完成：'
    case 'in_progress': return '任务已更新：'
    case 'urgent': return '新协作者：'
    case 'created': default: return '新任务：'
  }
}

function activityIcon(type: string): string {
  switch (type) {
    case 'completed': return 'check'
    case 'in_progress': return 'edit'
    case 'urgent': return 'group'
    case 'created': default: return 'add'
  }
}

function activityDotClass(type: string): string {
  switch (type) {
    case 'completed': return 'bg-secondary-container text-on-secondary-container'
    case 'in_progress': return 'bg-primary-fixed text-on-primary-fixed'
    case 'urgent': return 'bg-tertiary-fixed text-on-tertiary-fixed'
    case 'created': default: return 'bg-tertiary-fixed text-on-tertiary-fixed'
  }
}

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

onMounted(() => {
  taskStore.fetchTasks()
  taskStore.fetchStats('week')
})
</script>

<template>
  <div class="min-h-screen bg-background text-on-surface flex flex-col">
    <!-- Top App Bar -->
    <header class="sticky top-0 z-40 bg-surface border-b border-surface-variant flex justify-between items-center w-full px-lg h-16">
      <div class="flex items-center gap-lg">
        <div class="relative hidden sm:block">
          <span class="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-on-surface-variant">search</span>
          <input
            v-model="searchQuery"
            class="pl-10 pr-4 py-2 bg-surface-container rounded-full border-none focus:ring-2 focus:ring-primary w-64 text-label-md"
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
    <main class="p-lg md:p-xl max-w-max-width mx-auto w-full">
      <!-- Welcome Message -->
      <section class="mb-xl">
        <h2 class="font-headline text-headline-md md:text-display-lg text-on-surface tracking-tight mb-xs">
          {{ greeting }}, {{ authStore.nickname || 'Alex' }}
        </h2>
        <p class="font-body text-body-md text-on-surface-variant">
          今天您有 {{ highPriorityCount }} 个高优先级任务待完成。
        </p>
      </section>

      <!-- Top Bento Layer -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg mb-lg">
        <!-- Stats Cards (8 cols) -->
        <div class="lg:col-span-8 grid grid-cols-2 md:grid-cols-4 gap-md">
          <div class="bg-surface p-md rounded-xl border border-surface-variant shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-32">
            <span class="material-symbols-outlined text-primary">inventory_2</span>
            <div>
              <p class="font-label text-label-sm text-on-surface-variant uppercase tracking-wider">总任务数</p>
              <p class="font-headline text-headline-md">{{ stats.total }}</p>
            </div>
          </div>
          <div class="bg-surface p-md rounded-xl border border-surface-variant shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-32">
            <span class="material-symbols-outlined text-secondary">check_circle</span>
            <div>
              <p class="font-label text-label-sm text-on-surface-variant uppercase tracking-wider">已完成</p>
              <p class="font-headline text-headline-md">{{ stats.completed }}</p>
            </div>
          </div>
          <div class="bg-surface p-md rounded-xl border border-surface-variant shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-32">
            <span class="material-symbols-outlined text-tertiary">pending</span>
            <div>
              <p class="font-label text-label-sm text-on-surface-variant uppercase tracking-wider">进行中</p>
              <p class="font-headline text-headline-md">{{ stats.in_progress }}</p>
            </div>
          </div>
          <div class="bg-surface p-md rounded-xl border border-surface-variant shadow-sm hover:shadow-md transition-all flex flex-col justify-between h-32">
            <span class="material-symbols-outlined text-error">priority_high</span>
            <div>
              <p class="font-label text-label-sm text-on-surface-variant uppercase tracking-wider">紧急</p>
              <p class="font-headline text-headline-md">{{ highPriorityCount }}</p>
            </div>
          </div>
        </div>

        <!-- Progress Circle (4 cols) -->
        <div class="lg:col-span-4 bg-primary-container text-on-primary-container p-lg rounded-xl shadow-sm flex flex-col items-center justify-center text-center">
          <h3 class="font-label text-label-md mb-md">每周进度</h3>
          <div class="relative inline-flex">
            <svg class="w-32 h-32 transform -rotate-90">
              <circle
                class="text-on-primary-container/20"
                cx="64" cy="64" fill="transparent" r="58"
                stroke="currentColor" stroke-width="8"
              ></circle>
              <circle
                class="text-on-primary-container transition-all duration-1000 ease-out"
                cx="64" cy="64" fill="transparent" r="58"
                stroke="currentColor"
                :stroke-dasharray="circleCircumference"
                :stroke-dashoffset="dashOffset"
                stroke-width="8"
              ></circle>
            </svg>
            <span class="absolute inset-0 flex items-center justify-center font-headline text-headline-md">
              {{ Math.round(stats.completion_rate) }}%
            </span>
          </div>
          <p class="mt-md font-body text-body-sm opacity-90">
            还差 {{ remainingForGoal }} 个任务即可达成周目标
          </p>
        </div>
      </div>

      <!-- Bottom Bento Layer -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-lg">
        <!-- Upcoming Deadlines (7 cols) -->
        <section class="lg:col-span-7 bg-surface p-lg rounded-xl border border-surface-variant shadow-sm">
          <div class="flex justify-between items-center mb-lg">
            <h3 class="font-headline text-headline-sm">即将到期的截止日期</h3>
            <span class="text-primary font-label text-label-md hover:underline cursor-pointer">查看全部</span>
          </div>
          <div class="space-y-sm">
            <div
              v-for="task in upcomingDeadlines"
              :key="task.id"
              class="flex items-center gap-md p-md bg-surface-container-low rounded-lg border border-transparent hover:border-outline-variant transition-all group"
            >
              <div
                class="w-1 h-10 rounded-full"
                :class="priorityBarClass(task.priority)"
              ></div>
              <div class="flex-grow">
                <h4 class="font-label text-label-md">{{ task.title }}</h4>
                <p class="font-body text-body-sm text-on-surface-variant">
                  {{ formatDeadline(task.due_date || '') }} &bull; 项目：{{ taskCategoryName(task) }}
                </p>
              </div>
              <button class="opacity-0 group-hover:opacity-100 p-2 hover:bg-surface-container rounded-full transition-all">
                <span class="material-symbols-outlined text-on-surface-variant">chevron_right</span>
              </button>
            </div>

            <!-- Empty state -->
            <div
              v-if="upcomingDeadlines.length === 0"
              class="text-center py-xl text-on-surface-variant"
            >
              <span class="material-symbols-outlined text-4xl block mb-sm opacity-40">task_alt</span>
              <p class="font-body text-body-md">暂无即将到期的任务</p>
            </div>
          </div>
        </section>

        <!-- Recent Activity (5 cols) -->
        <section class="lg:col-span-5 bg-surface p-lg rounded-xl border border-surface-variant shadow-sm overflow-hidden flex flex-col">
          <h3 class="font-headline text-headline-sm mb-lg">最近动态</h3>
          <div class="space-y-lg relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[2px] before:bg-surface-variant">
            <div
              v-for="activity in recentActivities"
              :key="activity.id"
              class="flex gap-md relative"
            >
              <div
                class="w-6 h-6 rounded-full flex items-center justify-center z-10"
                :class="activityDotClass(activity.type)"
              >
                <span
                  class="material-symbols-outlined !text-[14px]"
                  :style="activity.type === 'completed' ? 'font-variation-settings: \'FILL\' 1;' : ''"
                >{{ activityIcon(activity.type) }}</span>
              </div>
              <div>
                <p class="font-body text-body-sm">
                  <span class="font-bold">{{ getActivityActionLabel(activity.type) }}</span>
                  {{ activity.title }}
                </p>
                <p class="font-label text-label-sm text-on-surface-variant">
                  {{ formatTimeAgo(activity.created_at) }}
                </p>
              </div>
            </div>

            <!-- Empty state -->
            <div
              v-if="recentActivities.length === 0"
              class="text-center py-xl text-on-surface-variant"
            >
              <span class="material-symbols-outlined text-4xl block mb-sm opacity-40">history</span>
              <p class="font-body text-body-md">暂无最近动态</p>
            </div>
          </div>
          <div class="mt-auto pt-lg">
            <div class="rounded-xl overflow-hidden aspect-video relative group cursor-pointer">
              <div class="w-full h-full bg-gradient-to-br from-primary-container/30 to-primary/20 flex items-center justify-center">
                <span class="material-symbols-outlined text-5xl text-primary/40">workspace_premium</span>
              </div>
              <div class="absolute inset-0 bg-gradient-to-t from-black/60 to-transparent flex items-end p-md">
                <p class="text-white font-label text-label-md">提示：按标签对任务进行分组以保持专注。</p>
              </div>
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
