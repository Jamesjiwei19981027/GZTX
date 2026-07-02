<script setup lang="ts">
import { computed, onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { ElDialog, ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'

interface TagInfo {
  name: string
  color: string
}

interface CategoryInfo {
  id: number
  name: string
  color: string
}

interface ReminderInfo {
  id: number
  task_id?: number
  remind_at: string
  remind_type: number
  is_sent: boolean
  notify_channels?: string
}

interface Task {
  id: number
  title: string
  description?: string
  priority: 0 | 1 | 2
  priority_label?: string
  status: 0 | 1 | 2
  status_label?: string
  due_date?: string
  completed_at?: string
  created_at?: string
  updated_at?: string
  is_overdue?: boolean
  is_recurring?: boolean
  category?: CategoryInfo | null
  tags?: TagInfo[]
  reminders?: ReminderInfo[]
  needs_follow_up?: boolean
  follow_up_reason?: string
  follow_up_remind_at?: string
  follow_up_notify_channels?: string
  completion_rate?: number
  completion_comment?: string
}

const props = defineProps<{
  modelValue: boolean
  task: Task | null
  loading?: boolean
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: boolean): void
  (e: 'edit', task: Task): void
  (e: 'complete', task: Task): void
  (e: 'uncomplete', task: Task): void
  (e: 'delete', task: Task): void
}>()

const visible = computed({
  get: () => props.modelValue,
  set: (v) => emit('update:modelValue', v),
})

const statusConfig: Record<number, { bg: string; text: string; icon: string; label: string }> = {
  0: { bg: 'bg-surface-container-high', text: 'text-on-surface-variant', icon: 'radio_button_unchecked', label: '待办' },
  1: { bg: 'bg-[#d8e2ff]/20', text: 'text-primary', icon: 'pending', label: '进行中' },
  2: { bg: 'bg-secondary-container/30', text: 'text-secondary', icon: 'check_circle', label: '已完成' },
}

const priorityLabelMap: Record<number, string> = { 0: '低', 1: '中', 2: '高' }
const priorityIconMap: Record<number, string> = { 0: 'low_priority', 1: 'priority', 2: 'priority_high' }

const channelLabels: Record<string, string> = {
  web_popup: '网页弹窗', web_push: '网页弹窗',
  email: '邮件提醒', wechat: '微信提醒', wx: '微信提醒',
  sms: '短信提醒', alarm: '闹钟提醒', desktop: '闹钟提醒',
}
const channelIcons: Record<string, string> = {
  web_popup: 'notifications_active', web_push: 'notifications_active',
  email: 'mail', wechat: 'chat', wx: 'chat',
  sms: 'sms', alarm: 'alarm', desktop: 'alarm',
}

const priorityBorderColor = computed(() => {
  if (!props.task) return 'border-l-primary'
  switch (props.task.priority) {
    case 2: return 'border-l-error'
    case 1: return 'border-l-tertiary'
    default: return 'border-l-primary'
  }
})

const currentStatusConfig = computed(() => {
  if (!props.task) return statusConfig[0]
  return statusConfig[props.task.status] ?? statusConfig[0]
})

const currentStatusLabel = computed(() => {
  if (!props.task) return '待办'
  return props.task.status_label ?? statusConfig[props.task.status]?.label ?? '待办'
})

// Separate daily reminders from regular ones
const nonDailyReminders = computed(() => {
  return (props.task?.reminders || []).filter(r => r.remind_type !== 4)
})

const dailyReminderInfo = computed(() => {
  const dailys = (props.task?.reminders || []).filter(r => r.remind_type === 4)
  if (dailys.length === 0) return null
  const time = dayjs(dailys[0].remind_at).format('HH:mm')
  return { time, count: dailys.length, channels: dailys[0].notify_channels }
})

function formatDate(date?: string) {
  if (!date) return '未设置'
  return dayjs(date).format('YYYY-MM-DD HH:mm')
}

function formatReminderTime(remindAt: string): string {
  return dayjs(remindAt).format('MM-DD HH:mm')
}

function getChannelList(channels?: string): Array<{ key: string; icon: string; label: string }> {
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

// ─── Live Countdown Timer ──────────────────────────────────────────────────────
const now = ref(Date.now())
let timerInterval: ReturnType<typeof setInterval> | null = null

watch(visible, (val) => {
  if (val && !timerInterval) {
    timerInterval = setInterval(() => { now.value = Date.now() }, 1000)
  } else if (!val && timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
})

onMounted(() => {
  if (visible.value) {
    timerInterval = setInterval(() => { now.value = Date.now() }, 1000)
  }
})

onBeforeUnmount(() => {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
})

function getCountdown(remindAt: string): string {
  const _tick = now.value
  if (!remindAt || !props.task || props.task.status === 2) return ''
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

function handleClose() {
  visible.value = false
}

function handleEdit() {
  if (props.task) emit('edit', props.task)
}

async function handleDelete() {
  if (!props.task) return
  try {
    await ElMessageBox.confirm('确定要删除这个任务吗？此操作不可撤销。', '删除确认', {
      confirmButtonText: '删除',
      cancelButtonText: '取消',
      type: 'warning',
      confirmButtonClass: 'el-button--danger',
    })
    emit('delete', props.task)
  } catch { /* cancelled */ }
}

function handleComplete() {
  if (props.task) emit('complete', props.task)
}

function handleUncomplete() {
  if (props.task) emit('uncomplete', props.task)
}
</script>

<template>
  <ElDialog
    v-model="visible"
    :title="null"
    :show-close="false"
    width="640px"
    class="task-detail-dialog"
    :close-on-click-modal="true"
    :close-on-press-escape="true"
    destroy-on-close
  >
    <!-- Loading -->
    <div v-if="loading" class="flex flex-col items-center justify-center py-xl gap-sm">
      <span class="material-symbols-outlined text-5xl text-on-surface-variant animate-spin">progress_activity</span>
      <span class="text-body-sm text-on-surface-variant">加载中...</span>
    </div>

    <!-- Not found -->
    <div
      v-else-if="!task"
      class="flex flex-col items-center justify-center py-xl gap-md"
    >
      <span class="material-symbols-outlined text-on-surface-variant" style="font-size: 48px;">search_off</span>
      <p class="text-body-md text-on-surface-variant font-label m-0">未找到该任务</p>
    </div>

    <!-- Detail Card -->
    <div v-else class="p-lg">
      <div
        class="bg-surface-container-lowest rounded-xl p-xl border border-surface-variant border-l-4"
        :class="priorityBorderColor"
      >
        <!-- Top Row: Status Badge + Created At + Close -->
        <div class="flex items-start justify-between gap-md">
          <span
            class="inline-flex items-center gap-xs px-md py-xs rounded-full font-label text-label-md"
            :class="[currentStatusConfig.bg, currentStatusConfig.text]"
          >
            <span class="material-symbols-outlined text-base">{{ currentStatusConfig.icon }}</span>
            {{ currentStatusLabel }}
          </span>
          <div class="flex items-center gap-sm">
            <div class="flex items-center gap-xs text-on-surface-variant">
              <span class="material-symbols-outlined text-base">schedule</span>
              <span class="text-label-sm font-label">{{ formatDate(task.created_at) }}</span>
            </div>
            <button
              class="rounded-full p-1 hover:bg-surface-container transition active:scale-95"
              title="关闭"
              @click="handleClose"
            >
              <span class="material-symbols-outlined text-on-surface-variant text-xl">close</span>
            </button>
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
        <p class="text-body-md text-on-surface-variant mt-md m-0 whitespace-pre-wrap leading-relaxed">
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

        <!-- Meta: Priority + Category -->
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
        <div v-if="nonDailyReminders.length > 0 || dailyReminderInfo" class="mt-lg">
          <div class="flex items-center gap-xs mb-sm">
            <span class="material-symbols-outlined text-primary text-lg">alarm</span>
            <span class="font-label text-label-md text-on-surface">提醒设置</span>
          </div>

          <!-- Daily reminder compact summary -->
          <div
            v-if="dailyReminderInfo"
            class="flex items-center gap-sm rounded-lg border px-md py-sm mb-sm"
            :class="
              task.status === 2
                ? 'bg-surface-container-low border-surface-variant'
                : 'bg-secondary/5 border-secondary/20'
            "
          >
            <span
              class="material-symbols-outlined text-base"
              :class="task.status === 2 ? 'text-on-surface-variant' : 'text-secondary'"
              style="font-variation-settings: 'FILL' 1;"
            >event_repeat</span>
            <span
              class="font-body text-body-sm"
              :class="task.status === 2 ? 'text-on-surface-variant' : 'text-on-surface'"
            >每天 {{ dailyReminderInfo.time }} 提醒</span>
            <span
              class="inline-flex items-center gap-1 rounded-full px-2 py-0.5 font-label text-[11px]"
              :class="task.status === 2 ? 'bg-surface-container-high text-on-surface-variant' : 'bg-secondary/10 text-secondary'"
            >共 {{ dailyReminderInfo.count }} 天</span>
            <div v-if="dailyReminderInfo.channels" class="flex items-center gap-xs ml-auto">
              <span
                v-for="ch in getChannelList(dailyReminderInfo.channels)"
                :key="ch.key"
                class="inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 font-label text-[11px]"
                :class="task.status === 2 ? 'bg-surface-container-high text-on-surface-variant' : 'bg-primary/10 text-primary'"
              >
                <span class="material-symbols-outlined text-[14px]" style="font-variation-settings: 'FILL' 1;">{{ ch.icon }}</span>
                {{ ch.label }}
              </span>
            </div>
          </div>

          <!-- Non-daily reminder cards -->
          <div class="flex flex-col gap-sm">
            <div
              v-for="reminder in nonDailyReminders"
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
            <p v-if="task.follow_up_reason" class="text-body-sm text-on-surface-variant m-0 mt-xs">
              {{ task.follow_up_reason }}
            </p>
            <p v-if="task.follow_up_remind_at" class="text-body-sm text-on-surface-variant m-0 mt-xs">
              <span class="material-symbols-outlined !text-[14px] align-middle mr-xs">alarm</span>
              提醒时间：{{ task.follow_up_remind_at }}
            </p>
          </div>
        </div>
      </div>

      <!-- Action Bar -->
      <div class="mt-lg flex items-center justify-between pt-lg border-t border-surface-variant">
        <button
          class="inline-flex items-center gap-sm rounded-xl px-md py-sm font-label text-label-md text-on-surface-variant hover:bg-surface-container transition active:scale-95"
          @click="handleEdit"
        >
          <span class="material-symbols-outlined text-xl">edit</span>
          编辑
        </button>
        <div class="flex items-center gap-sm">
          <button
            v-if="task.status !== 2"
            class="bg-primary text-on-primary rounded-xl px-md py-sm flex items-center gap-sm font-label text-label-md transition hover:opacity-90 active:scale-95"
            @click="handleComplete"
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
  </ElDialog>
</template>

<style scoped>
:deep(.el-dialog) {
  border-radius: 16px;
  padding: 0;
  overflow: hidden;
}
:deep(.el-dialog__header) {
  display: none;
}
:deep(.el-dialog__body) {
  padding: 0;
}
</style>
