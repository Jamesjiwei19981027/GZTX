<script setup lang="ts">
import { ref, computed, watch, onMounted } from 'vue'
import { useTaskStore } from '@/stores/task'
import dayjs from 'dayjs'
import { getMonthCalendarDates } from '@/utils/date'
import type { Task } from '@/types'

const taskStore = useTaskStore()

// ─── State ────────────────────────────────────────────────────────────────────
const currentDate = ref(dayjs())
const selectedDate = ref(dayjs())
const viewMode = ref<'month' | 'week' | 'day'>('month')

// ─── Computed ─────────────────────────────────────────────────────────────────
const currentYear = computed(() => currentDate.value.year())
const currentMonth = computed(() => currentDate.value.month())

const calendarDates = computed(() =>
  getMonthCalendarDates(currentYear.value, currentMonth.value).map(d => dayjs(d))
)

const monthTitle = computed(() => `${currentDate.value.year()}年 ${currentDate.value.month() + 1}月`)

const dayHeaders = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const selectedDateTasks = computed(() => getTasksForDate(selectedDate.value))

const selectedDateLabel = computed(() => {
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  const d = selectedDate.value
  return `${d.month() + 1}月${d.date()}日，${weekdays[d.day()]}`
})

const efficiencyScore = computed(() => {
  const tasks = selectedDateTasks.value
  if (tasks.length === 0) return 0
  const completed = tasks.filter(t => t.status === 2).length
  return Math.round((completed / tasks.length) * 100)
})

// ─── Methods ──────────────────────────────────────────────────────────────────
function prevMonth() {
  currentDate.value = currentDate.value.subtract(1, 'month')
}

function nextMonth() {
  currentDate.value = currentDate.value.add(1, 'month')
}

function goToday() {
  currentDate.value = dayjs()
  selectedDate.value = dayjs()
}

function isCurrentMonth(date: dayjs.Dayjs): boolean {
  return date.month() === currentMonth.value
}

function isToday(date: dayjs.Dayjs): boolean {
  return date.isSame(dayjs(), 'day')
}

function selectDate(date: dayjs.Dayjs) {
  selectedDate.value = date
}

function getTasksForDate(date: dayjs.Dayjs): Task[] {
  const dateStr = date.format('YYYY-MM-DD')
  return taskStore.tasks.filter(t => {
    if (!t.due_date) return false
    return dayjs(t.due_date).format('YYYY-MM-DD') === dateStr
  })
}

function getEventColorClass(task: Task, index: number): string {
  if (task.priority === 2) return 'bg-primary/10 text-primary'
  if (task.priority === 1) return 'bg-secondary-container/50 text-secondary'
  if (index % 3 === 0) return 'bg-primary/10 text-primary'
  if (index % 3 === 1) return 'bg-secondary-container/50 text-secondary'
  return 'bg-tertiary-fixed text-tertiary'
}

function getTaskBarColor(task: Task): string {
  if (task.priority === 2) return 'bg-primary'
  if (task.priority === 1) return 'bg-secondary'
  return 'bg-tertiary'
}

function getTaskIcon(task: Task): string {
  if (task.due_date) return 'schedule'
  if (task.category) return 'group'
  return 'check_circle'
}

function getTaskTimeLabel(task: Task): string {
  if (!task.due_date) return ''
  const d = dayjs(task.due_date)
  const h = d.hour()
  const timeStr = d.format('HH:mm')
  if (h < 12) return `上午 ${timeStr}`
  return `下午 ${timeStr}`
}

async function loadTasks() {
  const dates = calendarDates.value
  if (dates.length === 0) return
  const start = dates[0].format('YYYY-MM-DD')
  const end = dates[dates.length - 1].format('YYYY-MM-DD')
  await taskStore.fetchTasks({ due_date_from: start, due_date_to: end } as any)
}

// ─── Watchers ─────────────────────────────────────────────────────────────────
watch(currentDate, () => { loadTasks() })

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => { loadTasks() })
</script>

