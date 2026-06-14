<template>
  <div class="task-list-container">
    <div class="header">
      <h2>任务列表</h2>
      <el-button type="primary" @click="handleCreate">新建任务</el-button>
    </div>
    <div class="filters">
      <el-select v-model="filterParams.status" placeholder="状态" clearable>
        <el-option label="全部" :value="undefined" />
        <el-option label="待办" :value="0" />
        <el-option label="进行中" :value="1" />
        <el-option label="已完成" :value="2" />
      </el-select>
    </div>
    <div class="task-list">
      <TaskItem v-for="task in tasks" :key="task.id" :task="task" @click="handleTaskClick(task.id)" />
    </div>
    <el-pagination
      v-model:current-page="pagination.page"
      :page-size="pagination.page_size"
      :total="pagination.total"
      @current-change="handlePageChange"
    />
  </div>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useTaskStore } from '@/stores/task'
import TaskItem from '@/components/TaskItem.vue'
import { useRouter } from 'vue-router'
import type { TaskFilterParams } from '@/types'

const router = useRouter()
const taskStore = useTaskStore()
const tasks = taskStore.tasks
const pagination = taskStore.pagination
const filterParams = ref<TaskFilterParams>({})

onMounted(() => {
  taskStore.fetchTasks()
})

function handleCreate() {
  router.push('/tasks/new')
}

function handleTaskClick(id: number) {
  router.push(`/tasks/${id}`)
}

function handlePageChange(page: number) {
  taskStore.fetchTasks({ ...filterParams.value, page })
}
</script>

<style scoped>
.task-list-container {
  padding: 20px;
}
.header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 20px;
}
.filters {
  margin-bottom: 20px;
}
.task-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
}
</style>
