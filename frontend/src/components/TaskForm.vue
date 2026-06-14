<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import type { Task, CreateTaskRequest, Category, Tag, CreateReminderRequest } from '@/types'
import { ElForm, ElFormItem, ElInput, ElSelect, ElOption, ElDatePicker, ElSwitch, ElButton, ElCard } from 'element-plus'
import CategoryPicker from './CategoryPicker.vue'
import ReminderSetting from './ReminderSetting.vue'
import { useTaskStore } from '@/stores/task'

const props = defineProps<{
  task?: Task
  visible?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', data: CreateTaskRequest): void
  (e: 'cancel'): void
}>()

const taskStore = useTaskStore()
const loading = ref(false)

const formData = ref<CreateTaskRequest>({
  title: '',
  description: '',
  priority: 1,
  category_id: undefined,
  tag_ids: [],
  due_date: undefined,
  reminders: [],
  is_recurring: false
})

const isEdit = computed(() => !!props.task)

// 监听 props.task 变化，当编辑时填充表单
watch(
  () => props.task,
  (task) => {
    if (task) {
      formData.value = {
        title: task.title,
        description: task.description || '',
        priority: task.priority,
        category_id: task.category?.id,
        tag_ids: task.tags.map(t => t.id),
        due_date: task.due_date,
        reminders: task.reminders.map(r => ({
          remind_at: r.remind_at,
          remind_type: r.remind_type
        })),
        is_recurring: task.is_recurring
      }
    } else {
      resetForm()
    }
  },
  { immediate: true }
)

function resetForm() {
  formData.value = {
    title: '',
    description: '',
    priority: 1,
    category_id: undefined,
    tag_ids: [],
    due_date: undefined,
    reminders: [],
    is_recurring: false
  }
}

async function handleSubmit() {
  if (!formData.value.title.trim()) return

  loading.value = true
  try {
    emit('submit', formData.value)
  } finally {
    loading.value = false
  }
}

function handleCancel() {
  emit('cancel')
}

function handleCategoryChange(categoryId: number | undefined) {
  formData.value.category_id = categoryId
}

function handleReminderChange(reminders: CreateReminderRequest[]) {
  formData.value.reminders = reminders
}
</script>

<template>
  <ElCard class="task-form">
    <template #header>
      <div class="form-header">
        <span>{{ isEdit ? '编辑任务' : '新建任务' }}</span>
      </div>
    </template>

    <ElForm
      :model="formData"
      label-position="top"
      @submit.prevent="handleSubmit"
    >
      <ElFormItem label="任务标题" required>
        <ElInput
          v-model="formData.title"
          placeholder="请输入任务标题"
          maxlength="100"
          show-word-limit
        />
      </ElFormItem>

      <ElFormItem label="任务描述">
        <ElInput
          v-model="formData.description"
          type="textarea"
          placeholder="请输入任务描述（可选）"
          maxlength="500"
          :rows="3"
        />
      </ElFormItem>

      <ElFormItem label="优先级">
        <ElSelect v-model="formData.priority" style="width: 100%">
          <ElOption :value="2" label="高优先级" />
          <ElOption :value="1" label="中优先级" />
          <ElOption :value="0" label="低优先级" />
        </ElSelect>
      </ElFormItem>

      <ElFormItem label="分类">
        <CategoryPicker
          :value="formData.category_id"
          @change="handleCategoryChange"
        />
      </ElFormItem>

      <ElFormItem label="截止日期">
        <ElDatePicker
          v-model="formData.due_date"
          type="datetime"
          placeholder="选择截止日期"
          style="width: 100%"
          format="YYYY-MM-DD HH:mm"
          value-format="YYYY-MM-DDTHH:mm:ss"
        />
      </ElFormItem>

      <ElFormItem label="提醒设置">
        <ReminderSetting
          :reminders="formData.reminders || []"
          :due-date="formData.due_date"
          @change="handleReminderChange"
        />
      </ElFormItem>

      <ElFormItem>
        <div class="form-actions">
          <ElButton @click="handleCancel">取消</ElButton>
          <ElButton type="primary" :loading="loading" native-type="submit">
            {{ isEdit ? '保存' : '创建' }}
          </ElButton>
        </div>
      </ElFormItem>
    </ElForm>
  </ElCard>
</template>

<style scoped>
.task-form {
  max-width: 600px;
  margin: 0 auto;
}

.form-header {
  font-size: 16px;
  font-weight: 500;
}

.form-actions {
  display: flex;
  justify-content: flex-end;
  gap: 12px;
  width: 100%;
}
</style>