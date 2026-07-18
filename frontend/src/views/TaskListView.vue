<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { useTaskStore } from '@/stores/task'
import { ElPagination, ElMessage } from 'element-plus'
import TaskItem from '@/components/TaskItem.vue'
import TaskDetailDialog from '@/components/TaskDetailDialog.vue'
import TaskCompleteDialog from '@/components/TaskCompleteDialog.vue'

const router = useRouter()
const route = useRoute()
const taskStore = useTaskStore()

const searchQuery = ref('')
const activeTab = ref<'all' | 0 | 1 | 2>('all')
const activePriority = ref<'all' | 0 | 1 | 2>('all')
const needsFollowUp = ref(false)
const dueDateFrom = ref('')
const dueDateTo = ref('')

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

const priorityTabs = [
  { key: 'all' as const, label: '全部' },
  { key: 0 as const, label: '低' },
  { key: 1 as const, label: '中' },
  { key: 2 as const, label: '高' },
]

function buildFilterParams(page = 1): Record<string, unknown> {
  const params: Record<string, unknown> = {
    page,
    page_size: pagination.value.page_size,
  }
  if (activeTab.value !== 'all') {
    params.status = activeTab.value
  }
  if (activePriority.value !== 'all') {
    params.priority = activePriority.value
  }
  if (searchQuery.value.trim()) {
    params.search = searchQuery.value.trim()
  }
  if (needsFollowUp.value) {
    params.needs_follow_up = true
  }
  if (dueDateFrom.value) {
    params.due_date_from = dueDateFrom.value
  }
  if (dueDateTo.value) {
    params.due_date_to = dueDateTo.value
  }
  return params
}

function applyFilters() {
  taskStore.fetchTasks(buildFilterParams(1) as never)
}

function handleTabChange(key: 'all' | 0 | 1 | 2) {
  activeTab.value = key
  dueDateFrom.value = ''
  dueDateTo.value = ''
  applyFilters()
}

