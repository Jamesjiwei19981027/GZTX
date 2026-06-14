<script setup lang="ts">
import { computed } from 'vue'
import dayjs from 'dayjs'
import { relativeTime } from '@/utils/date'

interface Task {
  id: number
  title: string
  description?: string
  priority: 0 | 1 | 2
  priority_label: string
  status: 0 | 1 | 2
  status_label: string
  due_date?: string
  is_overdue: boolean
  category?: { name: string; color: string }
  tags: { name: string; color: string }[]
  needs_follow_up?: boolean
  created_at?: string
}

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

const isCompleted = computed(() => props.task.status === 2)
const isOverdue = computed(() => props.task.is_overdue && !isCompleted.value)
const needsFollowUp = computed(() => props.task.needs_follow_up === true)

const priorityBorderColor = computed(() => {
  switch (props.task.priority) {
    case 2:
      return 'border-l-error'
    case 1:
      return 'border-l-tertiary'
    default:
      return 'border-l-primary'
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

const dueDateDisplay = computed(() => {
  if (!props.task.due_date) return null
  return relativeTime(props.task.due_date)
})

const dueDateFormatted = computed(() => {
  if (!props.task.due_date) return null
  const d = dayjs(props.task.due_date)
  return d.format('MM/DD HH:mm')
})

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
</script>

<template>
  <div
    class="group relative flex items-start gap-0 rounded-xl bg-surface border border-surface-variant border-l-4 p-4 cursor-pointer transition-all duration-200 hover:bg-surface-container-low hover:shadow-card"
    :class="[
      priorityBorderColor,
      { 'opacity-60': isCompleted },
      { 'bg-error/[0.04] hover:bg-error/[0.08]': isOverdue },
    ]"
    @click="handleClick"
  >
    <!-- Priority Border Indicator (the border-l-4 above) -->

    <!-- Checkbox -->
    <div v-if="selectable" class="flex items-center pt-0.5 mr-3" @click.stop>
      <button
        class="relative w-5 h-5 rounded-md border-2 transition-all duration-150 flex items-center justify-center"
        :class="
          isCompleted || selected
            ? 'bg-secondary border-secondary'
            : 'border-outline hover:border-primary'
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

    <!-- Content -->
    <div class="flex-1 min-w-0">
      <!-- Title Row -->
      <div class="flex items-center gap-2 mb-1">
        <span
          class="font-label text-label-md text-on-surface leading-snug"
          :class="{ 'line-through': isCompleted }"
        >
          {{ task.title }}
        </span>

        <!-- Follow-up flag -->
        <span
          v-if="needsFollowUp"
          class="inline-flex items-center gap-0.5 rounded-full bg-[#f5e0c6] px-2 py-0.5 font-label text-[11px] text-[#2a1800]"
          title="需要跟进"
        >
          <span class="material-symbols-outlined text-xs">flag</span>
          跟进
        </span>
      </div>

      <!-- Description Preview -->
      <p
        v-if="task.description"
        class="text-body-sm text-on-surface-variant font-body truncate leading-relaxed mb-2 max-w-[90%]"
      >
        {{ task.description }}
      </p>

      <!-- Meta Row -->
      <div class="flex items-center flex-wrap gap-x-3 gap-y-1">
        <!-- Category -->
        <span
          v-if="task.category"
          class="inline-flex items-center gap-1 rounded-full bg-surface-container-low px-2 py-0.5 font-label text-[11px] text-on-surface-variant"
        >
          <span
            class="w-1.5 h-1.5 rounded-full flex-shrink-0"
            :style="{ backgroundColor: task.category.color }"
          />
          {{ task.category.name }}
        </span>

        <!-- Tags -->
        <span
          v-for="tag in task.tags"
          :key="tag.name"
          class="inline-flex items-center gap-1 rounded-full border border-outline-variant px-2 py-0.5 font-label text-[11px] text-on-surface-variant"
        >
          <span
            class="w-1.5 h-1.5 rounded-full flex-shrink-0"
            :style="{ backgroundColor: tag.color }"
          />
          {{ tag.name }}
        </span>

        <!-- Due Date -->
        <span
          v-if="dueDateDisplay"
          class="inline-flex items-center gap-1 font-body text-[11px]"
          :class="isOverdue ? 'text-error' : 'text-on-surface-variant'"
        >
          <span class="material-symbols-outlined text-xs">
            {{ isOverdue ? 'warning' : 'calendar_today' }}
          </span>
          <span>{{ isOverdue ? '已逾期 ' : '' }}</span>
          <span>{{ dueDateDisplay }}</span>
        </span>
      </div>
    </div>

    <!-- Right Side -->
    <div class="flex items-center gap-2 ml-3 flex-shrink-0">
      <!-- Priority Badge -->
      <span
        class="inline-flex items-center rounded-full px-2.5 py-0.5 font-label text-[11px] leading-tight"
        :class="priorityBadgeClasses"
      >
        {{ task.priority_label }}
      </span>

      <!-- Overflow Menu -->
      <button
        class="w-8 h-8 rounded-full flex items-center justify-center text-on-surface-variant transition opacity-0 group-hover:opacity-100 hover:bg-surface-container-high"
        @click.stop
      >
        <span class="material-symbols-outlined text-xl">more_vert</span>
      </button>
    </div>
  </div>
</template>
