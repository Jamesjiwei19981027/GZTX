<script setup lang="ts">
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { getMonthCalendarDates } from '@/utils/date'
import type { Task } from '@/types'
import TaskCompleteDialog from '@/components/TaskCompleteDialog.vue'
import TaskDetailDialog from '@/components/TaskDetailDialog.vue'

const router = useRouter()
const taskStore = useTaskStore()

// ─── State ────────────────────────────────────────────────────────────────────
const currentDate = ref(dayjs())
const selectedDate = ref(dayjs())
const viewMode = ref<'month' | 'week' | 'day'>('month')

// Sidebar state
const sidebarMode = ref<'list' | 'detail'>('list')
const selectedTaskId = ref<number | null>(null)
const showCompleteDialog = ref(false)

// Task detail dialog state (replaces the inline sidebar detail view)
const showDetailDialog = ref(false)
const detailDialogTask = ref<Task | null>(null)
const detailDialogLoading = ref(false)
const detailDialogTaskId = ref<number | null>(null)

// Popup menu state
const showPopup = ref(false)
const popupX = ref(0)
const popupY = ref(0)
const popupType = ref<'date' | 'status' | 'more' | 'card-status' | 'card-menu'>('date')
const popupDate = ref(dayjs())
const popupStatusType = ref<'pending' | 'in_progress' | 'completed'>('pending')
const popupTaskId = ref<number | null>(null)

// ─── Computed ─────────────────────────────────────────────────────────────────
const currentYear = computed(() => currentDate.value.year())
const currentMonth = computed(() => currentDate.value.month())

const calendarDates = computed(() =>
  getMonthCalendarDates(currentYear.value, currentMonth.value).map(d => dayjs(d))
)

const monthTitle = computed(() => `${currentDate.value.year()}年 ${currentDate.value.month() + 1}月`)

const weekDates = computed(() => {
  const startOfWeek = currentDate.value.startOf('week')
  return Array.from({ length: 7 }, (_, i) => startOfWeek.add(i, 'day'))
})

const weekTitle = computed(() => {
  const start = weekDates.value[0]
  const end = weekDates.value[6]
  if (start.month() === end.month()) {
    return `${start.year()}年${start.month() + 1}月${start.date()}日 - ${end.date()}日`
  }
  return `${start.year()}年${start.month() + 1}月${start.date()}日 - ${end.month() + 1}月${end.date()}日`
})

const dayTitle = computed(() => {
  const d = selectedDate.value
  const weekdays = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
  return `${d.year()}年${d.month() + 1}月${d.date()}日 ${weekdays[d.day()]}`
})

const displayTitle = computed(() => {
  if (viewMode.value === 'month') return monthTitle.value
  if (viewMode.value === 'week') return weekTitle.value
  return dayTitle.value
})

const hourSlots = computed(() => Array.from({ length: 24 }, (_, i) => i))

function getTasksForHour(hour: number): Task[] {
  const dateStr = selectedDate.value.format('YYYY-MM-DD')
  return taskStore.tasks.filter(t => {
    if (!t.due_date) return false
    const d = dayjs(t.due_date)
    return d.format('YYYY-MM-DD') === dateStr && d.hour() === hour
  })
}

const dayHeaders = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

const selectedDateTasks = computed(() => getTasksForDate(selectedDate.value))

const detailTask = computed(() => taskStore.currentTask)
const detailLoading = computed(() => taskStore.loading)

const statusConfig: Record<number, { bg: string; text: string; icon: string; label: string }> = {
  0: { bg: 'bg-surface-container-high', text: 'text-on-surface-variant', icon: 'radio_button_unchecked', label: '待办' },
  1: { bg: 'bg-primary/10', text: 'text-primary', icon: 'pending', label: '进行中' },
  2: { bg: 'bg-secondary-container/30', text: 'text-secondary', icon: 'check_circle', label: '已完成' },
}

const priorityConfig: Record<number, { icon: string; label: string; color: string }> = {
  0: { icon: 'low_priority', label: '低', color: 'text-on-surface-variant' },
  1: { icon: 'priority', label: '中', color: 'text-tertiary' },
  2: { icon: 'priority_high', label: '高', color: 'text-error' },
}

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

const overdueCount = computed(() => {
  return selectedDateTasks.value.filter(t => t.is_overdue && t.status !== 2).length
})

// ─── Methods ──────────────────────────────────────────────────────────────────
function prevPeriod() {
  if (viewMode.value === 'month') {
    currentDate.value = currentDate.value.subtract(1, 'month')
  } else if (viewMode.value === 'week') {
    currentDate.value = currentDate.value.subtract(1, 'week')
  } else {
    selectedDate.value = selectedDate.value.subtract(1, 'day')
    currentDate.value = selectedDate.value
  }
}

