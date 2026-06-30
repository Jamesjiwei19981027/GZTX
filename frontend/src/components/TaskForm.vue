<script setup lang="ts">
import { ref, computed, watch, nextTick } from 'vue'
import type { Task, CreateTaskRequest, TaskPriority, CreateReminderRequest } from '@/types'
import { ElForm, ElFormItem, ElInput, ElSelect, ElOption, ElDatePicker, ElButton, ElTag } from 'element-plus'
import type { FormInstance, FormRules } from 'element-plus'
import CategoryPicker from './CategoryPicker.vue'
import ReminderSetting from './ReminderSetting.vue'
import { getTagList } from '@/api/tags'
import type { Tag } from '@/types'

const props = defineProps<{
  task?: Task
  visible?: boolean
}>()

const emit = defineEmits<{
  (e: 'submit', data: CreateTaskRequest): void
  (e: 'cancel'): void
}>()

const formRef = ref<FormInstance>()
const loading = ref(false)
const allTags = ref<Tag[]>([])

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

const formRules = computed<FormRules>(() => ({
  title: [
    { required: true, message: '请输入任务标题', trigger: 'blur' },
    { min: 1, max: 100, message: '标题长度在 1 到 100 个字符', trigger: 'blur' }
  ]
}))

const priorityOptions: Array<{ value: TaskPriority; label: string; color: string }> = [
  { value: 0, label: '低', color: '#006c49' },
  { value: 1, label: '中', color: '#924700' },
  { value: 2, label: '高', color: '#ba1a1a' }
]

// Load tags on mount
async function loadTags() {
  try {
    allTags.value = await getTagList()
  } catch {
    // handled by API interceptor
  }
}
loadTags()

// Fill form when editing
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

// Reset form when visible becomes true without a task
watch(
  () => props.visible,
  (val) => {
    if (val && !props.task) {
      nextTick(() => {
        formRef.value?.clearValidate()
      })
    }
  }
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
  nextTick(() => {
    formRef.value?.clearValidate()
  })
}

