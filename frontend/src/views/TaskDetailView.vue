<template>
  <div class="task-detail-container" v-if="task">
    <el-page-header @back="handleBack" :title="'任务详情'">
      <template #content>
        <span class="task-title">{{ task.title }}</span>
      </template>
    </el-page-header>
    <div class="task-content">
      <el-descriptions :column="2" border>
        <el-descriptions-item label="状态">{{ task.status_label }}</el-descriptions-item>
        <el-descriptions-item label="优先级">{{ task.priority_label }}</el-descriptions-item>
        <el-descriptions-item label="截止日期">{{ task.due_date }}</el-descriptions-item>
        <el-descriptions-item label="分类">{{ task.category?.name }}</el-descriptions-item>
      </el-descriptions>
      <div class="description">
        <h4>描述</h4>
        <p>{{ task.description || '无' }}</p>
      </div>
      <div class="tags">
        <el-tag v-for="tag in task.tags" :key="tag.id" :color="tag.color">{{ tag.name }}</el-tag>
      </div>
    </div>
    <div class="actions">
      <el-button type="primary" @click="handleEdit">编辑</el-button>
      <el-button v-if="task.status !== 2" type="success" @click="showCompleteDialog = true">完成</el-button>
      <el-button v-else @click="handleUncomplete">取消完成</el-button>
      <el-button type="danger" @click="handleDelete">删除</el-button>
    </div>

    <!-- 完成评价对话框 -->
    <TaskCompleteDialog
      v-model="showCompleteDialog"
      :task-title="task.title"
      @submit="handleComplete"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useTaskStore } from '@/stores/task'
import { useRouter, useRoute } from 'vue-router'
import { ElMessage } from 'element-plus'
import TaskCompleteDialog from '@/components/TaskCompleteDialog.vue'

const router = useRouter()
const route = useRoute()
const taskStore = useTaskStore()
const task = taskStore.currentTask
const showCompleteDialog = ref(false)

onMounted(() => {
  taskStore.fetchTaskDetail(Number(route.params.id))
})

function handleBack() {
  router.back()
}

function handleEdit() {
  router.push(`/tasks/${task?.id}/edit`)
}

async function handleComplete(data: {
  completion_rate: number
  completion_comment: string
  needs_follow_up: boolean
  follow_up_reason: string
  follow_up_remind_at?: string
  follow_up_notify_channels?: string
}) {
  if (!task.value) return
  try {
    await taskStore.completeTask(task.value.id, {
      completion_rate: data.completion_rate,
      completion_comment: data.completion_comment,
      needs_follow_up: data.needs_follow_up,
      follow_up_reason: data.follow_up_reason || undefined,
      follow_up_remind_at: data.follow_up_remind_at,
      follow_up_notify_channels: data.follow_up_notify_channels
    })
    showCompleteDialog.value = false
    loadTask()
  } catch {
    ElMessage.error('操作失败')
  }
}

function loadTask() {
  if (task.value) {
    taskStore.fetchTaskDetail(task.value.id)
  }
}

async function handleUncomplete() {
  if (!task.value) return
  try {
    await taskStore.markUncomplete(task.value.id)
    loadTask()
  } catch {
    ElMessage.error('操作失败')
  }
}

async function handleDelete() {
  if (!task.value) return
  await taskStore.removeTask(task.value.id)
  router.push('/tasks')
}
</script>

<style scoped>
.task-detail-container {
  padding: 20px;
}
.task-title {
  font-size: 18px;
  font-weight: bold;
}
.task-content {
  margin: 20px 0;
}
.description {
  margin: 20px 0;
}
.tags {
  display: flex;
  gap: 8px;
}
.actions {
  display: flex;
  gap: 10px;
}
</style>
