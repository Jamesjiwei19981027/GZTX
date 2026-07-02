<script setup lang="ts">
import { ref, watch } from 'vue'
import { useTaskStore } from '@/stores/task'
import type { TaskPriority, CreateReminderRequest } from '@/types'
import dayjs from 'dayjs'

const props = withDefaults(defineProps<{
  visible: boolean
  sourceLabel?: string
  sourceType?: string
}>(), {
  visible: false,
  sourceLabel: '',
  sourceType: 'chat',
})

const emit = defineEmits<{
  'update:visible': [value: boolean]
  'created': [task: any]
}>()

const taskStore = useTaskStore()

// Form state
const taskContent = ref('')
const notes = ref('')
const deadline = ref('')
const priority = ref<TaskPriority>(1)
const submitting = ref(false)
const selectedChannels = ref<string[]>(['web_push'])
const reminderMinutesBefore = ref<number | null>(null)

// Notification channel options
const channelOptions = [
  { value: 'web_push', label: '网页弹窗', icon: 'web' },
  { value: 'email', label: '邮件提醒', icon: 'mail' },
  { value: 'wx', label: '微信提醒', icon: 'chat' },
  { value: 'sms', label: '短信提醒', icon: 'sms' },
  { value: 'desktop', label: '闹钟提醒', icon: 'notifications_active' },
]

// Quick reminder presets
const reminderPresets = [
  { label: '15分钟前', minutes: 15 },
  { label: '30分钟前', minutes: 30 },
  { label: '1小时前', minutes: 60 },
  { label: '2小时前', minutes: 120 },
]

function toggleChannel(channel: string) {
  const idx = selectedChannels.value.indexOf(channel)
  if (idx > -1) {
    selectedChannels.value.splice(idx, 1)
  } else {
    selectedChannels.value.push(channel)
  }
}

function isChannelActive(channel: string): boolean {
  return selectedChannels.value.includes(channel)
}

function setReminderPreset(minutes: number) {
  if (reminderMinutesBefore.value === minutes) {
    reminderMinutesBefore.value = null
  } else {
    reminderMinutesBefore.value = minutes
  }
}

function isReminderPresetActive(minutes: number): boolean {
  return reminderMinutesBefore.value === minutes
}

// Reset form when dialog opens
watch(() => props.visible, (val) => {
  if (val) {
    taskContent.value = ''
    notes.value = ''
    deadline.value = ''
    priority.value = 1
    selectedChannels.value = ['web_push']
    reminderMinutesBefore.value = null
  }
})

function close() {
  emit('update:visible', false)
}

function onMaskClick(e: MouseEvent) {
  if (e.target === e.currentTarget) {
    close()
  }
}

async function createTask() {
  if (!taskContent.value.trim()) return
  submitting.value = true
  try {
    // Build reminders if deadline and reminder preset are set
    const reminders: CreateReminderRequest[] = []
    if (deadline.value && reminderMinutesBefore.value && selectedChannels.value.length > 0) {
      const remindAt = dayjs(deadline.value).subtract(reminderMinutesBefore.value, 'minute').format('YYYY-MM-DDTHH:mm:ss')
      reminders.push({
        remind_at: remindAt,
        remind_type: 0,
        notify_channels: selectedChannels.value.join(',')
      })
    }

    const task = await taskStore.addTask({
      title: taskContent.value.trim(),
      description: notes.value.trim() || undefined,
      priority: priority.value,
      due_date: deadline.value || undefined,
      reminders: reminders.length > 0 ? reminders : undefined,
    })
    emit('created', task)
    close()
  } catch (e) {
    // Error handling is done in the store
  } finally {
    submitting.value = false
  }
}
</script>