<style scoped>
.task-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.glass-panel {
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(10px);
  -webkit-backdrop-filter: blur(10px);
}
.scrollbar-hide::-webkit-scrollbar {
  display: none;
}
.scrollbar-hide {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
.drag-preview {
  opacity: 0.5;
  cursor: grabbing;
}
</style>

<template>
  <div class="flex flex-1 overflow-hidden">
    <!-- Calendar Section -->
    <div class="flex-grow flex flex-col p-lg">
      <!-- Calendar Header -->
      <div class="flex items-center justify-between mb-lg">
        <div class="flex items-center gap-md">
          <h1 class="font-display text-display-lg">{{ monthTitle }}</h1>
          <div class="flex gap-xs ml-md">
            <button class="p-2 hover:bg-surface-container rounded-full transition-colors" @click="prevMonth">
              <span class="material-symbols-outlined">chevron_left</span>
            </button>
            <button class="p-2 hover:bg-surface-container rounded-full transition-colors" @click="nextMonth">
              <span class="material-symbols-outlined">chevron_right</span>
            </button>
          </div>
          <button class="px-md py-1.5 border border-outline-variant rounded-full text-label-md font-label hover:bg-surface-container-low transition-colors ml-sm" @click="goToday">今天</button>
        </div>
        <div class="flex bg-surface-container-low p-1 rounded-lg">
          <button
            v-for="mode in (['month', 'week', 'day'] as const)"
            :key="mode"
            :class="[
              'px-lg py-1.5 text-label-md font-label rounded-md transition-colors',
              viewMode === mode
                ? 'bg-surface shadow-sm text-primary'
                : 'text-on-surface-variant hover:text-on-surface'
            ]"
            @click="viewMode = mode"
          >
            {{ mode === 'month' ? '月' : mode === 'week' ? '周' : '日' }}
          </button>
        </div>
      </div>

      <!-- Calendar Content -->
      <div class="flex-grow bg-surface rounded-2xl border border-surface-variant shadow-sm overflow-hidden flex flex-col">
        <!-- Day Headers -->
        <div class="grid grid-cols-7 border-b border-surface-variant shrink-0">
          <div
            v-for="(header, hIdx) in dayHeaders"
            :key="header"
            :class="[
              'py-sm text-center font-label text-label-md text-on-surface-variant',
              hIdx < 6 && 'border-r border-surface-variant'
            ]"
          >
            {{ header }}
          </div>
        </div>

        <!-- Date Grid -->
        <div class="grid grid-cols-7 flex-grow" style="grid-template-rows: repeat(6, 1fr);">
          <div
            v-for="(date, index) in calendarDates"
            :key="index"
            :class="[
              'border-r border-b border-surface-variant p-sm h-full flex flex-col transition-colors',
              !isCurrentMonth(date)
                ? 'bg-surface-container-lowest/30 opacity-40'
                : 'hover:bg-surface-container-low cursor-pointer group',
              isToday(date) && 'bg-primary-fixed/10 ring-1 ring-inset ring-primary/20'
            ]"
            @click="isCurrentMonth(date) && selectDate(date)"
          >
            <!-- Day number row -->
            <div class="flex justify-between items-center">
              <span
                :class="[
                  'text-label-sm font-label',
                  isToday(date) && 'bg-primary text-on-primary w-6 h-6 flex items-center justify-center rounded-full'
                ]"
              >{{ date.date() }}</span>
            </div>

            <!-- Event labels -->
            <div class="mt-xs space-y-1 overflow-hidden">
              <div
                v-for="(task, tIdx) in getTasksForDate(date).slice(0, 2)"
                :key="task.id"
                :class="[
                  'text-[10px] px-1.5 py-0.5 rounded truncate font-medium',
                  getEventColorClass(task, tIdx)
                ]"
                :title="task.title"
              >
                {{ task.title }}
              </div>
              <div
                v-if="getTasksForDate(date).length > 2"
                class="text-[10px] text-on-surface-variant font-label px-1.5"
              >
                +{{ getTasksForDate(date).length - 2 }} 更多
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Sidebar Side Panel -->
    <aside class="w-80 border-l border-surface-variant bg-surface-container-lowest hidden lg:flex flex-col shrink-0 overflow-hidden">
      <!-- Date Heading -->
      <div class="p-lg border-b border-surface-variant shrink-0">
        <h3 class="font-headline text-headline-sm mb-xs">{{ selectedDateLabel }}</h3>
        <p class="text-body-sm text-on-surface-variant">今日已安排 {{ selectedDateTasks.length }} 项任务</p>

        <!-- Efficiency Score -->
        <div class="mt-lg flex flex-col gap-sm">
          <div class="flex items-center justify-between">
            <span class="text-label-sm font-label text-on-surface-variant uppercase tracking-wider">效率评分</span>
            <span class="text-label-sm font-label text-secondary">{{ efficiencyScore }}%</span>
          </div>
          <div class="h-1 bg-surface-variant rounded-full overflow-hidden">
            <div class="h-full bg-secondary transition-all duration-500" :style="{ width: `${efficiencyScore}%` }"></div>
          </div>
        </div>
      </div>

      <!-- Task List -->
      <div class="flex-grow overflow-y-auto p-lg space-y-md scrollbar-hide">
        <!-- Empty state -->
        <div v-if="selectedDateTasks.length === 0" class="flex flex-col items-center justify-center py-xl text-on-surface-variant">
          <span class="material-symbols-outlined text-5xl mb-sm opacity-30">event_available</span>
          <span class="text-body-sm">暂无日程安排</span>
          <span class="text-body-sm text-on-surface-variant/60 mt-0.5">享受这轻松的一天</span>
        </div>

        <!-- Task Cards -->
        <div
          v-for="task in selectedDateTasks"
          :key="task.id"
          draggable="true"
          class="group cursor-grab active:cursor-grabbing bg-surface border border-outline-variant p-md rounded-xl shadow-sm hover:shadow-md transition-all"
        >
          <div class="flex items-start gap-md">
            <div :class="['w-2 h-10 rounded-full mt-1 shrink-0', getTaskBarColor(task)]"></div>
            <div class="flex-grow min-w-0">
              <p class="font-label text-label-md text-on-surface truncate">{{ task.title }}</p>
              <div class="flex items-center gap-xs text-on-surface-variant text-[12px] mt-1">
                <span class="material-symbols-outlined text-[14px]">{{ getTaskIcon(task) }}</span>
                {{ task.due_date ? getTaskTimeLabel(task) : '全天' }}
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Mini Weather / Motivation -->
      <div class="p-lg mt-auto shrink-0">
        <div class="glass-panel p-md rounded-2xl border border-primary/10 flex items-center gap-md">
          <div class="w-10 h-10 rounded-full bg-primary-fixed flex items-center justify-center text-primary shrink-0">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">wb_sunny</span>
          </div>
          <div>
            <p class="text-label-sm font-label text-on-surface-variant uppercase">今日展望</p>
            <p class="text-label-md font-label">晴空万里，别忘了补水！</p>
          </div>
        </div>
      </div>
    </aside>
  </div>
</template>
