<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import type { CreateReminderRequest } from '@/types'
import dayjs from 'dayjs'
import { calculateReminderTime } from '@/utils/date'
import { ElDatePicker, ElButton, ElTag } from 'element-plus'

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

// Sync external reminder changes
watch(
  () => props.reminders,
  (newVal) => {
    const isSame =
      newVal.length === reminderList.value.length &&
      newVal.every((r, i) => r.remind_at === reminderList.value[i]?.remind_at)
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
    let changed = false
    reminderList.value.forEach((reminder) => {
      if (reminder.remind_at) {
        const oldRemind = dayjs(reminder.remind_at)
        reminder.remind_at = oldRemind.add(diffMinutes, 'minute').toISOString()
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
    ? dayjs(props.dueDate).subtract(15, 'minute').toISOString()
    : dayjs().add(15, 'minute').toISOString()

  reminderList.value.push({
    remind_at: defaultTime,
    remind_type: 0
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

  // Check if this exact time already exists
  const exists = reminderList.value.some(r => r.remind_at === remindAt)
  if (exists) return

  reminderList.value.push({
    remind_at: remindAt,
    remind_type: 0
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

function getRelativeLabel(remindAt: string): string {
  if (!props.dueDate) return ''
  const diffMinutes = dayjs(props.dueDate).diff(dayjs(remindAt), 'minute')
  if (diffMinutes <= 0) return '截止后'
  if (diffMinutes < 60) return `截止前 ${diffMinutes} 分钟`
  if (diffMinutes < 1440) return `截止前 ${Math.floor(diffMinutes / 60)} 小时`
  return `截止前 ${Math.floor(diffMinutes / 1440)} 天`
}
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

    <!-- Reminder list -->
    <div v-if="reminderList.length > 0" class="flex flex-col gap-sm">
      <TransitionGroup name="reminder-list" tag="div" class="flex flex-col gap-sm">
        <div
          v-for="(reminder, index) in reminderList"
          :key="reminder.remind_at + '-' + index"
          class="flex items-center gap-sm bg-surface-container-lowest border border-surface-variant rounded-xl px-md py-sm group hover:shadow-card transition-shadow"
        >
          <span class="material-symbols-outlined text-primary text-body-md shrink-0">alarm</span>

          <ElDatePicker
            :model-value="reminder.remind_at"
            type="datetime"
            placeholder="选择提醒时间"
            style="flex: 1"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DDTHH:mm:ss"
            size="default"
            @update:model-value="(val: string) => handleTimeChange(index, val)"
          />

          <ElTag
            v-if="getRelativeLabel(reminder.remind_at)"
            size="small"
            type="info"
            effect="plain"
            class="shrink-0 hidden sm:inline-flex"
          >
            {{ getRelativeLabel(reminder.remind_at) }}
          </ElTag>

          <button
            type="button"
            class="w-8 h-8 flex items-center justify-center rounded-lg text-on-surface-variant hover:text-error hover:bg-error-container/40 transition-colors cursor-pointer opacity-50 group-hover:opacity-100"
            @click="removeReminder(index)"
          >
            <span class="material-symbols-outlined text-body-md">delete</span>
          </button>
        </div>
      </TransitionGroup>
    </div>

    <!-- Empty state -->
    <div
      v-else
      class="flex flex-col items-center py-md text-on-surface-variant"
    >
      <span class="material-symbols-outlined text-headline-md text-outline-variant mb-sm">notifications_off</span>
      <span class="text-body-sm">暂未设置提醒</span>
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
