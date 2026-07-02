<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { ElMessage, ElMessageBox } from 'element-plus'
import TaskForm from '@/components/TaskForm.vue'
import TaskCompleteDialog from '@/components/TaskCompleteDialog.vue'
import dayjs from 'dayjs'

const route = useRoute()
const router = useRouter()
const taskStore = useTaskStore()

const showCompleteDialog = ref(false)
const isEditing = ref(false)

const isCreateMode = computed(() => {
  return route.name === 'TaskCreate' || route.meta.isCreate === true
})

const taskId = computed(() => {
  const id = route.params.id
  return id ? Number(id) : null
})

const task = computed(() => taskStore.currentTask)
const loading = computed(() => taskStore.loading)

const statusConfig: Record<number, { bg: string; text: string; icon: string }> = {
  0: { bg: 'bg-surface-container-high', text: 'text-on-surface-variant', icon: 'radio_button_unchecked' },
  1: { bg: 'bg-[#d8e2ff]/20', text: 'text-primary', icon: 'pending' },
  2: { bg: 'bg-secondary-container/30', text: 'text-secondary', icon: 'check_circle' },
}

const statusLabelMap: Record<number, string> = {
  0: '待办',
  1: '进行中',
  2: '已完成',
}

const priorityLabelMap: Record<number, string> = {
  0: '低',
  1: '中',
  2: '高',
}

const channelLabels: Record<string, string> = {
  web_popup: '网页弹窗',
  web_push: '网页弹窗',
  email: '邮件提醒',
  wechat: '微信提醒',
  wx: '微信提醒',
  sms: '短信提醒',
  alarm: '闹钟提醒',
  desktop: '闹钟提醒',
}

const channelIcons: Record<string, string> = {
  web_popup: 'notifications_active',
  web_push: 'notifications_active',
  email: 'mail',
  wechat: 'chat',
  wx: 'chat',
  sms: 'sms',
  alarm: 'alarm',
  desktop: 'alarm',
}

function formatChannels(channels: string): string {
  if (!channels) return ''
  return channels
    .split(',')
    .filter(Boolean)
    .map((ch) => channelLabels[ch] || ch)
    .join('、')
}

function getChannelList(channels: string): Array<{ key: string; icon: string; label: string }> {
  if (!channels) return []
  return channels
    .split(',')
    .filter(Boolean)
    .map((ch) => ({
      key: ch,
      icon: channelIcons[ch] || 'notifications',
      label: channelLabels[ch] || ch,
    }))
}

function formatReminderTime(remindAt: string): string {
  return dayjs(remindAt).format('MM-DD HH:mm')
}

const priorityIconMap: Record<number, string> = {
  0: 'low_priority',
  1: 'priority',
  2: 'priority_high',
}

const priorityBorderColor = computed(() => {
  if (!task.value) return 'border-l-primary'
  switch (task.value.priority) {
    case 2:
      return 'border-l-error'
    case 1:
      return 'border-l-tertiary'
    default:
      return 'border-l-primary'
  }
})

const currentStatusConfig = computed(() => {
  if (!task.value) return statusConfig[0]
  return statusConfig[task.value.status] ?? statusConfig[0]
})

const currentStatusLabel = computed(() => {
  if (!task.value) return '待办'
  return task.value.status_label ?? statusLabelMap[task.value.status] ?? '待办'
})

function handleBack() {
  router.push('/tasks')
}

function handleEdit() {
  isEditing.value = true
}

function handleCancelEdit() {
  isEditing.value = false
}

async function handleSaveEdit(data: Record<string, unknown>) {
  if (!taskId.value) return
  try {
    await taskStore.editTask(taskId.value, data)
    await taskStore.fetchTaskDetail(taskId.value)
    isEditing.value = false
    ElMessage.success('任务已更新')
  } catch {
    ElMessage.error('更新失败')
  }
}

async function handleCreateTask(data: Record<string, unknown>) {
  try {
    await taskStore.addTask(data)
    ElMessage.success('任务已创建')
    router.push('/tasks')
  } catch {
    ElMessage.error('创建失败')
  }
}