function nextPeriod() {
  if (viewMode.value === 'month') {
    currentDate.value = currentDate.value.add(1, 'month')
  } else if (viewMode.value === 'week') {
    currentDate.value = currentDate.value.add(1, 'week')
  } else {
    selectedDate.value = selectedDate.value.add(1, 'day')
    currentDate.value = selectedDate.value
  }
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
  if (task.priority === 2) return 'bg-error/20 text-error border border-error/30'
  if (task.priority === 1) return 'bg-secondary/20 text-secondary border border-secondary/30'
  if (index % 3 === 0) return 'bg-primary/20 text-primary border border-primary/30'
  if (index % 3 === 1) return 'bg-secondary/20 text-secondary border border-secondary/30'
  return 'bg-tertiary/20 text-tertiary border border-tertiary/30'
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

function getStatusCountsForDate(date: dayjs.Dayjs): { pending: number; in_progress: number; completed: number } {
  const tasks = getTasksForDate(date)
  return {
    pending: tasks.filter(t => t.status === 0).length,
    in_progress: tasks.filter(t => t.status === 1).length,
    completed: tasks.filter(t => t.status === 2).length,
  }
}

function getStatusIcon(task: Task): string {
  if (task.status === 2) return 'check_circle'
  if (task.status === 1) return 'pending'
  return 'radio_button_unchecked'
}

function getStatusColorClass(task: Task): string {
  if (task.status === 2) return 'text-secondary'
  if (task.status === 1) return 'text-primary'
  return 'text-on-surface-variant'
}

// ─── Task Detail Dialog Handlers ───────────────────────────────────────────────
async function openTaskDetail(task: Task) {
  detailDialogTaskId.value = task.id
  detailDialogTask.value = null
  detailDialogLoading.value = true
  showDetailDialog.value = true
  try {
    detailDialogTask.value = await taskStore.fetchTaskDetail(task.id)
  } catch {
    ElMessage.error('加载任务详情失败')
    showDetailDialog.value = false
  } finally {
    detailDialogLoading.value = false
  }
}

function handleDialogEdit(task: Task) {
  router.push(`/tasks/${task.id}`)
}

async function handleDialogDelete(task: Task) {
  try {
    await taskStore.removeTask(task.id)
    showDetailDialog.value = false
    ElMessage.success('任务已删除')
    await loadTasks()
  } catch {
    ElMessage.error('删除失败')
  }
}

async function handleDialogUncomplete(task: Task) {
  try {
    await taskStore.markUncomplete(task.id)
    showDetailDialog.value = false
    ElMessage.success('已恢复为未完成')
    await loadTasks()
  } catch {
    ElMessage.error('操作失败')
  }
}

function handleDialogComplete(task: Task) {
  selectedTaskId.value = task.id
  showCompleteDialog.value = true
}

async function handleCompleteSubmit(data: {
  completion_rate: number
  completion_comment: string
  needs_follow_up: boolean
  follow_up_reason?: string
  follow_up_remind_at?: string
  follow_up_notify_channels?: string
}) {
  if (!selectedTaskId.value) return
  try {
    await taskStore.markComplete(selectedTaskId.value, data)
    showCompleteDialog.value = false
    showDetailDialog.value = false
    await loadTasks()
    if (data.needs_follow_up) {
      ElMessage.success('已标记为跟进任务')
    } else {
      ElMessage.success('任务已完成')
    }
  } catch {
    ElMessage.error('操作失败')
  }
}

function formatDetailDate(date?: string): string {
  if (!date) return '未设置'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

async function loadTasks() {
  let start: string
  let end: string

  if (viewMode.value === 'week') {
    const dates = weekDates.value
    if (dates.length === 0) return
    start = dates[0].format('YYYY-MM-DD')
    end = dates[dates.length - 1].format('YYYY-MM-DD')
  } else if (viewMode.value === 'day') {
    start = selectedDate.value.format('YYYY-MM-DD')
    end = start
  } else {
    const dates = calendarDates.value
    if (dates.length === 0) return
    start = dates[0].format('YYYY-MM-DD')
    end = dates[dates.length - 1].format('YYYY-MM-DD')
  }

  await taskStore.fetchTasks({ due_date_from: start, due_date_to: end } as any)
}

// ─── Popup Menu Methods ────────────────────────────────────────────────────────
function openDatePopup(event: MouseEvent, date: dayjs.Dayjs) {
  const tasks = getTasksForDate(date)
  if (tasks.length === 0) return
  event.stopPropagation()
  popupDate.value = date
  popupType.value = 'date'
  popupX.value = event.clientX
  popupY.value = event.clientY
  showPopup.value = true
}

function openStatusPopup(event: MouseEvent, date: dayjs.Dayjs, statusType: 'pending' | 'in_progress' | 'completed') {
  event.stopPropagation()
  popupDate.value = date
  popupType.value = 'status'
  popupStatusType.value = statusType
  popupX.value = event.clientX
  popupY.value = event.clientY
  showPopup.value = true
}

function openMorePopup(event: MouseEvent, date: dayjs.Dayjs) {
  event.stopPropagation()
  selectDate(date)
  popupDate.value = date
  popupType.value = 'more'
  popupX.value = event.clientX
  popupY.value = event.clientY
  showPopup.value = true
}

function closePopup() {
  showPopup.value = false
}

function handlePopupTaskClick(task: Task) {
  closePopup()
  selectDate(popupDate.value)
  openTaskDetail(task)
}

async function handleDateAction(action: string) {
  const date = popupDate.value
  const tasks = getTasksForDate(date)
  closePopup()

  if (action === 'delete') {
    if (tasks.length === 0) return
    try {
      await ElMessageBox.confirm(`确定要删除该日期的 ${tasks.length} 个任务吗？`, '批量删除', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      })
      await batchDeleteTasks(tasks)
    } catch { /* cancelled */ }
  } else if (action === 'edit') {
    if (tasks.length > 0) {
      selectDate(date)
      openTaskDetail(tasks[0])
    }
  } else if (action === 'complete') {
    await batchCompleteTasks(tasks)
  }
}

async function handleStatusAction(action: string) {
  const date = popupDate.value
  const statusMap: Record<string, number> = { pending: 0, in_progress: 1, completed: 2 }
  const targetStatus = statusMap[popupStatusType.value]
  const tasks = getTasksForDate(date).filter(t => t.status === targetStatus)
  closePopup()

  if (action === 'restore') {
    for (const task of tasks) {
      try { await taskStore.markUncomplete(task.id) } catch { /* skip */ }
    }
    ElMessage.success(`已恢复 ${tasks.length} 个任务`)
    await loadTasks()
  } else if (action === 'delete') {
    if (tasks.length === 0) return
    try {
      await ElMessageBox.confirm(`确定要删除这 ${tasks.length} 个任务吗？`, '批量删除', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      })
      await batchDeleteTasks(tasks)
    } catch { /* cancelled */ }
  } else if (action === 'pending') {
    for (const task of tasks) {
      if (task.status === 2) {
        try { await taskStore.markUncomplete(task.id) } catch { /* skip */ }
      }
    }
    ElMessage.success('已设为待办')
    await loadTasks()
  } else if (action === 'complete') {
    await batchCompleteTasks(tasks)
  }
}