function handlePriorityChange(key: 'all' | 0 | 1 | 2) {
  activePriority.value = key
  dueDateFrom.value = ''
  dueDateTo.value = ''
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

// 监听路由 query 参数变化（从仪表板卡片或邮件链接跳转过来）
watch(() => route.query, (query) => {
  const qStatus = query.status
  const qPriority = query.priority
  const qDateFrom = query.due_date_from
  const qDateTo = query.due_date_to
  if (qStatus !== undefined) {
    activeTab.value = Number(qStatus) as 0 | 1 | 2
  } else {
    activeTab.value = 'all'
  }
  if (qPriority !== undefined) {
    activePriority.value = Number(qPriority) as 0 | 1 | 2
  } else {
    activePriority.value = 'all'
  }
  dueDateFrom.value = (typeof qDateFrom === 'string' ? qDateFrom : '') as string
  dueDateTo.value = (typeof qDateTo === 'string' ? qDateTo : '') as string
  applyFilters()
}, { immediate: false })

function handlePageChange(page: number) {
  taskStore.fetchTasks(buildFilterParams(page) as never)
}

function handleCreate() {
  router.push({ name: 'TaskCreate' })
}

// ─── Task Detail Dialog ────────────────────────────────────────────────────────
const showDetailDialog = ref(false)
const selectedTaskId = ref<number | null>(null)
const detailLoading = ref(false)
const detailTask = ref<any>(null)

async function handleTaskClick(taskId: number) {
  selectedTaskId.value = taskId
  detailLoading.value = true
  showDetailDialog.value = true
  try {
    detailTask.value = await taskStore.fetchTaskDetail(taskId)
  } catch {
    ElMessage.error('加载任务详情失败')
    showDetailDialog.value = false
  } finally {
    detailLoading.value = false
  }
}

function handleDetailEdit(task: any) {
  router.push(`/tasks/${task.id}`)
}

async function handleDetailDelete(task: any) {
  try {
    await taskStore.removeTask(task.id)
    showDetailDialog.value = false
    ElMessage.success('任务已删除')
    applyFilters()
  } catch {
    ElMessage.error('删除失败')
  }
}

async function handleDetailUncomplete(task: any) {
  try {
    await taskStore.markUncomplete(task.id)
    showDetailDialog.value = false
    ElMessage.success('已恢复为未完成')
    applyFilters()
  } catch {
    ElMessage.error('操作失败')
  }
}

// ─── Task Complete Dialog ──────────────────────────────────────────────────────
const showCompleteDialog = ref(false)
const completingTaskId = ref<number | null>(null)

function handleTaskComplete(task: { id: number }) {
  completingTaskId.value = task.id
  showCompleteDialog.value = true
}

function handleDetailComplete(task: any) {
  completingTaskId.value = task.id
  showCompleteDialog.value = true
}

async function handleCompleteSubmit(data: import('@/types').TaskCompleteRequest) {
  if (!completingTaskId.value) return
  try {
    await taskStore.markComplete(completingTaskId.value, data)
    showCompleteDialog.value = false
    showDetailDialog.value = false
    if (data.needs_follow_up) {
      ElMessage.success('已标记为跟进任务，将在指定时间提醒您继续跟进')
    } else {
      ElMessage.success('任务已完成')
    }
    applyFilters()
  } catch {
    ElMessage.error('操作失败')
  }
}

onMounted(() => {
  // 读取 URL query 参数初始化筛选（支持从邮件链接跳转）
  const qStatus = route.query.status
  const qPriority = route.query.priority
  const qDateFrom = route.query.due_date_from
  const qDateTo = route.query.due_date_to
  if (qStatus !== undefined) {
    activeTab.value = Number(qStatus) as 0 | 1 | 2
  }
  if (qPriority !== undefined) {
    activePriority.value = Number(qPriority) as 0 | 1 | 2
  }
  if (typeof qDateFrom === 'string') {
    dueDateFrom.value = qDateFrom
  }
  if (typeof qDateTo === 'string') {
    dueDateTo.value = qDateTo
  }
  taskStore.fetchTasks(buildFilterParams() as never)
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
    <div class="px-lg py-md flex items-center gap-md flex-shrink-0 flex-wrap">
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

      <!-- Priority Pills -->
      <div class="flex gap-sm">
        <button
          v-for="tab in priorityTabs"
          :key="String(tab.key)"
          class="rounded-full px-md py-xs font-label text-label-md transition"
          :class="
            activePriority === tab.key
              ? 'bg-tertiary text-on-tertiary'
              : 'border border-outline-variant text-on-surface-variant hover:bg-surface-container-high'
          "
          @click="handlePriorityChange(tab.key)"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Spacer -->
      <div class="flex-1" />

      <!-- Date Range Filter Indicator (from email links) -->
      <div
        v-if="dueDateFrom || dueDateTo"
        class="flex items-center gap-sm bg-tertiary-container text-on-tertiary-container rounded-full px-md py-xs text-label-md"
      >
        <span class="material-symbols-outlined text-base">calendar_today</span>
        <span>{{ dueDateFrom || '...' }} ~ {{ dueDateTo || '...' }}</span>
        <button
          class="material-symbols-outlined text-base hover:opacity-70 transition cursor-pointer"
          @click="dueDateFrom = ''; dueDateTo = ''; applyFilters()"
        >close</button>
      </div>

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

      <!-- Task Items Grid -->
      <div
        v-else-if="tasks.length > 0"
        class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4"
      >
        <TaskItem
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          @click="handleTaskClick(task.id)"
          @complete="handleTaskComplete"
        />
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

    <!-- Task Detail Dialog (opened on card click) -->
    <TaskDetailDialog
      v-model="showDetailDialog"
      :task="detailTask"
      :loading="detailLoading"
      @edit="handleDetailEdit"
      @complete="handleDetailComplete"
      @uncomplete="handleDetailUncomplete"
      @delete="handleDetailDelete"
    />

    <!-- Task Complete Dialog (rate + comment + follow-up) -->
    <TaskCompleteDialog
      v-model="showCompleteDialog"
      :task-title="(tasks.find(t => t.id === completingTaskId)?.title) || ''"
      @submit="handleCompleteSubmit"
    />
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
