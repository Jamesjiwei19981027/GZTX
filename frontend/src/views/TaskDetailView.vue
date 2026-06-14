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
      <el-button @click="handleComplete">{{ task.status === 2 ? '取消完成' : '完成' }}</el-button>
      <el-button type="danger" @click="handleDelete">删除</el-button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted } from 'vue'
import { useTaskStore } from '@/stores/task'
import { useRouter, useRoute } from 'vue-router'

const router = useRouter()
const route = useRoute()
const taskStore = useTaskStore()
const task = taskStore.currentTask

onMounted(() => {
  taskStore.fetchTaskDetail(Number(route.params.id))
})

function handleBack() {
  router.back()
}

function handleEdit() {
  router.push(`/tasks/${task?.id}/edit`)
}

async function handleComplete() {
  if (task?.status === 2) {
    await taskStore.markUncomplete(task.id)
  } else {
    await taskStore.markComplete(task.id)
  }
}

async function handleDelete() {
  await taskStore.removeTask(task!.id)
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
