<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import { getCategoryList, createCategory } from '@/api/categories'
import type { Category } from '@/types'
import { ElSelect, ElOption, ElDialog, ElForm, ElFormItem, ElInput, ElColorPicker, ElButton } from 'element-plus'

const props = defineProps<{
  value?: number
}>()

const emit = defineEmits<{
  (e: 'change', value: number | undefined): void
}>()

const categories = ref<Category[]>([])
const loading = ref(false)
const showCreateDialog = ref(false)
const creating = ref(false)

const newCategory = ref({
  name: '',
  color: '#0058be',
  icon: ''
})

const presetColors = [
  '#0058be', '#006c49', '#924700', '#ba1a1a',
  '#6750A4', '#006874', '#4A6267', '#7D5260',
  '#2170e4', '#6cf8bb', '#ffb786', '#ffdad6'
]

// Load categories from API
async function loadCategories() {
  loading.value = true
  try {
    const response = await getCategoryList()
    categories.value = response
  } catch {
    // handled by API interceptor
  } finally {
    loading.value = false
  }
}

// Watch for external value changes
watch(
  () => props.value,
  () => {
    // Value changes are handled by parent
  }
)

function handleChange(val: number | string | boolean | Record<string, any> | undefined) {
  if (val === '__create__') {
    showCreateDialog.value = true
    // Reset to previous value so the select doesn't show __create__
    return
  }
  emit('change', val as number | undefined)
}

async function handleCreateCategory() {
  if (!newCategory.value.name.trim()) return

  creating.value = true
  try {
    const created = await createCategory({
      name: newCategory.value.name.trim(),
      color: newCategory.value.color,
      icon: newCategory.value.icon || undefined
    })
    categories.value.push(created)
    emit('change', created.id)
    showCreateDialog.value = false
    newCategory.value = { name: '', color: '#0058be', icon: '' }
  } catch {
    // handled by API interceptor
  } finally {
    creating.value = false
  }
}

function handleCloseCreate() {
  showCreateDialog.value = false
  newCategory.value = { name: '', color: '#0058be', icon: '' }
}

onMounted(() => {
  loadCategories()
})

defineExpose({
  reload: loadCategories
})
</script>