<template>
  <Teleport to="body">
    <div
      v-if="visible"
      class="fixed inset-0 z-50 flex items-center justify-center bg-on-background/30 backdrop-blur-[2px] p-md"
      @click="onMaskClick"
    >
      <!-- Modal Container -->
      <div class="bg-surface w-full max-w-[560px] rounded-xl shadow-[0_10px_25px_rgba(0,0,0,0.1)] flex flex-col overflow-hidden animate-scale-in">
        <!-- Header -->
        <div class="px-lg py-md border-b border-surface-variant flex items-center justify-between bg-surface-container-lowest">
          <h2 class="font-headline text-headline-sm text-on-surface">快速创建任务</h2>
          <button
            aria-label="Close"
            class="text-on-surface-variant hover:bg-surface-container hover:text-on-surface rounded-full p-sm transition-colors duration-200 focus:outline-none focus:ring-2 focus:ring-primary/50"
            @click="close"
          >
            <span class="material-symbols-outlined block">close</span>
          </button>
        </div>

        <!-- Body -->
        <div class="p-lg flex flex-col gap-lg bg-surface">
          <!-- Source Information (Contextual awareness) -->
          <div v-if="sourceLabel" class="flex flex-col gap-sm">
            <label class="font-label text-label-md text-on-surface-variant">来源</label>
            <div class="flex items-center gap-sm px-md py-sm rounded-lg bg-surface-container-low border border-surface-variant">
              <div class="w-8 h-8 rounded-full bg-[rgba(7,193,96,0.1)] flex items-center justify-center shrink-0">
                <span
                  class="material-symbols-outlined text-[#07C160] text-[18px]"
                  style="font-variation-settings: 'FILL' 1;"
                >chat_bubble</span>
              </div>
              <div class="flex-1 min-w-0">
                <input
                  class="w-full bg-transparent border-none p-0 focus:ring-0 font-body text-body-sm text-on-surface truncate cursor-default"
                  readonly
                  type="text"
                  :value="sourceLabel"
                />
              </div>
              <a
                class="text-primary hover:text-primary-container font-label text-label-sm flex items-center gap-xs whitespace-nowrap transition-colors"
                href="#"
              >
                查看原文
                <span class="material-symbols-outlined text-[14px]">open_in_new</span>
              </a>
            </div>
          </div>

          <!-- Task Title -->
          <div class="flex flex-col gap-sm">
            <label class="font-label text-label-md text-on-surface" for="task-content">任务内容</label>
            <textarea
              id="task-content"
              v-model="taskContent"
              class="w-full border border-outline-variant rounded-lg px-md py-sm font-body text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none placeholder:text-outline"
              placeholder="输入任务名称..."
              rows="2"
            ></textarea>
          </div>

          <!-- Contextual Details (Extracted from source) -->
          <div class="flex flex-col gap-sm">
            <div class="flex items-center justify-between">
              <label class="font-label text-label-md text-on-surface-variant" for="task-notes">备注细节</label>
              <span class="font-label text-label-sm text-primary bg-primary/10 px-2 py-0.5 rounded text-[10px] uppercase tracking-wider">自动提取</span>
            </div>
            <textarea
              id="task-notes"
              v-model="notes"
              class="w-full border border-surface-variant rounded-lg px-md py-sm font-body text-body-sm text-on-surface-variant bg-surface-container-lowest focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all resize-none placeholder:text-outline"
              placeholder="添加备注..."
              rows="3"
            ></textarea>
          </div>

          <!-- Meta row: Deadline and Priority -->
          <div class="flex flex-col sm:flex-row gap-lg">
            <!-- Deadline -->
            <div class="flex flex-col gap-sm flex-1">
              <label class="font-label text-label-md text-on-surface">截止时间</label>
              <div class="relative group cursor-pointer">
                <span class="material-symbols-outlined absolute left-md top-1/2 -translate-y-1/2 text-on-surface-variant group-hover:text-primary transition-colors pointer-events-none">calendar_month</span>
                <input
                  v-model="deadline"
                  class="w-full border border-outline-variant rounded-lg pl-[44px] pr-md py-sm font-body text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all cursor-pointer hover:border-outline"
                  type="datetime-local"
                />
              </div>
            </div>
            <!-- Priority -->
            <div class="flex flex-col gap-sm flex-1">
              <label class="font-label text-label-md text-on-surface">优先级</label>
              <div class="relative">
                <select
                  v-model="priority"
                  class="w-full border border-outline-variant rounded-lg px-md py-sm font-body text-body-md text-on-surface bg-surface focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-all appearance-none pr-10"
                >
                  <option :value="2">高优先级</option>
                  <option :value="1">普通优先级</option>
                  <option :value="0">低优先级</option>
                </select>
                <span class="material-symbols-outlined absolute right-md top-1/2 -translate-y-1/2 text-on-surface-variant pointer-events-none">expand_more</span>
              </div>
            </div>
          </div>

          <!-- Reminder Settings (only show when deadline is set) -->
          <div v-if="deadline" class="flex flex-col gap-md p-md rounded-xl bg-surface-container-low border border-surface-variant">
            <div class="flex items-center gap-sm">
              <span class="material-symbols-outlined text-primary text-body-md">alarm</span>
              <span class="font-label text-label-md text-on-surface">提醒设置</span>
            </div>

            <!-- Quick reminder presets -->
            <div class="flex flex-col gap-sm">
              <span class="font-label text-label-sm text-on-surface-variant">提醒时间</span>
              <div class="flex flex-wrap gap-sm">
                <button
                  v-for="preset in reminderPresets"
                  :key="preset.minutes"
                  type="button"
                  class="inline-flex items-center gap-xs px-md py-xs rounded-full text-label-sm transition-all duration-200 cursor-pointer border"
                  :class="isReminderPresetActive(preset.minutes)
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:border-primary hover:text-primary'"
                  @click="setReminderPreset(preset.minutes)"
                >
                  <span class="material-symbols-outlined text-body-sm">schedule</span>
                  {{ preset.label }}
                </button>
              </div>
            </div>

            <!-- Notification channels -->
            <div v-if="reminderMinutesBefore" class="flex flex-col gap-sm">
              <span class="font-label text-label-sm text-on-surface-variant">提醒方式</span>
              <div class="flex flex-wrap gap-sm">
                <button
                  v-for="ch in channelOptions"
                  :key="ch.value"
                  type="button"
                  class="inline-flex items-center gap-xs px-md py-xs rounded-full text-label-sm transition-all duration-200 cursor-pointer border"
                  :class="isChannelActive(ch.value)
                    ? 'bg-primary text-on-primary border-primary'
                    : 'bg-surface-container-lowest text-on-surface-variant border-outline-variant hover:border-primary hover:text-primary'"
                  @click="toggleChannel(ch.value)"
                >
                  <span class="material-symbols-outlined !text-[16px]">{{ ch.icon }}</span>
                  {{ ch.label }}
                </button>
              </div>
            </div>

            <!-- Reminder summary -->
            <div v-if="reminderMinutesBefore && selectedChannels.length > 0" class="flex items-center gap-xs text-label-sm text-secondary bg-secondary/10 px-md py-xs rounded-lg">
              <span class="material-symbols-outlined !text-[16px]">check_circle</span>
              <span>将在截止前 {{ reminderMinutesBefore < 60 ? reminderMinutesBefore + '分钟' : reminderMinutesBefore < 1440 ? (reminderMinutesBefore / 60) + '小时' : (reminderMinutesBefore / 1440) + '天' }} 通过 {{ selectedChannels.length }} 种方式提醒您</span>
            </div>
          </div>
        </div>

        <!-- Footer Actions -->
        <div class="px-lg py-md border-t border-surface-variant bg-surface-container-lowest flex items-center justify-between">
          <div class="flex items-center gap-sm">
            <button class="text-on-surface-variant hover:text-primary hover:bg-surface-container p-sm rounded-full transition-colors" title="添加附件">
              <span class="material-symbols-outlined block text-[20px]">attach_file</span>
            </button>
            <button class="text-on-surface-variant hover:text-primary hover:bg-surface-container p-sm rounded-full transition-colors" title="添加标签">
              <span class="material-symbols-outlined block text-[20px]">label</span>
            </button>
          </div>
          <div class="flex items-center gap-sm">
            <button
              class="px-md py-2 rounded-lg font-label text-label-md text-on-surface-variant hover:bg-surface-container-low transition-colors"
              @click="close"
            >
              取消
            </button>
            <button
              class="px-lg py-2 rounded-lg font-label text-label-md bg-primary text-on-primary hover:bg-primary/90 hover:shadow-md transition-all active:scale-[0.98]"
              :disabled="!taskContent.trim() || submitting"
              :class="{ 'opacity-60 cursor-not-allowed': !taskContent.trim() || submitting }"
              @click="createTask"
            >
              {{ submitting ? '创建中...' : '创建任务' }}
            </button>
          </div>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<style scoped>
@keyframes scale-in {
  0% {
    opacity: 0;
    transform: scale(0.95);
  }
  100% {
    opacity: 1;
    transform: scale(1);
  }
}

.animate-scale-in {
  animation: scale-in 0.2s ease-out;
}

/* Custom scrollbar for textareas */
textarea::-webkit-scrollbar {
  width: 8px;
}
textarea::-webkit-scrollbar-track {
  background: transparent;
}
textarea::-webkit-scrollbar-thumb {
  background-color: #c2c6d6;
  border-radius: 4px;
}
</style>