async function handleComplete(data: {
  completion_rate: number
  completion_comment: string
  needs_follow_up: boolean
  follow_up_reason?: string
  follow_up_remind_at?: string
  follow_up_notify_channels?: string
}) {
  if (!taskId.value) return
  try {
    await taskStore.markComplete(taskId.value, data)
    showCompleteDialog.value = false
    await taskStore.fetchTaskDetail(taskId.value)
    if (data.needs_follow_up) {
      ElMessage.success('已标记为跟进任务，将在指定时间提醒您继续跟进')
    } else {
      ElMessage.success('任务已完成')
    }
  } catch {
    ElMessage.error('操作失败')
  }
}

async function handleUncomplete() {
  if (!taskId.value) return
  try {
    await taskStore.markUncomplete(taskId.value)
    await taskStore.fetchTaskDetail(taskId.value)
    ElMessage.success('已恢复为未完成')
  } catch {
    ElMessage.error('操作失败')
  }
}

async function handleDelete() {
  if (!taskId.value) return
  try {
    await ElMessageBox.confirm('确定要删除这个任务吗？此操作不可撤销。', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
    await taskStore.removeTask(taskId.value)
    ElMessage.success('任务已删除')
    router.push('/tasks')
  } catch (err: unknown) {
    if (err !== 'cancel' && err !== 'close') {
      ElMessage.error('删除失败')
    }
  }
}

function formatDate(date?: string) {
  if (!date) return '未设置'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

const now = ref(Date.now())
let timerInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  if (taskId.value && !isCreateMode.value) {
    taskStore.fetchTaskDetail(taskId.value)
  }
  timerInterval = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  taskStore.clearCurrentTask()
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
})

