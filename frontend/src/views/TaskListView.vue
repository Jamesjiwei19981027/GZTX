<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { ElPagination } from 'element-plus'
import TaskItem from '@/components/TaskItem.vue'

const router = useRouter()
const taskStore = useTaskStore()

const searchQuery = ref('')
const activeTab = ref<'all' | 0 | 1 | 2>('all')
const needsFollowUp = ref(false)

const tasks = computed(() => taskStore.tasks)
const pagination = computed(() => taskStore.pagination)
const loading = computed(() => taskStore.loading)
const totalTasks = computed(() => taskStore.pagination.total)

const statusTabs = [
  { key: 'all' as const, label: '全部' },
  { key: 0 as const, label: '待办' },
  { key: 1 as const, label: '进行中' },
  { key: 2 as const, label: '已完成' },
]

function buildFilterParams(page = 1): Record<string, unknown> {
  const params: Record<string, unknown> = {
    page,
    page_size: pagination.value.page_size,
  }
  if (activeTab.value !== 'all') {
    params.status = activeTab.value
  }
  if (searchQuery.value.trim()) {
    params.search = searchQuery.value.trim()
  }
  if (needsFollowUp.value) {
    params.needs_follow_up = true
  }
  return params
}

function applyFilters() {
  taskStore.fetchTasks(buildFilterParams(1) as never)
}

function handleTabChange(key: 'all' | 0 | 1 | 2) {
  activeTab.value = key
  applyFilters()
}

function toggleFollowUp() {
  needsFollowUp.value = !needsFollowUp.value
  applyFilters()
}

let searchTimer: ReturnType<typeof setTimeout> | null = null
watch(searchQuery, () => {
  if (searchTimer) clearTimeout(searchTimer)
  searchTimer = setTimeout(() => {
    applyFilters()
  }, 300)
})

function handlePageChange(page: number) {
  taskStore.fetchTasks(buildFilterParams(page) as never)
}

function handleCreate() {
  router.push({ name: 'TaskCreate' })
}

function handleTaskClick(taskId: number) {
  router.push(`/tasks/${taskId}`)
}

function handleTaskComplete(task: { id: number }) {
  taskStore.markComplete(task.id)
}

onMounted(() => {
  taskStore.fetchTasks()
})
</script>

<template>
  <div class="flex flex-col h-full bg-surface-container-low">
    <!-- Top App Bar -->
    <div class="h-16 bg-surface border-b border-surface-variant flex items-center justify-between px-lg flex-shrink-0">
      <!-- Left: Title -->
      <h2 class="text-headline-sm text-on-surface font-headline m-0">
        我的任务
      </h2>

      <!-- Center: Search -->
      <div class="relative flex items-center">
        <span class="material-symbols-outlined absolute left-3 text-on-surface-variant text-xl pointer-events-none">
          search
        </span>
        <input
          v-model="searchQuery"
          type="text"
          placeholder="搜索任务..."
          class="rounded-full bg-surface-container-low pl-10 pr-4 py-2 w-64 text-body-md text-on-surface placeholder:text-on-surface-variant/60 outline-none border border-transparent focus:border-primary transition-colors"
        />
      </div>

      <!-- Right: New Task Button -->
      <button
        class="bg-primary text-on-primary rounded-xl px-md py-sm flex items-center gap-sm font-label text-label-md transition hover:opacity-90 active:scale-95"
        @click="handleCreate"
      >
        <span class="material-symbols-outlined text-xl">add</span>
        新建任务
      </button>
    </div>

    <!-- Filter Bar -->
    <div class="px-lg py-md flex items-center gap-md flex-shrink-0">
      <!-- Status Pills -->
      <div class="flex gap-sm">
        <button
          v-for="tab in statusTabs"
          :key="String(tab.key)"
          class="rounded-full px-md py-xs font-label text-label-md transition"
          :class="
            activeTab === tab.key
              ? 'bg-primary text-on-primary'
              : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
          "
          @click="handleTabChange(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Follow-up Toggle -->
      <div class="flex items-center gap-sm">
        <span class="text-label-md text-on-surface-variant font-label">需要跟进</span>
        <button
          class="relative w-11 h-6 rounded-full transition-colors duration-200 flex-shrink-0"
          :class="needsFollowUp ? 'bg-primary' : 'bg-surface-container-high'"
          @click="toggleFollowUp"
        >
          <span
            class="absolute top-0.5 left-0.5 w-5 h-5 rounded-full bg-white shadow-sm transition-transform duration-200"
            :class="{ 'translate-x-5': needsFollowUp }"
          />
        </button>
      </div>
    </div>

    <!-- Task List -->
    <div class="flex-1 overflow-y-auto px-lg pb-lg">
      <!-- Loading State -->
      <div
        v-if="loading"
        class="flex flex-col items-center justify-center py-xl gap-sm"
      >
        <span class="material-symbols-outlined text-5xl text-on-surface-variant animate-spin">
          progress_activity
        </span>
        <span class="text-body-sm text-on-surface-variant">加载中...</span>
      </div>

      <!-- Task Items -->
      <div
        v-else-if="tasks.length > 0"
        class="flex flex-col gap-sm"
      >
        <div
          v-for="task in tasks"
          :key="task.id"
          class="bg-surface-container-lowest border border-surface-variant rounded-xl p-md mb-sm"
        >
          <TaskItem
            :task="task"
            @click="handleTaskClick(task.id)"
            @complete="handleTaskComplete"
          />
        </div>
      </div>

      <!-- Empty State -->
      <div
        v-else
        class="flex flex-col items-center justify-center py-xl gap-md"
      >
        <span class="material-symbols-outlined text-on-surface-variant" style="font-size: 48px;">
          task_alt
        </span>
        <p class="text-body-md text-on-surface-variant m-0">
          {{ searchQuery ? '没有找到匹配的任务，试试其他关键词' : '暂无任务，点击右上角创建你的第一个任务' }}
        </p>
        <button
          v-if="!searchQuery"
          class="bg-primary text-on-primary rounded-xl px-md py-sm flex items-center gap-sm font-label text-label-md transition hover:opacity-90 mt-sm"
          @click="handleCreate"
        >
          <span class="material-symbols-outlined text-xl">add</span>
          新建任务
        </button>
      </div>
    </div>

    <!-- Pagination -->
    <div
      v-if="totalTasks > pagination.page_size"
      class="px-lg py-md border-t border-surface-variant flex-shrink-0 flex items-center justify-center"
    >
      <ElPagination
        :current-page="pagination.page"
        :page-size="pagination.page_size"
        :total="totalTasks"
        layout="prev, pager, next"
        small
        @current-change="handlePageChange"
      />
    </div>
  </div>
</template>

<style scoped>
:deep(.el-pagination) {
  --el-pagination-button-bg-color: transparent;
  --el-pagination-hover-color: var(--color-primary, #0058be);
}

:deep(.el-pagination .is-active) {
  background-color: var(--color-primary, #0058be) !important;
  color: white !important;
  border-radius: 8px;
}

/* Remove default ElPagination inner box shadow */
:deep(.el-pagination button:disabled) {
  background-color: transparent;
}
</style>
