<script setup lang="ts">
import { ref, watch, computed, onMounted, onBeforeUnmount } from 'vue'
import type { CreateReminderRequest } from '@/types'
import dayjs from 'dayjs'
import { calculateReminderTime } from '@/utils/date'
import { ElDatePicker, ElButton, ElTag } from 'element-plus'

const now = ref(Date.now())
let timerInterval: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timerInterval = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  if (timerInterval) {
    clearInterval(timerInterval)
    timerInterval = null
  }
})

function getCountdown(remindAt?: string): string {
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

const props = defineProps<{
  reminders: CreateReminderRequest[]
  dueDate?: string
}>()

const emit = defineEmits<{
  (e: 'change', reminders: CreateReminderRequest[]): void
}>()

const reminderList = ref<CreateReminderRequest[]>([...props.reminders])

const quickOptions = [
  { label: '15分钟前', minutes: 15, icon: 'alarm' },
  { label: '30分钟前', minutes: 30, icon: 'alarm' },
  { label: '1小时前', minutes: 60, icon: 'schedule' },
  { label: '2小时前', minutes: 120, icon: 'schedule' },
  { label: '1天前', minutes: 1440, icon: 'calendar_today' }
]

// 通知方式选项
const channelOptions = [
  { value: 'web_push', label: '网页弹窗', icon: 'web' },
  { value: 'email', label: '邮件提醒', icon: 'mail' },
  { value: 'wx', label: '微信提醒', icon: 'chat' },
  { value: 'sms', label: '短信提醒', icon: 'sms' },
  { value: 'desktop', label: '闹钟提醒', icon: 'notifications_active' },
]

// Sync external reminder changes
watch(
  () => props.reminders,
  (newVal) => {
    const isSame =
      newVal.length === reminderList.value.length &&
      newVal.every((r, i) => r.remind_at === reminderList.value[i]?.remind_at && r.notify_channels === reminderList.value[i]?.notify_channels)
    if (!isSame) {
      reminderList.value = [...newVal]
    }
  },
  { deep: true }
)

// Recalculate reminder times when dueDate changes
watch(
  () => props.dueDate,
  (newDate, oldDate) => {
    if (!newDate || !oldDate) return

    const oldDue = dayjs(oldDate)
    const newDue = dayjs(newDate)
    const diffMinutes = newDue.diff(oldDue, 'minute')

    if (diffMinutes === 0) return

    // Shift all existing reminder times by the same delta as the due date change
    // Skip daily reminders (remind_type === 4) - those are regenerated separately
    let changed = false
    reminderList.value.forEach((reminder) => {
      if (reminder.remind_at && reminder.remind_type !== 4) {
        const oldRemind = dayjs(reminder.remind_at)
        reminder.remind_at = oldRemind.add(diffMinutes, 'minute').format('YYYY-MM-DDTHH:mm:ss')
        changed = true
      }
    })

    if (changed) {
      emitChange()
    }
  }
)

const hasDueDate = computed(() => !!props.dueDate)

function emitChange() {
  emit('change', [...reminderList.value])
}

function addReminder() {
  const defaultTime = props.dueDate
    ? dayjs(props.dueDate).subtract(15, 'minute').format('YYYY-MM-DDTHH:mm:ss')
    : dayjs().add(15, 'minute').format('YYYY-MM-DDTHH:mm:ss')

  reminderList.value.push({
    remind_at: defaultTime,
    remind_type: 0,
    notify_channels: 'web_push'
  })
  emitChange()
}

function removeReminder(index: number) {
  reminderList.value.splice(index, 1)
  emitChange()
}

function handleTimeChange(index: number, value: string) {
  if (value) {
    reminderList.value[index].remind_at = value
    emitChange()
  }
}

function setQuickReminder(minutesBefore: number) {
  if (!props.dueDate) return

  const remindAt = calculateReminderTime(props.dueDate, minutesBefore)

  // Check if this exact time already exists — if so, toggle it OFF
  const existingIndex = reminderList.value.findIndex(r => {
    const diff = Math.abs(dayjs(r.remind_at).diff(dayjs(remindAt), 'minute'))
    return diff <= 1
  })
  if (existingIndex > -1) {
    // Remove the existing reminder (toggle off)
    reminderList.value.splice(existingIndex, 1)
    emitChange()
    return
  }

  reminderList.value.push({
    remind_at: remindAt,
    remind_type: 0,
    notify_channels: 'web_push'
  })
  emitChange()
}

function isQuickOptionActive(minutes: number): boolean {
  if (!props.dueDate) return false
  const expected = calculateReminderTime(props.dueDate, minutes)
  return reminderList.value.some(r => {
    const diff = Math.abs(dayjs(r.remind_at).diff(dayjs(expected), 'minute'))
    return diff <= 1
  })
}

function getRelativeLabel(remindAt: string, remindType?: number): string {
  if (remindType === 4) {
    return `每天 ${dayjs(remindAt).format('HH:mm')}`
  }
  if (!props.dueDate) return ''
  const diffMinutes = dayjs(props.dueDate).diff(dayjs(remindAt), 'minute')
  if (diffMinutes <= 0) return '截止后'
  if (diffMinutes < 60) return `截止前 ${diffMinutes} 分钟`
  if (diffMinutes < 1440) return `截止前 ${Math.floor(diffMinutes / 60)} 小时`
  return `截止前 ${Math.floor(diffMinutes / 1440)} 天`
}

// 解析 notify_channels 字符串为数组
function getChannelList(channels?: string): string[] {
  if (!channels) return []
  return channels.split(',').filter(c => c.trim())
}

// 切换通知方式
function toggleChannel(index: number, channel: string) {
  const reminder = reminderList.value[index]
  const channels = getChannelList(reminder.notify_channels)
  const idx = channels.indexOf(channel)
  if (idx > -1) {
    channels.splice(idx, 1)
  } else {
    channels.push(channel)
  }
  reminder.notify_channels = channels.length > 0 ? channels.join(',') : undefined
  emitChange()
}

function isChannelActive(reminder: CreateReminderRequest, channel: string): boolean {
  return getChannelList(reminder.notify_channels).includes(channel)
}

// ─── Daily Reminder ─────────────────────────────────────────────────────────────
const dailyEnabled = ref(false)
const dailyTime = ref('09:00')

// Detect if there are existing daily reminders (remind_type === 4)
function syncDailyState() {
  const dailyReminders = reminderList.value.filter(r => r.remind_type === 4)
  if (dailyReminders.length > 0) {
    dailyEnabled.value = true
    // Extract time from the first daily reminder
    const firstTime = dayjs(dailyReminders[0].remind_at)
    dailyTime.value = firstTime.format('HH:mm')
  }
}

// Initialize daily state from existing reminders
syncDailyState()

function generateDailyReminders(): CreateReminderRequest[] {
  if (!dailyEnabled.value || !props.dueDate) return []

  const timeParts = dailyTime.value.split(':')
  const hour = parseInt(timeParts[0]) || 9
  const minute = parseInt(timeParts[1]) || 0

  const today = dayjs().startOf('day')
  const dueDate = dayjs(props.dueDate).startOf('day')
  const channels = 'web_push'

  const result: CreateReminderRequest[] = []
  let current = today

  // Generate one reminder per day from today to due date (inclusive)
  while (current.isBefore(dueDate) || current.isSame(dueDate, 'day')) {
    const remindAt = current.hour(hour).minute(minute).second(0)
    // Only add if it's in the future
    if (remindAt.isAfter(dayjs())) {
      result.push({
        remind_at: remindAt.format('YYYY-MM-DDTHH:mm:ss'),
        remind_type: 4,
        notify_channels: channels
      })
    }
    current = current.add(1, 'day')
  }

  return result
}

function applyDailyReminders() {
  // Remove all existing daily reminders (remind_type === 4)
  reminderList.value = reminderList.value.filter(r => r.remind_type !== 4)

  // Add new daily reminders if enabled
  if (dailyEnabled.value) {
    const dailys = generateDailyReminders()
    reminderList.value.push(...dailys)
  }

  emitChange()
}

function toggleDailyReminder() {
  dailyEnabled.value = !dailyEnabled.value
  applyDailyReminders()
}

function handleDailyTimeChange(val: string) {
  if (val) {
    dailyTime.value = val
    if (dailyEnabled.value) {
      applyDailyReminders()
    }
  }
}

// Watch for dueDate changes to regenerate daily reminders
watch(
  () => props.dueDate,
  () => {
    if (dailyEnabled.value) {
      applyDailyReminders()
    }
  }
)

// Non-daily reminders for display (hide daily type=4 from the list)
const nonDailyReminders = computed(() => {
  return reminderList.value
    .map((r, i) => ({ ...r, _index: i }))
    .filter(r => r.remind_type !== 4)
})

const dailyReminderCount = computed(() => {
  return reminderList.value.filter(r => r.remind_type === 4).length
})
</script>

<template>
  <div class="reminder-setting flex flex-col gap-md">
    <!-- Quick-set buttons -->
    <div v-if="hasDueDate" class="bg-surface-container-low rounded-xl p-md">
      <div class="flex items-center gap-sm mb-sm">
        <span class="material-symbols-outlined text-primary text-body-md">bolt</span>
        <span class="text-label-md text-on-surface-variant">快捷设置</span>
      </div>
      <div class="flex flex-wrap gap-sm">
        <button
          v-for="option in quickOptions"
          :key="option.minutes"
          type="button"
          class="inline-flex items-center gap-xs px-md py-xs rounded-full text-label-sm transition-all duration-200 cursor-pointer border"
          :class="isQuickOptionActive(option.minutes)
            ? 'bg-primary text-on-primary border-primary'
            : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:border-primary hover:text-primary'"
          @click="setQuickReminder(option.minutes)"
        >
          <span class="material-symbols-outlined text-body-sm">{{ option.icon }}</span>
          {{ option.label }}
        </button>
      </div>
    </div>

    <!-- Daily Reminder Toggle -->
    <div v-if="hasDueDate" class="bg-surface-container-low rounded-xl p-md">
      <div class="flex items-center justify-between">
        <div class="flex items-center gap-sm">
          <span class="material-symbols-outlined text-secondary text-body-md">repeat</span>
          <span class="text-label-md text-on-surface">每天提醒</span>
          <span class="text-label-sm text-on-surface-variant">（截止前每天定时提醒）</span>
        </div>
        <button
          type="button"
          class="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
          :class="dailyEnabled ? 'bg-primary' : 'bg-surface-container-high'"
          @click="toggleDailyReminder"
        >
          <span
            class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
            :class="{ 'translate-x-5': dailyEnabled }"
          />
        </button>
      </div>
      <div v-if="dailyEnabled" class="flex items-center gap-sm mt-sm pl-9">
        <span class="text-label-sm text-on-surface-variant">每天</span>
        <ElDatePicker
          :model-value="dailyTime"
          type="time"
          placeholder="选择时间"
          format="HH:mm"
          value-format="HH:mm"
          style="width: 120px"
          size="default"
          @update:model-value="handleDailyTimeChange"
        />
        <span class="text-label-sm text-on-surface-variant">提醒一次</span>
        <span
          v-if="dailyReminderCount > 0"
          class="inline-flex items-center gap-1 bg-secondary/10 text-secondary rounded-full px-2.5 py-0.5 font-label text-[11px] ml-1"
        >
          <span class="material-symbols-outlined text-[12px]" style="font-variation-settings: 'FILL' 1;">event_repeat</span>
          共 {{ dailyReminderCount }} 天
        </span>
      </div>
    </div>

    <!-- Reminder list (non-daily only) -->
    <div v-if="nonDailyReminders.length > 0" class="flex flex-col gap-sm">
      <TransitionGroup name="reminder-list" tag="div" class="flex flex-col gap-sm">
        <div
          v-for="reminder in nonDailyReminders"
          :key="reminder.remind_at + '-' + reminder._index"
          class="bg-surface-container-lowest border border-surface-variant rounded-xl px-md py-md group hover:shadow-card transition-shadow"
        >
          <!-- Time row -->
          <div class="flex items-center gap-sm mb-sm">
            <span class="material-symbols-outlined text-primary text-body-md shrink-0">alarm</span>

            <ElDatePicker
              :model-value="reminder.remind_at"
              type="datetime"
              placeholder="选择提醒时间"
              style="flex: 1"
              format="YYYY-MM-DD HH:mm"
              value-format="YYYY-MM-DDTHH:mm:ss"
              size="default"
              @update:model-value="(val: string) => handleTimeChange(reminder._index, val)"
            />

            <!-- Countdown indicator -->
            <span
              v-if="getCountdown(reminder.remind_at) && getCountdown(reminder.remind_at) !== '已到时'"
              class="inline-flex items-center gap-0.5 font-body text-label-sm tabular-nums font-medium text-primary shrink-0"
            >
              <span class="material-symbols-outlined text-sm">timer</span>
              {{ getCountdown(reminder.remind_at) }}
            </span>
            <span
              v-else-if="getCountdown(reminder.remind_at) === '已到时'"
              class="inline-flex items-center gap-0.5 font-label text-label-sm text-on-surface-variant shrink-0"
            >
              <span class="material-symbols-outlined text-sm">check_circle</span>
              已到时
            </span>

            <ElTag
              v-if="getRelativeLabel(reminder.remind_at, reminder.remind_type)"
              size="small"
              type="info"
              effect="plain"
              class="shrink-0 hidden sm:inline-flex"
            >
              {{ getRelativeLabel(reminder.remind_at, reminder.remind_type) }}
            </ElTag>

            <button
              type="button"
              class="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/40 transition-colors cursor-pointer opacity-50 group-hover:opacity-100 shrink-0"
              @click="removeReminder(reminder._index)"
            >
              <span class="material-symbols-outlined text-body-md">delete</span>
            </button>
          </div>

          <!-- Channel selection -->
          <div class="flex items-center gap-xs flex-wrap pl-9">
            <span class="text-label-sm text-on-surface-variant mr-xs">提醒方式：</span>
            <button
              v-for="ch in channelOptions"
              :key="ch.value"
              type="button"
              class="inline-flex items-center gap-xs px-sm py-xs rounded-full text-label-sm transition-all duration-200 cursor-pointer border"
              :class="isChannelActive(reminder, ch.value)
                ? 'bg-primary text-on-primary border-primary'
                : 'bg-surface-container-low text-on-surface-variant border-outline-variant hover:border-primary hover:text-primary'"
              @click="toggleChannel(reminder._index, ch.value)"
            >
              <span class="material-symbols-outlined !text-[16px]">{{ ch.icon }}</span>
              {{ ch.label }}
            </button>
          </div>
        </div>
      </TransitionGroup>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="flex flex-col items-center py-md text-on-surface-variant"
    >
      <span class="material-symbols-outlined text-headline-md text-outline-variant mb-sm">notifications_off</span>
      <span v-if="dailyEnabled" class="text-body-sm">仅设置了每天提醒</span>
      <span v-else class="text-body-sm">暂未设置提醒</span>
      <span v-if="!hasDueDate" class="text-label-sm text-outline mt-xs">请先设置截止日期</span>
    </div>

    <!-- Add button -->
    <button
      type="button"
      class="btn-ghost self-start"
      @click="addReminder"
    >
      <span class="material-symbols-outlined text-body-md text-primary">add_alarm</span>
      添加提醒
    </button>
  </div>
</template>

<style scoped>
/* Transition group for list items */
.reminder-list-enter-active {
  transition: all 0.3s ease;
}

.reminder-list-leave-active {
  transition: all 0.2s ease;
}

.reminder-list-enter-from {
  opacity: 0;
  transform: translateX(-16px);
}

.reminder-list-leave-to {
  opacity: 0;
  transform: translateX(16px);
}

.reminder-list-move {
  transition: transform 0.3s ease;
}

/* DatePicker inside reminder items should have no extra background */
:deep(.reminder-setting .el-date-editor) {
  --el-input-border-radius: 8px;
}

:deep(.el-date-editor .el-input__wrapper) {
  box-shadow: none !important;
  padding: 0;
}
</style>