function getCountdown(remindAt: string): string {
  // Force reactivity dependency on the timer tick
  const _tick = now.value
  if (!remindAt) return ''
  const target = dayjs(remindAt)
  const diffSeconds = target.diff(dayjs(), 'second')
  if (diffSeconds < 0) return '已到时'
  const hours = Math.floor(diffSeconds / 3600)
  const minutes = Math.floor((diffSeconds % 3600) / 60)
  const seconds = diffSeconds % 60
  if (hours > 99) {
    const days = Math.floor(hours / 24)
    const remainHours = hours % 24
    return `${days}天${String(remainHours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  }
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
}
</script>

<template>
  <div class="flex flex-col h-full bg-surface-container-low">
    <!-- Top App Bar -->
    <div class="h-16 bg-surface border-b border-surface-variant flex items-center px-lg flex-shrink-0 gap-md">
      <!-- Back Button -->
      <button
        class="rounded-full p-sm hover:bg-surface-container transition active:scale-95 flex items-center justify-center"
        @click="handleBack"
      >
        <span class="material-symbols-outlined text-on-surface-variant text-2xl">arrow_back</span>
      </button>

      <!-- Title -->
      <h2 class="text-headline-sm text-on-surface font-headline flex-1 m-0 truncate">
        {{ isCreateMode ? '新建任务' : (task?.title || '任务详情') }}
      </h2>

      <!-- Action Buttons (detail mode only, not editing) -->
      <div v-if="!isCreateMode && task && !isEditing" class="flex items-center gap-sm flex-shrink-0">
        <button
          class="rounded-full p-sm hover:bg-surface-container transition active:scale-95 flex items-center justify-center"
          title="编辑"
          @click="handleEdit"
        >
          <span class="material-symbols-outlined text-on-surface-variant text-2xl">edit</span>
        </button>
        <button
          v-if="task.status !== 2"
          class="rounded-full p-sm hover:bg-surface-container transition active:scale-95 flex items-center justify-center"
          title="标记完成"
          @click="showCompleteDialog = true"
        >
          <span class="material-symbols-outlined text-secondary text-2xl">check_circle</span>
        </button>
        <button
          class="rounded-full p-sm hover:bg-error-container transition active:scale-95 flex items-center justify-center"
          title="删除"
          @click="handleDelete"
        >
          <span class="material-symbols-outlined text-error text-2xl">delete</span>
        </button>
      </div>
    </div>

    <!-- Content -->
    <div class="flex-1 overflow-y-auto p-lg">
      <div class="max-w-3xl mx-auto">

        <!-- Loading -->
        <div
          v-if="loading && !isCreateMode"
          class="flex flex-col items-center justify-center py-xl gap-sm"
        >
          <span class="material-symbols-outlined text-5xl text-on-surface-variant animate-spin">
            progress_activity
          </span>
          <span class="text-body-sm text-on-surface-variant">加载中...</span>
        </div>

        <!-- Create Mode -->
        <div v-else-if="isCreateMode">
          <TaskForm @submit="handleCreateTask" @cancel="handleBack" />
        </div>

        <!-- Detail Mode -->
        <template v-else-if="task">

          <!-- Edit Mode -->
          <div v-if="isEditing">
            <TaskForm
              :task="task"
              @submit="handleSaveEdit"
              @cancel="handleCancelEdit"
            />
          </div>

          <!-- View Mode -->
          <div v-else>
            <!-- Main Task Card -->
            <div
              class="bg-surface-container-lowest rounded-xl p-xl shadow-card border border-surface-variant border-l-4"
              :class="priorityBorderColor"
            >
              <!-- Top Row: Status Badge + Created At -->
              <div class="flex items-start justify-between">
                <span
                  class="inline-flex items-center gap-xs px-md py-xs rounded-full font-label text-label-md"
                  :class="[currentStatusConfig.bg, currentStatusConfig.text]"
                >
                  <span class="material-symbols-outlined text-base">{{ currentStatusConfig.icon }}</span>
                  {{ currentStatusLabel }}
                </span>
                <div class="flex items-center gap-xs text-on-surface-variant">
                  <span class="material-symbols-outlined text-base">schedule</span>
                  <span class="text-label-sm font-label">{{ formatDate(task.created_at) }}</span>
                </div>
              </div>

              <!-- Title -->
              <h1
                class="text-headline-md text-on-surface font-headline mt-md m-0 leading-snug"
                :class="{ 'line-through opacity-60': task.status === 2 }"
              >
                {{ task.title }}
              </h1>

              <!-- Description -->
              <p
                class="text-body-md text-on-surface-variant mt-md m-0 whitespace-pre-wrap leading-relaxed"
              >
                {{ task.description || '暂无描述' }}
              </p>

              <!-- Prominent Due Date -->
              <div
                class="mt-lg rounded-lg px-md py-sm inline-flex items-center gap-sm"
                :class="task.is_overdue && task.status !== 2 ? 'bg-error/10' : 'bg-surface-container-high'"
              >
                <span
                  class="material-symbols-outlined text-2xl"
                  :class="task.is_overdue && task.status !== 2 ? 'text-error' : 'text-on-surface-variant'"
                >
                  {{ task.is_overdue && task.status !== 2 ? 'warning' : 'event' }}
                </span>
                <div class="flex flex-col">
                  <span class="text-label-xs text-on-surface-variant font-label">截止日期</span>
                  <span
                    class="text-title-lg font-headline font-bold leading-tight"
                    :class="task.is_overdue && task.status !== 2 ? 'text-error' : 'text-on-surface'"
                  >
                    {{ formatDate(task.due_date) }}
                    <span
                      v-if="task.is_overdue && task.status !== 2"
                      class="text-label-sm text-error font-label ml-xs"
                    >(已逾期)</span>
                  </span>
                </div>
              </div>

              <!-- Meta: Priority + Category (compact row) -->
              <div class="flex items-center gap-lg mt-md flex-wrap">
                <div class="flex items-center gap-sm">
                  <span class="material-symbols-outlined text-on-surface-variant text-xl">
                    {{ priorityIconMap[task.priority] }}
                  </span>
                  <span class="text-label-sm text-on-surface-variant font-label">优先级</span>
                  <span class="text-body-sm text-on-surface font-body">
                    {{ priorityLabelMap[task.priority] }}
                  </span>
                </div>
                <div v-if="task.category" class="flex items-center gap-sm">
                  <span class="material-symbols-outlined text-on-surface-variant text-xl">category</span>
                  <span class="text-label-sm text-on-surface-variant font-label">分类</span>
                  <span class="inline-flex items-center gap-xs text-body-sm text-on-surface font-body">
                    <span
                      class="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      :style="{ backgroundColor: task.category.color }"
                    />
                    {{ task.category.name }}
                  </span>
                </div>
              </div>

              <!-- Tags -->
              <div v-if="task.tags && task.tags.length > 0" class="mt-md flex flex-wrap gap-sm">
                <span
                  v-for="tag in task.tags"
                  :key="tag.name"
                  class="bg-[#d8e2ff]/20 text-primary rounded-full px-sm py-xs font-label text-label-sm inline-flex items-center gap-xs"
                >
                  <span
                    class="w-2 h-2 rounded-full flex-shrink-0"
                    :style="{ backgroundColor: tag.color }"
                  />
                  {{ tag.name }}
                </span>
              </div>

              <!-- Reminders -->
              <div v-if="task.reminders && task.reminders.length > 0" class="mt-lg">
                <div class="flex items-center gap-xs mb-sm">
                  <span class="material-symbols-outlined text-primary text-lg">alarm</span>
                  <span class="font-label text-label-md text-on-surface">提醒设置</span>
                </div>
                <div class="flex flex-col gap-sm">
                  <div
                    v-for="reminder in task.reminders"
                    :key="reminder.id"
                    class="flex flex-col gap-sm rounded-lg border px-md py-sm"
                    :class="
                      task.status === 2
                        ? 'bg-surface-container-low border-surface-variant'
                        : getCountdown(reminder.remind_at) === '已到时'
                          ? 'bg-surface-container-low border-surface-variant'
                          : 'bg-primary/5 border-primary/20'
                    "
                  >
                    <!-- Top row: Absolute time + notification channels -->
                    <div class="flex items-center justify-between gap-md flex-wrap">
                      <div class="flex items-center gap-xs">
                        <span
                          class="material-symbols-outlined text-base"
                          :class="
                            task.status === 2
                              ? 'text-on-surface-variant'
                              : getCountdown(reminder.remind_at) === '已到时'
                                ? 'text-on-surface-variant'
                                : 'text-primary'
                          "
                        >event</span>
                        <span
                          class="font-body text-body-sm"
                          :class="
                            task.status === 2
                              ? 'text-on-surface-variant'
                              : getCountdown(reminder.remind_at) === '已到时'
                                ? 'text-on-surface-variant'
                                : 'text-on-surface'
                          "
                        >{{ formatReminderTime(reminder.remind_at) }}</span>
                      </div>
                      <div v-if="reminder.notify_channels" class="flex items-center gap-xs flex-wrap">
                        <span
                          v-for="ch in getChannelList(reminder.notify_channels)"
                          :key="ch.key"
                          class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-label text-[11px]"
                          :class="
                            task.status === 2
                              ? 'bg-surface-container-high text-on-surface-variant'
                              : 'bg-primary/10 text-primary'
                          "
                        >
                          <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">{{ ch.icon }}</span>
                          {{ ch.label }}
                        </span>
                      </div>
                      <span v-else class="font-label text-[11px] text-on-surface-variant">仅应用内提醒</span>
                    </div>
                    <!-- Bottom row: Countdown pinned to bottom-right -->
                    <div class="flex items-center justify-end">
                      <span
                        v-if="task.status !== 2 && getCountdown(reminder.remind_at) && getCountdown(reminder.remind_at) !== '已到时'"
                        class="inline-flex items-center gap-1 font-body text-body-md tabular-nums font-medium text-primary"
                      >
                        <span class="material-symbols-outlined text-base">timer</span>
                        {{ getCountdown(reminder.remind_at) }}
                      </span>
                      <span
                        v-else-if="task.status !== 2 && getCountdown(reminder.remind_at) === '已到时'"
                        class="inline-flex items-center gap-1 font-label text-label-md text-on-surface-variant"
                      >
                        <span class="material-symbols-outlined text-base">check_circle</span>
                        已到时
                      </span>
                      <span
                        v-else-if="task.status === 2"
                        class="font-label text-label-sm text-on-surface-variant"
                      >任务已完成</span>
                    </div>
                  </div>
                </div>
              </div>

              <!-- Follow-up Notice -->
              <div
                v-if="task.needs_follow_up"
                class="mt-lg bg-[#ffdcc6]/30 border border-[#924700]/20 rounded-xl p-md flex items-start gap-sm"
              >
                <span class="material-symbols-outlined text-tertiary text-xl flex-shrink-0 mt-0.5">flag</span>
                <div class="flex-grow">
                  <span class="font-label text-label-md text-tertiary block">需要跟进</span>
                  <p
                    v-if="task.follow_up_reason"
                    class="text-body-sm text-on-surface-variant m-0 mt-xs"
                  >
                    <span class="material-symbols-outlined !text-[14px] align-middle mr-xs">campaign</span>
                    {{ task.follow_up_reason }}
                  </p>
                  <p
                    v-if="task.follow_up_remind_at"
                    class="text-body-sm text-on-surface-variant m-0 mt-xs"
                  >
                    <span class="material-symbols-outlined !text-[14px] align-middle mr-xs">alarm</span>
                    提醒时间：{{ task.follow_up_remind_at }}
                  </p>
                  <p
                    v-if="task.follow_up_notify_channels"
                    class="text-body-sm text-on-surface-variant m-0 mt-xs"
                  >
                    <span class="material-symbols-outlined !text-[14px] align-middle mr-xs">cell_tower</span>
                    通知方式：{{ formatChannels(task.follow_up_notify_channels) }}
                  </p>
                </div>
              </div>
            </div>

            <!-- Action Bar -->
            <div class="mt-lg flex items-center justify-between pt-lg border-t border-surface-variant">
              <!-- Left: Edit -->
              <button
                class="inline-flex items-center gap-sm rounded-xl px-md py-sm font-label text-label-md text-on-surface-variant hover:bg-surface-container transition active:scale-95"
                @click="handleEdit"
              >
                <span class="material-symbols-outlined text-xl">edit</span>
                编辑
              </button>

              <!-- Right: Complete + Delete -->
              <div class="flex items-center gap-sm">
                <!-- Complete / Uncomplete -->
                <button
                  v-if="task.status !== 2"
                  class="bg-primary text-on-primary rounded-xl px-md py-sm flex items-center gap-sm font-label text-label-md transition hover:opacity-90 active:scale-95"
                  @click="showCompleteDialog = true"
                >
                  <span class="material-symbols-outlined text-xl">check_circle</span>
                  标记完成
                </button>
                <button
                  v-else
                  class="bg-surface-container-high text-on-surface-variant rounded-xl px-md py-sm flex items-center gap-sm font-label text-label-md transition hover:bg-surface-container active:scale-95"
                  @click="handleUncomplete"
                >
                  <span class="material-symbols-outlined text-xl">undo</span>
                  恢复未完成
                </button>

                <!-- Delete -->
                <button
                  class="text-error hover:bg-error-container rounded-xl px-md py-sm flex items-center gap-sm font-label text-label-md transition active:scale-95"
                  @click="handleDelete"
                >
                  <span class="material-symbols-outlined text-xl">delete</span>
                  删除
                </button>
              </div>
            </div>
          </div>
        </template>

        <!-- Not Found -->
        <div
          v-else
          class="flex flex-col items-center justify-center py-xl gap-md"
        >
          <span class="material-symbols-outlined text-on-surface-variant" style="font-size: 48px;">
            search_off
          </span>
          <p class="text-body-md text-on-surface-variant font-label m-0">
            未找到该任务
          </p>
          <button
            class="bg-primary text-on-primary rounded-xl px-md py-sm flex items-center gap-sm font-label text-label-md transition hover:opacity-90 mt-sm"
            @click="handleBack"
          >
            返回任务列表
          </button>
        </div>
      </div>
    </div>

    <!-- Complete Dialog -->
    <TaskCompleteDialog
      v-model="showCompleteDialog"
      :task-title="task?.title || ''"
      @submit="handleComplete"
    />
  </div>
</template>
