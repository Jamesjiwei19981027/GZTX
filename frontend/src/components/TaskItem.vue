<script setup lang="ts">
import { computed } from 'vue'
import type { Task } from '@/types'
import { relativeTime } from '@/utils/date'
import { ElCheckbox, ElTag, ElText } from 'element-plus'

const props = defineProps<{
  task: Task
  selectable?: boolean
  selected?: boolean
}>()

const emit = defineEmits<{
  (e: 'click', task: Task): void
  (e: 'complete', task: Task): void
  (e: 'select', task: Task): void
}>()

const priorityType = computed(() => {
  switch (props.task.priority) {
    case 2: return 'danger'
    case 1: return 'warning'
    default: return 'info'
  }
})

const priorityLabel = computed(() => {
  switch (props.task.priority) {
    case 2: return '高'
    case 1: return '中'
    default: return '低'
  }
})

const dueDateDisplay = computed(() => {
  if (!props.task.due_date) return null
  return relativeTime(props.task.due_date)
})

const isOverdue = computed(() => {
  return props.task.is_overdue && props.task.status !== 2
})

const isCompleted = computed(() => props.task.status === 2)

function handleComplete() {
  emit('complete', props.task)
}

function handleClick() {
  emit('click', props.task)
}

function handleSelect() {
  emit('select', props.task)
}
</script>

<template>
  <div
    class="task-item"
    :class="{ 'is-overdue': isOverdue, 'is-completed': isCompleted }"
    @click="handleClick"
  >
    <ElCheckbox
      v-if="selectable"
      :model-value="selected"
      @click.stop
      @change="handleSelect"
    />
    <div class="task-content">
      <div class="task-header">
        <span class="task-title" :class="{ 'is-completed': isCompleted }">
          {{ task.title }}
        </span>
        <ElTag :type="priorityType" size="small">{{ priorityLabel }}</ElTag>
      </div>

      <div v-if="task.description" class="task-description">
        <ElText truncated>{{ task.description }}</ElText>
      </div>

      <div class="task-meta">
        <span v-if="task.category" class="task-category">
          {{ task.category.name }}
        </span>
        <span v-if="dueDateDisplay" class="task-due-date" :class="{ 'is-overdue': isOverdue }">
          {{ isOverdue ? '已过期 ' : '' }}{{ dueDateDisplay }}
        </span>
        <span v-for="tag in task.tags" :key="tag.id" class="task-tag">
          <ElTag size="small" :color="tag.color" effect="dark">{{ tag.name }}</ElTag>
        </span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.task-item {
  display: flex;
  align-items: flex-start;
  padding: 12px 16px;
  background: var(--el-fill-color-light);
  border-radius: 8px;
  cursor: pointer;
  transition: all 0.2s;
  gap: 12px;
}

.task-item:hover {
  background: var(--el-fill-color);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.task-item.is-overdue {
  border-left: 3px solid var(--el-color-danger);
}

.task-item.is-completed {
  opacity: 0.6;
}

.task-content {
  flex: 1;
  min-width: 0;
}

.task-header {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 4px;
}

.task-title {
  font-size: 14px;
  font-weight: 500;
  color: var(--el-text-color-primary);
}

.task-title.is-completed {
  text-decoration: line-through;
  color: var(--el-text-color-secondary);
}

.task-description {
  font-size: 12px;
  color: var(--el-text-color-secondary);
  margin-bottom: 6px;
}

.task-meta {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  font-size: 12px;
}

.task-category {
  color: var(--el-text-color-secondary);
}

.task-due-date {
  color: var(--el-text-color-secondary);
}

.task-due-date.is-overdue {
  color: var(--el-color-danger);
}

.task-tag {
  display: flex;
}
</style>