async function batchDeleteTasks(tasks: Task[]) {
  let count = 0
  for (const task of tasks) {
    try {
      await taskStore.removeTask(task.id)
      count++
    } catch { /* skip */ }
  }
  ElMessage.success(`已删除 ${count} 个任务`)
  await loadTasks()
}

async function batchCompleteTasks(tasks: Task[]) {
  const incomplete = tasks.filter(t => t.status !== 2)
  if (incomplete.length === 0) {
    ElMessage.info('没有可完成的任务')
    return
  }
  for (const task of incomplete) {
    try {
      await taskStore.markComplete(task.id, {
        completion_rate: 100,
        completion_comment: '批量完成',
        needs_follow_up: false,
      })
    } catch { /* skip */ }
  }
  ElMessage.success(`已完成 ${incomplete.length} 个任务`)
  await loadTasks()
}

function handleClickOutside() {
  if (showPopup.value) {
    showPopup.value = false
  }
}

function handleEscKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && showPopup.value) {
    showPopup.value = false
  }
}

// ─── Card Popup Methods ────────────────────────────────────────────────────────
function openCardStatusPopup(event: MouseEvent, task: Task) {
  event.stopPropagation()
  popupTaskId.value = task.id
  popupType.value = 'card-status'
  popupX.value = event.clientX
  popupY.value = event.clientY
  showPopup.value = true
}

function openCardMenuPopup(event: MouseEvent, task: Task) {
  event.stopPropagation()
  popupTaskId.value = task.id
  popupType.value = 'card-menu'
  popupX.value = event.clientX
  popupY.value = event.clientY
  showPopup.value = true
}

async function handleCardStatusAction(action: string) {
  const taskId = popupTaskId.value
  closePopup()
  if (!taskId) return

  if (action === 'delete') {
    try {
      await ElMessageBox.confirm('确定要删除这个任务吗？', '删除确认', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      })
      await taskStore.removeTask(taskId)
      ElMessage.success('任务已删除')
      await loadTasks()
    } catch { /* cancelled */ }
  } else if (action === 'edit') {
    router.push(`/tasks/${taskId}`)
  } else if (action === 'complete') {
    const task = taskStore.tasks.find(t => t.id === taskId)
    if (task && task.status === 2) {
      ElMessage.info('任务已完成')
      return
    }
    selectedTaskId.value = taskId
    const fetched = await taskStore.fetchTaskDetail(taskId)
    detailDialogTask.value = fetched || null
    showCompleteDialog.value = true
  }
}

async function handleCardMenuAction(action: string) {
  const taskId = popupTaskId.value
  closePopup()
  if (!taskId) return

  if (action === 'restore') {
    try {
      await taskStore.markUncomplete(taskId)
      ElMessage.success('已恢复为未完成')
      await loadTasks()
    } catch {
      ElMessage.error('操作失败')
    }
  } else if (action === 'delete') {
    try {
      await ElMessageBox.confirm('确定要删除这个任务吗？', '删除确认', {
        confirmButtonText: '删除',
        cancelButtonText: '取消',
        type: 'warning',
        confirmButtonClass: 'el-button--danger',
      })
      await taskStore.removeTask(taskId)
      ElMessage.success('任务已删除')
      await loadTasks()
    } catch { /* cancelled */ }
  } else if (action === 'pending') {
    try {
      await taskStore.markUncomplete(taskId)
      ElMessage.success('已设为继续待办')
      await loadTasks()
    } catch {
      ElMessage.error('操作失败')
    }
  }
}

// ─── Watchers ─────────────────────────────────────────────────────────────────
watch(currentDate, () => { loadTasks() })
watch(viewMode, () => { loadTasks() })
watch(selectedDate, () => {
  if (viewMode.value === 'day') {
    loadTasks()
  }
})