async function handleSubmit() {
  if (!formRef.value) return

  try {
    await formRef.value.validate()
    loading.value = true
    emit('submit', { ...formData.value })
  } catch {
    // validation failed or submit error
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
  <div class="bg-surface-container-lowest rounded-xl shadow-card border border-surface-variant overflow-hidden">
    <!-- Header -->
    <div class="flex items-center gap-md px-lg py-md border-b border-surface-variant bg-surface-container-low">
      <span class="material-symbols-outlined text-primary text-headline-sm">
        {{ isEdit ? 'edit_note' : 'add_task' }}
      </span>
      <h3 class="text-headline-sm text-on-surface m-0">
        {{ isEdit ? '编辑任务' : '新建任务' }}
      </h3>
    </div>

    <!-- Form body -->
    <div class="p-lg">
      <ElForm
        ref="formRef"
        :model="formData"
        :rules="formRules"
        label-position="top"
        @submit.prevent="handleSubmit"
      >
        <!-- Title -->
        <ElFormItem label="任务标题" prop="title" class="mb-md">
          <ElInput
            v-model="formData.title"
            placeholder="请输入任务标题"
            maxlength="100"
            show-word-limit
            clearable
          >
            <template #prefix>
              <span class="material-symbols-outlined text-outline text-body-sm">title</span>
            </template>
          </ElInput>
        </ElFormItem>

        <!-- Description -->
        <ElFormItem label="任务描述" class="mb-md">
          <ElInput
            v-model="formData.description"
            type="textarea"
            placeholder="请输入任务描述（可选）"
            maxlength="500"
            show-word-limit
            :rows="3"
            :autosize="{ minRows: 3, maxRows: 6 }"
          />
        </ElFormItem>

        <!-- Priority + Category row -->
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-md">
          <ElFormItem label="优先级" class="mb-md">
            <ElSelect v-model="formData.priority" style="width: 100%" placeholder="选择优先级">
              <ElOption
                v-for="opt in priorityOptions"
                :key="opt.value"
                :value="opt.value"
                :label="opt.label"
              >
                <div class="flex items-center gap-sm">
                  <span
                    class="inline-block w-2.5 h-2.5 rounded-full"
                    :style="{ backgroundColor: opt.color }"
                  ></span>
                  <span>{{ opt.label }}</span>
                </div>
              </ElOption>
            </ElSelect>
          </ElFormItem>

          <ElFormItem label="分类" class="mb-md">
            <CategoryPicker
              :value="formData.category_id"
              @change="handleCategoryChange"
            />
          </ElFormItem>
        </div>

        <!-- Due date -->
        <ElFormItem label="截止日期" class="mb-md">
          <ElDatePicker
            v-model="formData.due_date"
            type="datetime"
            placeholder="选择截止日期"
            style="width: 100%"
            format="YYYY-MM-DD HH:mm"
            value-format="YYYY-MM-DDTHH:mm:ss"
          >
            <template #prefix>
              <span class="material-symbols-outlined text-outline text-body-sm">calendar_today</span>
            </template>
          </ElDatePicker>
        </ElFormItem>

        <!-- Tags -->
        <ElFormItem label="标签" class="mb-md">
          <ElSelect
            v-model="formData.tag_ids"
            multiple
            filterable
            placeholder="选择标签"
            style="width: 100%"
            collapse-tags
            collapse-tags-tooltip
          >
            <ElOption
              v-for="tag in allTags"
              :key="tag.id"
              :value="tag.id"
              :label="tag.name"
            >
              <div class="flex items-center gap-sm">
                <span
                  class="inline-block w-2.5 h-2.5 rounded-full"
                  :style="{ backgroundColor: tag.color }"
                ></span>
                <span>{{ tag.name }}</span>
              </div>
            </ElOption>
          </ElSelect>
          <!-- Selected tags preview -->
          <div v-if="formData.tag_ids && formData.tag_ids.length > 0" class="flex flex-wrap gap-xs mt-sm">
            <ElTag
              v-for="tagId in formData.tag_ids"
              :key="tagId"
              closable
              size="small"
              :color="allTags.find(t => t.id === tagId)?.color"
              effect="dark"
              @close="formData.tag_ids = formData.tag_ids!.filter(id => id !== tagId)"
            >
              {{ allTags.find(t => t.id === tagId)?.name }}
            </ElTag>
          </div>
        </ElFormItem>

        <!-- Reminders -->
        <ElFormItem label="提醒设置" class="mb-md">
          <ReminderSetting
            :reminders="formData.reminders || []"
            :due-date="formData.due_date"
            @change="handleReminderChange"
          />
        </ElFormItem>

        <!-- Actions -->
        <ElFormItem class="mb-0">
          <div class="flex justify-end gap-md w-full pt-md border-t border-surface-variant">
            <button
              type="button"
              class="btn-ghost"
              @click="handleCancel"
            >
              <span class="material-symbols-outlined text-body-md">close</span>
              取消
            </button>
            <button
              type="button"
              class="btn-primary"
              :disabled="loading"
              @click="handleSubmit"
            >
              <span class="material-symbols-outlined text-body-md">
                {{ loading ? 'progress_activity' : (isEdit ? 'save' : 'check') }}
              </span>
              {{ isEdit ? '保存修改' : '创建任务' }}
            </button>
          </div>
        </ElFormItem>
      </ElForm>
    </div>
  </div>
</template>

<style scoped>
/* Ensure form items have proper spacing */
:deep(.el-form-item__label) {
  font-weight: 600;
  font-size: 14px;
  color: #424754;
}

:deep(.el-form-item) {
  margin-bottom: 0;
}

/* Smooth loading spinner animation */
@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.btn-primary:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.btn-primary:disabled .material-symbols-outlined {
  animation: spin 1s linear infinite;
}
</style>