<template>
  <div class="category-picker">
    <ElSelect
      :model-value="value"
      placeholder="选择分类"
      clearable
      filterable
      style="width: 100%"
      :loading="loading"
      @update:model-value="handleChange"
    >
      <ElOption
        v-for="category in categories"
        :key="category.id"
        :label="category.name"
        :value="category.id"
      >
        <div class="flex items-center gap-sm">
          <span
            class="inline-block w-3 h-3 rounded-full shrink-0 border border-white shadow-sm"
            :style="{ backgroundColor: category.color }"
          ></span>
          <span v-if="category.icon" class="material-symbols-outlined text-body-sm">{{ category.icon }}</span>
          <span class="flex-1 text-body-sm">{{ category.name }}</span>
          <span class="text-label-sm text-on-surface-variant">
            {{ category.task_count }}
          </span>
        </div>
      </ElOption>

      <!-- Create new option -->
      <template #footer>
        <div class="px-sm py-xs border-t border-surface-variant">
          <button
            type="button"
            class="flex items-center gap-sm w-full px-sm py-xs rounded-lg text-primary text-label-md hover:bg-primary-fixed/30 transition-colors cursor-pointer"
            @click.stop="showCreateDialog = true"
          >
            <span class="material-symbols-outlined text-body-md">add_circle</span>
            新建分类
          </button>
        </div>
      </template>
    </ElSelect>

    <!-- Inline creation dialog -->
    <ElDialog
      v-model="showCreateDialog"
      title=""
      width="380px"
      :close-on-click-modal="false"
      :append-to-body="true"
      class="create-category-dialog"
    >
      <template #header>
        <div class="flex items-center gap-md">
          <span class="material-symbols-outlined text-primary text-headline-sm">create_new_folder</span>
          <h3 class="text-headline-sm text-on-surface m-0">新建分类</h3>
        </div>
      </template>

      <ElForm :model="newCategory" label-position="top" @submit.prevent="handleCreateCategory">
        <ElFormItem label="分类名称" required>
          <ElInput
            v-model="newCategory.name"
            placeholder="请输入分类名称"
            maxlength="20"
            show-word-limit
            clearable
            @keydown.enter.prevent="handleCreateCategory"
          >
            <template #prefix>
              <span class="material-symbols-outlined text-outline text-body-sm">label</span>
            </template>
          </ElInput>
        </ElFormItem>

        <ElFormItem label="颜色">
          <div class="flex flex-wrap gap-sm items-center">
            <button
              v-for="color in presetColors"
              :key="color"
              type="button"
              class="w-8 h-8 rounded-full border-2 transition-all duration-200 cursor-pointer hover:scale-110"
              :class="newCategory.color === color ? 'border-on-surface shadow-md scale-110' : 'border-transparent'"
              :style="{ backgroundColor: color }"
              @click="newCategory.color = color"
            />
          </div>
          <div class="flex items-center gap-sm mt-sm">
            <ElColorPicker v-model="newCategory.color" size="small" />
            <span class="text-label-sm text-on-surface-variant">{{ newCategory.color }}</span>
          </div>
        </ElFormItem>

        <ElFormItem label="图标（Material Symbol 名称）">
          <ElInput
            v-model="newCategory.icon"
            placeholder="如: work, home, school"
            clearable
          >
            <template #prefix>
              <span class="material-symbols-outlined text-outline text-body-sm">{{ newCategory.icon || 'category' }}</span>
            </template>
          </ElInput>
        </ElFormItem>

        <!-- Preview -->
        <div class="bg-surface-container-low rounded-xl p-md mt-sm">
          <span class="text-label-sm text-on-surface-variant block mb-xs">预览</span>
          <div class="flex items-center gap-sm">
            <span
              class="inline-block w-3 h-3 rounded-full"
              :style="{ backgroundColor: newCategory.color }"
            ></span>
            <span v-if="newCategory.icon" class="material-symbols-outlined text-body-sm" :style="{ color: newCategory.color }">
              {{ newCategory.icon }}
            </span>
            <span class="text-body-md text-on-surface">
              {{ newCategory.name || '分类名称' }}
            </span>
          </div>
        </div>
      </ElForm>

      <template #footer>
        <div class="flex justify-end gap-md">
          <button type="button" class="btn-ghost" @click="handleCloseCreate">
            取消
          </button>
          <button
            type="button"
            class="btn-primary"
            :disabled="!newCategory.name.trim() || creating"
            @click="handleCreateCategory"
          >
            <span class="material-symbols-outlined text-body-md">
              {{ creating ? 'progress_activity' : 'check' }}
            </span>
            创建
          </button>
        </div>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.category-picker {
  width: 100%;
}

/* Dialog styling */
:deep(.create-category-dialog .el-dialog) {
  border-radius: 16px;
  overflow: hidden;
}

:deep(.create-category-dialog .el-dialog__header) {
  border-bottom: 1px solid #e1e3e4;
  margin-right: 0;
  padding: 16px 24px;
}

:deep(.create-category-dialog .el-dialog__body) {
  padding: 20px 24px;
}

:deep(.create-category-dialog .el-dialog__footer) {
  border-top: 1px solid #e1e3e4;
  padding: 12px 24px;
}

/* Select dropdown footer */
:deep(.el-select-dropdown__footer) {
  padding: 0;
}

/* Disabled button state */
.btn-primary:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

@keyframes spin {
  from { transform: rotate(0deg); }
  to { transform: rotate(360deg); }
}

.btn-primary:disabled .material-symbols-outlined {
  animation: spin 1s linear infinite;
}
</style>