// ─── Lifecycle ────────────────────────────────────────────────────────────────
onMounted(() => {
  loadTasks()
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleEscKey)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleEscKey)
})
</script>

<style scoped>
.task-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
}
.glass-panel {
  background: rgba(23, 31, 51, 0.7);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(173, 198, 255, 0.1);
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
.glow-primary {
  box-shadow: 0 0 15px rgba(173, 198, 255, 0.3);
}
.glow-secondary {
  box-shadow: 0 0 15px rgba(78, 222, 163, 0.3);
}
.tech-border {
  border-color: rgba(66, 71, 84, 0.5);
}
.popup-enter {
  animation: popupFadeIn 0.15s ease-out;
}
@keyframes popupFadeIn {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.popup-more-list::-webkit-scrollbar {
  display: none;
}
.popup-more-list {
  -ms-overflow-style: none;
  scrollbar-width: none;
}
</style>

<template>
  <div class="flex flex-1 overflow-hidden">
    <!-- Calendar Section -->
    <div class="flex-grow flex flex-col p-lg">
      <!-- Calendar Header -->
      <div class="flex items-center justify-between mb-lg">
        <div class="flex items-center gap-md">
          <h1 class="font-display text-display-lg text-primary">{{ displayTitle }}</h1>
          <div class="flex gap-xs ml-md">
            <button class="p-2 hover:bg-surface-variant/30 rounded-full transition-colors" @click="prevPeriod">
              <span class="material-symbols-outlined text-primary">chevron_left</span>
            </button>
            <button class="p-2 hover:bg-surface-variant/30 rounded-full transition-colors" @click="nextPeriod">
              <span class="material-symbols-outlined text-primary">chevron_right</span>
            </button>
          </div>
          <button class="px-md py-1.5 border border-primary/40 rounded-full text-label-sm text-primary hover:bg-primary/10 transition-colors ml-sm" @click="goToday">今天</button>
        </div>
        <div class="flex bg-surface-container p-1 rounded border border-outline-variant/30">
          <button
            v-for="mode in (['month', 'week', 'day'] as const)"
            :key="mode"
            :class="[
              'px-lg py-1.5 text-label-sm font-label rounded-sm transition-colors',
              viewMode === mode
                ? 'bg-primary text-on-primary shadow-lg font-bold'
                : 'text-on-surface-variant hover:text-on-surface font-medium'
            ]"
            @click="viewMode = mode"
          >
            {{ mode === 'month' ? '月' : mode === 'week' ? '周' : '日' }}
          </button>
        </div>
      </div>

      <!-- Calendar Content -->
      <div class="flex-grow bg-surface-container-lowest border tech-border shadow-2xl overflow-hidden flex flex-col">

        <!-- ========== MONTH VIEW ========== -->
        <template v-if="viewMode === 'month'">
          <!-- Day Headers -->
          <div class="grid grid-cols-7 border-b tech-border bg-surface-container/30 shrink-0">
            <div
              v-for="(header, hIdx) in dayHeaders"
              :key="header"
              class="py-sm text-center text-label-sm text-primary/70"
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
                'border-r border-b tech-border p-sm h-full flex flex-col transition-colors',
                !isCurrentMonth(date)
                  ? 'bg-surface-container-lowest opacity-20'
                  : 'hover:bg-surface-variant/30 cursor-pointer group',
                isToday(date) && 'bg-primary/10 relative overflow-hidden'
              ]"
              @click="isCurrentMonth(date) && selectDate(date)"
            >
              <!-- Today glow border overlay -->
              <div v-if="isToday(date)" class="absolute inset-0 border-2 border-primary/30 pointer-events-none glow-primary"></div>

              <!-- Day number row -->
              <div class="flex justify-between items-center relative z-10">
                <span
                  :class="[
                    'text-label-sm',
                    isToday(date) && 'bg-primary text-on-primary w-6 h-6 flex items-center justify-center rounded-sm font-bold glow-primary',
                    isCurrentMonth(date) && getTasksForDate(date).length > 0 && 'cursor-pointer hover:bg-surface-variant/50 px-1 rounded transition-colors'
                  ]"
                  @click="isCurrentMonth(date) && getTasksForDate(date).length > 0 && openDatePopup($event, date)"
                >{{ date.date() }}</span>
              </div>

              <!-- Event labels (clickable) -->
              <div class="mt-xs space-y-1 overflow-hidden relative z-10">
                <div
                  v-for="(task, tIdx) in getTasksForDate(date).slice(0, 2)"
                  :key="task.id"
                  :class="[
                    'text-[10px] px-1.5 py-0.5 rounded truncate font-bold cursor-pointer transition-all',
                    'hover:opacity-80 hover:shadow-sm active:scale-[0.97]',
                    getEventColorClass(task, tIdx),
                    task.is_overdue && task.status !== 2 && 'border-l-2 border-error'
                  ]"
                  :title="task.title"
                  @click.stop="selectDate(date); openTaskDetail(task)"
                >
                  <span v-if="task.is_overdue && task.status !== 2" class="material-symbols-outlined !text-[10px] text-error align-middle mr-0.5">warning</span>{{ task.title }}
                </div>
                <div
                  v-if="getTasksForDate(date).length > 2"
                  class="text-[10px] text-primary font-label px-1.5 py-0.5 cursor-pointer hover:bg-primary/10 rounded inline-flex items-center gap-0.5 transition-colors"
                  @click.stop="openMorePopup($event, date)"
                >
                  <span class="material-symbols-outlined !text-[10px]">expand_more</span>
                  +{{ getTasksForDate(date).length - 2 }} 更多
                </div>
              </div>

              <!-- Status Count Badges -->
              <div
                v-if="isCurrentMonth(date) && (getStatusCountsForDate(date).pending > 0 || getStatusCountsForDate(date).in_progress > 0 || getStatusCountsForDate(date).completed > 0)"
                class="mt-auto pt-1 flex items-center gap-1 flex-wrap relative z-10"
              >
                <span
                  v-if="getStatusCountsForDate(date).pending > 0"
                  class="inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded bg-surface-variant/50 text-on-surface-variant border border-outline-variant/30 cursor-pointer hover:bg-surface-variant transition-colors"
                  @click.stop="openStatusPopup($event, date, 'pending')"
                >
                  <span class="material-symbols-outlined !text-[10px]">radio_button_unchecked</span>
                  {{ getStatusCountsForDate(date).pending }}
                </span>
                <span
                  v-if="getStatusCountsForDate(date).in_progress > 0"
                  class="inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded bg-primary/10 text-primary border border-primary/30 cursor-pointer hover:bg-primary/20 transition-colors"
                  @click.stop="openStatusPopup($event, date, 'in_progress')"
                >
                  <span class="material-symbols-outlined !text-[10px]">pending</span>
                  {{ getStatusCountsForDate(date).in_progress }}
                </span>
                <span
                  v-if="getStatusCountsForDate(date).completed > 0"
                  class="inline-flex items-center gap-0.5 text-[9px] font-medium px-1 py-0.5 rounded bg-secondary/10 text-secondary border border-secondary/30 cursor-pointer hover:bg-secondary/20 transition-colors"
                  @click.stop="openStatusPopup($event, date, 'completed')"
                >
                  <span class="material-symbols-outlined !text-[10px]">check_circle</span>
                  {{ getStatusCountsForDate(date).completed }}
                </span>
              </div>
            </div>
          </div>
        </template>

        <!-- ========== WEEK VIEW ========== -->
        <template v-else-if="viewMode === 'week'">
          <!-- Day Headers -->
          <div class="grid grid-cols-7 border-b tech-border bg-surface-container/30 shrink-0">
            <div
              v-for="(header, hIdx) in dayHeaders"
              :key="header"
              class="py-sm text-center text-label-sm text-primary/70"
            >
              <div>{{ header }}</div>
              <div
                :class="[
                  'text-lg font-bold mt-0.5',
                  weekDates[hIdx]?.isSame(dayjs(), 'day') ? 'bg-primary text-on-primary w-7 h-7 rounded-full flex items-center justify-center mx-auto' : 'text-on-surface'
                ]"
              >{{ weekDates[hIdx]?.date() }}</div>
            </div>
          </div>

          <!-- Week Grid: 7 columns, each showing all tasks for that day -->
          <div class="grid grid-cols-7 flex-grow" style="grid-template-rows: 1fr;">
            <div
              v-for="(date, index) in weekDates"
              :key="index"
              :class="[
                'border-r tech-border p-sm h-full flex flex-col overflow-y-auto transition-colors',
                date.isSame(dayjs(), 'day') ? 'bg-primary/5' : 'hover:bg-surface-variant/20 cursor-pointer',
              ]"
              @click="selectDate(date)"
            >
              <div class="space-y-1.5 flex-grow">
                <div
                  v-for="(task, tIdx) in getTasksForDate(date)"
                  :key="task.id"
                  :class="[
                    'text-[11px] px-2 py-1 rounded-md truncate font-bold cursor-pointer transition-all',
                    'hover:opacity-80 hover:shadow-sm active:scale-[0.97]',
                    getEventColorClass(task, tIdx),
                    task.is_overdue && task.status !== 2 && 'border-l-2 border-error'
                  ]"
                  :title="task.title"
                  @click.stop="selectDate(date); openTaskDetail(task)"
                >
                  <div class="flex items-center gap-1">
                    <span
                      class="material-symbols-outlined !text-[12px] shrink-0"
                      :class="getStatusColorClass(task)"
                    >{{ getStatusIcon(task) }}</span>
                    <span class="truncate">{{ task.title }}</span>
                  </div>
                  <div v-if="task.due_date" class="text-[10px] opacity-70 mt-0.5 ml-5">
                    {{ dayjs(task.due_date).format('HH:mm') }}
                  </div>
                </div>

                <!-- Empty state for days with no tasks -->
                <div v-if="getTasksForDate(date).length === 0" class="flex flex-col items-center justify-center py-lg text-on-surface-variant/30">
                  <span class="material-symbols-outlined text-xl">event_available</span>
                </div>
              </div>
            </div>
          </div>
        </template>

        <!-- ========== DAY VIEW ========== -->
        <template v-else-if="viewMode === 'day'">
          <!-- Hourly Timeline -->
          <div class="flex-grow overflow-y-auto">
            <div
              v-for="hour in hourSlots"
              :key="hour"
              :class="[
                'flex border-b tech-border min-h-[60px]',
                hour === dayjs().hour() && selectedDate.isSame(dayjs(), 'day') ? 'bg-primary/5' : ''
              ]"
            >
              <!-- Time label -->
              <div class="w-16 shrink-0 py-sm px-sm text-right text-label-sm text-on-surface-variant/60 border-r tech-border">
                {{ String(hour).padStart(2, '0') }}:00
              </div>

              <!-- Task slots -->
              <div class="flex-grow p-xs space-y-1">
                <div
                  v-for="(task, tIdx) in getTasksForHour(hour)"
                  :key="task.id"
                  :class="[
                    'text-[12px] px-2 py-1 rounded-md cursor-pointer transition-all font-medium',
                    'hover:opacity-80 hover:shadow-sm active:scale-[0.98]',
                    getEventColorClass(task, tIdx)
                  ]"
                  @click="openTaskDetail(task)"
                >
                  <div class="flex items-center gap-1.5">
                    <span
                      class="material-symbols-outlined !text-[14px] shrink-0"
                      :class="getStatusColorClass(task)"
                    >{{ getStatusIcon(task) }}</span>
                    <span class="truncate">{{ task.title }}</span>
                    <span class="text-[10px] opacity-60 shrink-0">{{ dayjs(task.due_date).format('HH:mm') }}</span>
                  </div>
                </div>
              </div>
            </div>

            <!-- All-day / no-time tasks section -->
            <div v-if="getTasksForDate(selectedDate).some(t => !t.due_date)" class="border-t-2 tech-border p-md">
              <div class="text-label-sm text-on-surface-variant mb-sm font-label">全天任务</div>
              <div class="space-y-1">
                <div
                  v-for="(task, tIdx) in getTasksForDate(selectedDate).filter(t => !t.due_date)"
                  :key="task.id"
                  :class="[
                    'text-[12px] px-2 py-1 rounded-md cursor-pointer transition-all font-medium',
                    getEventColorClass(task, tIdx)
                  ]"
                  @click="openTaskDetail(task)"
                >
                  <div class="flex items-center gap-1.5">
                    <span
                      class="material-symbols-outlined !text-[14px]"
                      :class="getStatusColorClass(task)"
                    >{{ getStatusIcon(task) }}</span>
                    <span>{{ task.title }}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </template>
      </div>
    </div>

    <!-- Sidebar Side Panel -->
    <aside class="w-80 border-l tech-border bg-surface-container-lowest hidden lg:flex flex-col shrink-0 overflow-hidden">

      <!-- ========== LIST MODE ========== -->
      <template v-if="sidebarMode === 'list'">
        <!-- Date Heading -->
        <div class="p-lg border-b tech-border bg-surface-container/20 shrink-0">
          <h3 class="font-headline text-headline-sm text-primary font-bold mb-xs">{{ selectedDateLabel }}</h3>
          <div class="flex items-center gap-sm">
            <p class="text-body-sm text-on-surface-variant">已安排 {{ selectedDateTasks.length }} 项任务</p>
            <span
              v-if="overdueCount > 0"
              class="inline-flex items-center gap-0.5 text-[11px] font-medium px-1.5 py-0.5 rounded-full bg-error/10 text-error"
            >
              <span class="material-symbols-outlined !text-[12px]">warning</span>
              {{ overdueCount }} 项逾期
            </span>
          </div>

          <!-- Efficiency Score -->
          <div class="mt-lg flex flex-col gap-sm">
            <div class="flex items-center justify-between">
              <span class="text-label-sm font-label text-on-surface-variant uppercase tracking-wider">效率指标</span>
              <span class="text-label-sm font-label text-secondary glow-secondary">{{ efficiencyScore }}%</span>
            </div>
            <div class="h-1.5 bg-surface-variant/30 rounded-full overflow-hidden">
              <div class="h-full bg-secondary glow-secondary transition-all duration-1000" :style="{ width: `${efficiencyScore}%` }"></div>
            </div>
          </div>
        </div>

        <!-- Task List -->
        <div class="flex-grow overflow-y-auto p-lg space-y-md scrollbar-hide">
          <!-- Empty state -->
          <div v-if="selectedDateTasks.length === 0" class="flex flex-col items-center justify-center py-xl text-on-surface-variant">
            <span class="material-symbols-outlined text-5xl mb-sm text-primary/20">event_available</span>
            <span class="text-body-sm">暂无日程安排</span>
            <span class="text-body-sm text-on-surface-variant/40 mt-0.5">享受这轻松的一天</span>
          </div>

          <!-- Task Cards (clickable) -->
          <div
            v-for="task in selectedDateTasks"
            :key="task.id"
            :class="[
              'group cursor-pointer bg-surface-container border p-md rounded shadow-sm hover:shadow-md transition-all',
              task.is_overdue && task.status !== 2
                ? 'border-error/30 hover:border-error/60 hover:bg-error/5'
                : task.priority === 2
                  ? 'border-primary/20 hover:border-primary/60 hover:bg-primary/5'
                  : task.priority === 1
                    ? 'border-secondary/20 hover:border-secondary/60 hover:bg-secondary/5'
                    : 'border-tertiary/20 hover:border-tertiary/60 hover:bg-tertiary/5'
            ]"
            @click="openTaskDetail(task)"
          >
            <div class="flex items-start gap-md">
              <div :class="['w-1 h-10 mt-1 shrink-0', task.is_overdue && task.status !== 2 ? 'bg-error glow-secondary' : getTaskBarColor(task), task.priority === 0 && 'glow-primary']"></div>
              <div class="flex-grow min-w-0">
                <div class="flex items-center gap-xs">
                  <button
                    class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center hover:ring-2 hover:ring-primary/30 transition-all"
                    @click.stop="openCardStatusPopup($event, task)"
                  >
                    <span
                      class="material-symbols-outlined !text-[16px]"
                      :class="getStatusColorClass(task)"
                    >{{ getStatusIcon(task) }}</span>
                  </button>
                  <p class="font-bold text-label-md text-on-surface truncate flex-1" :class="{ 'line-through opacity-60': task.status === 2 }">{{ task.title }}</p>
                  <button
                    class="shrink-0 p-1 rounded-full hover:bg-surface-variant/50 transition-colors opacity-0 group-hover:opacity-100"
                    @click.stop="openCardMenuPopup($event, task)"
                  >
                    <span class="material-symbols-outlined text-on-surface-variant !text-[16px]">more_vert</span>
                  </button>
                </div>
                <div class="flex items-center gap-xs text-on-surface-variant/70 text-[12px] mt-1 ml-5 font-medium">
                  <span class="material-symbols-outlined text-[14px]">{{ getTaskIcon(task) }}</span>
                  {{ task.due_date ? getTaskTimeLabel(task) : '全天' }}
                  <span v-if="task.is_overdue && task.status !== 2" class="inline-flex items-center gap-0.5 text-error text-[11px] font-medium ml-1">
                    <span class="material-symbols-outlined !text-[12px]">warning</span>已逾期
                  </span>
                </div>
                <!-- Description preview -->
                <p v-if="task.description" class="text-[11px] text-on-surface-variant/50 mt-1 ml-5 truncate">{{ task.description }}</p>
              </div>
            </div>
          </div>
        </div>
      </template>

      <!-- Detail mode moved to TaskDetailDialog -->

      <!-- Mini Weather / Motivation (always shown) -->
      <div class="p-lg mt-auto shrink-0">
        <div class="glass-panel p-md rounded border-primary/20 flex items-center gap-md relative overflow-hidden">
          <div class="absolute top-0 right-0 p-1 bg-primary/20 text-[10px] text-primary font-bold">INFO</div>
          <div class="w-10 h-10 rounded bg-primary/20 flex items-center justify-center text-primary glow-primary shrink-0">
            <span class="material-symbols-outlined" style="font-variation-settings: 'FILL' 1;">wb_sunny</span>
          </div>
          <div>
            <p class="text-label-sm font-label text-primary uppercase">今日展望</p>
            <p class="text-sm font-medium text-on-surface">晴空万里，别忘了补水！</p>
          </div>
        </div>
      </div>
    </aside>

    <!-- Task Detail Dialog -->
    <TaskDetailDialog
      v-model="showDetailDialog"
      :task="detailDialogTask"
      :loading="detailDialogLoading"
      @edit="handleDialogEdit"
      @complete="handleDialogComplete"
      @uncomplete="handleDialogUncomplete"
      @delete="handleDialogDelete"
    />

    <!-- Task Complete Dialog -->
    <TaskCompleteDialog
      v-model="showCompleteDialog"
      :task-title="detailDialogTask?.title || ''"
      @submit="handleCompleteSubmit"
    />

    <!-- Popup Menus -->
    <Teleport to="body">
      <!-- Date Number Popup -->
      <div
        v-if="showPopup && popupType === 'date'"
        class="fixed z-[9999] popup-enter"
        :style="{ left: popupX + 'px', top: popupY + 'px' }"
        @click.stop
      >
        <div class="bg-surface-container border border-outline-variant/50 rounded-lg shadow-2xl py-1.5 min-w-[160px] overflow-hidden">
          <div class="px-3 py-1.5 text-[10px] text-primary/60 font-label uppercase tracking-wider border-b border-outline-variant/20 mb-1">
            {{ popupDate.month() + 1 }}月{{ popupDate.date() }}日 · {{ getTasksForDate(popupDate).length }} 项任务
          </div>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors text-left"
            @click="handleDateAction('delete')"
          >
            <span class="material-symbols-outlined text-[18px]">delete</span>
            <span class="font-medium">删除全部</span>
          </button>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-on-surface hover:bg-surface-variant/50 transition-colors text-left"
            @click="handleDateAction('edit')"
          >
            <span class="material-symbols-outlined text-[18px]">edit</span>
            <span class="font-medium">查看/修改</span>
          </button>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-secondary hover:bg-secondary/10 transition-colors text-left"
            @click="handleDateAction('complete')"
          >
            <span class="material-symbols-outlined text-[18px]">check_circle</span>
            <span class="font-medium">全部完成</span>
          </button>
        </div>
      </div>

      <!-- Status Badge Popup -->
      <div
        v-if="showPopup && popupType === 'status'"
        class="fixed z-[9999] popup-enter"
        :style="{ left: popupX + 'px', top: popupY + 'px' }"
        @click.stop
      >
        <div class="bg-surface-container border border-outline-variant/50 rounded-lg shadow-2xl py-1.5 min-w-[170px] overflow-hidden">
          <div class="px-3 py-1.5 text-[10px] font-label uppercase tracking-wider border-b border-outline-variant/20 mb-1"
            :class="{
              'text-on-surface-variant/60': popupStatusType === 'pending',
              'text-primary/60': popupStatusType === 'in_progress',
              'text-secondary/60': popupStatusType === 'completed'
            }"
          >
            {{ popupStatusType === 'pending' ? '待办' : popupStatusType === 'in_progress' ? '进行中' : '已完成' }} · {{ getTasksForDate(popupDate).filter(t => t.status === (popupStatusType === 'pending' ? 0 : popupStatusType === 'in_progress' ? 1 : 2)).length }} 项
          </div>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-on-surface hover:bg-surface-variant/50 transition-colors text-left"
            @click="handleStatusAction('restore')"
          >
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant">undo</span>
            <span class="font-medium">恢复</span>
          </button>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors text-left"
            @click="handleStatusAction('delete')"
          >
            <span class="material-symbols-outlined text-[18px]">delete</span>
            <span class="font-medium">删除</span>
          </button>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-on-surface hover:bg-surface-variant/50 transition-colors text-left"
            @click="handleStatusAction('pending')"
          >
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant">radio_button_unchecked</span>
            <span class="font-medium">继续待办</span>
          </button>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-secondary hover:bg-secondary/10 transition-colors text-left"
            @click="handleStatusAction('complete')"
          >
            <span class="material-symbols-outlined text-[18px]">check_circle</span>
            <span class="font-medium">完成</span>
          </button>
        </div>
      </div>

      <!-- More Tasks Popup -->
      <div
        v-if="showPopup && popupType === 'more'"
        class="fixed z-[9999] popup-enter"
        :style="{ left: popupX + 'px', top: popupY + 'px' }"
        @click.stop
      >
        <div class="bg-surface-container border border-outline-variant/50 rounded-lg shadow-2xl min-w-[200px] max-w-[260px] overflow-hidden">
          <div class="px-3 py-2 text-[10px] text-primary/60 font-label uppercase tracking-wider border-b border-outline-variant/20 flex items-center justify-between">
            <span>{{ popupDate.month() + 1 }}月{{ popupDate.date() }}日 全部任务</span>
            <span class="bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">{{ getTasksForDate(popupDate).length }}</span>
          </div>
          <div class="max-h-[240px] overflow-y-auto popup-more-list py-1">
            <div
              v-for="(task, tIdx) in getTasksForDate(popupDate)"
              :key="task.id"
              class="flex items-center gap-2 px-3 py-2 hover:bg-surface-variant/50 cursor-pointer transition-colors border-b border-outline-variant/10 last:border-0"
              @click="handlePopupTaskClick(task)"
            >
              <span
                class="material-symbols-outlined text-[16px] shrink-0"
                :class="getStatusColorClass(task)"
              >{{ getStatusIcon(task) }}</span>
              <span
                :class="[
                  'text-[11px] px-1.5 py-0.5 rounded truncate font-bold flex-1',
                  getEventColorClass(task, tIdx)
                ]"
              >{{ task.title }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Card Status Icon Popup (delete/edit/complete) -->
      <div
        v-if="showPopup && popupType === 'card-status'"
        class="fixed z-[9999] popup-enter"
        :style="{ left: popupX + 'px', top: popupY + 'px' }"
        @click.stop
      >
        <div class="bg-surface-container border border-outline-variant/50 rounded-lg shadow-2xl py-1.5 min-w-[150px] overflow-hidden">
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors text-left"
            @click="handleCardStatusAction('delete')"
          >
            <span class="material-symbols-outlined text-[18px]">delete</span>
            <span class="font-medium">删除</span>
          </button>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-on-surface hover:bg-surface-variant/50 transition-colors text-left"
            @click="handleCardStatusAction('edit')"
          >
            <span class="material-symbols-outlined text-[18px]">edit</span>
            <span class="font-medium">修改</span>
          </button>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-secondary hover:bg-secondary/10 transition-colors text-left"
            @click="handleCardStatusAction('complete')"
          >
            <span class="material-symbols-outlined text-[18px]">check_circle</span>
            <span class="font-medium">完成</span>
          </button>
        </div>
      </div>

      <!-- Card Three-Dots Menu Popup (restore/delete/pending) -->
      <div
        v-if="showPopup && popupType === 'card-menu'"
        class="fixed z-[9999] popup-enter"
        :style="{ left: popupX + 'px', top: popupY + 'px' }"
        @click.stop
      >
        <div class="bg-surface-container border border-outline-variant/50 rounded-lg shadow-2xl py-1.5 min-w-[150px] overflow-hidden">
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-on-surface hover:bg-surface-variant/50 transition-colors text-left"
            @click="handleCardMenuAction('restore')"
          >
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant">undo</span>
            <span class="font-medium">恢复</span>
          </button>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-error hover:bg-error/10 transition-colors text-left"
            @click="handleCardMenuAction('delete')"
          >
            <span class="material-symbols-outlined text-[18px]">delete</span>
            <span class="font-medium">删除</span>
          </button>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-on-surface hover:bg-surface-variant/50 transition-colors text-left"
            @click="handleCardMenuAction('pending')"
          >
            <span class="material-symbols-outlined text-[18px] text-on-surface-variant">radio_button_unchecked</span>
            <span class="font-medium">继续待办</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
