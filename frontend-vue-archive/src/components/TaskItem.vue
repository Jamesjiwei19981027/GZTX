<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { ElMessage, ElMessageBox } from 'element-plus'
import dayjs from 'dayjs'
import { relativeTime } from '@/utils/date'
import type { Task } from '@/types'

const props = withDefaults(
  defineProps<{
    task: Task
    selectable?: boolean
    selected?: boolean
  }>(),
  {
    selectable: true,
    selected: false,
  },
)

const emit = defineEmits<{
  (e: 'click', task: Task): void
  (e: 'complete', task: Task): void
  (e: 'select', task: Task): void
}>()

const router = useRouter()
const taskStore = useTaskStore()

const isCompleted = computed(() => props.task.status === 2)
const isOverdue = computed(() => props.task.is_overdue && !isCompleted.value)
const needsFollowUp = computed(() => props.task.needs_follow_up === true)

// ─── Live Countdown Timer ──────────────────────────────────────────────────────
const now = ref(Date.now())
let countdownInterval: ReturnType<typeof setInterval> | null = null

const nextReminderCountdown = computed(() => {
  // Force reactivity on every tick
  const _tick = now.value
  if (isCompleted.value) return null
  const reminders = props.task.reminders
  if (!reminders || reminders.length === 0) return null

  // Pick the earliest unsent reminder whose remind_at is in the future
  const sorted = [...reminders]
    .filter((r) => !r.is_sent && r.remind_at)
    .sort((a, b) => dayjs(a.remind_at).valueOf() - dayjs(b.remind_at).valueOf())

  const next = sorted[0]
  if (!next) return null

  const diffSeconds = dayjs(next.remind_at).diff(dayjs(), 'second')
  if (diffSeconds < 0) return null

  const days = Math.floor(diffSeconds / 86400)
  const hours = Math.floor((diffSeconds % 86400) / 3600)
  const minutes = Math.floor((diffSeconds % 3600) / 60)
  const seconds = diffSeconds % 60
  const timeStr = `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
  return days > 0 ? `${days}天 ${timeStr}` : timeStr
})

const channelIconMap: Record<string, { icon: string; label: string }> = {
  web_push: { icon: 'notifications_active', label: '网页弹窗' },
  web_popup: { icon: 'notifications_active', label: '网页弹窗' },
  email: { icon: 'mail', label: '邮件' },
  wx: { icon: 'chat', label: '微信' },
  wechat: { icon: 'chat', label: '微信' },
  sms: { icon: 'sms', label: '短信' },
  desktop: { icon: 'alarm', label: '闹钟' },
  alarm: { icon: 'alarm', label: '闹钟' },
}

const reminderChannels = computed(() => {
  if (!props.task.reminders || props.task.reminders.length === 0) return []
  const channelSet = new Set<string>()
  props.task.reminders.forEach((r) => {
    if (r.notify_channels) {
      r.notify_channels.split(',').filter(Boolean).forEach((ch) => channelSet.add(ch))
    }
  })
  return Array.from(channelSet).map((ch) => ({
    key: ch,
    ...(channelIconMap[ch] || { icon: 'notifications', label: ch }),
  }))
})

const priorityBorderColor = computed(() => {
  switch (props.task.priority) {
    case 2:
      return 'border-t-error'
    case 1:
      return 'border-t-tertiary'
    default:
      return 'border-t-primary'
  }
})

const priorityBadgeClasses = computed(() => {
  switch (props.task.priority) {
    case 2:
      return 'bg-[#ffdad6] text-[#410002]'
    case 1:
      return 'bg-[#f5e0c6] text-[#2a1800]'
    default:
      return 'bg-[#d3e3fd] text-[#003258]'
  }
})

const priorityLabelMap: Record<number, string> = { 0: '低', 1: '中', 2: '高' }
const priorityLabel = computed(
  () => props.task.priority_label ?? priorityLabelMap[props.task.priority] ?? '中',
)

const dueDateDisplay = computed(() => {
  if (!props.task.due_date) return null
  return relativeTime(props.task.due_date)
})

const dueDateFormatted = computed(() => {
  if (!props.task.due_date) return null
  const d = dayjs(props.task.due_date)
  return d.format('MM/DD HH:mm')
})

// ─── Popup Menu State ──────────────────────────────────────────────────────────
const showMenu = ref(false)
const menuX = ref(0)
const menuY = ref(0)

function openMenu(event: MouseEvent) {
  event.stopPropagation()
  event.preventDefault()
  menuX.value = event.clientX
  menuY.value = event.clientY
  showMenu.value = true
}

function closeMenu() {
  showMenu.value = false
}

function handleClickOutside(e: MouseEvent) {
  if (showMenu.value) {
    showMenu.value = false
  }
}

function handleEscKey(e: KeyboardEvent) {
  if (e.key === 'Escape' && showMenu.value) {
    showMenu.value = false
  }
}

// ─── Menu Actions ──────────────────────────────────────────────────────────────
async function handleMenuAction(action: string) {
  closeMenu()
  const taskId = props.task.id

  if (action === 'restore') {
    try {
      await taskStore.markUncomplete(taskId)
      ElMessage.success('已恢复为未完成')
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
    } catch { /* cancelled */ }
  } else if (action === 'pending') {
    try {
      await taskStore.markUncomplete(taskId)
      ElMessage.success('已设为继续待办')
    } catch {
      ElMessage.error('操作失败')
    }
  } else if (action === 'complete') {
    if (props.task.status === 2) {
      ElMessage.info('任务已完成')
      return
    }
    emit('complete', props.task)
  } else if (action === 'edit') {
    router.push(`/tasks/${taskId}`)
  }
}

function handleClick() {
  emit('click', props.task)
}

function handleComplete(e: Event) {
  e.stopPropagation()
  emit('complete', props.task)
}

function handleSelect(e: Event) {
  e.stopPropagation()
  emit('select', props.task)
}

onMounted(() => {
  document.addEventListener('click', handleClickOutside)
  document.addEventListener('keydown', handleEscKey)
  countdownInterval = setInterval(() => {
    now.value = Date.now()
  }, 1000)
})

onBeforeUnmount(() => {
  document.removeEventListener('click', handleClickOutside)
  document.removeEventListener('keydown', handleEscKey)
  if (countdownInterval) {
    clearInterval(countdownInterval)
    countdownInterval = null
  }
})
</script>

<style scoped>
.menu-enter {
  animation: menuFadeIn 0.15s ease-out;
}
@keyframes menuFadeIn {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
</style>

<template>
  <div
    class="group relative flex flex-col rounded-2xl bg-surface-container-lowest border border-outline-variant/30 border-t-[4px] p-4 cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-primary/8 hover:-translate-y-0.5 h-full"
    :class="[
      priorityBorderColor,
      { 'opacity-60': isCompleted },
      { 'bg-error/[0.03]': isOverdue },
    ]"
    @click="handleClick"
  >
    <!-- Top Row: Checkbox + Priority Badge + Menu -->
    <div class="flex items-center justify-between mb-2">
      <!-- Checkbox -->
      <div v-if="selectable" @click.stop>
        <button
          class="relative w-5 h-5 rounded-md border-2 transition-all duration-150 flex items-center justify-center"
          :class="
            isCompleted || selected
              ? 'bg-secondary border-secondary'
              : 'border-outline/50 hover:border-primary'
          "
          @click="handleComplete"
        >
          <span
            v-if="isCompleted || selected"
            class="material-symbols-outlined text-on-secondary text-sm leading-none"
          >
            check
          </span>
        </button>
      </div>
      <div v-else />

      <!-- Right: Priority + Menu -->
      <div class="flex items-center gap-2">
        <!-- Priority Badge -->
        <span
          class="inline-flex items-center rounded-full px-4 py-1.5 font-label text-[16px] leading-tight font-bold tracking-wide"
          :class="priorityBadgeClasses"
        >
          {{ priorityLabel }}
        </span>

        <!-- Overflow Menu -->
        <button
          class="w-7 h-7 rounded-full flex items-center justify-center text-on-surface-variant/40 transition opacity-0 group-hover:opacity-100 hover:bg-surface-variant/30 hover:text-on-surface-variant"
          @click.stop="openMenu($event)"
        >
          <span class="material-symbols-outlined text-lg">more_vert</span>
        </button>
      </div>
    </div>

    <!-- Title -->
    <h3
      class="font-headline text-headline-sm text-on-surface leading-snug mb-1.5 line-clamp-2"
      :class="{ 'line-through opacity-50': isCompleted }"
    >
      {{ task.title }}
    </h3>

    <!-- Description Preview (2 lines max) -->
    <p
      v-if="task.description"
      class="text-body-sm text-on-surface-variant font-body leading-relaxed mb-3 line-clamp-2 flex-grow-0"
    >
      {{ task.description }}
    </p>
    <!-- Spacer to push bottom content down -->
    <div v-else class="flex-grow" />

    <!-- Tags Row -->
    <div class="flex items-center flex-wrap gap-1.5 mb-3">
      <!-- Follow-up flag -->
      <span
        v-if="needsFollowUp"
        class="inline-flex items-center gap-1 rounded-full bg-[#f5e0c6] px-2 py-0.5 font-label text-[10px] text-[#2a1800]"
        title="需要跟进"
      >
        <span class="w-1.5 h-1.5 rounded-full bg-[#e8a000]" />
        跟进
      </span>

      <!-- Category -->
      <span
        v-if="task.category"
        class="inline-flex items-center gap-1 rounded-full bg-surface-container-high/80 px-2 py-0.5 font-label text-[10px] text-on-surface-variant"
      >
        <span
          class="w-1.5 h-1.5 rounded-full flex-shrink-0"
          :style="{ backgroundColor: task.category.color }"
        />
        {{ task.category.name }}
      </span>

      <!-- Tags -->
      <span
        v-for="tag in task.tags.slice(0, 3)"
        :key="tag.name"
        class="inline-flex items-center gap-1 rounded-full bg-surface-container-high/80 px-2 py-0.5 font-label text-[10px] text-on-surface-variant"
      >
        <span
          class="w-1.5 h-1.5 rounded-full flex-shrink-0"
          :style="{ backgroundColor: tag.color }"
        />
        {{ tag.name }}
      </span>
      <span
        v-if="task.tags.length > 3"
        class="inline-flex items-center rounded-full bg-surface-container-high/80 px-2 py-0.5 font-label text-[10px] text-on-surface-variant/60"
      >
        +{{ task.tags.length - 3 }}
      </span>
    </div>

    <!-- Bottom Section: Channels + Countdown -->
    <div class="flex items-center justify-between mt-auto pt-2 border-t border-outline-variant/20">
      <!-- Notification channels -->
      <div
        v-if="reminderChannels.length > 0"
        class="flex items-center gap-1 flex-wrap"
      >
        <span
          v-for="ch in reminderChannels"
          :key="ch.key"
          class="inline-flex items-center gap-0.5 rounded-full bg-primary/8 px-1.5 py-0.5 font-label text-[9px] text-primary/70"
          :title="ch.label"
        >
          <span class="material-symbols-outlined text-[11px]" style="font-variation-settings: 'FILL' 1;">{{ ch.icon }}</span>
          {{ ch.label }}
        </span>
      </div>
      <div v-else />

      <!-- Countdown -->
      <div
        v-if="nextReminderCountdown"
        class="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-1 font-body text-[11px] tabular-nums font-medium text-primary"
      >
        <span class="material-symbols-outlined text-xs" style="font-variation-settings: 'FILL' 1;">timer</span>
        {{ nextReminderCountdown }}
      </div>
    </div>

    <!-- Popup Menu (Teleported to body) -->
    <Teleport to="body">
      <div
        v-if="showMenu"
        class="fixed z-[9999] menu-enter"
        :style="{ left: menuX + 'px', top: menuY + 'px' }"
        @click.stop
      >
        <div class="bg-white border border-gray-200 rounded-xl shadow-2xl py-1.5 min-w-[160px] overflow-hidden">
          <div class="px-3 py-1.5 text-[10px] text-gray-400 font-medium uppercase tracking-wider border-b border-gray-100 mb-1">
            {{ task.title.length > 12 ? task.title.slice(0, 12) + '...' : task.title }}
          </div>
          <button
            v-if="task.status === 2"
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
            @click="handleMenuAction('restore')"
          >
            <span class="material-symbols-outlined text-[18px] text-gray-400">undo</span>
            <span class="font-medium">恢复</span>
          </button>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
            @click="handleMenuAction('edit')"
          >
            <span class="material-symbols-outlined text-[18px] text-gray-400">edit</span>
            <span class="font-medium">修改</span>
          </button>
          <button
            v-if="task.status !== 2"
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-green-600 hover:bg-green-50 transition-colors text-left"
            @click="handleMenuAction('complete')"
          >
            <span class="material-symbols-outlined text-[18px]">check_circle</span>
            <span class="font-medium">完成</span>
          </button>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50 transition-colors text-left"
            @click="handleMenuAction('pending')"
          >
            <span class="material-symbols-outlined text-[18px] text-gray-400">radio_button_unchecked</span>
            <span class="font-medium">继续待办</span>
          </button>
          <div class="border-t border-gray-100 my-1"></div>
          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-sm text-red-500 hover:bg-red-50 transition-colors text-left"
            @click="handleMenuAction('delete')"
          >
            <span class="material-symbols-outlined text-[18px]">delete</span>
            <span class="font-medium">删除</span>
          </button>
        </div>
      </div>
    </Teleport>
  </div>
</template>
