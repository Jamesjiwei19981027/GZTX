<script setup lang="ts">
import { ref, onMounted } from 'vue'
import type { Category } from '@/types'
import { getCategoryList, createCategory } from '@/api/categories'
import { ElSelect, ElOption, ElDialog, ElForm, ElFormItem, ElInput, ElColorPicker, ElButton } from 'element-plus'
import { Plus } from '@element-plus/icons-vue'

const props = defineProps<{
  value?: number
}>()

const emit = defineEmits<{
  (e: 'change', value: number | undefined): void
}>()

const categories = ref<Category[]>([])
const loading = ref(false)
const showCreateDialog = ref(false)

const newCategory = ref({
  name: '',
  color: '#409EFF'
})

// 加载分类列表
async function loadCategories() {
  loading.value = true
  try {
    const response = await getCategoryList()
    categories.value = response
  } finally {
    loading.value = false
  }
}

function handleChange(value: number | undefined) {
  emit('change', value)
}

async function handleCreateCategory() {
  if (!newCategory.value.name.trim()) return

  try {
    const created = await createCategory({
      name: newCategory.value.name,
      color: newCategory.value.color
    })
    categories.value.push(created)
    emit('change', created.id)
    showCreateDialog.value = false
    newCategory.value = { name: '', color: '#409EFF' }
  } catch {
    // error handled by api
  }
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
      style="width: 100%"
      @update:model-value="handleChange"
    >
      <ElOption
        v-for="category in categories"
        :key="category.id"
        :label="category.name"
        :value="category.id"
      >
        <div class="category-option">
          <span class="category-color" :style="{ backgroundColor: category.color }"></span>
          <span>{{ category.name }}</span>
          <span class="task-count">({{ category.task_count }})</span>
        </div>
      </ElOption>
      <template #append>
        <ElButton text :icon="Plus" @click.stop="showCreateDialog = true" />
      </template>
    </ElSelect>

    <ElDialog v-model="showCreateDialog" title="创建分类" width="300px">
      <ElForm :model="newCategory" label-position="top">
        <ElFormItem label="分类名称">
          <ElInput v-model="newCategory.name" placeholder="请输入分类名称" />
        </ElFormItem>
        <ElFormItem label="颜色">
          <ElColorPicker v-model="newCategory.color" />
        </ElFormItem>
      </ElForm>
      <template #footer>
        <ElButton @click="showCreateDialog = false">取消</ElButton>
        <ElButton type="primary" @click="handleCreateCategory">创建</ElButton>
      </template>
    </ElDialog>
  </div>
</template>

<style scoped>
.category-option {
  display: flex;
  align-items: center;
  gap: 8px;
}

.category-color {
  width: 12px;
  height: 12px;
  border-radius: 2px;
}

.task-count {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}
</style>