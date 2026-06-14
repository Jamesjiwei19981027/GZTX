<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { CreateReminderRequest } from '@/types'
import { ElCard, ElButton, ElInputNumber, ElSelect, ElOption, ElDatePicker, ElIcon } from 'element-plus'
import { Plus, Delete } from '@element-plus/icons-vue'
import dayjs from 'dayjs'

const props = defineProps<{
  reminders: CreateReminderRequest[]
  dueDate?: string
}>()

const emit = defineEmits<{
  (e: 'change', reminders: CreateReminderRequest[]): void
}>()

const reminderList = ref<CreateReminderRequest[]>([...props.reminders])

const remindBeforeOptions = [
  { value: 15, label: '15分钟前' },
  { value: 30, label: '30分钟前' },
  { value: 60, label: '1小时前' },
  { value: 120, label: '2小时前' },
  { value: 1440, label: '1天前' }
]

// 当 dueDate 变化时，提示是否需要更新提醒时间
watch(
  () => props.dueDate,
  (newDate) => {
    if (newDate) {
      reminderList.value.forEach(reminder => {
        // 如果是相对提醒（remind_type=0），需要重新计算
        if (reminder.remind_type === 0 && reminder.remind_at) {
          const dueDateTime = dayjs(newDate)
          const minutesBefore = reminder.minutes_before || 15
          reminder.remind_at = dueDateTime.subtract(minutesBefore, 'minute').toISOString()
        }
      })
    }
  }
)

function addReminder() {
  const defaultReminder: CreateReminderRequest = {
    remind_at: props.dueDate
      ? dayjs(props.dueDate).subtract(15, 'minute').toISOString()
      : dayjs().add(15, 'minute').toISOString(),
    remind_type: 0
  }
  reminderList.value.push(defaultReminder)
  emit('change', reminderList.value)
}

function removeReminder(index: number) {
  reminderList.value.splice(index, 1)
  emit('change', reminderList.value)
}

function updateReminderTime(index: number, time: string) {
  reminderList.value[index].remind_at = time
  emit('change', reminderList.value)
}

// 快捷设置提醒时间
function setQuickReminder(minutesBefore: number) {
  if (!props.dueDate) return

  const remindAt = dayjs(props.dueDate).subtract(minutesBefore, 'minute').toISOString()
  reminderList.value.push({
    remind_at: remindAt,
    remind_type: 0
  })
  emit('change', reminderList.value)
}

function handleTimeChange(index: number, value: string) {
  if (value) {
    updateReminderTime(index, value)
  }
}
</script>

<template>
  <div class="reminder-setting">
    <ElCard v-if="dueDate" shadow="never" class="quick-actions">
      <template #header>
        <span>快捷设置</span>
      </template>
      <div class="quick-buttons">
        <ElButton
          v-for="option in remindBeforeOptions"
          :key="option.value"
          size="small"
          @click="setQuickReminder(option.value)"
        >
          {{ option.label }}
        </ElButton>
      </div>
    </ElCard>

    <div class="reminder-list">
      <div v-for="(reminder, index) in reminderList" :key="index" class="reminder-item">
        <ElDatePicker
          :model-value="reminder.remind_at"
          type="datetime"
          placeholder="选择提醒时间"
          style="flex: 1"
          format="YYYY-MM-DD HH:mm"
          value-format="YYYY-MM-DDTHH:mm:ss"
          @update:model-value="(val) => handleTimeChange(index, val)"
        />
        <ElIcon class="delete-icon" @click="removeReminder(index)">
          <Delete />
        </ElIcon>
      </div>
    </div>

    <ElButton type="primary" plain :icon="Plus" @click="addReminder">
      添加提醒
    </ElButton>
  </div>
</template>

<style scoped>
.reminder-setting {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.quick-actions {
  background: var(--el-fill-color-light);
}

.quick-buttons {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.reminder-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.reminder-item {
  display: flex;
  align-items: center;
  gap: 8px;
}

.delete-icon {
  color: var(--el-color-danger);
  cursor: pointer;
  font-size: 16px;
}

.delete-icon:hover {
  opacity: 0.8;
}
</style>